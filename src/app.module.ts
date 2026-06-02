import { Module } from '@nestjs/common';
import { BotsModule } from './bots/bots.module';
import { AppConfigModule } from './config/config.module';
import { LettaModule } from './letta/letta.module';
import { MediaModule } from './media/media.module';

@Module({
  imports: [AppConfigModule, LettaModule, MediaModule, BotsModule],
})
export class AppModule {}
