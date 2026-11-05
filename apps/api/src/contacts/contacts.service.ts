import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient, type TenantTx, withTenant } from '@softema/db';
import { type ActivityDto, type ActivityKind, type ActivityPageDto, type ContactDetailDto, type ContactDto, type ContactListDto, type contactCreateSchema, type contactListQuerySchema, type contactUpdateSchema, type NoteDto, normalizeEmail, normalizeSearch, STAGE_LABEL, type TagDto } from '@softema/shared';
import type { z } from 'zod';
import { ApiError, isUniqueViolation, notFound } from '../common/errors';
import { type Actor, isUuid } from '../common/guards';
import { APP_DB } from '../tokens';

const SELECT = {
  id: true, name: true, email: true, phone: true, company: true, city: true, stage: true, source: true, version: true, createdAt: true, updatedAt: true,
  owner: { select: { id: true, name: true } },
  tags: { select: { tag: { select: { id: true, name: true } } }, orderBy: { tag: { name: 'asc' } } },
} satisfies Prisma.ContactSelect;
type Row = Prisma.ContactGetPayload<{ select: typeof SELECT }>;
const NOTE_SELECT = { id: true, body: true, createdAt: true, updatedAt: true, author: { select: { id: true, name: true } } } satisfies Prisma.NoteSelect;

const toDto = (c: Row): ContactDto => ({ ...c, tags: c.tags.map(t => t.tag), createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString() });
const toNote = (n: Prisma.NoteGetPayload<{ select: typeof NOTE_SELECT }>): NoteDto => ({ ...n, createdAt: n.createdAt.toISOString(), updatedAt: n.updatedAt.toISOString() });
const FIELD_LABEL: Record<string, string> = { name: 'jméno', email: 'e-mail', phone: 'telefon', company: 'firma', city: 'město', ownerId: 'vlastník' };
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

  list(actor: Actor, q: z.output<typeof contactListQuerySchema>): Promise<ContactListDto> {
    const where: Prisma.ContactWhereInput = {
      workspaceId: actor.workspaceId, deletedAt: null,
      ...(q.q ? { searchText: { contains: normalizeSearch(q.q) } } : {}),
      ...(q.stage ? { stage: q.stage } : {}), ...(q.source ? { source: q.source } : {}),
      ...(q.tag ? { tags: { some: { tag: { nameNormalized: normalizeSearch(q.tag) } } } } : {}),
    };
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
        const c = await tx.contact.create({ data: { workspaceId: actor.workspaceId, name: input.name, email: input.email, emailNormalized: normalizeEmail(input.email), phone: input.phone, company: input.company, city: input.city, stage: input.stage, ownerUserId: ownerId ?? null }, select: { id: true } });
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
        const { version, ownerId, ...fields } = input;
        const changed = (Object.keys(fields) as (keyof typeof fields)[]).filter(k => fields[k] !== undefined && fields[k] !== cur[k]);
        const ownerChanged = ownerId !== undefined && ownerId !== (cur.owner?.id ?? null);
        if (ownerChanged && ownerId) await this.member(tx, actor, ownerId);
        // The version check and the write are one statement, so two members can never overwrite each other silently.
        const res = await tx.contact.updateMany({
          where: { id, workspaceId: actor.workspaceId, deletedAt: null, version },
          data: { ...fields, ...(fields.email ? { emailNormalized: normalizeEmail(fields.email) } : {}), ...(ownerChanged ? { ownerUserId: ownerId } : {}), version: { increment: 1 } },
        });
        if (!res.count) throw new ApiError(409, 'VERSION_CONFLICT', 'Kontakt mezitím upravil někdo jiný. Načtěte aktuální data a změnu zopakujte.');
        const names = [...changed.filter(k => k !== 'stage'), ...(ownerChanged ? ['ownerId'] : [])];
        if (input.stage && changed.includes('stage')) await this.activity(tx, actor, id, 'stage', `Fáze změněna na ${STAGE_LABEL[input.stage]}`, `Předtím: ${STAGE_LABEL[cur.stage]}`);
        if (names.length) await this.activity(tx, actor, id, 'contact', 'Kontakt upraven', `Změněno: ${names.map(n => FIELD_LABEL[n] ?? n).join(', ')}`);
        await this.audit(tx, actor, 'update', 'contact', id, [...changed, ...(ownerChanged ? ['ownerId'] : [])]);
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
