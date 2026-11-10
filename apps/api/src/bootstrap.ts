import 'reflect-metadata';
import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { toNodeHandler } from 'better-auth/node';
import express from 'express';
import helmet from 'helmet';
import { type AppDeps, AppModule } from './app.module';
import type { Config } from './config';
import { AUTH } from './tokens';
import type { Auth } from './auth/auth';

export async function createApp(config: Config, deps: AppDeps = {}) {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(config, deps),{ bodyParser: false, logger: config.NODE_ENV === 'test' ? false : ['error', 'warn', 'log'] });
  app.use(helmet());
  // Behind the Vercel proxy only: a request without the shared secret did not come through our web, so it is refused
  // before any route, including Better-Auth. The health check stays open for the server's own monitoring.
  if (config.HUB_PROXY_SECRET) {
    const expected = Buffer.from(config.HUB_PROXY_SECRET);
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path === '/api/health') return next();
      const got = Buffer.from(String(req.headers['x-hub-proxy'] ?? ''));
      if (got.length === expected.length && timingSafeEqual(got, expected)) { delete req.headers['x-hub-proxy']; return next(); }
      res.status(403).json({ code: 'BAD_ORIGIN', message: 'Požadavek nepřišel přes web Softema Hub.' });
    });
  }
  // Better-Auth reads the raw body, so it is mounted before the JSON parser.
  app.getHttpAdapter().getInstance().all('/api/auth/{*path}', toNodeHandler(app.get<Auth>(AUTH)));
  app.use(express.json({ limit: '100kb' }));
  return app;
}
