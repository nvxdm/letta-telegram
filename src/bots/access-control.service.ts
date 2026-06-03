import { Injectable, Logger } from '@nestjs/common';
import type { Context } from 'telegraf';
import type { BotConfig } from '../config/env.validation';

@Injectable()
export class AccessControlService {
  private readonly logger = new Logger(AccessControlService.name);

  isAllowed(bot: BotConfig, ctx: Context): boolean {
    const chat = ctx.chat;
    const from = ctx.from;
    if (!chat) return false;

    if (chat.type === 'private') {
      if (!from) return false;
      const allowed = bot.allowedUserIds.includes(from.id);
      if (!allowed) {
        this.logger.warn(
          `[${bot.name}] dropped: user ${from.id} (@${from.username ?? '?'}) not in BOT_*_ALLOWED_USER_IDS`,
        );
      }
      return allowed;
    }

    if (chat.type === 'group' || chat.type === 'supergroup') {
      const allowed = bot.allowedChatIds.includes(chat.id);
      if (!allowed) {
        this.logger.warn(
          `[${bot.name}] dropped: chat ${chat.id} ("${'title' in chat ? chat.title : '?'}") not in BOT_*_ALLOWED_CHAT_IDS`,
        );
      }
      return allowed;
    }

    return false;
  }
}
