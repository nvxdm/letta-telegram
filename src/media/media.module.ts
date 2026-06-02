import { Module } from '@nestjs/common';
import { LettaModule } from '../letta/letta.module';
import { AgentOutputParserService } from './agent-output-parser.service';
import { TelegramDownloaderService } from './telegram-downloader.service';
import { TgPayloadBuilderService } from './tg-payload-builder.service';

@Module({
  imports: [LettaModule],
  providers: [TelegramDownloaderService, TgPayloadBuilderService, AgentOutputParserService],
  exports: [TelegramDownloaderService, TgPayloadBuilderService, AgentOutputParserService],
})
export class MediaModule {}
