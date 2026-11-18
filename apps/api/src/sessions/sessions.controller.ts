/**
 * Signed-in devices of the current user (zadání 8.1: správa relací). Sessions live in tables only the auth role may
 * read, so this uses the auth database client; the application role still cannot see them. Tokens never leave the API,
 * and every query is limited to the signed-in user, so nobody can list or end another person's sessions.
 */
import { Controller, Delete, Get, HttpCode, Inject, Param, UseGuards } from '@nestjs/common';
import type { PrismaClient } from '@softema/db';
import type { SessionDto } from '@softema/shared';
import { ApiError, notFound } from '../common/errors';
import { CurrentSessionId, CurrentUser, SessionGuard, type SessionUser } from '../common/guards';
import { AUTH_DB } from '../tokens';

@Controller('api/v1/me/sessions')
@UseGuards(SessionGuard)
export class SessionsController {
  constructor(@Inject(AUTH_DB) private readonly db: PrismaClient) {}

  @Get()
  async list(@CurrentUser() user: SessionUser, @CurrentSessionId() current: string): Promise<SessionDto[]> {
    const rows = await this.db.session.findMany({
      where: { userId: user.id, expiresAt: { gt: new Date() } },
      select: { id: true, createdAt: true, updatedAt: true, ipAddress: true, userAgent: true },
      orderBy: { updatedAt: 'desc' },
    });
    return rows
      .map(s => ({ id: s.id, current: s.id === current, createdAt: s.createdAt.toISOString(), lastActiveAt: s.updatedAt.toISOString(), ipAddress: s.ipAddress, userAgent: s.userAgent }))
      .sort((a, b) => Number(b.current) - Number(a.current));
  }

  /** Ends the other devices; this one stays signed in. */
  @Delete()
  async revokeOthers(@CurrentUser() user: SessionUser, @CurrentSessionId() current: string) {
    const { count } = await this.db.session.deleteMany({ where: { userId: user.id, id: { not: current } } });
    return { revoked: count };
  }

  @Delete(':id') @HttpCode(204)
  async revoke(@CurrentUser() user: SessionUser, @CurrentSessionId() current: string, @Param('id') id: string) {
    if (id === current) throw new ApiError(409, 'CURRENT_SESSION', 'Toto zařízení ukončíte odhlášením.');
    const { count } = await this.db.session.deleteMany({ where: { id, userId: user.id } });
    if (!count) throw notFound('Přihlášení');
  }
}
