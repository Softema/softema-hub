'use client';
/* Segments over the API: saved contact filters. Counts and members are always evaluated on the server. */
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { CONTACT_STAGES, SEGMENT_FIELD_LABEL, SEGMENT_FIELD_OPS, SEGMENT_FIELDS, SEGMENT_LIMITS, SEGMENT_OP_LABEL, type SegmentDto, type SegmentField, type SegmentMatch, type SegmentOp, type SegmentRule, segmentRuleText, STAGE_LABEL } from '@softema/shared';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { fmt, plural } from '@/lib/hub/format';
import { Avatar, Badge, Btn, Field, IconBtn, PageHead, Pick } from '../ui';
import { FormError, Section, useConfirm } from '../kit-core';
import { ApiFailure, message, useContacts, useCustomFieldNames, useSegment, useSegmentMutations, useSegmentPreview, useSegments, useTags } from './api';
import { LoadFailure, LoadingBlock, stageTone } from './live-ui';
import { useLive, useLiveRoute } from './live-state';

/** Tabs of the contacts module. Real routes, so links and back/forward work. */
export function ContactsNav({ active }: { active: 'kontakty' | 'kontakty/segmenty' }) {
  const { go } = useLive();
  return (
    <nav className="subnav" aria-label="Části modulu">
      {([['kontakty', 'Kontakty'], ['kontakty/segmenty', 'Segmenty']] as const).map(([r, label]) => (
        <button key={r} type="button" aria-current={active === r ? 'page' : undefined} onClick={() => go(r)}>{label}</button>
      ))}
    </nav>
  );
}

export function LiveSegments() {
  const { parts } = useLiveRoute();
  if (parts[2] === 'novy') return <SegmentEditor key="novy" />;
  if (parts[2]) return <ExistingSegment key={parts[2]} id={parts[2]} />;
  return <SegmentList />;
}

const rulesText = (s: Pick<SegmentDto, 'rules' | 'match'>) => (s.rules.length ? s.rules.map(segmentRuleText).join(s.match === 'all' ? ' a ' : ' nebo ') : 'Všechny kontakty');

function SegmentList() {
  const { workspace, allowed, go } = useLive();
  const list = useSegments(workspace.id);
  const { remove } = useSegmentMutations(workspace.id);
  const [confirmEl, confirm] = useConfirm();
  const canWrite = allowed('contact:write');
  const del = (s: SegmentDto) => confirm({
    title: `Smazat segment ${s.name}?`, danger: true, confirm: 'Smazat segment', desc: 'Kontakty zůstanou, smaže se jen uložený filtr.',
    onConfirm: () => remove.mutate(s.id, { onSuccess: () => toast.success('Segment byl smazán.'), onError: e => toast.error(message(e)) }),
  });
  const newButton = canWrite && <Btn primary onClick={() => go('kontakty/segmenty/novy')}><Plus aria-hidden />Nový segment</Btn>;
  return (
    <div className="page">
      <PageHead title="Segmenty" desc="Uložené filtry kontaktů. Počty se počítají na serveru z aktuálních dat celého prostoru.">{newButton}</PageHead>
      <ContactsNav active="kontakty/segmenty" />
      {list.isPending ? <LoadingBlock label="Načítám segmenty…" />
        : !list.data ? <LoadFailure error={list.error} onRetry={() => void list.refetch()} />
        : (
          <section className="panel" aria-busy={list.isFetching}>
            {list.isError && <p className="form-error" role="alert">Seznam se nepodařilo obnovit, zobrazená data mohou být starší. {message(list.error)}</p>}
            {list.data.length ? (
              <div className="table-scroll">
                <table className="hub-table data-table">
                  <thead><tr><th>Segment</th><th className="col-opt">Pravidla</th><th className="num">Kontakty</th><th aria-label="Akce" /></tr></thead>
                  <tbody>
                    {list.data.map(s => (
                      <tr key={s.id} onClick={() => go('kontakty/segmenty/' + s.id)}>
                        <td><div className="name-cell"><button type="button" onClick={e => { e.stopPropagation(); go('kontakty/segmenty/' + s.id); }}>{s.name}<small>{s.description || 'Bez popisu'}</small></button></div></td>
                        <td className="col-opt wrap muted small">{rulesText(s)}</td>
                        <td className="num">{fmt(s.count)}</td>
                        <td className="col-actions" onClick={e => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><button type="button" className="icon-btn" aria-label={`Akce segmentu ${s.name}`}><MoreHorizontal aria-hidden /></button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => go('kontakty/segmenty/' + s.id)}><Pencil aria-hidden />{canWrite ? 'Upravit pravidla' : 'Zobrazit'}</DropdownMenuItem>
                              {canWrite && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => del(s)}><Trash2 aria-hidden />Smazat</DropdownMenuItem></>}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="empty"><h3>Zatím nemáte žádný segment</h3><p>Segment vybírá kontakty podle štítků, fáze, zdroje, města, firmy, stáří nebo vlastních polí.</p>{canWrite && <Btn primary onClick={() => go('kontakty/segmenty/novy')}><Plus aria-hidden />Vytvořit segment</Btn>}</div>}
          </section>
        )}
      {confirmEl}
    </div>
  );
}

function ExistingSegment({ id }: { id: string }) {
  const { workspace, go } = useLive();
  const seg = useSegment(workspace.id, id);
  if (seg.isPending) return <div className="page"><LoadingBlock label="Načítám segment…" /></div>;
  if (!seg.data) {
    const missing = seg.error instanceof ApiFailure && seg.error.status === 404;
    return <div className="page">{missing
      ? <section className="panel empty"><h3>Segment nenalezen</h3><p>V tomto pracovním prostoru segment neexistuje nebo byl smazán.</p><Btn primary onClick={() => go('kontakty/segmenty')}>Zpět na segmenty</Btn></section>
      : <LoadFailure error={seg.error} onRetry={() => void seg.refetch()} />}</div>;
  }
  // A new version from the server (after saving) starts a fresh draft.
  return <SegmentEditor key={seg.data.version} existing={seg.data} />;
}

type DraftRule = { id: string; field: SegmentField; op: SegmentOp; value: string; key?: string };
interface Draft { name: string; description: string; match: SegmentMatch; rules: DraftRule[] }
let ruleSeq = 0;
const blankRule = (): DraftRule => ({ id: `r${++ruleSeq}`, field: 'tag', op: 'is', value: '' });
const complete = (r: DraftRule) => !!r.value.trim() && (r.field !== 'customField' || !!r.key) && (r.field !== 'createdDays' || (/^\d{1,4}$/.test(r.value.trim()) && +r.value >= 1 && +r.value <= SEGMENT_LIMITS.days));
const toRule = (r: DraftRule): SegmentRule => ({ field: r.field, op: r.op, value: r.value.trim(), ...(r.field === 'customField' ? { key: r.key } : {}) });

/** Waits until typing stops, so the preview is not asked for on every keystroke. */
function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

function SegmentEditor({ existing }: { existing?: SegmentDto }) {
  const { workspace, allowed, go } = useLive();
  const canWrite = allowed('contact:write');
  const { create, update, remove } = useSegmentMutations(workspace.id);
  const initial = useMemo<Draft>(() => existing
    ? { name: existing.name, description: existing.description, match: existing.match, rules: existing.rules.map(r => ({ ...r, id: `r${++ruleSeq}` })) }
    : { name: '', description: '', match: 'all', rules: [blankRule()] }, [existing]);
  const [draft, setDraft] = useState<Draft>(initial);
  const [error, setError] = useState('');
  const [nameError, setNameError] = useState('');
  const [confirmEl, confirm] = useConfirm();
  const strip = (d: Draft) => JSON.stringify({ ...d, rules: d.rules.map(({ id: _id, ...r }) => r) });
  const dirty = strip(draft) !== strip(initial);
  const busy = create.isPending || update.isPending || remove.isPending;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const tags = useTags(workspace.id);
  const contacts = useContacts(workspace.id, {});
  const fieldNames = useCustomFieldNames(workspace.id);
  const valid = draft.rules.filter(complete);
  const query = useDebounced({ match: draft.match, rules: valid.map(toRule) });
  const preview = useSegmentPreview(workspace.id, query);
  const p = preview.data;
  // Per-rule counts belong to the rules the preview was computed for; while typing they are not shown.
  const current = JSON.stringify(valid.map(toRule)) === JSON.stringify(query.rules) && !preview.isPlaceholderData;
  const countOf = (r: DraftRule) => (current ? p?.ruleCounts[valid.findIndex(x => x.id === r.id)] : undefined);

  const optionsFor = (r: DraftRule): [string, string][] => r.field === 'tag' ? (tags.data ?? []).map(t => [t.name, t.name])
    : r.field === 'stage' ? CONTACT_STAGES.map(s => [s, STAGE_LABEL[s]])
    : r.field === 'source' ? (contacts.data?.sources ?? []).map(s => [s, s]) : [];
  const setRule = (rid: string, patch: Partial<DraftRule>) => { setDraft(d => ({ ...d, rules: d.rules.map(r => (r.id === rid ? { ...r, ...patch } : r)) })); setError(''); };
  const back = () => { if (!dirty) return go('kontakty/segmenty'); confirm({ title: 'Odejít bez uložení?', desc: 'Segment má neuložené změny. Když odejdete, ztratí se.', confirm: 'Odejít bez uložení', danger: true, onConfirm: () => go('kontakty/segmenty') }); };

  const save = () => {
    const name = draft.name.trim();
    if (!name) { setNameError('Pojmenujte segment.'); return; }
    if (draft.rules.some(r => !complete(r))) { setError('Doplňte hodnoty všech pravidel, nebo nedokončená pravidla odeberte.'); return; }
    const body = { name, description: draft.description.trim(), match: draft.match, rules: draft.rules.map(toRule) };
    const onError = (e: unknown) => { const f = e instanceof ApiFailure ? e.fields ?? {} : {}; if (f.name) setNameError(f.name); else setError(message(e)); };
    if (existing) update.mutate({ id: existing.id, version: existing.version, ...body }, { onSuccess: () => toast.success('Segment byl uložen.'), onError });
    else create.mutate(body, { onSuccess: s => { toast.success('Segment byl vytvořen.'); go('kontakty/segmenty/' + s.id, true); }, onError });
  };
  const del = () => existing && confirm({
    title: `Smazat segment ${existing.name}?`, danger: true, confirm: 'Smazat segment', desc: 'Kontakty zůstanou, smaže se jen uložený filtr.',
    onConfirm: () => remove.mutate(existing.id, { onSuccess: () => { toast.success('Segment byl smazán.'); go('kontakty/segmenty', true); }, onError: e => toast.error(message(e)) }),
  });

  return (
    <div className="page">
      <button type="button" className="back-link" onClick={back}><ArrowLeft size={15} aria-hidden />Zpět na segmenty</button>
      <PageHead title={existing ? existing.name : 'Nový segment'} desc="Pravidla se vyhodnocují na serveru nad aktuálními kontakty. Výsledek se mění, jak se mění data.">
        {canWrite && existing && <Btn onClick={del} disabled={busy}><Trash2 aria-hidden />Smazat</Btn>}
        {canWrite && <Btn primary onClick={save} disabled={busy || (!dirty && !!existing)} aria-busy={busy}><Check aria-hidden />{busy ? 'Ukládám…' : existing ? 'Uložit změny' : 'Vytvořit segment'}</Btn>}
      </PageHead>
      <div className="split">
        <fieldset disabled={!canWrite || busy} className="contents">
          <div className="stack">
            <Section title="Základní údaje">
              <div className="sec-body stack">
                <Field label="Název segmentu" hint={nameError || undefined}><input value={draft.name} onChange={e => { setDraft({ ...draft, name: e.target.value }); setNameError(''); }} placeholder="Např. Aktivní klienti z Brna" maxLength={SEGMENT_LIMITS.name} aria-invalid={!!nameError || undefined} /></Field>
                <Field label="Popis (nepovinné)"><input value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} maxLength={SEGMENT_LIMITS.description} /></Field>
              </div>
            </Section>
            <Section title="Pravidla" desc={draft.rules.length ? undefined : 'Bez pravidel segment obsahuje všechny kontakty.'} actions={draft.rules.length > 1 && (
              <div className="segmented" role="group" aria-label="Kombinace pravidel">
                <button type="button" className={draft.match === 'all' ? 'active' : ''} aria-pressed={draft.match === 'all'} onClick={() => setDraft({ ...draft, match: 'all' })}>Splňuje vše</button>
                <button type="button" className={draft.match === 'any' ? 'active' : ''} aria-pressed={draft.match === 'any'} onClick={() => setDraft({ ...draft, match: 'any' })}>Aspoň jedno</button>
              </div>
            )}>
              <div className="sec-body stack-sm">
                {draft.rules.map((r, k) => {
                  const ops = SEGMENT_FIELD_OPS[r.field];
                  const options = optionsFor(r);
                  const select = (r.field === 'tag' || r.field === 'stage' || r.field === 'source') && r.op !== 'contains';
                  const count = complete(r) ? countOf(r) : undefined;
                  return (
                    <div key={r.id} className="rule-row">
                      <span className="rule-join">{k === 0 ? 'Kde' : draft.match === 'all' ? 'a' : 'nebo'}</span>
                      <Pick value={r.field} onChange={v => { const f = v as SegmentField; setRule(r.id, { field: f, op: SEGMENT_FIELD_OPS[f][0], value: f === 'createdDays' ? '30' : '', key: undefined }); }} options={SEGMENT_FIELDS.map(f => [f, SEGMENT_FIELD_LABEL[f]] as [string, string])} label={`Pole pravidla ${k + 1}`} />
                      {r.field === 'customField' && <Pick value={r.key ?? ''} onChange={v => setRule(r.id, { key: v || undefined })} options={fieldNames.data?.length ? fieldNames.data.map(n => [n, n] as [string, string]) : [['', 'Žádná vlastní pole']]} label={`Název vlastního pole pravidla ${k + 1}`} />}
                      {ops.length > 1 ? <Pick value={r.op} onChange={v => setRule(r.id, { op: v as SegmentOp })} options={ops.map(o => [o, SEGMENT_OP_LABEL[o]] as [string, string])} label={`Podmínka pravidla ${k + 1}`} /> : <span className="rule-op">{SEGMENT_OP_LABEL[r.op]}</span>}
                      {select
                        ? <Pick value={r.value} onChange={v => setRule(r.id, { value: v })} options={options.length ? options : [['', 'Žádné možnosti']]} label={`Hodnota pravidla ${k + 1}`} />
                        : r.field === 'createdDays' ? <span className="rule-num"><input type="number" min={1} max={SEGMENT_LIMITS.days} value={r.value} onChange={e => setRule(r.id, { value: e.target.value })} aria-label={`Počet dní pravidla ${k + 1}`} /> dní</span>
                        : <input value={r.value} onChange={e => setRule(r.id, { value: e.target.value })} aria-label={`Hodnota pravidla ${k + 1}`} placeholder="Hodnota" maxLength={SEGMENT_LIMITS.value} />}
                      <span className="rule-count muted small" title="Kontakty splňující jen toto pravidlo">{count === undefined ? '—' : fmt(count)}</span>
                      <IconBtn label={`Odebrat pravidlo ${k + 1}`} onClick={() => { setDraft(d => ({ ...d, rules: d.rules.filter(x => x.id !== r.id) })); setError(''); }}><Trash2 /></IconBtn>
                    </div>
                  );
                })}
                <div><Btn onClick={() => setDraft(d => ({ ...d, rules: [...d.rules, blankRule()] }))} disabled={draft.rules.length >= SEGMENT_LIMITS.rules}><Plus aria-hidden />Přidat pravidlo</Btn></div>
                <FormError>{error}</FormError>
              </div>
            </Section>
          </div>
        </fieldset>
          <Section title="Náhled segmentu" className="sticky-side" desc={valid.length < draft.rules.length ? 'Nedokončená pravidla se zatím nepočítají.' : undefined}>
            <div className="sec-body" aria-busy={preview.isFetching} aria-live="polite">
              {!p ? (preview.isError ? <p className="form-error" role="alert">{message(preview.error)}</p> : <LoadingBlock label="Počítám kontakty…" />) : (
                <>
                  {preview.isError && <p className="form-error" role="alert">Náhled se nepodařilo obnovit. {message(preview.error)}</p>}
                  <div className="seg-count"><strong>{fmt(p.total)}</strong><span>{plural(p.total, 'kontakt', 'kontakty', 'kontaktů', false)}</span></div>
                  <ul className="mini-list">
                    {p.sample.map(c => <li key={c.id}><button type="button" onClick={() => go('kontakty/' + c.id)}><Avatar name={c.name} size="sm" /><span>{c.name}<small>{c.email}</small></span><Badge tone={stageTone(c.stage)}>{STAGE_LABEL[c.stage]}</Badge></button></li>)}
                  </ul>
                  {p.total > p.sample.length && <p className="small muted">a dalších {fmt(p.total - p.sample.length)}</p>}
                  {!p.total && <p className="muted">Pravidlům zatím neodpovídá žádný kontakt.</p>}
                </>
              )}
            </div>
          </Section>
      </div>
      {confirmEl}
    </div>
  );
}
