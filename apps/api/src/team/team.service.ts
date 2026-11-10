/**
 * Team: members, roles and invitations. Every change runs through a SECURITY DEFINER function that checks the
 * caller's role in the database again (migration 0002); the API checks first only to answer precisely.
 */
import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import type { IncomingHttpHeaders } from 'node:http';
import type { z } from 'zod';
import { type PrismaClient, type TenantTx, withTenant } from '@softema/db';
import { type InvitationAcceptedDto, type InvitationDto, type InvitationPreviewDto, type MemberDto, normalizeEmail, ROLE_LABEL, type WorkspaceRole, type invitationAcceptSchema, type invitationCreateSchema } from '@softema/shared';
import type { Auth } from '../auth/auth';
import type { Config } from '../config';
import { ApiError, isUniqueViolation, notFound } from '../common/errors';
import type { Actor } from '../common/guards';
import { type Mailer, renderMail } from '../mail/mailer';
import { APP_DB, AUTH, CONFIG, MAILER } from '../tokens';

export const INVITATION_TTL_DAYS = 7;
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const invalid = () => new ApiError(410, 'INVITATION_INVALID', 'Pozvánka je neplatná, už byla použita nebo vypršela. Požádejte správce o novou.');

/** Maps the status a database function returned to the API answer. */
function check(status: string, what = 'Člen týmu') {
  if (status === 'ok') return;
  if (status === 'forbidden') throw new ApiError(403, 'FORBIDDEN', 'Tým spravují jen správci prostoru.');
  if (status === 'self') throw new ApiError(409, 'FORBIDDEN', 'Vlastní roli ani členství měnit nemůžete. Požádejte jiného správce.');
  if (status === 'already_member') throw new ApiError(409, 'ALREADY_MEMBER', 'Tento e-mail už je členem prostoru.', { email: 'Tento e-mail už je členem prostoru.' });
  throw notFound(what);
}

@Injectable()
export class TeamService {
  private readonly log = new Logger('Team');
  constructor(
    @Inject(APP_DB) private readonly db: PrismaClient,
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(CONFIG) private readonly config: Config,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  private tx<T>(actor: Actor, fn: (tx: TenantTx) => Promise<T>) { return withTenant(this.db, actor, fn); }
  private audit(tx: TenantTx, actor: Actor, action: string, entity: string, entityId: string, changedFields: string[] = []) {
    return tx.auditLog.create({ data: { workspaceId: actor.workspaceId, actorUserId: actor.userId, action, entity, entityId, changedFields } });
  }

  members(actor: Actor): Promise<MemberDto[]> {
    return this.tx(actor, async tx => {
      const rows = await tx.workspaceMembership.findMany({ where: { workspaceId: actor.workspaceId }, select: { role: true, user: { select: { id: true, name: true, email: true, twoFactorEnabled: true } } }, orderBy: { user: { name: 'asc' } } });
      return rows.map(r => ({ id: r.user.id, name: r.user.name, email: r.user.email, role: r.role, twoFactorEnabled: !!r.user.twoFactorEnabled }));
    });
  }

  invitations(actor: Actor): Promise<InvitationDto[]> {
    return this.tx(actor, async tx => {
      // RLS returns invitations only to administrators of this workspace; token_hash is not even readable.
      const rows = await tx.invitation.findMany({
        where: { workspaceId: actor.workspaceId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true, email: true, role: true, createdAt: true, expiresAt: true, invitedBy: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(r => ({ id: r.id, email: r.email, role: r.role, invitedBy: r.invitedBy, createdAt: r.createdAt.toISOString(), expiresAt: r.expiresAt.toISOString() }));
    });
  }

  async invite(actor: Actor, input: z.output<typeof invitationCreateSchema>): Promise<InvitationDto> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000);
    const { dto, workspace, inviter } = await this.tx(actor, async tx => {
      const [{ r }] = await tx.$queryRaw<{ r: { status: string; id?: string } }[]>`select hub.invite_member(${actor.workspaceId}::uuid, ${input.email}, ${input.role}::hub."WorkspaceRole", ${hashToken(token)}, ${expiresAt}) r`;
      check(r.status);
      await this.audit(tx, actor, 'invitation.create', 'invitation', r.id!, ['role']);
      const ws = await tx.workspace.findUniqueOrThrow({ where: { id: actor.workspaceId }, select: { name: true } });
      const me = await tx.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { id: true, name: true } });
      const dto: InvitationDto = { id: r.id!, email: input.email, role: input.role, invitedBy: me, createdAt: new Date().toISOString(), expiresAt: expiresAt.toISOString() };
      return { dto, workspace: ws.name, inviter: me.name };
    });
    // After the commit: a failed e-mail never leaves a half-created invitation, and the admin can send it again
    // (a new invitation replaces the pending one). The provider error itself is not passed on: it can contain the address.
    const mail = renderMail({
      to: input.email, subject: `Pozvánka do pracovního prostoru ${workspace}`,
      lines: [`Dobrý den,`, `${inviter} vás zve do pracovního prostoru ${workspace} v Softema Hub s rolí ${ROLE_LABEL[input.role]}.`, `Pozvánku přijmete odkazem níže. Platí ${INVITATION_TTL_DAYS} dní a lze ji použít jen jednou.`],
      action: { label: 'Přijmout pozvánku', url: `${this.config.WEB_ORIGIN}/pozvanka#${token}` },
      footer: 'Pokud pozvánku nečekáte, e-mail ignorujte. Bez přijetí se nic nestane.',
    });
    try { await this.mailer.send(mail); }
    catch (e) {
      this.log.error(`Invitation e-mail failed (${e instanceof Error ? e.message.slice(0, 40) : 'unknown'})`);
      throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Pozvánka je uložená, ale e-mail se nepodařilo odeslat. Zkuste člověka pozvat znovu.');
    }
    return dto;
  }

  async revokeInvitation(actor: Actor, id: string) {
    await this.tx(actor, async tx => {
      const [{ r }] = await tx.$queryRaw<{ r: string }[]>`select hub.revoke_invitation(${actor.workspaceId}::uuid, ${id}::uuid) r`;
      check(r, 'Pozvánka');
      await this.audit(tx, actor, 'invitation.revoke', 'invitation', id);
    });
  }

  async setRole(actor: Actor, userId: string, role: WorkspaceRole) {
    await this.tx(actor, async tx => {
      const [{ r }] = await tx.$queryRaw<{ r: string }[]>`select hub.set_member_role(${actor.workspaceId}::uuid, ${userId}, ${role}::hub."WorkspaceRole") r`;
      check(r);
      await this.audit(tx, actor, 'member.role', 'membership', userId, ['role']);
    });
  }

  async removeMember(actor: Actor, userId: string) {
    await this.tx(actor, async tx => {
      const [{ r }] = await tx.$queryRaw<{ r: string }[]>`select hub.remove_member(${actor.workspaceId}::uuid, ${userId}) r`;
      check(r);
      await this.audit(tx, actor, 'member.remove', 'membership', userId);
    });
  }

  /* ---------- accepting, without a workspace context ---------- */

  private async find(token: string) {
    const rows = await this.db.$queryRaw<{ workspace_id: string; workspace_name: string; email: string; email_normalized: string; role: WorkspaceRole; account_exists: boolean }[]>`select * from hub.invitation_preview(${hashToken(token)})`;
    if (!rows[0]) throw invalid();
    return rows[0];
  }

  async preview(token: string): Promise<InvitationPreviewDto> {
    const i = await this.find(token);
    return { workspaceName: i.workspace_name, email: i.email, role: i.role, accountExists: i.account_exists };
  }

  /**
   * A signed-in user accepts for their own account. Without a session, a new account is created for the invited
   * address, which the link has just proven. An existing account must sign in first, so nobody can take it over.
   */
  async accept(input: z.output<typeof invitationAcceptSchema>, headers: IncomingHttpHeaders): Promise<InvitationAcceptedDto> {
    const inv = await this.find(input.token);
    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(headers) });
    let userId: string, created = false;
    if (session) {
      if (normalizeEmail(session.user.email) !== inv.email_normalized) throw new ApiError(403, 'FORBIDDEN', `Pozvánka patří adrese ${inv.email}. Odhlaste se a otevřete odkaz znovu.`);
      userId = session.user.id;
    } else if (inv.account_exists) {
      throw new ApiError(409, 'SIGN_IN_REQUIRED', 'K tomuto e-mailu už účet existuje. Přihlaste se a pozvánku přijměte.');
    } else {
      const fields: Record<string, string> = {};
      if (!input.name) fields.name = 'Vyplňte jméno a příjmení.';
      if (!input.password) fields.password = 'Zvolte si heslo.';
      if (Object.keys(fields).length) throw new ApiError(422, 'VALIDATION_FAILED', Object.values(fields)[0], fields);
      const ctx = await this.auth.$context;
      try {
        const user = await ctx.internalAdapter.createUser({ email: inv.email_normalized, name: input.name!, emailVerified: true }, { method: 'admin' });
        await ctx.internalAdapter.linkAccount({ userId: user.id, providerId: 'credential', accountId: user.id, password: await ctx.password.hash(input.password!) });
        userId = user.id; created = true;
      } catch (e) {
        if (isUniqueViolation(e)) throw invalid(); // the same invitation accepted twice at once
        throw e;
      }
    }
    const actor = { userId, workspaceId: inv.workspace_id };
    let status: string;
    try {
      status = await withTenant(this.db, actor, async tx => {
        const [{ r }] = await tx.$queryRaw<{ r: { status: string } }[]>`select hub.accept_invitation(${hashToken(input.token)}) r`;
        if (r.status === 'ok') await this.audit(tx, { ...actor, role: inv.role }, 'invitation.accept', 'membership', userId, ['role']);
        return r.status;
      });
    } catch (e) {
      if (created) await (await this.auth.$context).internalAdapter.deleteUser(userId);
      throw e;
    }
    if (status !== 'ok') {
      if (created) await (await this.auth.$context).internalAdapter.deleteUser(userId);
      if (status === 'email_mismatch') throw new ApiError(403, 'FORBIDDEN', `Pozvánka patří adrese ${inv.email}.`);
      throw invalid();
    }
    return { workspaceId: inv.workspace_id, email: inv.email, accountCreated: created };
  }
}
