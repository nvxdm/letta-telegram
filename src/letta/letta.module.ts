import { Module } from '@nestjs/common';
import { Letta } from '@letta-ai/letta-client';
import { LETTA_CONFIG } from '../config/letta.config';
import type { LettaConfig } from '../config/env.validation';
import { LETTA_CLIENT, LettaService } from './letta.service';

@Module({
  providers: [
    {
      provide: LETTA_CLIENT,
      inject: [LETTA_CONFIG],
      useFactory: (cfg: LettaConfig): Letta =>
        new Letta({
          apiKey: cfg.token,
          baseURL: cfg.baseUrl,
        }),
    },
    LettaService,
  ],
  exports: [LettaService],
})
export class LettaModule {}
