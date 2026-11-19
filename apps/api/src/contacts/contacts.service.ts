import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient, type TenantTx, withTenant } from '@softema/db';
import { type ActivityDto, type ActivityKind, can, type ContactBulkResultDto, type contactBulkSchema, type ContactFilter, type ActivityPageDto, type ContactDetailDto, type ContactDto, type ContactListDto, type contactCreateSchema, type contactListQuerySchema, type contactUpdateSchema, type NoteDto, BULK_LIMITS, normalizeEmail, normalizeSearch, STAGE_LABEL, type TagDto } from '@softema/shared';
import type { z } from 'zod';
import { ApiError, isUniqueViolation, notFound } from '../common/errors';
import { type Actor, isUuid } from '../common/guards';
import { APP_DB } from '../tokens';

const SELECT = {
  id: true, name: true, email: true, phone: true, company: true, city: true, stage: true, source: true, customFields: true, version: true, createdAt: true, updatedAt: true,
  owner: { select: { id: true, name: true } },
  tags: { select: { tag: { select: { id: true, name: true } } }, orderBy: { tag: { name: 'asc' } } },
} satisfies Prisma.ContactSelect;
type Row = Prisma.ContactGetPayload<{ select: typeof SELECT }>;
const NOTE_SELECT = { id: true, body: true, createdAt: true, updatedAt: true, author: { select: { id: true, name: true } } } satisfies Prisma.NoteSelect;

/** Custom fields as stored; anything that is not a flat name → text object (legacy or manual edits) reads as empty. */
const fieldsOf = (v: Prisma.JsonValue): Record<string, string> =>
  v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => typeof e[1] === 'string')) : {};
const sameFields = (a: Record<string, string>, b: Record<string, string>) => Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k, v]) => b[k] === v);
/** Names whose value was added, changed or removed, for the timeline and the audit log (names only, never values). */
const changedFieldNames = (before: Record<string, string>, after: Record<string, string>) =>
  [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(k => before[k] !== after[k]).sort((x, y) => x.localeCompare(y, 'cs'));
const toDto = (c: Row): ContactDto => ({ ...c, tags: c.tags.map(t => t.tag), customFields: fieldsOf(c.customFields), createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString() });
const toNote = (n: Prisma.NoteGetPayload<{ select: typeof NOTE_SELECT }>): NoteDto => ({ ...n, createdAt: n.createdAt.toISOString(), updatedAt: n.updatedAt.toISOString() });
const FIELD_LABEL: Record<string, string> = { name: 'jméno', email: 'e-mail', phone: 'telefon', company: 'firma', city: 'město', ownerId: 'vlastník' };
/** The list filter, shared by the list and by bulk actions on "all matching the filter". Live contacts only. */
const filterWhere = (actor: Actor, f: ContactFilter): Prisma.ContactWhereInput => ({
  workspaceId: actor.workspaceId, deletedAt: null,
  ...(f.q ? { searchText: { contains: normalizeSearch(f.q) } } : {}),
  ...(f.stage ? { stage: f.stage } : {}), ...(f.source ? { source: f.source } : {}),
  ...(f.tag ? { tags: { some: { tag: { nameNormalized: normalizeSearch(f.tag) } } } } : {}),
});
const fmtCount = (n: number) => n.toLocaleString('cs-CZ');
const BULK_DETAIL = 'Hromadná akce v seznamu kontaktů';
const duplicate = () => new ApiError(409, 'DUPLICATE_EMAIL', 'Kontakt s tímto e-mailem už v prostoru existuje.', { email: 'Kontakt s tímto e-mailem už v prostoru existuje.' });

@Injectable()
export class ContactsService {
  constructor(@Inject(APP_DB) private readonly db: PrismaClient) {}

  private tx<T>(actor: Actor, fn: (tx: TenantTx) => Promise<T>) { return withTenant(this.db, actor, fn); }

  /** The workspace filter duplicates RLS on purpose: two independent layers (zadání 6.1). */
  private async live(tx: TenantTx, actor: Actor, id: string) {
    if (!isUuid(id)) throw notFound('Kontakt');
    const c = await tx.contact.findFirst({ where: { id, workspaceId: actor.workspaceId, deletedAt: null }, select: SELECT });
    if (!c) throw notFound('Kontakt');
    return c;
  }
  private activity(tx: TenantTx, actor: Actor, contactId: string, type: ActivityKind, title: string, detail = '') {
    return tx.activity.create({ data: { workspaceId: actor.workspaceId, contactId, actorUserId: actor.userId, type, payload: { title, detail } } });
  }
  private audit(tx: TenantTx, actor: Actor, action: string, entity: string, entityId: string, changedFields: string[] = []) {
    return tx.auditLog.create({ data: { workspaceId: actor.workspaceId, actorUserId: actor.userId, action, entity, entityId, changedFields } });
  }
  private async member(tx: TenantTx, actor: Actor, ownerId: string) {
    const m = await tx.workspaceMembership.findUnique({ where: { workspaceId_userId: { workspaceId: actor.workspaceId, userId: ownerId } }, select: { userId: true } });
    if (!m) throw new ApiError(422, 'VALIDATION_FAILED', 'Vlastník musí být členem tohoto prostoru.', { ownerId: 'Vlastník musí být členem tohoto prostoru.' });
  }
  /** Finds or creates a workspace tag; a concurrent insert of the same name is tolerated. */
  private async tag(tx: TenantTx, actor: Actor, name: string) {
    const nameNormalized = normalizeSearch(name);
    const key = { workspaceId_nameNormalized: { workspaceId: actor.workspaceId, nameNormalized } };
    await tx.tag.createMany({ data: { workspaceId: actor.workspaceId, name, nameNormalized }, skipDuplicates: true });
    return tx.tag.findUniqueOrThrow({ where: key, select: { id: true, name: true } });
  }
  /** Custom field names in use in the workspace, optionally ignoring one contact (whose own names may be renamed). */
  private async fieldNames(tx: TenantTx, actor: Actor, exceptContactId?: string) {
    const rows = await tx.$queryRaw<{ name: string }[]>`
      select distinct jsonb_object_keys(custom_fields) as name from hub.contact
      where workspace_id = ${actor.workspaceId}::uuid and deleted_at is null and jsonb_typeof(custom_fields) = 'object'
      ${exceptContactId ? Prisma.sql`and id <> ${exceptContactId}::uuid` : Prisma.empty}`;
    return rows.map(r => r.name);
  }
  /** One spelling per field in the workspace: "obor" on a new contact becomes the existing "Obor", so segments and
   *  imports see a single field. */
  private async canonical(tx: TenantTx, actor: Actor, fields: Record<string, string>, exceptContactId?: string) {
    if (!Object.keys(fields).length) return fields;
    const known = new Map((await this.fieldNames(tx, actor, exceptContactId)).map(n => [normalizeSearch(n), n]));
    return Object.fromEntries(Object.entries(fields).map(([k, v]) => [known.get(normalizeSearch(k)) ?? k, v])) as Record<string, string>;
  }

  list(actor: Actor, q: z.output<typeof contactListQuerySchema>): Promise<ContactListDto> {
    const where = filterWhere(actor, q);
    const orderBy: Prisma.ContactOrderByWithRelationInput[] = q.sort === 'name' ? [{ name: 'asc' }, { id: 'asc' }] : q.sort === 'company' ? [{ company: 'asc' }, { name: 'asc' }, { id: 'asc' }] : [{ createdAt: 'desc' }, { id: 'desc' }];
    return this.tx(actor, async tx => {
      const total = await tx.contact.count({ where });
      const items = await tx.contact.findMany({ where, orderBy, skip: (q.page - 1) * q.limit, take: q.limit, select: SELECT });
      const sources = await tx.contact.findMany({ where: { workspaceId: actor.workspaceId, deletedAt: null }, distinct: ['source'], select: { source: true }, orderBy: { source: 'asc' } });
      return { items: items.map(toDto), total, page: q.page, limit: q.limit, sources: sources.map(s => s.source) };
    });
  }

  async create(actor: Actor, input: z.output<typeof contactCreateSchema>): Promise<ContactDetailDto> {
    try {
      return await this.tx(actor, async tx => {
        const ownerId = input.ownerId === undefined ? actor.userId : input.ownerId;
        if (ownerId && ownerId !== actor.userId) await this.member(tx, actor, ownerId);
        const customFields = await this.canonical(tx, actor, input.customFields);
        const c = await tx.contact.create({ data: { workspaceId: actor.workspaceId, name: input.name, email: input.email, emailNormalized: normalizeEmail(input.email), phone: input.phone, company: input.company, city: input.city, stage: input.stage, ownerUserId: ownerId ?? null, customFields }, select: { id: true } });
        for (const name of new Set(input.tags)) { const t = await this.tag(tx, actor, name); await tx.contactTag.createMany({ data: { workspaceId: actor.workspaceId, contactId: c.id, tagId: t.id }, skipDuplicates: true }); }
        await this.activity(tx, actor, c.id, 'contact', 'Kontakt přidán do databáze', 'Zdroj: Ruční zadání');
        await this.audit(tx, actor, 'create', 'contact', c.id);
        return { ...toDto(await this.live(tx, actor, c.id)), notes: [] };
      });
    } catch (e) { if (isUniqueViolation(e)) throw duplicate(); throw e; }
  }

  detail(actor: Actor, id: string): Promise<ContactDetailDto> {
    return this.tx(actor, async tx => {
      const c = await this.live(tx, actor, id);
      const notes = await tx.note.findMany({ where: { workspaceId: actor.workspaceId, contactId: id, deletedAt: null }, orderBy: { createdAt: 'desc' }, select: NOTE_SELECT });
      await this.audit(tx, actor, 'read', 'contact', id);
      return { ...toDto(c), notes: notes.map(toNote) };
    });
  }

  async update(actor: Actor, id: string, input: z.output<typeof contactUpdateSchema>): Promise<ContactDto> {
    try {
      return await this.tx(actor, async tx => {
        const cur = await this.live(tx, actor, id);
        const { version, ownerId, customFields: rawFields, ...fields } = input;
        const changed = (Object.keys(fields) as (keyof typeof fields)[]).filter(k => fields[k] !== undefined && fields[k] !== cur[k]);
        const ownerChanged = ownerId !== undefined && ownerId !== (cur.owner?.id ?? null);
        if (ownerChanged && ownerId) await this.member(tx, actor, ownerId);
        const before = fieldsOf(cur.customFields);
        const customFields = rawFields === undefined ? undefined : await this.canonical(tx, actor, rawFields, id);
        const fieldsChanged = customFields !== undefined && !sameFields(before, customFields);
        // The version check and the write are one statement, so two members can never overwrite each other silently.
        const res = await tx.contact.updateMany({
          where: { id, workspaceId: actor.workspaceId, deletedAt: null, version },
          data: { ...fields, ...(fields.email ? { emailNormalized: normalizeEmail(fields.email) } : {}), ...(ownerChanged ? { ownerUserId: ownerId } : {}), ...(fieldsChanged ? { customFields } : {}), version: { increment: 1 } },
        });
        if (!res.count) throw new ApiError(409, 'VERSION_CONFLICT', 'Kontakt mezitím upravil někdo jiný. Načtěte aktuální data a změnu zopakujte.');
        const names = [...changed.filter(k => k !== 'stage'), ...(ownerChanged ? ['ownerId'] : [])];
        if (input.stage && changed.includes('stage')) await this.activity(tx, actor, id, 'stage', `Fáze změněna na ${STAGE_LABEL[input.stage]}`, `Předtím: ${STAGE_LABEL[cur.stage]}`);
        if (names.length) await this.activity(tx, actor, id, 'contact', 'Kontakt upraven', `Změněno: ${names.map(n => FIELD_LABEL[n] ?? n).join(', ')}`);
        if (fieldsChanged) await this.activity(tx, actor, id, 'field', 'Upravena vlastní pole', `Změněno: ${changedFieldNames(before, customFields).join(', ')}`);
        await this.audit(tx, actor, 'update', 'contact', id, [...changed, ...(ownerChanged ? ['ownerId'] : []), ...(fieldsChanged ? ['customFields'] : [])]);
        return toDto(await this.live(tx, actor, id));
      });
    } catch (e) { if (isUniqueViolation(e)) throw duplicate(); throw e; }
  }

  remove(actor: Actor, id: string): Promise<void> {
    return this.tx(actor, async tx => {
      await this.live(tx, actor, id);
      await tx.contact.updateMany({ where: { id, workspaceId: actor.workspaceId, deletedAt: null }, data: { deletedAt: new Date(), version: { increment: 1 } } });
      await this.activity(tx, actor, id, 'contact', 'Kontakt smazán');
      await this.audit(tx, actor, 'delete', 'contact', id);
    });
  }

  /**
   * One action over many contacts in one transaction: all of them change, or none. Ids are resolved inside the
   * workspace (foreign or deleted ids are simply not matched); a filter is evaluated on the server. Every changed
   * contact gets its own timeline entry and audit record, as if the change were made in its detail.
   */
  bulk(actor: Actor, input: z.output<typeof contactBulkSchema>): Promise<ContactBulkResultDto> {
    if (input.action === 'delete' && !can(actor.role, 'contact:delete')) throw new ApiError(403, 'FORBIDDEN', 'Na tuto akci nemáte oprávnění. Kontakty mažou jen správci.');
    return this.tx(actor, async tx => {
      const { ids: picked, filter } = input.target;
      const where = picked ? { workspaceId: actor.workspaceId, deletedAt: null, id: { in: picked } } : filterWhere(actor, filter ?? {});
      const rows = await tx.contact.findMany({ where, select: { id: true, stage: true }, orderBy: { id: 'asc' }, take: BULK_LIMITS.filter + 1 });
      if (rows.length > BULK_LIMITS.filter) throw new ApiError(422, 'VALIDATION_FAILED', `Hromadná akce může najednou zasáhnout nejvýše ${fmtCount(BULK_LIMITS.filter)} kontaktů. Zužte filtr.`);
      const ids = rows.map(r => r.id);
      if (!ids.length) return { matched: 0, changed: 0 };
      const log = async (changed: string[], type: ActivityKind, title: (id: string) => string, detail: (id: string) => string, action: string, fields: string[]) => {
        if (!changed.length) return;
        await tx.activity.createMany({ data: changed.map(contactId => ({ workspaceId: actor.workspaceId, contactId, actorUserId: actor.userId, type, payload: { title: title(contactId), detail: detail(contactId) } })) });
        await tx.auditLog.createMany({ data: changed.map(entityId => ({ workspaceId: actor.workspaceId, actorUserId: actor.userId, action, entity: 'contact', entityId, changedFields: fields })) });
      };
      switch (input.action) {
        case 'tag': {
          const t = await this.tag(tx, actor, input.tag!);
          const had = new Set((await tx.contactTag.findMany({ where: { workspaceId: actor.workspaceId, tagId: t.id, contactId: { in: ids } }, select: { contactId: true } })).map(x => x.contactId));
          const changed = ids.filter(id => !had.has(id));
          await tx.contactTag.createMany({ data: changed.map(contactId => ({ workspaceId: actor.workspaceId, contactId, tagId: t.id })), skipDuplicates: true });
          await log(changed, 'tag', () => `Přidán štítek ${t.name}`, () => BULK_DETAIL, 'tag.add', ['tags']);
          return { matched: ids.length, changed: changed.length };
        }
        case 'untag': {
          const t = await tx.tag.findUnique({ where: { workspaceId_nameNormalized: { workspaceId: actor.workspaceId, nameNormalized: normalizeSearch(input.tag!) } }, select: { id: true, name: true } });
          if (!t) return { matched: ids.length, changed: 0 };
          const changed = (await tx.contactTag.findMany({ where: { workspaceId: actor.workspaceId, tagId: t.id, contactId: { in: ids } }, select: { contactId: true } })).map(x => x.contactId);
          await tx.contactTag.deleteMany({ where: { workspaceId: actor.workspaceId, tagId: t.id, contactId: { in: changed } } });
          await log(changed, 'tag', () => `Odebrán štítek ${t.name}`, () => BULK_DETAIL, 'tag.remove', ['tags']);
          return { matched: ids.length, changed: changed.length };
        }
        case 'stage': {
          const stage = input.stage!;
          const before = new Map(rows.map(r => [r.id, r.stage]));
          const changed = rows.filter(r => r.stage !== stage).map(r => r.id);
          // The version moves on, so an open detail form gets a conflict instead of silently overwriting the new stage.
          await tx.contact.updateMany({ where: { workspaceId: actor.workspaceId, deletedAt: null, id: { in: changed } }, data: { stage, version: { increment: 1 } } });
          await log(changed, 'stage', () => `Fáze změněna na ${STAGE_LABEL[stage]}`, id => `Předtím: ${STAGE_LABEL[before.get(id)!]} · ${BULK_DETAIL}`, 'update', ['stage']);
          return { matched: ids.length, changed: changed.length };
        }
        case 'delete': {
          await tx.contact.updateMany({ where: { workspaceId: actor.workspaceId, deletedAt: null, id: { in: ids } }, data: { deletedAt: new Date(), version: { increment: 1 } } });
          await log(ids, 'contact', () => 'Kontakt smazán', () => BULK_DETAIL, 'delete', []);
          return { matched: ids.length, changed: ids.length };
        }
      }
    });
  }

  /** Custom field names used in the workspace, for suggestions when adding a field. */
  customFieldNames(actor: Actor): Promise<string[]> {
    return this.tx(actor, async tx => (await this.fieldNames(tx, actor)).sort((a, b) => a.localeCompare(b, 'cs')));
  }

  tags(actor: Actor): Promise<TagDto[]> {
    return this.tx(actor, tx => tx.tag.findMany({ where: { workspaceId: actor.workspaceId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }));
  }
  addTag(actor: Actor, id: string, name: string): Promise<TagDto> {
    return this.tx(actor, async tx => {
      await this.live(tx, actor, id);
      const t = await this.tag(tx, actor, name);
      const { count } = await tx.contactTag.createMany({ data: { workspaceId: actor.workspaceId, contactId: id, tagId: t.id }, skipDuplicates: true });
      if (count) { await this.activity(tx, actor, id, 'tag', `Přidán štítek ${t.name}`, 'Ručně v detailu kontaktu'); await this.audit(tx, actor, 'tag.add', 'contact', id, ['tags']); }
      return t;
    });
  }
  removeTag(actor: Actor, id: string, tagId: string): Promise<void> {
    return this.tx(actor, async tx => {
      await this.live(tx, actor, id);
      if (!isUuid(tagId)) throw notFound('Štítek');
      const link = await tx.contactTag.findFirst({ where: { workspaceId: actor.workspaceId, contactId: id, tagId }, select: { tag: { select: { name: true } } } });
      if (!link) throw notFound('Štítek');
      await tx.contactTag.deleteMany({ where: { workspaceId: actor.workspaceId, contactId: id, tagId } });
      await this.activity(tx, actor, id, 'tag', `Odebrán štítek ${link.tag.name}`, 'Ručně v detailu kontaktu');
      await this.audit(tx, actor, 'tag.remove', 'contact', id, ['tags']);
    });
  }

  addNote(actor: Actor, id: string, body: string): Promise<NoteDto> {
    return this.tx(actor, async tx => {
      await this.live(tx, actor, id);
      const n = await tx.note.create({ data: { workspaceId: actor.workspaceId, contactId: id, authorUserId: actor.userId, body }, select: NOTE_SELECT });
      await this.activity(tx, actor, id, 'note', 'Přidána interní poznámka');
      await this.audit(tx, actor, 'note.create', 'note', n.id);
      return toNote(n);
    });
  }
  private async note(tx: TenantTx, actor: Actor, id: string, noteId: string) {
    await this.live(tx, actor, id);
    if (!isUuid(noteId)) throw notFound('Poznámka');
    const n = await tx.note.findFirst({ where: { id: noteId, workspaceId: actor.workspaceId, contactId: id, deletedAt: null }, select: { id: true } });
    if (!n) throw notFound('Poznámka');
  }
  updateNote(actor: Actor, id: string, noteId: string, body: string): Promise<NoteDto> {
    return this.tx(actor, async tx => {
      await this.note(tx, actor, id, noteId);
      const n = await tx.note.update({ where: { id: noteId }, data: { body }, select: NOTE_SELECT });
      await this.activity(tx, actor, id, 'note', 'Upravena interní poznámka');
      await this.audit(tx, actor, 'note.update', 'note', noteId, ['body']);
      return toNote(n);
    });
  }
  removeNote(actor: Actor, id: string, noteId: string): Promise<void> {
    return this.tx(actor, async tx => {
      await this.note(tx, actor, id, noteId);
      await tx.note.updateMany({ where: { id: noteId, workspaceId: actor.workspaceId }, data: { deletedAt: new Date() } });
      await this.activity(tx, actor, id, 'note', 'Smazána interní poznámka');
      await this.audit(tx, actor, 'note.delete', 'note', noteId);
    });
  }

  activities(actor: Actor, id: string, cursor?: string, limit = 50): Promise<ActivityPageDto> {
    return this.tx(actor, async tx => {
      await this.live(tx, actor, id);
      const rows = await tx.activity.findMany({
        where: { workspaceId: actor.workspaceId, contactId: id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1,
        ...(cursor && isUuid(cursor) ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true, type: true, payload: true, createdAt: true, actor: { select: { id: true, name: true } } },
      });
      const items = rows.slice(0, limit).map((a): ActivityDto => { const p = a.payload as { title?: string; detail?: string }; return { id: a.id, type: a.type as ActivityKind, title: p.title ?? '', detail: p.detail ?? '', actor: a.actor, createdAt: a.createdAt.toISOString() }; });
      return { items, nextCursor: rows.length > limit ? items[items.length - 1].id : null };
    });
  }
}
