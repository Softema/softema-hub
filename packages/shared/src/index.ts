/** Contract shared by apps/api and apps/web: input schemas, response types, roles and error codes. */
import { z } from 'zod';

/* ---------- roles and permissions (zadání 3.1) ---------- */
export type Role = 'agency_admin' | 'workspace_admin' | 'member';
export const ROLE_LABEL: Record<Role, string> = { agency_admin: 'Správce agentury', workspace_admin: 'Správce prostoru', member: 'Člen týmu' };
export type Permission = 'contact:read' | 'contact:write' | 'contact:delete' | 'team:read' | 'team:manage';
const PERMISSIONS: Record<Role, readonly Permission[]> = {
  agency_admin: ['contact:read', 'contact:write', 'contact:delete', 'team:read', 'team:manage'],
  workspace_admin: ['contact:read', 'contact:write', 'contact:delete', 'team:read', 'team:manage'],
  member: ['contact:read', 'contact:write', 'team:read'],
};
export const can = (role: Role, permission: Permission) => PERMISSIONS[role].includes(permission);
/** Roles that can be granted inside a workspace. `agency_admin` comes from the agency, never from an invitation. */
export const WORKSPACE_ROLES = ['workspace_admin', 'member'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];
/** Two-factor authentication is mandatory for administrators (zadání 6.1). */
export const requiresTwoFactor = (role: Role) => role !== 'member';

/* ---------- normalization ---------- */
export const normalizeEmail = (s: string) => s.trim().toLowerCase();
/** Same folding as the generated `contact.search_text` column: no diacritics, lower case. */
export const normalizeSearch = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/* ---------- contacts ---------- */
export const CONTACT_STAGES = ['lead', 'prospect', 'client'] as const;
export type ContactStage = (typeof CONTACT_STAGES)[number];
export const STAGE_LABEL: Record<ContactStage, string> = { lead: 'Lead', prospect: 'Zájemce', client: 'Klient' };

const text = (max: number) => z.string().trim().max(max, `Nejvýše ${max} znaků.`);
const name = text(200).min(1, 'Vyplňte jméno a příjmení.');
const email = z.string().trim().max(254, 'E-mail je příliš dlouhý.').regex(/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/, 'Zadejte platný e-mail, např. jana@firma.cz.');

export const contactCreateSchema = z.strictObject({
  name, email,
  phone: text(50).default(''), company: text(200).default(''), city: text(120).default(''),
  stage: z.enum(CONTACT_STAGES).default('lead'),
  ownerId: z.string().min(1).nullable().optional(),
  tags: z.array(text(60).min(1)).max(50).default([]),
});
export type ContactCreateInput = z.input<typeof contactCreateSchema>;

export const contactUpdateSchema = z.strictObject({
  version: z.number().int().positive('Chybí verze záznamu.'),
  name: name.optional(), email: email.optional(),
  phone: text(50).optional(), company: text(200).optional(), city: text(120).optional(),
  stage: z.enum(CONTACT_STAGES).optional(),
  ownerId: z.string().min(1).nullable().optional(),
});
export type ContactUpdateInput = z.input<typeof contactUpdateSchema>;

export const CONTACT_SORTS = ['newest', 'name', 'company'] as const;
export const contactListQuerySchema = z.object({
  q: text(200).optional(),
  stage: z.enum(CONTACT_STAGES).optional(),
  tag: text(60).optional(),
  source: text(120).optional(),
  sort: z.enum(CONTACT_SORTS).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type ContactListQuery = z.input<typeof contactListQuerySchema>;

export const tagAddSchema = z.strictObject({ name: text(60).min(1, 'Zadejte štítek.') });
export const noteBodySchema = z.strictObject({ body: text(2000).min(1, 'Poznámka je prázdná.') });

/* ---------- accounts and team ---------- */
export const PASSWORD_MIN = 12;
export const passwordSchema = z.string().min(PASSWORD_MIN, `Heslo musí mít aspoň ${PASSWORD_MIN} znaků.`).max(128, 'Heslo může mít nejvýše 128 znaků.');
const token = z.string().trim().min(20, 'Odkaz je neúplný.').max(200, 'Odkaz je neplatný.');
export const invitationCreateSchema = z.strictObject({ email, role: z.enum(WORKSPACE_ROLES, 'Vyberte roli.') });
export type InvitationCreateInput = z.input<typeof invitationCreateSchema>;
export const memberRoleSchema = z.strictObject({ role: z.enum(WORKSPACE_ROLES, 'Vyberte roli.') });
export const invitationTokenSchema = z.strictObject({ token });
export const invitationAcceptSchema = z.strictObject({ token, name: name.optional(), password: passwordSchema.optional() });
export type InvitationAcceptInput = z.input<typeof invitationAcceptSchema>;

/* ---------- responses ---------- */
export interface UserRef { id: string; name: string }
export interface TagDto { id: string; name: string }
export interface WorkspaceDto { id: string; name: string; kind: 'internal' | 'client'; role: Role }
/** `twoFactorRequired`: the user administers at least one workspace and must turn on 2FA before working with data. */
export interface MeDto { user: { id: string; name: string; email: string; twoFactorEnabled: boolean; twoFactorRequired: boolean }; workspaces: WorkspaceDto[] }
export interface MemberDto extends UserRef { email: string; role: Role; twoFactorEnabled: boolean }
export interface InvitationDto { id: string; email: string; role: WorkspaceRole; invitedBy: UserRef | null; createdAt: string; expiresAt: string }
export interface InvitationPreviewDto { workspaceName: string; email: string; role: WorkspaceRole; accountExists: boolean }
export interface InvitationAcceptedDto { workspaceId: string; email: string; accountCreated: boolean }
export interface ContactDto {
  id: string; name: string; email: string; phone: string; company: string; city: string;
  stage: ContactStage; source: string; owner: UserRef | null; tags: TagDto[];
  version: number; createdAt: string; updatedAt: string;
}
export interface NoteDto { id: string; body: string; author: UserRef; createdAt: string; updatedAt: string }
export interface ContactDetailDto extends ContactDto { notes: NoteDto[] }
export interface ContactListDto { items: ContactDto[]; total: number; page: number; limit: number; sources: string[] }
export type ActivityKind = 'contact' | 'note' | 'tag' | 'stage';
export interface ActivityDto { id: string; type: ActivityKind; title: string; detail: string; actor: UserRef | null; createdAt: string }
export interface ActivityPageDto { items: ActivityDto[]; nextCursor: string | null }

/* ---------- errors ---------- */
export type ErrorCode = 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION_FAILED' | 'DUPLICATE_EMAIL' | 'VERSION_CONFLICT' | 'BAD_ORIGIN' | 'SERVICE_UNAVAILABLE' | 'INTERNAL'
  | 'TWO_FACTOR_REQUIRED' | 'ALREADY_MEMBER' | 'INVITATION_INVALID' | 'SIGN_IN_REQUIRED';
export interface ApiErrorBody { code: ErrorCode; message: string; fields?: Record<string, string> }
