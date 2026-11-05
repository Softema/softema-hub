import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { type PrismaClient, withTenant } from '@softema/db';
import type { MeDto, MemberDto } from '@softema/shared';
import { type Actor, CurrentActor, CurrentUser, Requires, SessionGuard, WorkspaceGuard } from '../common/guards';
import { APP_DB } from '../tokens';

@Controller('api/v1')
@UseGuards(SessionGuard)
export class WorkspacesController {
  constructor(@Inject(APP_DB) private readonly db: PrismaClient) {}

  @Get('me')
  me(@CurrentUser() user: { id: string; name: string; email: string }): Promise<MeDto> {
    return withTenant(this.db, { userId: user.id }, async tx => {
      const agencies = new Set((await tx.agencyMembership.findMany({ where: { userId: user.id }, select: { agencyId: true } })).map(a => a.agencyId));
      const memberships = await tx.workspaceMembership.findMany({ where: { userId: user.id }, select: { workspaceId: true, role: true } });
      const roles = new Map(memberships.map(m => [m.workspaceId, m.role]));
      const list = await tx.workspace.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, kind: true, agencyId: true } }); // RLS: only reachable ones
      return {
        user: { id: user.id, name: user.name, email: user.email },
        workspaces: list.map(w => ({ id: w.id, name: w.name, kind: w.kind, role: agencies.has(w.agencyId) ? 'agency_admin' as const : roles.get(w.id)! })),
      };
    });
  }

  @Get('workspaces/:workspaceId/members')
  @UseGuards(WorkspaceGuard)
  @Requires('contact:read')
  members(@CurrentActor() actor: Actor): Promise<MemberDto[]> {
    return withTenant(this.db, actor, async tx => {
      const rows = await tx.workspaceMembership.findMany({ where: { workspaceId: actor.workspaceId }, select: { role: true, user: { select: { id: true, name: true } } }, orderBy: { user: { name: 'asc' } } });
      return rows.map(r => ({ id: r.user.id, name: r.user.name, role: r.role }));
    });
  }
}
