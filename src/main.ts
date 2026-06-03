import 'reflect-metadata';
import { config as loadDotenv } from 'dotenv';
loadDotenv();

import { Logger, LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

function resolveLogLevels(): LogLevel[] {
  const level = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  const order: LogLevel[] = ['error', 'warn', 'log', 'debug', 'verbose'];
  const idx = order.findIndex((l) => l === level || (level === 'info' && l === 'log'));
  if (idx < 0) return ['error', 'warn', 'log'];
  return order.slice(0, idx + 1);
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: resolveLogLevels(),
    abortOnError: true,
  });

  process.on('uncaughtException', (err) => {
    new Logger('UncaughtException').error(err.message, err.stack);
  });
  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    new Logger('UnhandledRejection').error(err.message, err.stack);
  });

  const logger = new Logger('Bootstrap');
  logger.log('Letta⇄Telegram proxy started.');

  const shutdown = async (signal: string): Promise<void> => {
    logger.log(`Received ${signal}, shutting down...`);
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void bootstrap();
