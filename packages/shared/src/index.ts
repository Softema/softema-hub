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

/** Custom fields of a contact (zadání 8.2): name → plain-text value. Names are unique regardless of case and
 *  diacritics; the API additionally adopts the spelling already used in the workspace. */
export const CUSTOM_FIELDS = { max: 50, name: 60, value: 500 } as const;
export const customFieldsSchema = z.record(z.string(), z.string()).transform((rec, ctx) => {
  const out: [string, string][] = [];
  const seen = new Set<string>();
  for (const [rawName, rawValue] of Object.entries(rec)) {
    const name = rawName.trim(), value = rawValue.trim();
    const problem = !name ? 'Doplňte název pole.'
      : name.length > CUSTOM_FIELDS.name ? `Název pole může mít nejvýše ${CUSTOM_FIELDS.name} znaků.`
      : value.length > CUSTOM_FIELDS.value ? `Hodnota pole „${name}“ může mít nejvýše ${CUSTOM_FIELDS.value} znaků.`
      : seen.has(normalizeSearch(name)) ? `Pole „${name}“ je u kontaktu dvakrát.` : '';
    if (problem) { ctx.addIssue({ code: 'custom', message: problem }); return z.NEVER; }
    seen.add(normalizeSearch(name)); out.push([name, value]);
  }
  if (out.length > CUSTOM_FIELDS.max) { ctx.addIssue({ code: 'custom', message: `Kontakt může mít nejvýše ${CUSTOM_FIELDS.max} vlastních polí.` }); return z.NEVER; }
  // fromEntries defines own properties, so a name like "__proto__" stays an ordinary field.
  return Object.fromEntries(out) as Record<string, string>;
});

export const contactCreateSchema = z.strictObject({
  name, email,
  phone: text(50).default(''), company: text(200).default(''), city: text(120).default(''),
  stage: z.enum(CONTACT_STAGES).default('lead'),
  ownerId: z.string().min(1).nullable().optional(),
  tags: z.array(text(60).min(1)).max(50).default([]),
  customFields: customFieldsSchema.default({}),
});
export type ContactCreateInput = z.input<typeof contactCreateSchema>;

export const contactUpdateSchema = z.strictObject({
  version: z.number().int().positive('Chybí verze záznamu.'),
  name: name.optional(), email: email.optional(),
  phone: text(50).optional(), company: text(200).optional(), city: text(120).optional(),
  stage: z.enum(CONTACT_STAGES).optional(),
  ownerId: z.string().min(1).nullable().optional(),
  /** The complete new set of custom fields; fields left out are removed. */
  customFields: customFieldsSchema.optional(),
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

/* ---------- segments (zadání 8.2, kap. 5 Segment) ---------- */
/** Fields a rule can test. Courses, webinars and consent come with their modules. */
export const SEGMENT_FIELDS = ['tag', 'stage', 'source', 'city', 'company', 'createdDays', 'customField'] as const;
export type SegmentField = (typeof SEGMENT_FIELDS)[number];
export const SEGMENT_OPS = ['is', 'isNot', 'contains', 'lessThan'] as const;
export type SegmentOp = (typeof SEGMENT_OPS)[number];
/** Allowed conditions per field; the first one is the default. Same set as the demo segment editor. */
export const SEGMENT_FIELD_OPS: Record<SegmentField, readonly SegmentOp[]> = {
  tag: ['is', 'isNot', 'contains'], stage: ['is', 'isNot'], source: ['is', 'isNot'],
  city: ['is', 'isNot', 'contains'], company: ['contains', 'isNot'], createdDays: ['lessThan'], customField: ['is', 'isNot', 'contains'],
};
export const SEGMENT_FIELD_LABEL: Record<SegmentField, string> = {
  tag: 'Štítek', stage: 'Fáze', source: 'Zdroj', city: 'Město', company: 'Firma', createdDays: 'Přidán do databáze', customField: 'Vlastní pole',
};
export const SEGMENT_OP_LABEL: Record<SegmentOp, string> = { is: 'je', isNot: 'není', contains: 'obsahuje', lessThan: 'za posledních' };
export const SEGMENT_LIMITS = { rules: 20, name: 80, description: 200, value: 200, days: 3650 } as const;

export const segmentRuleSchema = z.strictObject({
  field: z.enum(SEGMENT_FIELDS, 'Neznámé pole pravidla.'),
  op: z.enum(SEGMENT_OPS, 'Neznámá podmínka pravidla.'),
  value: text(SEGMENT_LIMITS.value).min(1, 'Doplňte hodnoty všech pravidel, nebo nedokončená pravidla odeberte.'),
  /** Name of the custom field; only for `customField`. */
  key: text(CUSTOM_FIELDS.name).optional(),
}).superRefine((r, ctx) => {
  // Defensive: with an unknown field or op the enum issue above is already reported.
  if (!SEGMENT_FIELD_OPS[r.field] || !SEGMENT_OPS.includes(r.op)) return;
  const problem = !SEGMENT_FIELD_OPS[r.field].includes(r.op) ? `Podmínka „${SEGMENT_OP_LABEL[r.op]}“ u pole ${SEGMENT_FIELD_LABEL[r.field]} nejde použít.`
    : r.field === 'stage' && !(CONTACT_STAGES as readonly string[]).includes(r.value) ? 'Neznámá fáze kontaktu.'
    : r.field === 'createdDays' && !(/^\d{1,4}$/.test(r.value) && +r.value >= 1 && +r.value <= SEGMENT_LIMITS.days) ? `Počet dní musí být celé číslo od 1 do ${SEGMENT_LIMITS.days}.`
    : r.field === 'customField' && !r.key ? 'Vyberte vlastní pole.'
    : r.field !== 'customField' && r.key !== undefined ? 'Název pole patří jen k pravidlu Vlastní pole.' : '';
  if (problem) ctx.addIssue({ code: 'custom', message: problem });
});
export type SegmentRule = z.output<typeof segmentRuleSchema>;
export const SEGMENT_MATCHES = ['all', 'any'] as const;
export type SegmentMatch = (typeof SEGMENT_MATCHES)[number];
const segmentRules = z.array(segmentRuleSchema).max(SEGMENT_LIMITS.rules, `Segment může mít nejvýše ${SEGMENT_LIMITS.rules} pravidel.`);

/** Rules only, for the live preview of an unsaved segment. */
export const segmentPreviewSchema = z.strictObject({ match: z.enum(SEGMENT_MATCHES).default('all'), rules: segmentRules.default([]) });
export const segmentCreateSchema = z.strictObject({
  name: text(SEGMENT_LIMITS.name).min(1, 'Pojmenujte segment.'),
  description: text(SEGMENT_LIMITS.description).default(''),
  match: z.enum(SEGMENT_MATCHES).default('all'),
  rules: segmentRules.default([]),
});
export type SegmentCreateInput = z.input<typeof segmentCreateSchema>;
/** Fields left out stay as they are: a missing `rules` must never turn a segment into "all contacts". */
export const segmentUpdateSchema = z.strictObject({
  version: z.number().int().positive('Chybí verze záznamu.'),
  name: text(SEGMENT_LIMITS.name).min(1, 'Pojmenujte segment.').optional(),
  description: text(SEGMENT_LIMITS.description).optional(),
  match: z.enum(SEGMENT_MATCHES).optional(),
  rules: segmentRules.optional(),
});
export type SegmentUpdateInput = z.input<typeof segmentUpdateSchema>;

/** Human-readable rule, e.g. "Štítek je VIP". */
export function segmentRuleText(r: Pick<SegmentRule, 'field' | 'op' | 'value' | 'key'>) {
  if (r.field === 'createdDays') return `${SEGMENT_FIELD_LABEL.createdDays} za posledních ${r.value} dní`;
  const value = r.field === 'stage' && r.value in STAGE_LABEL ? STAGE_LABEL[r.value as ContactStage] : r.value;
  return `${r.field === 'customField' ? r.key || SEGMENT_FIELD_LABEL.customField : SEGMENT_FIELD_LABEL[r.field]} ${SEGMENT_OP_LABEL[r.op]} ${value || '…'}`;
}

export const tagAddSchema =z.strictObject({ name: text(60).min(1, 'Zadejte štítek.') });
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
/** One signed-in device of the current user. Never carries the session token. */
export interface SessionDto { id: string; current: boolean; createdAt: string; lastActiveAt: string; ipAddress: string | null; userAgent: string | null }
/** Temporary lock after repeated wrong passwords (zadání 6.1). */
export const LOGIN_LOCK = { attempts: 5, minutes: 15 } as const;
export interface ContactDto {
  id: string; name: string; email: string; phone: string; company: string; city: string;
  stage: ContactStage; source: string; owner: UserRef | null; tags: TagDto[];
  customFields: Record<string, string>;
  version: number; createdAt: string; updatedAt: string;
}
export interface NoteDto { id: string; body: string; author: UserRef; createdAt: string; updatedAt: string }
export interface ContactDetailDto extends ContactDto { notes: NoteDto[] }
export interface ContactListDto { items: ContactDto[]; total: number; page: number; limit: number; sources: string[] }
/** Contact as shown in a segment preview: enough to recognise it and open the detail. */
export interface SegmentMemberDto { id: string; name: string; email: string; stage: ContactStage }
export interface SegmentDto {
  id: string; name: string; description: string; match: SegmentMatch; rules: SegmentRule[];
  /** Live contacts matching the rules right now. */
  count: number;
  createdBy: UserRef | null; version: number; createdAt: string; updatedAt: string;
}
/** `ruleCounts[i]`: contacts matching rule i alone, so the editor can show which rule narrows the segment. */
export interface SegmentPreviewDto { total: number; sample: SegmentMemberDto[]; ruleCounts: number[] }
export type ActivityKind ='contact' | 'note' | 'tag' | 'stage' | 'field';
export interface ActivityDto { id: string; type: ActivityKind; title: string; detail: string; actor: UserRef | null; createdAt: string }
export interface ActivityPageDto { items: ActivityDto[]; nextCursor: string | null }

/* ---------- errors ---------- */
export type ErrorCode = 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION_FAILED' | 'DUPLICATE_EMAIL' | 'VERSION_CONFLICT' | 'BAD_ORIGIN' | 'SERVICE_UNAVAILABLE' | 'INTERNAL'
  | 'DUPLICATE_NAME' | 'TWO_FACTOR_REQUIRED' | 'ALREADY_MEMBER' | 'INVITATION_INVALID' | 'SIGN_IN_REQUIRED' | 'CURRENT_SESSION';
export interface ApiErrorBody { code: ErrorCode; message: string; fields?: Record<string, string> }
