import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Letta, toFile } from '@letta-ai/letta-client';
import type { LettaResponse, Message } from '@letta-ai/letta-client/resources/agents/messages';
import type { MessageCreate } from '@letta-ai/letta-client/resources/agents/agents';
import { LETTA_CONFIG } from '../config/letta.config';
import type { LettaConfig } from '../config/env.validation';
import { AssistantReply, LettaContentBlock } from './letta.types';

export const LETTA_CLIENT = Symbol('LETTA_CLIENT');

@Injectable()
export class LettaService implements OnModuleInit {
  private readonly logger = new Logger(LettaService.name);
  private readonly agentLocks = new Map<string, Promise<unknown>>();
  private readonly folderByAgent = new Map<string, string>();

  constructor(
    @Inject(LETTA_CLIENT) private readonly client: Letta,
    @Inject(LETTA_CONFIG) private readonly cfg: LettaConfig,
  ) {}

  onModuleInit(): void {
    this.logger.log(`Letta client ready (baseURL=${this.cfg.baseUrl})`);
  }

  async sendMessage(agentId: string, content: LettaContentBlock[]): Promise<AssistantReply | null> {
    return this.runSerialized(agentId, async () => {
      const response: LettaResponse = await this.client.agents.messages.create(
        agentId,
        {
          messages: [
            // Our LettaContentBlock union is a superset of the SDK's typed content
            // (it also models `file` blocks), so cast through unknown to the SDK shape.
            { role: 'user', content: content as unknown as MessageCreate['content'] },
          ],
        },
        { timeout: this.cfg.timeoutMs, maxRetries: 1 },
      );

      if (response.stop_reason && response.stop_reason.stop_reason !== 'end_turn') {
        this.logger.warn(
          `Letta agent ${agentId} returned stop_reason=${response.stop_reason.stop_reason}`,
        );
      }

      return this.extractReply(response.messages ?? []);
    });
  }

  async uploadFileForAgent(
    agentId: string,
    botName: string,
    file: { buffer: Buffer; filename: string; mimeType: string },
  ): Promise<{ fileId: string } | null> {
    return this.runSerialized(`upload:${agentId}`, async () => {
      const folderId = await this.ensureFolder(agentId, botName);
      if (!folderId) return null;

      try {
        const uploadable = await toFile(file.buffer, file.filename, { type: file.mimeType });
        const result = await this.client.folders.files.upload(folderId, { file: uploadable });
        const fileId = (result as { id?: string }).id;
        if (!fileId) {
          this.logger.error(`Letta upload returned no file id: ${JSON.stringify(result)}`);
          return null;
        }
        return { fileId };
      } catch (err) {
        this.logger.error(
          `Failed to upload "${file.filename}" to folder ${folderId}: ${(err as Error).message}`,
        );
        return null;
      }
    });
  }

  private async ensureFolder(agentId: string, botName: string): Promise<string | null> {
    const folderName = `tg-bot-${botName}`;
    // Key by agent *and* folder name: two bots can share one agentId but each
    // owns a distinct per-bot folder.
    const cacheKey = `${agentId}::${folderName}`;
    const cached = this.folderByAgent.get(cacheKey);
    if (cached) return cached;

    try {
      // Reuse an existing same-named folder so process restarts don't pile up
      // duplicate folders on the Letta server.
      const existingId = await this.findFolderByName(folderName);
      if (existingId) {
        this.folderByAgent.set(cacheKey, existingId);
        return existingId;
      }

      const created = await this.client.folders.create({ name: folderName });
      const folderId = (created as { id?: string }).id;
      if (!folderId) {
        this.logger.error(`Failed to create folder "${folderName}": missing id`);
        return null;
      }

      try {
        await this.client.agents.folders.attach(folderId, { agent_id: agentId });
      } catch (err) {
        this.logger.warn(
          `Folder ${folderId} created but attach to agent ${agentId} failed: ${(err as Error).message}`,
        );
      }

      this.folderByAgent.set(cacheKey, folderId);
      this.logger.log(`Bound folder ${folderId} ("${folderName}") to agent ${agentId}`);
      return folderId;
    } catch (err) {
      this.logger.error(`Could not provision folder "${folderName}": ${(err as Error).message}`);
      return null;
    }
  }

  private async findFolderByName(folderName: string): Promise<string | null> {
    try {
      const page = await this.client.folders.list({ name: folderName });
      const match = page.getPaginatedItems().find((f) => f.name === folderName);
      return (match as { id?: string } | undefined)?.id ?? null;
    } catch (err) {
      this.logger.warn(`Folder lookup for "${folderName}" failed: ${(err as Error).message}`);
      return null;
    }
  }

  private extractReply(messages: Message[]): AssistantReply | null {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if ((m as { message_type?: string }).message_type === 'assistant_message') {
        const text = this.coerceText((m as { content?: unknown }).content);
        if (text.trim().length === 0) return null;
        return { text };
      }
    }
    return null;
  }

  private coerceText(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((block) => {
          if (block && typeof block === 'object' && 'text' in block) {
            const t = (block as { text?: unknown }).text;
            return typeof t === 'string' ? t : '';
          }
          return '';
        })
        .join('');
    }
    return '';
  }

  private async runSerialized<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prior = this.agentLocks.get(key) ?? Promise.resolve();
    const next = prior.then(task, task);
    // The stored promise is only used for sequencing, so swallow its result/
    // rejection (the caller awaits `next` and handles errors) — otherwise a
    // failed task with no follow-up call would surface as an unhandled
    // rejection. Compare against `tracked` (the stored promise) so cleanup
    // actually runs once this is the latest entry.
    const tracked: Promise<void> = next.then(
      () => undefined,
      () => undefined,
    );
    void tracked.finally(() => {
      if (this.agentLocks.get(key) === tracked) this.agentLocks.delete(key);
    });
    this.agentLocks.set(key, tracked);
    return next;
  }
}
