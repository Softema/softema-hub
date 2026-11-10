import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { type PrismaClient, withTenant } from '@softema/db';
import { type MeDto, requiresTwoFactor } from '@softema/shared';
import { CurrentUser, SessionGuard, type SessionUser } from '../common/guards';
import { APP_DB } from '../tokens';

@Controller('api/v1')
@UseGuards(SessionGuard)
export class WorkspacesController {
  constructor(@Inject(APP_DB) private readonly db: PrismaClient) {}

  @Get('me')
  me(@CurrentUser() user: SessionUser): Promise<MeDto> {
    return withTenant(this.db, { userId: user.id }, async tx => {
      const agencies = new Set((await tx.agencyMembership.findMany({ where: { userId: user.id }, select: { agencyId: true } })).map(a => a.agencyId));
      const memberships = await tx.workspaceMembership.findMany({ where: { userId: user.id }, select: { workspaceId: true, role: true } });
      const roles = new Map(memberships.map(m => [m.workspaceId, m.role]));
      const list = await tx.workspace.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, kind: true, agencyId: true } }); // RLS: only reachable ones
      const workspaces = list.map(w => ({ id: w.id, name: w.name, kind: w.kind, role: agencies.has(w.agencyId) ? 'agency_admin' as const : roles.get(w.id)! }));
      return {
        user: { id: user.id, name: user.name, email: user.email, twoFactorEnabled: !!user.twoFactorEnabled, twoFactorRequired: workspaces.some(w => requiresTwoFactor(w.role)) },
        workspaces,
      };
    });
  }
}
