import { Injectable, Logger } from '@nestjs/common';
import type { Context } from 'telegraf';
import { stripTags, type ParsedOutput } from '../../media/agent-output-parser.service';

@Injectable()
export class TelegramSenderService {
  private readonly logger = new Logger(TelegramSenderService.name);

  async send(ctx: Context, parsed: ParsedOutput): Promise<void> {
    if (parsed.parts.length === 0) return;

    for (const part of parsed.parts) {
      try {
        if (part.kind === 'photo') {
          // The caption is already plain text (tags stripped), so send it without
          // parse_mode — otherwise a stray '<' or '&' makes Telegram reject the
          // whole photo. Cap at Telegram's 1024-char caption limit.
          const caption = part.caption?.slice(0, 1024);
          await ctx.replyWithPhoto(part.url, caption ? { caption } : undefined);
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
            await ctx.reply(stripTags(part.html));
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
