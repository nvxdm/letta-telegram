import { Inject, Injectable } from '@nestjs/common';
import { BOT_CONFIGS } from '../config/config.module';
import type { BotConfig } from '../config/env.validation';

@Injectable()
export class BotRegistryService {
  private readonly byName = new Map<string, BotConfig>();

  constructor(@Inject(BOT_CONFIGS) configs: BotConfig[]) {
    for (const cfg of configs) this.byName.set(cfg.name, cfg);
  }

  get(name: string): BotConfig | undefined {
    return this.byName.get(name);
  }

  all(): BotConfig[] {
    return [...this.byName.values()];
  }
}
