import { type CanActivate, createParamDecorator, type ExecutionContext, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { type PrismaClient, withTenant } from '@softema/db';
import { can, type Permission, type Role } from '@softema/shared';
import type { Auth } from '../auth/auth';
import { APP_DB, AUTH, CONFIG } from '../tokens';
import type { Config } from '../config';
import { ApiError, notFound } from './errors';

export interface Actor { userId: string; workspaceId: string; role: Role }
type Authed = Request & { user?: { id: string; name: string; email: string }; actor?: Actor };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID.test(s);

/** Valid session required. Cookie requests that change data must also come from our own origin (CSRF). */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AUTH) private readonly auth: Auth, @Inject(CONFIG) private readonly config: Config) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<Authed>();
    if (!['GET', 'HEAD'].includes(req.method) && req.headers.origin !== this.config.WEB_ORIGIN) throw new ApiError(403, 'BAD_ORIGIN', 'Požadavek z nepovoleného původu.');
    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) throw new ApiError(401, 'UNAUTHENTICATED', 'Přihlaste se prosím.');
    req.user = session.user;
    return true;
  }
}

export const Requires = (permission: Permission) => SetMetadata('permission', permission);

/**
 * Resolves the role from the database; the workspace id in the URL is only a request.
 * A workspace the user cannot access answers exactly like one that does not exist.
 */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(@Inject(APP_DB) private readonly db: PrismaClient, @Inject(Reflector) private readonly reflector: Reflector) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<Authed>();
    const workspaceId = String(req.params.workspaceId);
    const user = req.user!;
    if (!isUuid(workspaceId)) throw notFound('Pracovní prostor');
    const role = await withTenant(this.db, { userId: user.id }, async tx => {
      const ws = await tx.workspace.findUnique({ where: { id: workspaceId }, select: { agencyId: true } });
      if (!ws) return null;
      const agency = await tx.agencyMembership.findUnique({ where: { agencyId_userId: { agencyId: ws.agencyId, userId: user.id } }, select: { userId: true } });
      if (agency) return 'agency_admin' as const;
      return (await tx.workspaceMembership.findUnique({ where: { workspaceId_userId: { workspaceId, userId: user.id } }, select: { role: true } }))?.role ?? null;
    });
    if (!role) throw notFound('Pracovní prostor');
    const needed = this.reflector.get<Permission | undefined>('permission', ctx.getHandler());
    if (needed && !can(role, needed)) throw new ApiError(403, 'FORBIDDEN', 'Na tuto akci nemáte oprávnění. Kontakty mažou jen správci.');
    req.actor = { userId: user.id, workspaceId, role };
    return true;
  }
}

export const CurrentActor = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<Authed>().actor!);
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<Authed>().user!);
