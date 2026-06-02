import { Injectable, Logger } from '@nestjs/common';
import type { Context, MiddlewareFn } from 'telegraf';
import type { BotConfig } from '../../config/env.validation';
import { LettaService } from '../../letta/letta.service';
import { AgentOutputParserService } from '../../media/agent-output-parser.service';
import { TgPayloadBuilderService } from '../../media/tg-payload-builder.service';
import { AccessControlService } from '../access-control.service';
import { TelegramSenderService } from './telegram-sender.service';

@Injectable()
export class TelegramUpdateHandler {
  private readonly logger = new Logger(TelegramUpdateHandler.name);

  constructor(
    private readonly accessControl: AccessControlService,
    private readonly payloadBuilder: TgPayloadBuilderService,
    private readonly letta: LettaService,
    private readonly parser: AgentOutputParserService,
    private readonly sender: TelegramSenderService,
  ) {}

  middlewareFor(bot: BotConfig): MiddlewareFn<Context> {
    return async (ctx, next) => {
      if (!ctx.message) {
        await next();
        return;
      }

      if (!this.accessControl.isAllowed(bot, ctx)) {
        return;
      }

      const startedAt = Date.now();
      try {
        const content = await this.payloadBuilder.build({
          ctx,
          agentId: bot.agentId,
          botName: bot.name,
        });

        if (!content || content.length === 0) {
          this.logger.debug(`[${bot.name}] no relayable content in update ${ctx.update.update_id}`);
          return;
        }

        if (ctx.chat?.type === 'private') {
          try {
            await ctx.sendChatAction('typing');
          } catch {
            // best effort
          }
        }

        const reply = await this.letta.sendMessage(bot.agentId, content);
        if (!reply) {
          this.logger.debug(`[${bot.name}] agent chose silence for update ${ctx.update.update_id}`);
          return;
        }

        const parsed = this.parser.parse(reply.text);
        await this.sender.send(ctx, parsed);
        this.logger.log(
          `[${bot.name}] handled update ${ctx.update.update_id} in ${Date.now() - startedAt}ms`,
        );
      } catch (err) {
        this.logger.error(
          `[${bot.name}] error handling update ${ctx.update.update_id}: ${(err as Error).message}`,
          (err as Error).stack,
        );
        try {
          if (ctx.chat?.type === 'private') {
            await ctx.reply('⚠️ Something went wrong reaching the agent. Please try again.');
          }
        } catch {
          // ignore
        }
      }
    };
  }
}
