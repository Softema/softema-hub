import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient, type TenantTx, withTenant } from '@softema/db';
import { type ContactStage, normalizeSearch, type SegmentDto, type SegmentMatch, type SegmentMemberDto, type SegmentPreviewDto, type SegmentRule, type segmentCreateSchema, type segmentPreviewSchema, segmentRuleSchema, type segmentUpdateSchema } from '@softema/shared';
import { z } from 'zod';
import { ApiError, isUniqueViolation, notFound } from '../common/errors';
import { type Actor, isUuid } from '../common/guards';
import { APP_DB } from '../tokens';
import { segmentSql } from './segment-sql';

const SELECT = {
  id: true, name: true, description: true, match: true, rules: true, version: true, createdAt: true, updatedAt: true,
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.SegmentSelect;
type Row = Prisma.SegmentGetPayload<{ select: typeof SELECT }>;
const SAMPLE = 8;
const storedRules = z.array(segmentRuleSchema);
const duplicate = () => new ApiError(409, 'DUPLICATE_NAME', 'Segment s tímto názvem už v prostoru existuje.', { name: 'Segment s tímto názvem už v prostoru existuje.' });

/** Rules as stored. Only the API writes them, validated; should a row ever not parse, the segment matches nobody
 *  rather than everybody, so a campaign can never go to the whole database by mistake. */
function rulesOf(row: Pick<Row, 'match' | 'rules'>): { match: SegmentMatch; rules: SegmentRule[]; sql: Prisma.Sql } {
  const match: SegmentMatch = row.match === 'any' ? 'any' : 'all';
  const parsed = storedRules.safeParse(row.rules);
  return parsed.success ? { match, rules: parsed.data, sql: segmentSql(match, parsed.data) } : { match, rules: [], sql: Prisma.sql`false` };
}

@Injectable()
export class SegmentsService {
  constructor(@Inject(APP_DB) private readonly db: PrismaClient) {}

  private tx<T>(actor: Actor, fn: (tx: TenantTx) => Promise<T>) { return withTenant(this.db, actor, fn); }
  private audit(tx: TenantTx, actor: Actor, action: string, entityId: string, changedFields: string[] = []) {
    return tx.auditLog.create({ data: { workspaceId: actor.workspaceId, actorUserId: actor.userId, action, entity: 'segment', entityId, changedFields } });
  }

  /** Evaluated on the server over all live contacts of the workspace. The workspace filter duplicates RLS on purpose. */
  private async count(tx: TenantTx, actor: Actor, cond: Prisma.Sql) {
    const [r] = await tx.$queryRaw<{ n: bigint }[]>`select count(*) as n from hub.contact c where c.workspace_id = ${actor.workspaceId}::uuid and c.deleted_at is null and ${cond}`;
    return Number(r.n);
  }
  private sample(tx: TenantTx, actor: Actor, cond: Prisma.Sql) {
    return tx.$queryRaw<SegmentMemberDto[]>`select c.id::text as id, c.name, c.email, c.stage::text as stage from hub.contact c
      where c.workspace_id = ${actor.workspaceId}::uuid and c.deleted_at is null and ${cond}
      order by c.created_at desc, c.id desc limit ${SAMPLE}`;
  }
  private async find(tx: TenantTx, actor: Actor, id: string) {
    if (!isUuid(id)) throw notFound('Segment');
    const s = await tx.segment.findFirst({ where: { id, workspaceId: actor.workspaceId }, select: SELECT });
    if (!s) throw notFound('Segment');
    return s;
  }
  private async toDto(tx: TenantTx, actor: Actor, s: Row): Promise<SegmentDto> {
    const { match, rules, sql } = rulesOf(s);
    return { id: s.id, name: s.name, description: s.description, match, rules, count: await this.count(tx, actor, sql), createdBy: s.createdBy, version: s.version, createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString() };
  }

  list(actor: Actor): Promise<SegmentDto[]> {
    return this.tx(actor, async tx => {
      const rows = await tx.segment.findMany({ where: { workspaceId: actor.workspaceId }, orderBy: [{ name: 'asc' }, { id: 'asc' }], select: SELECT });
      const out: SegmentDto[] = [];
      for (const s of rows) out.push(await this.toDto(tx, actor, s));
      return out;
    });
  }

  detail(actor: Actor, id: string): Promise<SegmentDto> {
    return this.tx(actor, async tx => this.toDto(tx, actor, await this.find(tx, actor, id)));
  }

  /** Live count of an unsaved segment, a few members and how many contacts each rule matches on its own. */
  preview(actor: Actor, input: z.output<typeof segmentPreviewSchema>): Promise<SegmentPreviewDto> {
    return this.tx(actor, async tx => {
      const cond = segmentSql(input.match, input.rules);
      const total = await this.count(tx, actor, cond);
      const sample = (await this.sample(tx, actor, cond)).map(m => ({ ...m, stage: m.stage as ContactStage }));
      const ruleCounts: number[] = [];
      for (const r of input.rules) ruleCounts.push(await this.count(tx, actor, segmentSql('all', [r])));
      return { total, sample, ruleCounts };
    });
  }

  async create(actor: Actor, input: z.output<typeof segmentCreateSchema>): Promise<SegmentDto> {
    try {
      return await this.tx(actor, async tx => {
        const s = await tx.segment.create({
          data: { workspaceId: actor.workspaceId, name: input.name, nameNormalized: normalizeSearch(input.name), description: input.description, match: input.match, rules: input.rules, createdByUserId: actor.userId },
          select: SELECT,
        });
        await this.audit(tx, actor, 'segment.create', s.id);
        return this.toDto(tx, actor, s);
      });
    } catch (e) { if (isUniqueViolation(e)) throw duplicate(); throw e; }
  }

  async update(actor: Actor, id: string, input: z.output<typeof segmentUpdateSchema>): Promise<SegmentDto> {
    try {
      return await this.tx(actor, async tx => {
        const cur = await this.find(tx, actor, id);
        const before = rulesOf(cur);
        const next = { name: input.name ?? cur.name, description: input.description ?? cur.description, match: input.match ?? before.match, rules: input.rules ?? before.rules };
        const changed: string[] = (['name', 'description', 'match'] as const).filter(k => next[k] !== cur[k]);
        if (JSON.stringify(next.rules) !== JSON.stringify(before.rules)) changed.push('rules');
        // The version check and the write are one statement, so two members can never overwrite each other silently.
        const res = await tx.segment.updateMany({
          where: { id, workspaceId: actor.workspaceId, version: input.version },
          // Only what was sent is written, so stored rules that do not parse are never replaced by "no rules".
          data: { name: next.name, nameNormalized: normalizeSearch(next.name), description: next.description, ...(input.match ? { match: input.match } : {}), ...(input.rules ? { rules: input.rules } : {}), version: { increment: 1 } },
        });
        if (!res.count) throw new ApiError(409, 'VERSION_CONFLICT', 'Segment mezitím upravil někdo jiný. Načtěte aktuální verzi a změnu zopakujte.');
        await this.audit(tx, actor, 'segment.update', id, changed);
        return this.toDto(tx, actor, await this.find(tx, actor, id));
      });
    } catch (e) { if (isUniqueViolation(e)) throw duplicate(); throw e; }
  }

  /** Deletes only the rule; contacts stay untouched. */
  remove(actor: Actor, id: string): Promise<void> {
    return this.tx(actor, async tx => {
      await this.find(tx, actor, id);
      await tx.segment.deleteMany({ where: { id, workspaceId: actor.workspaceId } });
      await this.audit(tx, actor, 'segment.delete', id);
    });
  }
}

