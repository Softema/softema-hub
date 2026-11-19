import { Prisma } from '@softema/db';
import { normalizeSearch, type SegmentMatch, type SegmentRule } from '@softema/shared';

/**
 * SQL condition over `hub.contact c` for validated segment rules. Every value is a bound parameter; text comparisons
 * ignore case and diacritics like the contact search (hub.search_fold), substring tests use strpos, so user input is
 * never a LIKE pattern. Deleted contacts and the workspace are filtered by the caller (and by RLS).
 */
export function ruleSql(r: SegmentRule): Prisma.Sql {
  const fold = (col: Prisma.Sql) => Prisma.sql`hub.search_fold(${col})`;
  const v = Prisma.sql`hub.search_fold(${r.value})`;
  const textHit = (col: Prisma.Sql) => (r.op === 'contains' ? Prisma.sql`strpos(${fold(col)}, ${v}) > 0` : Prisma.sql`${fold(col)} = ${v}`);
  let hit: Prisma.Sql;
  switch (r.field) {
    case 'tag': {
      // tag.name_normalized is written with normalizeSearch, so compare against the same folding.
      const t = normalizeSearch(r.value);
      hit = Prisma.sql`exists (select 1 from hub.contact_tag ct join hub.tag t on t.id = ct.tag_id
        where ct.contact_id = c.id and ct.workspace_id = c.workspace_id
        and ${r.op === 'contains' ? Prisma.sql`strpos(t.name_normalized, ${t}) > 0` : Prisma.sql`t.name_normalized = ${t}`})`;
      break;
    }
    case 'stage': hit = Prisma.sql`c.stage::text = ${r.value}`; break;
    case 'source': hit = textHit(Prisma.sql`c.source`); break;
    case 'city': hit = textHit(Prisma.sql`c.city`); break;
    // "Firma není X" negates "obsahuje X", as in the demo.
    case 'company': hit = Prisma.sql`strpos(${fold(Prisma.sql`c.company`)}, ${v}) > 0`; break;
    case 'createdDays': return Prisma.sql`c.created_at > now() - make_interval(days => ${Number(r.value)}::int)`;
    case 'customField': {
      // Field names are matched like the API matches them (one spelling per workspace, case and diacritics ignored).
      // A non-object value (legacy or manual edit) reads as no fields instead of failing the whole query.
      hit = Prisma.sql`exists (select 1 from jsonb_each_text(case when jsonb_typeof(c.custom_fields) = 'object' then c.custom_fields else '{}'::jsonb end) f
        where hub.search_fold(f.key) = hub.search_fold(${r.key ?? ''}) and ${textHit(Prisma.sql`f.value`)})`;
      break;
    }
  }
  return r.op === 'isNot' ? Prisma.sql`not (${hit})` : hit;
}

/** No rules means every contact, as in the demo editor. */
export function segmentSql(match: SegmentMatch, rules: SegmentRule[]): Prisma.Sql {
  if (!rules.length) return Prisma.sql`true`;
  return Prisma.sql`(${Prisma.join(rules.map(r => Prisma.sql`(${ruleSql(r)})`), match === 'all' ? ' and ' : ' or ')})`;
}
