import type { Context } from 'telegraf';
import { AccessControlService } from './access-control.service';
import type { BotConfig } from '../config/env.validation';

describe('AccessControlService', () => {
  const svc = new AccessControlService();

  const bot = (over: Partial<BotConfig> = {}): BotConfig => ({
    name: 'b',
    token: 'tttttttttt',
    agentId: 'a',
    allowedUserIds: [111],
    allowedChatIds: [-200],
    ...over,
  });

  // Minimal Context stand-in — isAllowed only reads ctx.chat and ctx.from.
  const ctx = (chat: unknown, from?: unknown): Context => ({ chat, from }) as unknown as Context;

  it('denies when there is no chat', () => {
    expect(svc.isAllowed(bot(), ctx(undefined))).toBe(false);
  });

  it('private: allows only listed user ids', () => {
    expect(svc.isAllowed(bot(), ctx({ type: 'private', id: 111 }, { id: 111 }))).toBe(true);
    expect(svc.isAllowed(bot(), ctx({ type: 'private', id: 999 }, { id: 999 }))).toBe(false);
  });

  it('private: denies when sender is missing', () => {
    expect(svc.isAllowed(bot(), ctx({ type: 'private', id: 111 }))).toBe(false);
  });

  it('group/supergroup: allows only listed chat ids', () => {
    expect(svc.isAllowed(bot(), ctx({ type: 'group', id: -200, title: 'g' }, { id: 5 }))).toBe(true);
    expect(svc.isAllowed(bot(), ctx({ type: 'supergroup', id: -200, title: 'g' }, { id: 5 }))).toBe(true);
    expect(svc.isAllowed(bot(), ctx({ type: 'group', id: -999, title: 'g' }, { id: 5 }))).toBe(false);
  });

  it('empty allow-lists deny everything', () => {
    const b = bot({ allowedUserIds: [], allowedChatIds: [] });
    expect(svc.isAllowed(b, ctx({ type: 'private', id: 111 }, { id: 111 }))).toBe(false);
    expect(svc.isAllowed(b, ctx({ type: 'group', id: -200, title: 'g' }, { id: 5 }))).toBe(false);
  });

  it('channel posts are not allowed (channels are unsupported)', () => {
    expect(svc.isAllowed(bot({ allowedChatIds: [-200] }), ctx({ type: 'channel', id: -200, title: 'c' }))).toBe(false);
  });
});
