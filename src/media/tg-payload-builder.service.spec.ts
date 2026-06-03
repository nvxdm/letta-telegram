import type { Context } from 'telegraf';
import { TgPayloadBuilderService } from './tg-payload-builder.service';
import type { TelegramDownloaderService } from './telegram-downloader.service';
import type { LettaService } from '../letta/letta.service';

describe('TgPayloadBuilderService sender labelling', () => {
  // Text-only messages touch neither the downloader nor Letta.
  const builder = new TgPayloadBuilderService(
    {} as TelegramDownloaderService,
    {} as LettaService,
  );

  const build = (chat: unknown, message: unknown) =>
    builder.build({ ctx: { chat, message } as unknown as Context, agentId: 'a', botName: 'b' });

  it('prefixes DM text with "Name (id) says:"', async () => {
    const blocks = await build(
      { type: 'private', id: 123 },
      { text: 'hello', from: { id: 123, first_name: 'Ann', last_name: 'Lee' } },
    );
    expect(blocks).toEqual([{ type: 'text', text: 'Ann Lee (123) says: hello' }]);
  });

  it('keeps the group title and prefixes the sender in groups', async () => {
    const blocks = await build(
      { type: 'supergroup', id: -100, title: 'Team' },
      { text: 'hello', from: { id: 123, first_name: 'Ann' } },
    );
    expect(blocks).toEqual([{ type: 'text', text: '[in group "Team"]\nAnn (123) says: hello' }]);
  });

  it('falls back to username, then "user", when no name is set', async () => {
    const byUsername = await build(
      { type: 'private', id: 5 },
      { text: 'hi', from: { id: 5, username: 'annlee' } },
    );
    expect(byUsername).toEqual([{ type: 'text', text: 'annlee (5) says: hi' }]);
  });

  it('includes reply context between the group line and the sender line', async () => {
    const blocks = await build(
      { type: 'supergroup', id: -100, title: 'Team' },
      {
        text: 'sure',
        from: { id: 9, first_name: 'Bo' },
        reply_to_message: { text: 'are you coming?' },
      },
    );
    expect(blocks).toEqual([
      { type: 'text', text: '[in group "Team"]\n[in reply to: "are you coming?"]\nBo (9) says: sure' },
    ]);
  });
});
