'use client';
/* CRM sections: segments (rule builder with live counts), deal pipeline, consents overview and CSV import. */
import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, Download, FileUp, GripVertical, Mail, MoreHorizontal, Pencil, Plus, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { fmt, fmtDate, fmtDateTime, isEmail, money, newId, normalize, percent, plural } from '@/lib/hub/format';
import { canEmail, segmentContext, segmentMembers } from '@/lib/hub/logic';
import { afterContactCreated, findByEmail, logActivity, makeContact, nextContactIdIn, setConsent } from '@/lib/hub/ops';
import { DEAL_STAGES, type ConsentState, type Contact, type Deal, type DealStage, type Lifecycle, type Segment, type SegmentField, type SegmentRule } from '@/lib/hub/types';
import { useHub, useUnsavedGuard } from './state';
import { Avatar, Badge, Btn, Field, IconBtn, Metric, PageHead, Pick } from './ui';
import { FormError, Notice, Section, download, parseCsv, toCsv, useConfirm, useRoute } from './kit';
import { CONSENTS, CrmHead, STAGES, consentTone } from './crm-shared';
import { NewDeal } from './contact-detail';

/* ===================== Segments ===================== */
const OP_LABEL: Record<SegmentRule['op'], string> = { is: 'je', isNot: 'není', contains: 'obsahuje', lessThan: 'za posledních' };
type FieldDef = { label: string; ops: SegmentRule['op'][]; kind: 'select' | 'text' | 'number' };
const FIELDS: Record<SegmentField, FieldDef> = {
  tag: { label: 'Štítek', ops: ['is', 'isNot', 'contains'], kind: 'select' },
  stage: { label: 'Fáze', ops: ['is', 'isNot'], kind: 'select' },
  source: { label: 'Zdroj', ops: ['is', 'isNot'], kind: 'select' },
  consent: { label: 'Souhlas', ops: ['is', 'isNot'], kind: 'select' },
  city: { label: 'Město', ops: ['is', 'isNot', 'contains'], kind: 'text' },
  company: { label: 'Firma', ops: ['contains', 'isNot'], kind: 'text' },
  createdDays: { label: 'Přidán do databáze', ops: ['lessThan'], kind: 'number' },
  customField: { label: 'Vlastní pole', ops: ['is', 'isNot', 'contains'], kind: 'text' },
  course: { label: 'Kurz', ops: ['is', 'isNot'], kind: 'select' },
  webinar: { label: 'Webinář (registrace)', ops: ['is', 'isNot'], kind: 'select' },
};

function useRuleOptions() {
  const { w } = useHub();
  return useMemo(() => {
    const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'cs'));
    return {
      tag: uniq(w.contacts.flatMap(c => c.tags)).map(t => [t, t] as [string, string]),
      stage: STAGES.map(s => [s, s] as [string, string]),
      source: uniq(w.contacts.map(c => c.source)).map(t => [t, t] as [string, string]),
      consent: CONSENTS.map(s => [s, s] as [string, string]),
      course: w.courses.map(c => [c.id, c.title] as [string, string]),
      webinar: w.webinars.map(x => [x.id, x.title] as [string, string]),
      customKeys: uniq(w.contacts.flatMap(c => c.customFields.map(f => f.name))),
    };
  }, [w.contacts, w.courses, w.webinars]);
}

export function ruleText(r: SegmentRule, names: { course: [string, string][]; webinar: [string, string][] }) {
  const def = FIELDS[r.field];
  const value = r.field === 'course' ? names.course.find(x => x[0] === r.value)?.[1] ?? 'smazaný kurz' : r.field === 'webinar' ? names.webinar.find(x => x[0] === r.value)?.[1] ?? 'smazaný webinář' : r.value;
  if (r.field === 'createdDays') return `${def.label} za posledních ${r.value} dní`;
  return `${r.field === 'customField' ? r.key || def.label : def.label} ${OP_LABEL[r.op]} ${value || '…'}`;
}

export function Segments() {
  const { parts } = useRoute();
  if (parts[2]) return <SegmentBuilder id={parts[2] === 'novy' ? undefined : parts[2]} />;
  return <SegmentList />;
}

function SegmentList() {
  const { w, data, workspaceId, go, mutate } = useHub();
  const opts = useRuleOptions();
  const ctx = useMemo(() => segmentContext(data, workspaceId), [data, workspaceId]);
  const [confirmEl, confirm] = useConfirm();
  const rows = w.segments.map(s => { const members = segmentMembers(w.contacts, s, ctx); return { s, members: members.length, eligible: members.filter(canEmail).length, campaigns: w.campaigns.filter(c => c.audience.type === 'segment' && c.audience.segmentId === s.id) }; });
  const duplicate = (s: Segment) => { const copy: Segment = { ...s, id: newId('seg'), name: `${s.name} (kopie)`, createdAt: new Date().toISOString(), rules: s.rules.map(r => ({ ...r, id: newId('r') })) }; mutate(d => ({ ...d, segments: [...d.segments, copy] })); toast.success('Segment byl zkopírován.'); go('kontakty/segmenty/' + copy.id); };
  const remove = (s: Segment, used: number, scheduled: number) => {
    if (scheduled) { toast.error('Segment používá naplánovaná kampaň. Nejdřív u ní změňte příjemce.'); return; }
    confirm({ title: `Smazat segment ${s.name}?`, danger: true, confirm: 'Smazat segment', desc: used ? `Segment používá ${plural(used, 'kampaň', 'kampaně', 'kampaní')}. Odeslané kampaně si příjemce pamatují, koncepty bude nutné upravit.` : 'Kontakty zůstanou, smaže se jen pravidlo segmentu.', onConfirm: () => { mutate(d => ({ ...d, segments: d.segments.filter(x => !(x.workspaceId === workspaceId && x.id === s.id)) })); toast.success('Segment byl smazán.'); } });
  };
  return (
    <div className="page">
      <CrmHead active="kontakty/segmenty" title="Segmenty" desc="Dynamické skupiny kontaktů podle pravidel. Počty se počítají z aktuálních dat.">
        <Btn primary onClick={() => go('kontakty/segmenty/novy')}><Plus aria-hidden />Nový segment</Btn>
      </CrmHead>
      <section className="panel">
        {rows.length ? (
          <div className="table-scroll">
            <table className="hub-table data-table">
              <thead><tr><th>Segment</th><th className="col-opt">Pravidla</th><th className="num">Kontakty</th><th className="num">Se souhlasem</th><th className="col-opt">Kampaně</th><th aria-label="Akce" /></tr></thead>
              <tbody>
                {rows.map(({ s, members, eligible, campaigns }) => (
                  <tr key={s.id} onClick={() => go('kontakty/segmenty/' + s.id)}>
                    <td><div className="name-cell"><button type="button" onClick={e => { e.stopPropagation(); go('kontakty/segmenty/' + s.id); }}>{s.name}<small>{s.description || 'Bez popisu'}</small></button></div></td>
                    <td className="col-opt wrap muted small">{s.rules.length ? s.rules.map(r => ruleText(r, opts)).join(s.match === 'all' ? ' a ' : ' nebo ') : 'Všechny kontakty'}</td>
                    <td className="num"><button type="button" className="link-num" onClick={e => { e.stopPropagation(); go('kontakty/segmenty/' + s.id); }}>{fmt(members)}</button></td>
                    <td className="num">{fmt(eligible)}</td>
                    <td className="col-opt muted">{campaigns.length ? plural(campaigns.length, 'kampaň', 'kampaně', 'kampaní') : '—'}</td>
                    <td className="col-actions" onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><button type="button" className="icon-btn" aria-label={`Akce segmentu ${s.name}`}><MoreHorizontal aria-hidden /></button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => go('kontakty/segmenty/' + s.id)}><Pencil aria-hidden />Upravit pravidla</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => go(`kampane/nova?segment=${s.id}`)}><Mail aria-hidden />Nová kampaň pro segment</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => duplicate(s)}><Copy aria-hidden />Duplikovat</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => remove(s, campaigns.length, campaigns.filter(c => c.status === 'Naplánováno').length)}><Trash2 aria-hidden />Smazat</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty"><h3>Zatím nemáte žádný segment</h3><p>Segment vybírá kontakty podle štítků, fáze, souhlasu, kurzů nebo webinářů.</p><Btn primary onClick={() => go('kontakty/segmenty/novy')}><Plus aria-hidden />Vytvořit segment</Btn></div>}
      </section>
      {confirmEl}
    </div>
  );
}

function SegmentBuilder({ id }: { id?: string }) {
  const { w, data, workspaceId, go, mutate, setGuard } = useHub();
  const existing = id ? w.segments.find(s => s.id === id) : undefined;
  const initial = useMemo<Segment>(() => existing ?? { id: newId('seg'), workspaceId, name: '', description: '', match: 'all', rules: [{ id: newId('r'), field: 'tag', op: 'is', value: '' }], createdAt: new Date().toISOString() }, [existing, workspaceId]);
  const [draft, setDraft] = useState<Segment>(initial);
  const [error, setError] = useState('');
  const opts = useRuleOptions();
  const ctx = useMemo(() => segmentContext(data, workspaceId), [data, workspaceId]);
  const valid = draft.rules.filter(r => r.value.trim() && (r.field !== 'customField' || r.key));
  const members = useMemo(() => segmentMembers(w.contacts, { ...draft, rules: valid }, ctx), [w.contacts, draft, valid, ctx]);
  const eligible = members.filter(canEmail).length;
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  useUnsavedGuard(dirty, 'Segment má neuložené změny.');
  if (id && !existing) return <div className="page"><section className="panel empty"><h3>Segment nenalezen</h3><p>V tomto pracovním prostoru segment neexistuje.</p><Btn primary onClick={() => go('kontakty/segmenty')}>Zpět na segmenty</Btn></section></div>;

  const setRule = (rid: string, patch: Partial<SegmentRule>) => setDraft(d => ({ ...d, rules: d.rules.map(r => (r.id === rid ? { ...r, ...patch } : r)) }));
  const save = () => {
    const name = draft.name.trim();
    if (!name) return setError('Pojmenujte segment.');
    if (w.segments.some(s => s.id !== draft.id && normalize(s.name) === normalize(name))) return setError('Segment s tímto názvem už existuje.');
    if (draft.rules.some(r => !r.value.trim() || (r.field === 'customField' && !r.key))) return setError('Doplňte hodnoty všech pravidel, nebo nedokončená pravidla odeberte.');
    const next = { ...draft, name, description: draft.description.trim() };
    mutate(d => ({ ...d, segments: existing ? d.segments.map(s => (s.workspaceId === workspaceId && s.id === next.id ? next : s)) : [...d.segments, next] }));
    setDraft(next); setError('');
    toast.success(existing ? 'Segment byl uložen.' : 'Segment byl vytvořen.');
    if (!existing) { setGuard(null); go('kontakty/segmenty/' + next.id, { replace: true }); }
  };

  return (
    <div className="page">
      <button type="button" className="back-link" onClick={() => go('kontakty/segmenty')}><ArrowLeft size={15} aria-hidden />Zpět na segmenty</button>
      <PageHead title={existing ? existing.name : 'Nový segment'} desc="Pravidla se vyhodnocují nad aktuálními kontakty. Výsledek se mění, jak se mění data.">
        <Btn onClick={() => go(`kampane/nova?segment=${draft.id}`)} disabled={!existing || dirty} title={!existing || dirty ? 'Nejdřív segment uložte' : undefined}><Mail aria-hidden />Kampaň pro segment</Btn>
        <Btn primary onClick={save} disabled={!dirty && !!existing}><Check aria-hidden />{existing ? 'Uložit změny' : 'Vytvořit segment'}</Btn>
      </PageHead>
      <div className="split">
        <div className="stack">
          <Section title="Základní údaje">
            <div className="sec-body stack">
              <Field label="Název segmentu"><input value={draft.name} onChange={e => { setDraft({ ...draft, name: e.target.value }); setError(''); }} placeholder="Např. Aktivní klienti z Brna" maxLength={80} /></Field>
              <Field label="Popis (nepovinné)"><input value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} maxLength={200} /></Field>
            </div>
          </Section>
          <Section title="Pravidla" desc={draft.rules.length > 1 ? undefined : 'Bez pravidel segment obsahuje všechny kontakty.'} actions={draft.rules.length > 1 && (
            <div className="segmented" role="group" aria-label="Kombinace pravidel">
              <button type="button" className={draft.match === 'all' ? 'active' : ''} aria-pressed={draft.match === 'all'} onClick={() => setDraft({ ...draft, match: 'all' })}>Splňuje vše</button>
              <button type="button" className={draft.match === 'any' ? 'active' : ''} aria-pressed={draft.match === 'any'} onClick={() => setDraft({ ...draft, match: 'any' })}>Aspoň jedno</button>
            </div>
          )}>
            <div className="sec-body stack-sm">
              {draft.rules.map((r, k) => {
                const def = FIELDS[r.field];
                const options = r.field === 'tag' ? opts.tag : r.field === 'stage' ? opts.stage : r.field === 'source' ? opts.source : r.field === 'consent' ? opts.consent : r.field === 'course' ? opts.course : r.field === 'webinar' ? opts.webinar : [];
                const count = segmentMembers(w.contacts, { ...draft, match: 'all', rules: r.value.trim() ? [r] : [] }, ctx).length;
                return (
                  <div key={r.id} className="rule-row">
                    <span className="rule-join">{k === 0 ? 'Kde' : draft.match === 'all' ? 'a' : 'nebo'}</span>
                    <Pick value={r.field} onChange={v => { const f = v as SegmentField; setRule(r.id, { field: f, op: FIELDS[f].ops[0], value: f === 'createdDays' ? '30' : '', key: undefined }); }} options={(Object.keys(FIELDS) as SegmentField[]).map(f => [f, FIELDS[f].label] as [string, string])} label={`Pole pravidla ${k + 1}`} />
                    {r.field === 'customField' && <Pick value={r.key ?? ''} onChange={v => setRule(r.id, { key: v })} options={opts.customKeys.length ? opts.customKeys : [['', 'Žádná vlastní pole']]} label="Název vlastního pole" />}
                    {def.ops.length > 1 ? <Pick value={r.op} onChange={v => setRule(r.id, { op: v as SegmentRule['op'] })} options={def.ops.map(o => [o, OP_LABEL[o]] as [string, string])} label={`Podmínka pravidla ${k + 1}`} /> : <span className="rule-op">{OP_LABEL[r.op]}</span>}
                    {def.kind === 'select' && r.op !== 'contains'
                      ? <Pick value={r.value} onChange={v => setRule(r.id, { value: v })} options={options.length ? options : [['', 'Žádné možnosti']]} label={`Hodnota pravidla ${k + 1}`} />
                      : def.kind === 'number' ? <span className="rule-num"><input type="number" min={1} max={3650} value={r.value} onChange={e => setRule(r.id, { value: e.target.value })} aria-label="Počet dní" /> dní</span>
                      : <input value={r.value} onChange={e => setRule(r.id, { value: e.target.value })} aria-label={`Hodnota pravidla ${k + 1}`} placeholder="Hodnota" />}
                    <span className="rule-count muted small" title="Kontakty splňující jen toto pravidlo">{r.value.trim() ? fmt(count) : '—'}</span>
                    <IconBtn label={`Odebrat pravidlo ${k + 1}`} onClick={() => setDraft(d => ({ ...d, rules: d.rules.filter(x => x.id !== r.id) }))}><Trash2 /></IconBtn>
                  </div>
                );
              })}
              <div><Btn onClick={() => setDraft(d => ({ ...d, rules: [...d.rules, { id: newId('r'), field: 'tag', op: 'is', value: '' }] }))}><Plus aria-hidden />Přidat pravidlo</Btn></div>
              <FormError>{error}</FormError>
            </div>
          </Section>
        </div>
        <Section title="Náhled segmentu" className="sticky-side" desc={valid.length < draft.rules.length ? 'Nedokončená pravidla se zatím nepočítají.' : undefined}>
          <div className="sec-body">
            <div className="seg-count"><strong>{fmt(members.length)}</strong><span>{plural(members.length, 'kontakt', 'kontakty', 'kontaktů', false)}</span></div>
            <p className="small muted">{fmt(eligible)} se souhlasem s e-mailingem · {fmt(members.length - eligible)} bez souhlasu (kampaň je vynechá)</p>
            <ul className="mini-list">
              {members.slice(0, 8).map(c => <li key={c.id}><button type="button" onClick={() => go('kontakty/' + c.id)}><Avatar name={c.name} color={c.color} size="sm" /><span>{c.name}<small>{c.email}</small></span><Badge tone={consentTone(c.consent.state)}>{c.consent.state}</Badge></button></li>)}
            </ul>
            {members.length > 8 && <p className="small muted">a dalších {fmt(members.length - 8)}</p>}
            {!members.length && <p className="muted">Pravidlům zatím neodpovídá žádný kontakt.</p>}
          </div>
        </Section>
      </div>
    </div>
  );
}

/* ===================== Pipeline ===================== */
const DEAL_PROB: Record<DealStage, number> = { 'Nový lead': 10, 'Kvalifikace': 25, 'Nabídka odeslána': 65, 'Vyjednávání': 80, 'Vyhráno': 100, 'Prohráno': 0 };
export function Pipeline() {
  const { w, workspaceId, go, mutate } = useHub();
  const [creating, setCreating] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<DealStage | null>(null);
  const [confirmEl, confirm] = useConfirm();
  const contacts = useMemo(() => new Map(w.contacts.map(c => [c.id, c])), [w.contacts]);
  const open = w.deals.filter(d => d.stage !== 'Vyhráno' && d.stage !== 'Prohráno');
  const won = w.deals.filter(d => d.stage === 'Vyhráno'); const lost = w.deals.filter(d => d.stage === 'Prohráno');
  const move = (d: Deal, stage: DealStage) => {
    if (d.stage === stage) return;
    mutate(x => logActivity({ ...x, deals: x.deals.map(y => (y.workspaceId === workspaceId && y.id === d.id ? { ...y, stage, probability: DEAL_PROB[stage], updatedAt: new Date().toISOString() } : y)) }, workspaceId, d.contactId, 'deal', `Obchod přesunut do fáze ${stage}`, d.title, 'kontakty/pipeline'));
    toast.success(`„${d.title}“ → ${stage}`);
  };
  return (
    <div className="page">
      <CrmHead active="kontakty/pipeline" title="Pipeline" desc="Obchodní příležitosti podle fáze. Přetáhněte kartu, nebo použijte nabídku Přesunout.">
        <Btn primary onClick={() => setCreating(true)}><Plus aria-hidden />Nový obchod</Btn>
      </CrmHead>
      <div className="metric-grid">
        <Metric label="Otevřené obchody" value={money(open.reduce((s, d) => s + d.value, 0))} desc={plural(open.length, 'obchod', 'obchody', 'obchodů')} />
        <Metric label="Vážená hodnota" value={money(open.reduce((s, d) => s + (d.value * d.probability) / 100, 0))} desc="hodnota × pravděpodobnost" />
        <Metric label="Vyhráno" value={money(won.reduce((s, d) => s + d.value, 0))} desc={plural(won.length, 'obchod', 'obchody', 'obchodů')} />
        <Metric label="Úspěšnost" value={won.length + lost.length ? percent((won.length / (won.length + lost.length)) * 100) : '—'} desc="vyhrané z uzavřených" />
      </div>
      <div className="kanban" role="list" aria-label="Fáze pipeline">
        {DEAL_STAGES.map(stage => {
          const deals = w.deals.filter(d => d.stage === stage).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
          return (
            <section key={stage} role="listitem" className={`kanban-col ${over === stage ? 'is-over' : ''}`} aria-label={`${stage}: ${deals.length}`}
              onDragOver={e => { if (dragId) { e.preventDefault(); setOver(stage); } }} onDragLeave={() => setOver(o => (o === stage ? null : o))}
              onDrop={e => { e.preventDefault(); const d = w.deals.find(x => x.id === dragId); if (d) move(d, stage); setDragId(null); setOver(null); }}>
              <header><h2>{stage}</h2><span className="muted small">{deals.length} · {money(deals.reduce((s, d) => s + d.value, 0))}</span></header>
              <div className="kanban-cards">
                {deals.map(d => { const c = contacts.get(d.contactId); return (
                  <article key={d.id} className={`deal-card ${dragId === d.id ? 'is-dragging' : ''}`} draggable onDragStart={e => { setDragId(d.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', d.id); }} onDragEnd={() => { setDragId(null); setOver(null); }}>
                    <div className="deal-top">
                      <GripVertical size={14} aria-hidden className="muted grip" />
                      <button type="button" className="deal-title" onClick={() => c && go('kontakty/' + c.id)}>{d.title}</button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><button type="button" className="icon-btn" aria-label={`Akce obchodu ${d.title}`}><MoreHorizontal aria-hidden /></button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Přesunout do</DropdownMenuLabel>
                          {DEAL_STAGES.filter(s => s !== d.stage).map(s => <DropdownMenuItem key={s} onSelect={() => move(d, s)}><ArrowRight aria-hidden />{s}</DropdownMenuItem>)}
                          <DropdownMenuSeparator />
                          {c && <DropdownMenuItem onSelect={() => go('kontakty/' + c.id)}>Otevřít kontakt</DropdownMenuItem>}
                          <DropdownMenuItem variant="destructive" onSelect={() => confirm({ title: 'Smazat obchod?', desc: `„${d.title}“ se odstraní z pipeline.`, confirm: 'Smazat', danger: true, onConfirm: () => { mutate(x => ({ ...x, deals: x.deals.filter(y => !(y.workspaceId === workspaceId && y.id === d.id)) })); toast.success('Obchod byl smazán.'); } })}><Trash2 aria-hidden />Smazat</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="deal-meta"><span>{c?.name ?? 'Smazaný kontakt'}</span><strong>{money(d.value)}</strong></div>
                    <small className="muted">Aktualizováno {fmtDate(d.updatedAt)} · {d.probability} %</small>
                  </article>
                ); })}
                {!deals.length && <p className="kanban-empty">Žádné obchody</p>}
              </div>
            </section>
          );
        })}
      </div>
      <NewDeal open={creating} onClose={() => setCreating(false)} />
      {confirmEl}
    </div>
  );
}

/* ===================== Consents ===================== */
export function Consents() {
  const { w, workspaceId, go, mutate, log } = useHub();
  const [filter, setFilter] = useState<'all' | ConsentState>('all');
  const counts = Object.fromEntries(CONSENTS.map(s => [s, w.contacts.filter(c => c.consent.state === s).length])) as Record<ConsentState, number>;
  const events = useMemo(() => w.contacts.flatMap(c => c.consent.history.map((h, k) => ({ key: `${c.id}-${k}`, c, h }))).filter(e => filter === 'all' || e.h.state === filter).sort((a, b) => b.h.date.localeCompare(a.h.date)).slice(0, 60), [w.contacts, filter]);
  const pending = w.contacts.filter(c => c.consent.state === 'Čeká na potvrzení');
  const evidence = () => download('evidence-souhlasu.csv', toCsv([['Kontakt', 'E-mail', 'Stav', 'Zdroj', 'Datum', 'IP adresa', 'Double opt-in'], ...w.contacts.flatMap(c => c.consent.history.map(h => [c.name, c.email, h.state, h.source, fmtDateTime(h.date), c.consent.ip, c.consent.doubleOptIn ? 'ano' : 'ne']))]));
  return (
    <div className="page">
      <CrmHead active="kontakty/souhlasy" title="Souhlasy (GDPR)" desc="Souhlas s e-mailingem je oddělený od fáze kontaktu. Kampaně posíláme jen kontaktům se stavem Udělen.">
        <Btn onClick={evidence}><Download aria-hidden />Export evidence</Btn>
      </CrmHead>
      <div className="metric-grid">
        {CONSENTS.map(s => <button key={s} type="button" className="metric metric-link" onClick={() => go(`kontakty?souhlas=${encodeURIComponent(s)}`)}><div className="metric-label">{s}</div><div className="metric-value">{fmt(counts[s])}</div><div className="metric-foot"><span>{w.contacts.length ? percent((counts[s] / w.contacts.length) * 100) : '—'} kontaktů · zobrazit</span></div></button>)}
      </div>
      <Notice>Potvrzovací e-maily (double opt-in) a odkazy pro odhlášení v prototypu neodcházejí. Akce níže jen simulují kliknutí kontaktu a zapisují je do historie souhlasu.</Notice>
      <div className="split mt-4">
        <Section title="Historie změn" desc="Nejnovějších 60 záznamů" actions={<Pick value={filter} onChange={v => setFilter(v as 'all' | ConsentState)} options={[['all', 'Všechny stavy'], ...CONSENTS.map(s => [s, s] as [string, string])]} label="Filtr stavu" />}>
          <ul className="row-list sec-body">
            {events.map(({ key, c, h }) => (
              <li key={key}><button type="button" className="row-item" onClick={() => go('kontakty/' + c.id)}>
                <Avatar name={c.name} color={c.color} size="sm" />
                <span className="row-main"><strong>{c.name}</strong><small>{h.source} · {fmtDateTime(h.date)}</small></span>
                <Badge tone={consentTone(h.state)}>{h.state}</Badge>
              </button></li>
            ))}
            {!events.length && <li className="muted">Žádné záznamy.</li>}
          </ul>
        </Section>
        <Section title="Čeká na potvrzení" desc={plural(pending.length, 'kontakt', 'kontakty', 'kontaktů')} className="sticky-side">
          <div className="sec-body stack-sm">
            {pending.slice(0, 12).map(c => <button key={c.id} type="button" className="side-link" onClick={() => go('kontakty/' + c.id)}><strong>{c.name}</strong><small>{c.consent.source} · {fmtDate(c.consent.date)}</small></button>)}
            {pending.length > 12 && <p className="small muted">a dalších {pending.length - 12}</p>}
            {pending.length ? <>
              <Btn onClick={() => { pending.forEach(c => log(c.id, 'consent', 'Připomenutí potvrzení souhlasu (simulace)', 'Nic se neodeslalo')); toast.success(`Připomenutí zapsáno u ${plural(pending.length, 'kontaktu', 'kontaktů', 'kontaktů')} (simulace).`); }}><Mail aria-hidden />Připomenout potvrzení</Btn>
              <Btn onClick={() => { mutate(d => setConsent(d, workspaceId, pending.map(c => c.id), 'Udělen', 'Potvrzení double opt-in (simulace)', true)); toast.success('Souhlasy byly potvrzeny (simulace).'); }}><ShieldCheck aria-hidden />Simulovat potvrzení všech</Btn>
            </> : <p className="muted">Nikdo nečeká na potvrzení.</p>}
          </div>
        </Section>
      </div>
    </div>
  );
}

/* ===================== CSV import ===================== */
type MapKey = 'ignore' | 'name' | 'firstName' | 'lastName' | 'email' | 'phone' | 'company' | 'city' | 'tags' | 'stage' | 'custom';
const MAP_LABEL: Record<MapKey, string> = { ignore: 'Neimportovat', name: 'Jméno a příjmení', firstName: 'Křestní jméno', lastName: 'Příjmení', email: 'E-mail', phone: 'Telefon', company: 'Firma', city: 'Město', tags: 'Štítky', stage: 'Fáze', custom: 'Vlastní pole' };
const guess = (h: string): MapKey => {
  const n = normalize(h).replace(/[^a-z]/g, '');
  if (/^(email|mail|emailovaadresa)$/.test(n)) return 'email';
  if (/^(jmenoaprijmeni|celejmeno|name|fullname|jmeno)$/.test(n)) return 'name';
  if (/^(krestnijmeno|firstname)$/.test(n)) return 'firstName';
  if (/^(prijmeni|lastname|surname)$/.test(n)) return 'lastName';
  if (/^(telefon|tel|phone|mobil)$/.test(n)) return 'phone';
  if (/^(firma|spolecnost|company|organizace)$/.test(n)) return 'company';
  if (/^(mesto|city|obec)$/.test(n)) return 'city';
  if (/^(stitky|stitek|tags|tag)$/.test(n)) return 'tags';
  if (/^(faze|stage|stav)$/.test(n)) return 'stage';
  return 'custom';
};
const SAMPLE = 'Jméno a příjmení;E-mail;Firma;Město;Štítky;Obor\nJana Ukázková;jana.ukazkova@posta.example;Ukázka Studio;Brno;Newsletter, Webinář;Design\nPetr Smyšlený;petr@smysleny.example;Smyšlený a syn;Praha;Newsletter;Stavebnictví\nNeplatný řádek;bez-zavinace;;;;\n';
type Row = { line: number; name: string; email: string; phone: string; company: string; city: string; tags: string[]; stage?: Lifecycle; custom: { name: string; value: string }[]; error?: string; dup?: 'file' | 'existing'; existingId?: number };

export function ImportWizard() {
  const { data, w, workspaceId, go, mutate, settings } = useHub();
  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState('');
  const [text, setText] = useState('');
  const [header, setHeader] = useState(true);
  const [map, setMap] = useState<MapKey[]>([]);
  const [opts, setOpts] = useState({ tags: 'Import', consent: 'none' as 'none' | 'given', dupes: 'skip' as 'skip' | 'update' });
  const [result, setResult] = useState<null | { created: number; updated: number; skipped: number; invalid: number; ids: number[] }>(null);
  const [error, setError] = useState('');
  useUnsavedGuard(step > 1 && step < 4, 'Import není dokončený. Pokud odejdete, nic se nenaimportuje.');

  const table = useMemo(() => parseCsv(text), [text]);
  const heads = useMemo(() => (header ? table[0] ?? [] : (table[0] ?? []).map((_, k) => `Sloupec ${k + 1}`)), [header, table]);
  const body = useMemo(() => (header ? table.slice(1) : table), [header, table]);
  const rows: Row[] = useMemo(() => {
    const seen = new Set<string>();
    return body.map((cells, k) => {
      const get = (key: MapKey) => cells.filter((_, i) => map[i] === key).join(' ').trim();
      const name = get('name') || `${get('firstName')} ${get('lastName')}`.trim();
      const email = get('email').toLowerCase();
      const stage = STAGES.find(s => normalize(s) === normalize(get('stage')));
      const row: Row = { line: k + (header ? 2 : 1), name, email, phone: get('phone'), company: get('company'), city: get('city'), tags: get('tags').split(/[,|]/).map(t => t.trim()).filter(Boolean), stage, custom: cells.map((v, i) => (map[i] === 'custom' && v ? { name: heads[i], value: v } : null)).filter((x): x is { name: string; value: string } => !!x) };
      if (!name) row.error = 'Chybí jméno';
      else if (!email) row.error = 'Chybí e-mail';
      else if (!isEmail(email)) row.error = `Neplatný e-mail „${email}“`;
      else if (seen.has(normalize(email))) row.dup = 'file';
      else { seen.add(normalize(email)); const ex = findByEmail(data, workspaceId, email); if (ex) { row.dup = 'existing'; row.existingId = ex.id; } }
      return row;
    });
  }, [body, map, header, heads, data, workspaceId]);
  const valid = rows.filter(r => !r.error && r.dup !== 'file');
  const fresh = valid.filter(r => !r.dup); const existing = valid.filter(r => r.dup === 'existing');
  const invalid = rows.filter(r => r.error); const inFile = rows.filter(r => r.dup === 'file');

  const load = (t: string, name: string) => {
    const parsed = parseCsv(t);
    if (!parsed.length) { setError('Soubor neobsahuje žádná data.'); return; }
    if (parsed.length > 5001) { setError('V ukázce lze najednou importovat nejvýše 5 000 řádků.'); return; }
    setText(t); setFileName(name); setError('');
    setMap(parsed[0].map(h => guess(h)));
  };
  const toMapping = () => {
    if (!table.length) return setError('Nahrajte soubor CSV nebo vložte data.');
    if (map.length !== heads.length) setMap(heads.map(h => (header ? guess(h) : 'ignore')));
    setStep(2); setError('');
  };
  const toCheck = () => {
    if (!map.includes('email')) return setError('Přiřaďte sloupec s e-mailem.');
    if (!map.includes('name') && !map.includes('firstName') && !map.includes('lastName')) return setError('Přiřaďte sloupec se jménem.');
    setStep(3); setError('');
  };
  const run = () => {
    const extra = opts.tags.split(',').map(t => t.trim()).filter(Boolean);
    const source = `Import CSV${fileName ? `: ${fileName}` : ''}`;
    let created = 0, updated = 0; const ids: number[] = [];
    mutate(d => {
      let next = d; let id = nextContactIdIn(d);
      const add: Contact[] = [];
      for (const r of fresh) {
        const c = makeContact(next, workspaceId, { name: r.name, email: r.email, phone: r.phone, company: r.company, city: r.city, stage: r.stage ?? 'Lead', source: 'Import', tags: [...r.tags, ...extra], consent: opts.consent === 'given' ? 'Udělen' : 'Bez souhlasu', consentSource: opts.consent === 'given' ? `${source} (doložený souhlas)` : source, customFields: r.custom, owner: settings.team[0]?.name }, id++);
        add.push(c); ids.push(c.id); created++;
      }
      next = add.reduce((acc, c) => afterContactCreated(acc, workspaceId, c), { ...next, contacts: [...add, ...next.contacts] });
      if (opts.dupes === 'update') {
        const byId = new Map(existing.map(r => [r.existingId!, r]));
        next = { ...next, contacts: next.contacts.map(c => { const r = c.workspaceId === workspaceId ? byId.get(c.id) : undefined; if (!r) return c; updated++; ids.push(c.id); return { ...c, phone: c.phone || r.phone, company: c.company || r.company, city: c.city || r.city, tags: [...new Set([...c.tags, ...r.tags, ...extra])], customFields: [...c.customFields, ...r.custom.filter(f => !c.customFields.some(x => normalize(x.name) === normalize(f.name))).map(f => ({ id: newId('cf'), ...f }))] }; }) };
      }
      return next;
    });
    setResult({ created, updated, skipped: (opts.dupes === 'skip' ? existing.length : 0) + inFile.length, invalid: invalid.length, ids });
    setStep(4);
    toast.success(`Import dokončen: ${plural(created, 'nový kontakt', 'nové kontakty', 'nových kontaktů')}.`);
  };
  const steps = ['Soubor', 'Mapování sloupců', 'Kontrola', 'Hotovo'];

  return (
    <div className="page">
      <button type="button" className="back-link" onClick={() => go('kontakty')}><ArrowLeft size={15} aria-hidden />Zpět na kontakty</button>
      <PageHead title="Import kontaktů" desc={`Do prostoru ${settings.name}. Soubor se zpracuje jen v tomto prohlížeči.`} />
      <ol className="stepper" aria-label="Kroky importu">{steps.map((s, k) => <li key={s} aria-current={step === k + 1 ? 'step' : undefined} className={step > k + 1 ? 'done' : ''}><span>{step > k + 1 ? <Check size={14} aria-hidden /> : k + 1}</span>{s}</li>)}</ol>

      {step === 1 && (
        <Section title="1. Nahrajte soubor CSV" desc="Oddělovač středník, čárka nebo tabulátor. První řádek může obsahovat názvy sloupců.">
          <div className="sec-body stack">
            <label className="drop-area">
              <FileUp aria-hidden />
              <strong>{fileName || 'Vyberte soubor CSV'}</strong>
              <span className="muted small">{table.length ? `${plural(body.length, 'řádek', 'řádky', 'řádků')} · ${plural(heads.length, 'sloupec', 'sloupce', 'sloupců')}` : 'nebo vložte data níže'}</span>
              <input type="file" accept=".csv,text/csv,text/plain" className="sr-only" onChange={async e => { const f = e.target.files?.[0]; if (f) { if (f.size > 5_000_000) setError('Soubor je větší než 5 MB.'); else load(await f.text(), f.name); } e.target.value = ''; }} />
            </label>
            <Field label="Nebo vložte obsah CSV"><textarea rows={6} value={text} onChange={e => { setText(e.target.value); setFileName(''); setMap(parseCsv(e.target.value)[0]?.map(h => guess(h)) ?? []); }} placeholder={SAMPLE} /></Field>
            <label className="check-row"><input type="checkbox" checked={header} onChange={e => setHeader(e.target.checked)} />První řádek obsahuje názvy sloupců</label>
            <FormError>{error}</FormError>
            <div className="form-actions"><Btn onClick={() => load(SAMPLE, 'ukazka-kontaktu.csv')}>Načíst ukázková data</Btn><Btn onClick={() => download('vzor-importu.csv', SAMPLE)}><Download aria-hidden />Stáhnout vzor</Btn><Btn primary onClick={toMapping} disabled={!table.length}>Pokračovat<ArrowRight aria-hidden /></Btn></div>
          </div>
        </Section>
      )}

      {step === 2 && (
        <Section title="2. Přiřaďte sloupce" desc="Nepřiřazené sloupce se uloží jako vlastní pole (lze změnit na Neimportovat).">
          <div className="table-scroll">
            <table className="hub-table map-table">
              <thead><tr><th>Sloupec v souboru</th><th>Ukázka hodnot</th><th>Pole v Softema Hubu</th></tr></thead>
              <tbody>
                {heads.map((h, i) => (
                  <tr key={i}>
                    <td><strong>{h || `Sloupec ${i + 1}`}</strong></td>
                    <td className="muted small wrap">{body.slice(0, 3).map(r => r[i]).filter(Boolean).join(' · ') || '—'}</td>
                    <td><Pick value={map[i] ?? 'ignore'} onChange={v => setMap(m => { const n = [...m]; n[i] = v as MapKey; return n; })} options={(Object.keys(MAP_LABEL) as MapKey[]).map(k => [k, k === 'custom' ? `Vlastní pole „${h}“` : MAP_LABEL[k]] as [string, string])} label={`Pole pro sloupec ${h}`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="sec-body"><FormError>{error}</FormError><div className="form-actions"><Btn onClick={() => setStep(1)}><ArrowLeft aria-hidden />Zpět</Btn><Btn primary onClick={toCheck}>Zkontrolovat data<ArrowRight aria-hidden /></Btn></div></div>
        </Section>
      )}

      {step === 3 && (
        <div className="split">
          <Section title="3. Kontrola a nastavení" desc={`${fileName || 'Vložená data'} · ${plural(rows.length, 'řádek', 'řádky', 'řádků')}`}>
            <div className="sec-body stack">
              <div className="import-stats">
                <div><strong>{fmt(fresh.length)}</strong><span>nových kontaktů</span></div>
                <div><strong>{fmt(existing.length)}</strong><span>už v databázi</span></div>
                <div><strong>{fmt(inFile.length)}</strong><span>duplicit v souboru</span></div>
                <div className={invalid.length ? 'bad' : ''}><strong>{fmt(invalid.length)}</strong><span>chybných řádků</span></div>
              </div>
              {existing.length > 0 && <Field label="Kontakty, které už existují (podle e-mailu)"><Pick value={opts.dupes} onChange={v => setOpts({ ...opts, dupes: v as 'skip' | 'update' })} options={[['skip', 'Přeskočit'], ['update', 'Doplnit prázdné údaje a štítky']]} className="full" label="Duplicity" /></Field>}
              <Field label="Štítky pro všechny importované" hint="Oddělte čárkou."><input value={opts.tags} onChange={e => setOpts({ ...opts, tags: e.target.value })} /></Field>
              <Field label="Právní základ pro e-mailing" hint="Souhlas „Udělen“ nastavte jen tehdy, když ho umíte doložit (zdroj se zapíše do evidence).">
                <Pick value={opts.consent} onChange={v => setOpts({ ...opts, consent: v as 'none' | 'given' })} options={[['none', 'Bez souhlasu – kampaně je vynechají'], ['given', 'Kontakty daly doložitelný souhlas']]} className="full" label="Souhlas" />
              </Field>
              {invalid.length > 0 && (
                <div className="error-list">
                  <h3>Chybné řádky se nenaimportují</h3>
                  <ul>{invalid.slice(0, 8).map(r => <li key={r.line}>Řádek {r.line}: {r.error}</li>)}</ul>
                  {invalid.length > 8 && <p className="small muted">a dalších {invalid.length - 8}</p>}
                  <Btn onClick={() => download('chyby-importu.csv', toCsv([['Řádek', 'Chyba', 'Jméno', 'E-mail'], ...invalid.map(r => [r.line, r.error, r.name, r.email])]))}><Download aria-hidden />Stáhnout seznam chyb</Btn>
                </div>
              )}
              <div className="form-actions"><Btn onClick={() => setStep(2)}><ArrowLeft aria-hidden />Zpět k mapování</Btn><Btn primary onClick={run} disabled={!fresh.length && !(opts.dupes === 'update' && existing.length)}><Upload aria-hidden />Importovat {plural(fresh.length + (opts.dupes === 'update' ? existing.length : 0), 'kontakt', 'kontakty', 'kontaktů')}</Btn></div>
            </div>
          </Section>
          <Section title="Náhled" desc="Prvních 8 platných řádků" className="sticky-side">
            <ul className="mini-list sec-body">
              {valid.slice(0, 8).map(r => <li key={r.line}><span className="mini-row"><Avatar name={r.name} size="sm" /><span>{r.name}<small>{r.email}{r.company ? ` · ${r.company}` : ''}</small></span>{r.dup === 'existing' ? <Badge tone="blue">Existuje</Badge> : <Badge tone="green">Nový</Badge>}</span></li>)}
            </ul>
          </Section>
        </div>
      )}

      {step === 4 && result && (
        <Section title="Import je hotový">
          <div className="sec-body stack">
            <div className="import-stats">
              <div><strong>{fmt(result.created)}</strong><span>vytvořeno</span></div>
              <div><strong>{fmt(result.updated)}</strong><span>doplněno</span></div>
              <div><strong>{fmt(result.skipped)}</strong><span>přeskočeno</span></div>
              <div className={result.invalid ? 'bad' : ''}><strong>{fmt(result.invalid)}</strong><span>chybných</span></div>
            </div>
            <p className="muted">Kontakty jsou uložené v tomto prohlížeči. Duplicitní e-maily jsme nevytvořili znovu.</p>
            <div className="form-actions">
              <Btn onClick={() => { setStep(1); setText(''); setFileName(''); setResult(null); }}>Importovat další soubor</Btn>
              <Btn primary onClick={() => go('kontakty?zdroj=Import')}>Zobrazit importované kontakty</Btn>
            </div>
          </div>
        </Section>
      )}
      {w.contacts.length === 0 && step === 1 && <p className="muted small mt-4">Tip: ukázková data obsahují i jeden chybný řádek, abyste viděli validaci.</p>}
    </div>
  );
}
