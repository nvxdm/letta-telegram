import { Module } from '@nestjs/common';
import { LettaModule } from '../letta/letta.module';
import { MediaModule } from '../media/media.module';
import { AccessControlService } from './access-control.service';
import { BotsLauncherService } from './bots-launcher.service';
import { TelegramSenderService } from './handlers/telegram-sender.service';
import { TelegramUpdateHandler } from './handlers/telegram-update.handler';

@Module({
  imports: [LettaModule, MediaModule],
  providers: [
    AccessControlService,
    TelegramSenderService,
    TelegramUpdateHandler,
    BotsLauncherService,
  ],
})
export class BotsModule {}
