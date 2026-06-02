import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Letta, toFile } from '@letta-ai/letta-client';
import type { LettaResponse, Message } from '@letta-ai/letta-client/resources/agents/messages';
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
            {
              role: 'user',
              content: content as unknown as Parameters<
                typeof this.client.agents.messages.create
              >[1]['messages'] extends Array<infer T> | null | undefined
                ? T extends { content: infer C }
                  ? C
                  : never
                : never,
            },
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
    const cached = this.folderByAgent.get(agentId);
    if (cached) return cached;

    const folderName = `tg-bot-${botName}`;
    try {
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

      this.folderByAgent.set(agentId, folderId);
      this.logger.log(`Bound folder ${folderId} ("${folderName}") to agent ${agentId}`);
      return folderId;
    } catch (err) {
      this.logger.error(`Could not provision folder "${folderName}": ${(err as Error).message}`);
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
    this.agentLocks.set(
      key,
      next.finally(() => {
        if (this.agentLocks.get(key) === next) this.agentLocks.delete(key);
      }),
    );
    return next;
  }
}
