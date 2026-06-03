import { botEnvSchema } from './env.validation';

describe('botEnvSchema id parsing', () => {
  const parse = (allowedUserIds?: string, allowedChatIds?: string) =>
    botEnvSchema.parse({ name: 'b', token: '1234567890', agentId: 'a', allowedUserIds, allowedChatIds });

  it('parses comma-separated decimal ids including negative chat ids', () => {
    const cfg = parse('1, 2 ,3', '-1001234567890');
    expect(cfg.allowedUserIds).toEqual([1, 2, 3]);
    expect(cfg.allowedChatIds).toEqual([-1001234567890]);
  });

  it('treats empty / unset as empty arrays (deny all)', () => {
    const cfg = parse('', undefined);
    expect(cfg.allowedUserIds).toEqual([]);
    expect(cfg.allowedChatIds).toEqual([]);
  });

  it('rejects non-decimal forms that Number() would silently coerce', () => {
    for (const bad of ['0x10', '1e3', '+5', '12.5', 'abc']) {
      expect(() => parse(bad)).toThrow(/Invalid numeric id/);
    }
  });

  it('rejects ids beyond the safe integer range', () => {
    expect(() => parse('99999999999999999999')).toThrow(/safe integer range/);
  });
});
