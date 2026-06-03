import { Logger } from '@nestjs/common';
import { BotConfig, botEnvSchema } from './env.validation';

// Canonical positive integers only — no leading zeros, so BOT_01_* can't
// collide with BOT_1_* (both would parse to index 1 and clobber each other).
const BOT_TOKEN_PATTERN = /^BOT_([1-9]\d*)_TOKEN$/;

export function loadBotConfigs(env: NodeJS.ProcessEnv = process.env): BotConfig[] {
  const logger = new Logger('BotsConfig');

  const indices = Object.keys(env)
    .map((key) => BOT_TOKEN_PATTERN.exec(key))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]))
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => a - b);

  if (indices.length === 0) {
    logger.warn('No BOT_<N>_TOKEN env vars found — service will start with zero bots.');
    return [];
  }

  const configs: BotConfig[] = [];
  for (const idx of indices) {
    const prefix = `BOT_${idx}_`;
    try {
      const parsed = botEnvSchema.parse({
        name: env[`${prefix}NAME`] ?? `bot-${idx}`,
        token: env[`${prefix}TOKEN`],
        agentId: env[`${prefix}AGENT_ID`],
        allowedUserIds: env[`${prefix}ALLOWED_USER_IDS`],
        allowedChatIds: env[`${prefix}ALLOWED_CHAT_IDS`],
      });
      configs.push(parsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Invalid configuration for ${prefix}*: ${message}`);
    }
  }

  const names = new Set<string>();
  for (const cfg of configs) {
    if (names.has(cfg.name)) {
      throw new Error(`Duplicate bot name "${cfg.name}" — BOT_<N>_NAME must be unique`);
    }
    names.add(cfg.name);
  }

  return configs;
}
