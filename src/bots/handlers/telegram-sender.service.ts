import { Injectable, Logger } from '@nestjs/common';
import type { Context } from 'telegraf';
import type { ParsedOutput } from '../../media/agent-output-parser.service';

@Injectable()
export class TelegramSenderService {
  private readonly logger = new Logger(TelegramSenderService.name);

  async send(ctx: Context, parsed: ParsedOutput): Promise<void> {
    if (parsed.parts.length === 0) return;

    for (const part of parsed.parts) {
      try {
        if (part.kind === 'photo') {
          await ctx.replyWithPhoto(
            part.url,
            part.caption ? { caption: part.caption, parse_mode: 'HTML' } : undefined,
          );
          continue;
        }
        if (part.kind === 'document') {
          await ctx.replyWithDocument(
            part.filename ? { url: part.url, filename: part.filename } : part.url,
          );
          continue;
        }
        await ctx.reply(part.html, { parse_mode: 'HTML' });
      } catch (err) {
        const msg = (err as Error).message;
        this.logger.error(`Failed to send ${part.kind} part: ${msg}. Falling back to plain text.`);
        try {
          if (part.kind === 'text') {
            await ctx.reply(stripHtml(part.html));
          } else {
            await ctx.reply(part.url);
          }
        } catch (innerErr) {
          this.logger.error(`Fallback reply failed: ${(innerErr as Error).message}`);
        }
      }
    }
  }
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"');
}
