import { LettaConfig, lettaEnvSchema } from './env.validation';

export function loadLettaConfig(env: NodeJS.ProcessEnv = process.env): LettaConfig {
  try {
    return lettaEnvSchema.parse({
      baseUrl: env.LETTA_BASE_URL,
      token: env.LETTA_TOKEN,
      timeoutMs: env.LETTA_TIMEOUT_MS,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid Letta configuration: ${message}`);
  }
}

export const LETTA_CONFIG = Symbol('LETTA_CONFIG');
