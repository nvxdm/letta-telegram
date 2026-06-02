import { Injectable, Logger } from '@nestjs/common';
import type { Context } from 'telegraf';
import type { Message } from 'telegraf/typings/core/types/typegram';
import { LettaService } from '../letta/letta.service';
import { LettaContentBlock } from '../letta/letta.types';
import { TelegramDownloaderService } from './telegram-downloader.service';

interface BuildContext {
  ctx: Context;
  agentId: string;
  botName: string;
}

@Injectable()
export class TgPayloadBuilderService {
  private readonly logger = new Logger(TgPayloadBuilderService.name);

  constructor(
    private readonly downloader: TelegramDownloaderService,
    private readonly letta: LettaService,
  ) {}

  async build({ ctx, agentId, botName }: BuildContext): Promise<LettaContentBlock[] | null> {
    const message = ctx.message;
    if (!message) return null;

    const prefix = this.buildSenderPrefix(ctx, message);
    const replyContext = this.buildReplyContext(message);
    const blocks: LettaContentBlock[] = [];

    if ('photo' in message && message.photo && message.photo.length > 0) {
      const largest = message.photo[message.photo.length - 1];
      const file = await this.downloader.download(ctx.telegram, largest.file_id);
      if (file) {
        blocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: file.mimeType.startsWith('image/') ? file.mimeType : 'image/jpeg',
            data: file.buffer.toString('base64'),
          },
        });
      }
      const caption = ('caption' in message && message.caption) || '';
      blocks.push({ type: 'text', text: this.joinText(prefix, replyContext, caption || '[photo]') });
      return blocks;
    }

    if ('document' in message && message.document) {
      const doc = message.document;
      const file = await this.downloader.download(ctx.telegram, doc.file_id, {
        mimeType: doc.mime_type,
        filename: doc.file_name,
      });
      if (file) {
        const uploaded = await this.letta.uploadFileForAgent(agentId, botName, {
          buffer: file.buffer,
          filename: file.filename,
          mimeType: file.mimeType,
        });
        if (uploaded) {
          const isImage = file.mimeType.startsWith('image/');
          blocks.push(
            isImage
              ? { type: 'image', source: { type: 'letta', file_id: uploaded.fileId } }
              : { type: 'file', source: { type: 'letta', file_id: uploaded.fileId } },
          );
        } else {
          this.logger.warn(`Document upload failed; relaying as text note instead.`);
        }
      }
      const caption = ('caption' in message && message.caption) || '';
      const note = `[document: ${doc.file_name ?? 'file'}${doc.mime_type ? ` (${doc.mime_type})` : ''}]`;
      blocks.push({
        type: 'text',
        text: this.joinText(prefix, replyContext, caption || note),
      });
      return blocks;
    }

    if ('voice' in message && message.voice) {
      const voice = message.voice;
      const file = await this.downloader.download(ctx.telegram, voice.file_id, {
        mimeType: voice.mime_type ?? 'audio/ogg',
        filename: `voice-${voice.file_unique_id}.ogg`,
      });
      if (file) {
        const uploaded = await this.letta.uploadFileForAgent(agentId, botName, {
          buffer: file.buffer,
          filename: file.filename,
          mimeType: file.mimeType,
        });
        if (uploaded) {
          blocks.push({ type: 'file', source: { type: 'letta', file_id: uploaded.fileId } });
        }
      }
      blocks.push({
        type: 'text',
        text: this.joinText(prefix, replyContext, `[voice message, ${voice.duration ?? '?'}s]`),
      });
      return blocks;
    }

    if ('audio' in message && message.audio) {
      const audio = message.audio;
      const file = await this.downloader.download(ctx.telegram, audio.file_id, {
        mimeType: audio.mime_type ?? 'audio/mpeg',
        filename: audio.file_name ?? `audio-${audio.file_unique_id}.mp3`,
      });
      if (file) {
        const uploaded = await this.letta.uploadFileForAgent(agentId, botName, {
          buffer: file.buffer,
          filename: file.filename,
          mimeType: file.mimeType,
        });
        if (uploaded) {
          blocks.push({ type: 'file', source: { type: 'letta', file_id: uploaded.fileId } });
        }
      }
      blocks.push({
        type: 'text',
        text: this.joinText(prefix, replyContext, `[audio: ${audio.title ?? audio.file_name ?? 'untitled'}]`),
      });
      return blocks;
    }

    if ('text' in message && message.text) {
      blocks.push({ type: 'text', text: this.joinText(prefix, replyContext, message.text) });
      return blocks;
    }

    return null;
  }

  private buildSenderPrefix(ctx: Context, message: Message): string {
    if (ctx.chat?.type === 'private') return '';
    const from = 'from' in message ? message.from : undefined;
    if (!from) return '';
    const handle = from.username ? `@${from.username}` : `${from.first_name ?? 'user'}`;
    return `[from ${handle} in group "${('title' in (ctx.chat ?? {}) ? (ctx.chat as { title?: string }).title : '') || 'unknown'}"]`;
  }

  private buildReplyContext(message: Message): string {
    if (!('reply_to_message' in message) || !message.reply_to_message) return '';
    const rep = message.reply_to_message;
    const repText = 'text' in rep ? rep.text : 'caption' in rep ? rep.caption : undefined;
    if (!repText) return '[in reply to a previous message]';
    const trimmed = repText.length > 200 ? `${repText.slice(0, 200)}…` : repText;
    return `[in reply to: "${trimmed}"]`;
  }

  private joinText(...parts: string[]): string {
    return parts.filter((p) => p && p.length > 0).join('\n');
  }
}
