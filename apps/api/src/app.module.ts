import { Controller, Get, type DynamicModule, Inject, Module, Res } from '@nestjs/common';
import type { Response } from 'express';
import { APP_FILTER } from '@nestjs/core';
import { createClient, type PrismaClient } from '@softema/db';
import { createAuth } from './auth/auth';
import { ApiExceptionFilter } from './common/errors';
import { OriginGuard, SessionGuard, WorkspaceGuard } from './common/guards';
import type { Config } from './config';
import { ContactsController } from './contacts/contacts.controller';
import { ContactsService } from './contacts/contacts.service';
import { SegmentsController } from './segments/segments.controller';
import { SegmentsService } from './segments/segments.service';
import { DEFAULT_OUTBOX, type Mailer, OutboxMailer, ResendMailer } from './mail/mailer';
import { SessionsController } from './sessions/sessions.controller';
import { InvitationsController, TeamController } from './team/team.controller';
import { TeamService } from './team/team.service';
import { APP_DB, AUTH, AUTH_DB, CONFIG, MAILER } from './tokens';
import { WorkspacesController } from './workspaces/workspaces.controller';

/** Uptime check for the server and the scheduled monitor: 503 when the database does not answer within 5 s.
 *  Public, so it says nothing beyond ok/error. */
@Controller('api')
class HealthController {
  constructor(@Inject(APP_DB) private readonly db: PrismaClient) {}
  @Get('health') async health(@Res({ passthrough: true }) res: Response) {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 5000); });
    try { await Promise.race([this.db.$queryRaw`select 1`, timeout]); return { status: 'ok' }; }
    catch { res.status(503); return { status: 'error' }; }
    finally { clearTimeout(timer); }
  }
}

export interface AppDeps { mailer?: Mailer }

@Module({})
export class AppModule {
  static register(config: Config, deps: AppDeps = {}): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController, WorkspacesController, ContactsController, SegmentsController, TeamController, InvitationsController, SessionsController],
      providers: [
        { provide: CONFIG, useValue: config },
        { provide: MAILER, useValue: deps.mailer ?? (config.MAIL_PROVIDER === 'resend' ? new ResendMailer(config.RESEND_API_KEY!, config.MAIL_FROM!) : new OutboxMailer(config.MAIL_OUTBOX_DIR ?? DEFAULT_OUTBOX)) },
        { provide: APP_DB, useFactory: () => createClient(config.DATABASE_APP_URL) },
        { provide: AUTH_DB, useFactory: () => createClient(config.DATABASE_AUTH_URL, 5) },
        { provide: AUTH, useFactory: (db: PrismaClient, mailer: Mailer) => createAuth(config, db, mailer), inject: [AUTH_DB, MAILER] },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        SessionGuard, WorkspaceGuard, OriginGuard, ContactsService, SegmentsService, TeamService,
      ],
    };
  }
}
