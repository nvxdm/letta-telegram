import { Global, Module } from '@nestjs/common';
import { loadBotConfigs } from './bots.config';
import { LETTA_CONFIG, loadLettaConfig } from './letta.config';
import { BotConfig, LettaConfig } from './env.validation';

export const BOT_CONFIGS = Symbol('BOT_CONFIGS');

@Global()
@Module({
  providers: [
    {
      provide: LETTA_CONFIG,
      useFactory: (): LettaConfig => loadLettaConfig(),
    },
    {
      provide: BOT_CONFIGS,
      useFactory: (): BotConfig[] => loadBotConfigs(),
    },
  ],
  exports: [LETTA_CONFIG, BOT_CONFIGS],
})
export class AppConfigModule {}
