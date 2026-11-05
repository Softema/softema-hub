import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { toNodeHandler } from 'better-auth/node';
import express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import type { Config } from './config';
import { AUTH } from './tokens';
import type { Auth } from './auth/auth';

export async function createApp(config: Config) {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(config), { bodyParser: false, logger: config.NODE_ENV === 'test' ? false : ['error', 'warn', 'log'] });
  app.use(helmet());
  // Better-Auth reads the raw body, so it is mounted before the JSON parser.
  app.getHttpAdapter().getInstance().all('/api/auth/{*path}', toNodeHandler(app.get<Auth>(AUTH)));
  app.use(express.json({ limit: '100kb' }));
  return app;
}
