import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Telegraf } from 'telegraf';
import { BOT_CONFIGS } from '../config/config.module';
import type { BotConfig } from '../config/env.validation';
import { TelegramUpdateHandler } from './handlers/telegram-update.handler';

@Injectable()
export class BotsLauncherService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(BotsLauncherService.name);
  private readonly bots = new Map<string, Telegraf>();

  constructor(
    @Inject(BOT_CONFIGS) private readonly configs: BotConfig[],
    private readonly handler: TelegramUpdateHandler,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.configs.length === 0) {
      this.logger.warn('No bots configured — skipping launch.');
      return;
    }

    await Promise.all(this.configs.map((cfg) => this.launchBot(cfg)));
  }

  async onModuleDestroy(): Promise<void> {
    for (const [name, bot] of this.bots) {
      try {
        bot.stop('SIGTERM');
        this.logger.log(`Bot "${name}" stopped`);
      } catch (err) {
        this.logger.error(`Error stopping bot "${name}": ${(err as Error).message}`);
      }
    }
    this.bots.clear();
  }

  private async launchBot(cfg: BotConfig): Promise<void> {
    const bot = new Telegraf(cfg.token);
    bot.use(this.handler.middlewareFor(cfg));

    bot.catch((err, ctx) => {
      this.logger.error(
        `[${cfg.name}] uncaught handler error on update ${ctx.update.update_id}: ${
          (err as Error).message
        }`,
        (err as Error).stack,
      );
    });

    try {
      const me = await bot.telegram.getMe();
      this.logger.log(
        `Bot "${cfg.name}" connected as @${me.username} → agent ${cfg.agentId}`,
      );
    } catch (err) {
      this.logger.error(
        `Bot "${cfg.name}": getMe failed (${(err as Error).message}). Token may be invalid.`,
      );
      return;
    }

    bot.launch().catch((err) => {
      this.logger.error(`Bot "${cfg.name}" launch error: ${(err as Error).message}`);
    });

    this.bots.set(cfg.name, bot);
  }
}
