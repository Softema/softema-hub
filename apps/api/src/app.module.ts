import { Controller, Get, type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { createClient, type PrismaClient } from '@softema/db';
import { createAuth } from './auth/auth';
import { ApiExceptionFilter } from './common/errors';
import { OriginGuard, SessionGuard, WorkspaceGuard } from './common/guards';
import type { Config } from './config';
import { ContactsController } from './contacts/contacts.controller';
import { ContactsService } from './contacts/contacts.service';
import { DEFAULT_OUTBOX, type Mailer, OutboxMailer, ResendMailer } from './mail/mailer';
import { InvitationsController, TeamController } from './team/team.controller';
import { TeamService } from './team/team.service';
import { APP_DB, AUTH, AUTH_DB, CONFIG, MAILER } from './tokens';
import { WorkspacesController } from './workspaces/workspaces.controller';

@Controller('api')
class HealthController { @Get('health') health() { return { status: 'ok' }; } }

export interface AppDeps { mailer?: Mailer }

@Module({})
export class AppModule {
  static register(config: Config, deps: AppDeps = {}): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController, WorkspacesController, ContactsController, TeamController, InvitationsController],
      providers: [
        { provide: CONFIG, useValue: config },
        { provide: MAILER, useValue: deps.mailer ?? (config.MAIL_PROVIDER === 'resend' ? new ResendMailer(config.RESEND_API_KEY!, config.MAIL_FROM!) : new OutboxMailer(config.MAIL_OUTBOX_DIR ?? DEFAULT_OUTBOX)) },
        { provide: APP_DB, useFactory: () => createClient(config.DATABASE_APP_URL) },
        { provide: AUTH_DB, useFactory: () => createClient(config.DATABASE_AUTH_URL, 5) },
        { provide: AUTH, useFactory: (db: PrismaClient, mailer: Mailer) => createAuth(config, db, mailer), inject: [AUTH_DB, MAILER] },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        SessionGuard, WorkspaceGuard, OriginGuard, ContactsService, TeamService,
      ],
    };
  }
}
