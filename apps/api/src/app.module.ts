import { Controller, Get, type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { createClient, type PrismaClient } from '@softema/db';
import { createAuth } from './auth/auth';
import { ApiExceptionFilter } from './common/errors';
import { SessionGuard, WorkspaceGuard } from './common/guards';
import type { Config } from './config';
import { ContactsController } from './contacts/contacts.controller';
import { ContactsService } from './contacts/contacts.service';
import { APP_DB, AUTH, AUTH_DB, CONFIG } from './tokens';
import { WorkspacesController } from './workspaces/workspaces.controller';

@Controller('api')
class HealthController { @Get('health') health() { return { status: 'ok' }; } }

@Module({})
export class AppModule {
  static register(config: Config): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController, WorkspacesController, ContactsController],
      providers: [
        { provide: CONFIG, useValue: config },
        { provide: APP_DB, useFactory: () => createClient(config.DATABASE_APP_URL) },
        { provide: AUTH_DB, useFactory: () => createClient(config.DATABASE_AUTH_URL, 5) },
        { provide: AUTH, useFactory: (db: PrismaClient) => createAuth(config, db), inject: [AUTH_DB] },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        SessionGuard, WorkspaceGuard, ContactsService,
      ],
    };
  }
}
