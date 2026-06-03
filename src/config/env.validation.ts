import { z } from 'zod';

const idList = z
  .string()
  .optional()
  .transform((raw) => {
    if (!raw) return [] as number[];
    return raw
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .map((part) => {
        // Telegram ids are plain base-10 integers (chat ids are negative).
        // Reject hex/binary/scientific/'+' forms that Number() would silently
        // coerce into a valid-but-wrong id.
        if (!/^-?\d+$/.test(part)) {
          throw new Error(`Invalid numeric id: "${part}"`);
        }
        const n = Number(part);
        if (!Number.isSafeInteger(n)) {
          throw new Error(`Numeric id out of safe integer range: "${part}"`);
        }
        return n;
      });
  });

export const botEnvSchema = z.object({
  name: z.string().min(1, 'BOT_<N>_NAME is required'),
  token: z.string().min(10, 'BOT_<N>_TOKEN is required and looks too short'),
  agentId: z.string().min(1, 'BOT_<N>_AGENT_ID is required'),
  allowedUserIds: idList,
  allowedChatIds: idList,
});

export type BotConfig = z.infer<typeof botEnvSchema>;

export const lettaEnvSchema = z.object({
  baseUrl: z.string().url('LETTA_BASE_URL must be a valid URL'),
  token: z.string().min(1, 'LETTA_TOKEN is required'),
  timeoutMs: z
    .string()
    .optional()
    .transform((raw) => {
      if (!raw) return 120_000;
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) throw new Error('LETTA_TIMEOUT_MS must be a positive number');
      return n;
    }),
});

export type LettaConfig = z.infer<typeof lettaEnvSchema>;
