'use client';
/* Webinars (admin): list by state, overview & results, registrants linked to CRM, settings, reminders.
   Public registration page and participant view are in webinar-public.tsx. */
import React, { useMemo, useState } from 'react';
import { ArrowLeft, Ban, CalendarClock, Check, Copy, Download, ExternalLink, MoreHorizontal, Pencil, Play, Plus, RotateCcw, Trash2, Users, Video } from 'lucide-react';
import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { DAY, fmt, fmtDate, fmtDateTime, fromPragueInput, newId, normalize, percent, plural, slugify, toDateInput, toTimeInput } from '@/lib/hub/format';
import { webinarState, type WebinarState } from '@/lib/hub/logic';
import { logActivity } from '@/lib/hub/ops';
import type { Registration, Webinar } from '@/lib/hub/types';
import { useHub, useUnsavedGuard } from './state';
import { Avatar, Badge, Btn, Empty, Field, Metric, Modal, PageHead, Pick } from './ui';
import { Bar, ContactPicker, DateField, FilterTabs, FormError, ImagePicker, Notice, Pager, Section, SubNav, ToggleRow, download, paginate, toCsv, useConfirm, useRoute } from './kit';
import { Art, ACCENTS } from './learn-shared';
import { RegistrationPage, WebinarRoom } from './webinar-public';

export const stateTone = (s: WebinarState) => (s === 'Naplánováno' ? 'blue' : s === 'Probíhá' ? 'orange' : s === 'Proběhlo' ? 'gray' : s === 'Evergreen' ? 'green' : s === 'Zrušeno' ? 'red' : 'gray');
export const whenText = (w: Webinar) => (w.kind === 'evergreen' ? `Každý den ${w.sessions.join(', ')}` : fmtDateTime(w.startsAt));
const sourceUrl = (w: Webinar) => `https://softema.cz/w/${w.slug}`;

export default function Webinars() {
  const { parts } = useRoute();
  const [, id, sub] = parts;
  if (!id) return <WebinarList />;
  if (sub === 'stranka') return <RegistrationPage key={id} id={id} />;
  if (sub === 'mistnost') return <WebinarRoom key={id} id={id} />;
  return <WebinarDetail key={id} id={id} tab={sub && ['registrace', 'upravit', 'pripominky'].includes(sub) ? sub : 'prehled'} />;
}

const FILTERS: [string, string][] = [['upcoming', 'Nadcházející'], ['evergreen', 'Evergreen'], ['past', 'Proběhlé'], ['draft', 'Koncepty'], ['cancelled', 'Zrušené'], ['all', 'Všechny']];
const matches = (f: string, s: WebinarState) => f === 'all' || (f === 'upcoming' && (s === 'Naplánováno' || s === 'Probíhá')) || (f === 'evergreen' && s === 'Evergreen') || (f === 'past' && s === 'Proběhlo') || (f === 'draft' && s === 'Koncept') || (f === 'cancelled' && s === 'Zrušeno');

export function useWebinarActions() {
  const { workspaceId, mutate, patch, go } = useHub();
  const [confirmEl, confirm] = useConfirm();
  const publish = (w: Webinar) => { patch('webinars', w.id, x => ({ ...x, published: true })); toast.success('Webinář je publikovaný. Registrační stránka je aktivní.'); };
  const cancel = (w: Webinar, regs: number) => confirm({ title: `Zrušit webinář ${w.title}?`, danger: true, confirm: 'Zrušit webinář', desc: `${plural(regs, 'registrovaný', 'registrovaní', 'registrovaných')} by v ostré verzi dostali e-mail o zrušení. V prototypu se nic neodešle.`, onConfirm: () => { patch('webinars', w.id, x => ({ ...x, cancelled: true })); toast.success('Webinář byl zrušen.'); } });
  const restore = (w: Webinar) => { patch('webinars', w.id, x => ({ ...x, cancelled: false })); toast.success('Webinář byl obnoven.'); };
  const duplicate = (w: Webinar) => { const copy: Webinar = { ...w, id: newId('w'), title: `${w.title} (kopie)`, slug: `${w.slug}-kopie-${Date.now().toString(36).slice(-4)}`, published: false, cancelled: false, startsAt: new Date(Date.now() + 14 * DAY).toISOString(), createdAt: new Date().toISOString() }; mutate(d => ({ ...d, webinars: [copy, ...d.webinars] })); toast.success('Kopie webináře vznikla jako koncept.'); go(`webinare/${copy.id}/upravit`); };
  const remove = (w: Webinar, regs: number) => confirm({ title: `Smazat webinář ${w.title}?`, danger: true, confirm: 'Smazat', desc: regs ? `Smažou se i ${plural(regs, 'registrace', 'registrace', 'registrací')}. Kontakty v CRM zůstanou.` : 'Webinář se nevratně smaže.', onConfirm: () => { mutate(d => ({ ...d, webinars: d.webinars.filter(x => !(x.workspaceId === workspaceId && x.id === w.id)), registrations: d.registrations.filter(r => !(r.workspaceId === workspaceId && r.webinarId === w.id)) })); toast.success('Webinář byl smazán.'); go('webinare'); } });
  return { confirmEl, publish, cancel, restore, duplicate, remove };
}

function WebinarMenu({ w, regs, actions }: { w: Webinar; regs: number; actions: ReturnType<typeof useWebinarActions> }) {
  const { go } = useHub();
  const [now] = useState(() => Date.now());
  const s = webinarState(w, now);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><button type="button" className="icon-btn" aria-label={`Akce webináře ${w.title}`} onClick={e => e.stopPropagation()}><MoreHorizontal aria-hidden /></button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
        <DropdownMenuItem onSelect={() => go(`webinare/${w.id}/upravit`)}><Pencil aria-hidden />Upravit</DropdownMenuItem>
        {s === 'Koncept' && <DropdownMenuItem onSelect={() => actions.publish(w)}><Check aria-hidden />Publikovat</DropdownMenuItem>}
        {(s === 'Naplánováno' || s === 'Evergreen') && <DropdownMenuItem onSelect={() => go(`webinare/${w.id}/stranka`)}><ExternalLink aria-hidden />Registrační stránka</DropdownMenuItem>}
        {(s === 'Probíhá' || s === 'Naplánováno' || s === 'Evergreen' || s === 'Proběhlo') && <DropdownMenuItem onSelect={() => go(`webinare/${w.id}/mistnost`)}><Play aria-hidden />{s === 'Proběhlo' ? 'Záznam (pohled účastníka)' : 'Pohled účastníka'}</DropdownMenuItem>}
        <DropdownMenuItem onSelect={() => actions.duplicate(w)}><Copy aria-hidden />Duplikovat</DropdownMenuItem>
        <DropdownMenuSeparator />
        {s === 'Zrušeno' ? <DropdownMenuItem onSelect={() => actions.restore(w)}><RotateCcw aria-hidden />Obnovit</DropdownMenuItem>
          : s !== 'Proběhlo' && <DropdownMenuItem onSelect={() => actions.cancel(w, regs)}><Ban aria-hidden />Zrušit webinář</DropdownMenuItem>}
        <DropdownMenuItem variant="destructive" onSelect={() => actions.remove(w, regs)}><Trash2 aria-hidden />Smazat</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function WebinarList() {
  const { w, go, workspaceId, mutate, settings } = useHub();
  const { query, setQuery } = useRoute();
  const filter = query.get('filtr') ?? 'upcoming';
  const actions = useWebinarActions();
  const [now] = useState(() => Date.now());
  const stats = (x: Webinar) => { const rs = w.registrations.filter(r => r.webinarId === x.id); const att = rs.filter(r => r.attended).length; return { regs: rs.length, att, rate: rs.length && rs.some(r => r.attended !== null) ? (att / rs.length) * 100 : null }; };
  const list = w.webinars.filter(x => matches(filter, webinarState(x, now))).sort((a, b) => (filter === 'past' ? b.startsAt.localeCompare(a.startsAt) : a.startsAt.localeCompare(b.startsAt)));
  const counts = Object.fromEntries(FILTERS.map(([k]) => [k, w.webinars.filter(x => matches(k, webinarState(x, now))).length]));
  const create = () => {
    const start = new Date(now + 14 * DAY); start.setHours(18, 0, 0, 0);
    const x: Webinar = { id: newId('w'), workspaceId, title: 'Nový webinář', description: '', accent: 'orange', kind: 'live', startsAt: start.toISOString(), timezone: settings.timezone || 'Europe/Prague', durationMin: 60, host: settings.team[0]?.name ?? '', sessions: [], video: { source: 'LiveKit', url: '' }, published: false, cancelled: false, slug: `webinar-${Date.now().toString(36)}`, reminders: { confirmation: true, before24h: true, before1h: true, followUp: true, replayMail: true }, replayDays: 14, tag: 'Webinář', createdAt: new Date().toISOString() };
    mutate(d => ({ ...d, webinars: [x, ...d.webinars] })); toast.success('Webinář vznikl jako koncept.'); go(`webinare/${x.id}/upravit`);
  };
  const all = w.registrations;
  const pastRegs = all.filter(r => r.attended !== null);
  return (
    <div className="page">
      <PageHead title="Webináře" desc="Živé a evergreen webináře. Registrace se propisují do CRM.">
        <Btn primary onClick={create}><Plus aria-hidden />Nový webinář</Btn>
      </PageHead>
      <div className="metric-grid">
        <Metric label="Nadcházející" value={fmt(counts.upcoming)} desc={`${counts.evergreen} evergreen`} />
        <Metric label="Registrace" value={fmt(all.length)} desc="celkem" />
        <Metric label="Účast" value={pastRegs.length ? percent((pastRegs.filter(r => r.attended).length / pastRegs.length) * 100) : '—'} desc="z proběhlých" />
        <Metric label="Shlédli záznam" value={fmt(all.filter(r => r.replay).length)} desc="replay" />
      </div>
      <FilterTabs label="Filtr webinářů" value={filter} onChange={k => setQuery({ filtr: k === 'upcoming' ? undefined : k })} items={FILTERS.map(([k, l]) => [k, l, counts[k]] as [string, string, number])} />
      <div className="card-grid">
        {list.map(x => { const s = webinarState(x, now); const st = stats(x); return (
          <article key={x.id} className="panel course-card">
            <button type="button" className="course-card-link" onClick={() => go('webinare/' + x.id)} tabIndex={-1} aria-hidden><Art accent={x.accent} image={x.image} eyebrow={x.kind === 'live' ? 'Živý webinář' : 'Evergreen'} title={x.title} /></button>
            <div className="course-card-body">
              <div className="flex-row spread"><Badge tone={stateTone(s)}>{s}</Badge><WebinarMenu w={x} regs={st.regs} actions={actions} /></div>
              <h3><button type="button" onClick={() => go('webinare/' + x.id)}>{x.title}</button></h3>
              <p className="muted small"><CalendarClock size={13} aria-hidden className="inline" /> {whenText(x)} · {x.durationMin} min · {x.host}</p>
              <div className="course-stats"><span><strong>{fmt(st.regs)}</strong> registrovaných</span><span>{st.rate === null ? 'účast po konání' : <><strong>{percent(st.rate, 0)}</strong> účast</>}</span></div>
            </div>
          </article>
        ); })}
      </div>
      {!list.length && <section className="panel empty"><Video size={28} aria-hidden /><h3>{w.webinars.length ? 'V tomto filtru nejsou žádné webináře' : 'Zatím nemáte žádný webinář'}</h3><p>Naplánujte živý webinář nebo evergreen se záznamem.</p><Btn primary onClick={create}><Plus aria-hidden />Nový webinář</Btn></section>}
      {actions.confirmEl}
    </div>
  );
}

function WebinarDetail({ id, tab }: { id: string; tab: string }) {
  const { w, go } = useHub();
  const x = w.webinars.find(v => v.id === id);
  const actions = useWebinarActions();
  const [now] = useState(() => Date.now());
  if (!x) return <div className="page"><section className="panel empty"><h3>Webinář nenalezen</h3><p>V tomto pracovním prostoru webinář neexistuje.</p><Btn primary onClick={() => go('webinare')}>Zpět na webináře</Btn></section></div>;
  const s = webinarState(x, now);
  const regs = w.registrations.filter(r => r.webinarId === x.id);
  const base = `webinare/${x.id}`;
  return (
    <div className="page">
      <button type="button" className="back-link" onClick={() => go('webinare')}><ArrowLeft size={15} aria-hidden />Všechny webináře</button>
      <PageHead title={x.title} desc={`${x.kind === 'live' ? 'Živý webinář' : 'Evergreen'} · ${whenText(x)} · ${x.host || 'bez moderátora'}`}>
        <Badge tone={stateTone(s)}>{s}</Badge>
        {s === 'Koncept' && <Btn primary onClick={() => actions.publish(x)}><Check aria-hidden />Publikovat</Btn>}
        {(s === 'Naplánováno' || s === 'Evergreen') && <Btn onClick={() => go(`${base}/stranka`)}><ExternalLink aria-hidden />Registrační stránka</Btn>}
        {s !== 'Koncept' && s !== 'Zrušeno' && <Btn primary={s === 'Probíhá'} onClick={() => go(`${base}/mistnost`)}><Play aria-hidden />{s === 'Probíhá' ? 'Vstoupit do vysílání' : s === 'Proběhlo' ? 'Záznam' : 'Pohled účastníka'}</Btn>}
        {s === 'Zrušeno' && <Btn onClick={() => actions.restore(x)}><RotateCcw aria-hidden />Obnovit</Btn>}
        <WebinarMenu w={x} regs={regs.length} actions={actions} />
      </PageHead>
      <SubNav active={tab === 'prehled' ? base : `${base}/${tab}`} items={[[base, 'Přehled'], [`${base}/registrace`, 'Registrace', regs.length], [`${base}/upravit`, 'Nastavení'], [`${base}/pripominky`, 'Připomínky']]} />
      {s === 'Zrušeno' && <Notice tone="warn">Webinář je zrušený. Registrační stránka nepřijímá nové registrace.</Notice>}
      {s === 'Koncept' && <Notice>Koncept: registrační stránka zatím není veřejná. Po kontrole nastavení webinář publikujte.</Notice>}
      {tab === 'prehled' && <Overview x={x} regs={regs} state={s} />}
      {tab === 'registrace' && <Registrants x={x} state={s} />}
      {tab === 'upravit' && <WebinarSettings x={x} />}
      {tab === 'pripominky' && <Reminders x={x} />}
      {actions.confirmEl}
    </div>
  );
}

function Overview({ x, regs, state }: { x: Webinar; regs: Registration[]; state: WebinarState }) {
  const { go, w } = useHub();
  const att = regs.filter(r => r.attended); const decided = regs.filter(r => r.attended !== null);
  const sources = Object.entries(regs.reduce<Record<string, number>>((m, r) => { const k = r.source.split(' · ')[0]; m[k] = (m[k] ?? 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]);
  const avg = att.length ? Math.round(att.reduce((s, r) => s + r.watchMinutes, 0) / att.length) : 0;
  const flow = w.workflows.find(f => f.nodes.some(n => n.data.kind === 'trigger' && n.data.config.event === 'webinar_registered'));
  const replayUntil = new Date(+new Date(x.startsAt) + x.durationMin * 60_000 + x.replayDays * DAY).toISOString();
  return (
    <>
      <div className="metric-grid">
        <Metric label="Registrovaní" value={fmt(regs.length)} desc={state === 'Naplánováno' ? `začíná ${fmtDateTime(x.startsAt)}` : 'celkem'} />
        <Metric label="Přítomní" value={decided.length ? fmt(att.length) : '—'} desc={decided.length ? `${percent((att.length / regs.length) * 100, 0)} z registrovaných` : 'po konání'} />
        <Metric label="Shlédli záznam" value={fmt(regs.filter(r => r.replay).length)} desc={x.kind === 'live' ? `záznam do ${fmtDate(replayUntil)}` : 'evergreen'} />
        <Metric label="Průměrná doba sledování" value={att.length ? `${avg} min` : '—'} desc={`z ${x.durationMin} min`} />
      </div>
      <div className="split">
        <Section title="Výsledky" desc="Registrovaní → přítomní → záznam">
          <div className="sec-body funnel">
            {[['Registrovaní', regs.length], ['Přítomní', att.length], ['Záznam', regs.filter(r => r.replay).length]].map(([l, v]) => (
              <div key={l as string} className="funnel-row"><span>{l}</span><Bar value={((v as number) / Math.max(1, regs.length)) * 100} label={l as string} /><strong>{fmt(v as number)}</strong></div>
            ))}
            {state === 'Naplánováno' && <p className="small muted">Účast se doplní po konání (data z LiveKit/Mux po napojení backendu; v prototypu ji zapíšete ručně v Registracích).</p>}
          </div>
        </Section>
        <div className="stack">
          <Section title="Zdroje registrací">
            <ul className="sec-body row-list">
              {sources.map(([k, n]) => <li key={k} className="kv"><span>{k}</span><strong>{fmt(n)}</strong></li>)}
              {!sources.length && <li className="muted">Zatím žádné registrace.</li>}
            </ul>
          </Section>
          <Section title="Odkazy">
            <div className="sec-body stack-sm">
              <div className="kv"><span>Registrační stránka</span><strong className="small">{sourceUrl(x)}</strong></div>
              <div className="kv"><span>Štítek registrovaných</span><strong>{x.tag || '—'}</strong></div>
              <Btn onClick={() => go(`kontakty?stitek=${encodeURIComponent(x.tag)}`)} disabled={!x.tag}><Users aria-hidden />Kontakty se štítkem</Btn>
              {flow && <Btn onClick={() => go('automatizace/' + flow.id)}>Automatizace: {flow.name}</Btn>}
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}

type AttFilter = 'all' | 'yes' | 'no' | 'pending' | 'replay';
function Registrants({ x, state }: { x: Webinar; state: WebinarState }) {
  const { w, workspaceId, mutate, go } = useHub();
  const [q, setQ] = useState('');
  const [f, setF] = useState<AttFilter>('all');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [confirmEl, confirm] = useConfirm();
  const contacts = useMemo(() => new Map(w.contacts.map(c => [c.id, c])), [w.contacts]);
  const regs = w.registrations.filter(r => r.webinarId === x.id);
  const rows = regs.filter(r => (f === 'all' || (f === 'yes' && r.attended) || (f === 'no' && r.attended === false) || (f === 'pending' && r.attended === null) || (f === 'replay' && r.replay))
    && normalize(`${contacts.get(r.contactId)?.name ?? ''} ${contacts.get(r.contactId)?.email ?? ''}`).includes(normalize(q))).sort((a, b) => b.registeredAt.localeCompare(a.registeredAt));
  const pg = paginate(rows, page, 20);
  const canMark = state === 'Proběhlo' || state === 'Probíhá' || state === 'Evergreen';
  const setAtt = (r: Registration, attended: boolean | null) => mutate(d => {
    const next = { ...d, registrations: d.registrations.map(y => (y.workspaceId === workspaceId && y.id === r.id ? { ...y, attended, watchMinutes: attended ? Math.max(y.watchMinutes, Math.round(x.durationMin * 0.7)) : 0 } : y)) };
    return attended ? logActivity(next, workspaceId, r.contactId, 'webinar', 'Účast na webináři zaznamenána', x.title, 'webinare/' + x.id) : next;
  });
  const closeOut = () => confirm({ title: 'Označit ostatní jako nepřítomné?', desc: 'Všichni registrovaní bez zapsané účasti budou označení jako nepřítomní. Dostanou pak follow-up se záznamem.', confirm: 'Označit', onConfirm: () => { mutate(d => ({ ...d, registrations: d.registrations.map(y => (y.workspaceId === workspaceId && y.webinarId === x.id && y.attended === null ? { ...y, attended: false } : y)) })); toast.success('Účast byla uzavřena.'); } });
  return (
    <>
      <div className="toolbar">
        <input className="toolbar-search" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="Hledat registrovaného…" aria-label="Hledat registrovaného" />
        <div className="flex-row wrap">
          <Pick value={f} onChange={v => { setF(v as AttFilter); setPage(1); }} options={[['all', 'Všichni'], ['yes', 'Přítomní'], ['no', 'Nepřítomní'], ['pending', 'Bez záznamu účasti'], ['replay', 'Shlédli záznam']]} label="Filtr účasti" />
          {state === 'Proběhlo' && regs.some(r => r.attended === null) && <Btn onClick={closeOut}>Uzavřít účast</Btn>}
          <Btn onClick={() => download(`registrace-${x.slug}.csv`, toCsv([['Jméno', 'E-mail', 'Registrace', 'Zdroj', 'Účast', 'Minuty', 'Záznam'], ...regs.map(r => { const c = contacts.get(r.contactId); return [c?.name ?? 'Smazaný kontakt', c?.email ?? '', fmtDateTime(r.registeredAt), r.source, r.attended === null ? '' : r.attended ? 'ano' : 'ne', r.watchMinutes, r.replay ? 'ano' : 'ne']; })]))} disabled={!regs.length}><Download aria-hidden />Export</Btn>
          <Btn primary onClick={() => setAdding(true)} disabled={state === 'Zrušeno'}><Plus aria-hidden />Registrovat kontakt</Btn>
        </div>
      </div>
      <section className="panel">
        <div className="table-scroll">
          <table className="hub-table data-table">
            <thead><tr><th>Kontakt</th><th className="col-opt">Registrace</th><th className="col-opt">Zdroj</th><th>Účast</th><th aria-label="Akce" /></tr></thead>
            <tbody>
              {pg.slice.map(r => { const c = contacts.get(r.contactId); return (
                <tr key={r.id} onClick={() => c && go('kontakty/' + c.id)}>
                  <td><div className="name-cell">{c ? <><Avatar name={c.name} color={c.color} /><button type="button">{c.name}<small>{c.email}</small></button></> : <span className="muted">Smazaný kontakt</span>}</div></td>
                  <td className="col-opt muted">{fmtDateTime(r.registeredAt)}</td>
                  <td className="col-opt muted">{r.source}</td>
                  <td>{r.attended ? <Badge tone="green">Přítomen · {r.watchMinutes} min</Badge> : r.attended === false ? <Badge tone={r.replay ? 'blue' : 'gray'}>{r.replay ? 'Záznam' : 'Nepřišel'}</Badge> : <Badge tone="gray">Registrován</Badge>}</td>
                  <td className="col-actions" onClick={e => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><button type="button" className="icon-btn" aria-label={`Akce registrace ${c?.name ?? ''}`}><MoreHorizontal aria-hidden /></button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canMark && r.attended !== true && <DropdownMenuItem onSelect={() => { setAtt(r, true); toast.success('Účast byla zapsána.'); }}>Označit jako přítomného</DropdownMenuItem>}
                        {canMark && r.attended !== false && <DropdownMenuItem onSelect={() => { setAtt(r, false); toast.success('Označeno jako nepřítomný.'); }}>Označit jako nepřítomného</DropdownMenuItem>}
                        {!canMark && <DropdownMenuItem disabled>Účast lze zapsat po začátku webináře</DropdownMenuItem>}
                        <DropdownMenuItem onSelect={() => go(`webinare/${x.id}/mistnost?ucastnik=${r.contactId}`)}>Pohled účastníka</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => confirm({ title: 'Zrušit registraci?', desc: 'Kontakt zůstane v CRM, odebere se jen registrace.', confirm: 'Zrušit registraci', danger: true, onConfirm: () => { mutate(d => ({ ...d, registrations: d.registrations.filter(y => !(y.workspaceId === workspaceId && y.id === r.id)) })); toast.success('Registrace byla zrušena.'); } })}><Trash2 aria-hidden />Zrušit registraci</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ); })}
            </tbody>
          </table>
        </div>
        {!rows.length && <Empty text={regs.length ? 'Nikdo neodpovídá filtru.' : 'Zatím žádné registrace.'} />}
        <Pager page={pg.page} pages={pg.pages} total={rows.length} from={pg.from} to={pg.to} onPage={setPage} noun="registrací" />
      </section>
      <AddRegistrant x={x} open={adding} onClose={() => setAdding(false)} />
      {confirmEl}
    </>
  );
}

function AddRegistrant({ x, open, onClose }: { x: Webinar; open: boolean; onClose: () => void }) {
  const { w, workspaceId, mutate } = useHub();
  const [picked, setPicked] = useState<number[]>([]);
  const registered = new Set(w.registrations.filter(r => r.webinarId === x.id).map(r => r.contactId));
  const candidates = w.contacts.filter(c => !registered.has(c.id));
  const add = () => {
    const date = new Date().toISOString();
    mutate(d => picked.reduce((acc, id) => logActivity({ ...acc, registrations: [{ id: newId('rg'), workspaceId, webinarId: x.id, contactId: id, registeredAt: date, source: 'Ručně v administraci', attended: null, watchMinutes: 0, replay: false }, ...acc.registrations], contacts: acc.contacts.map(c => (c.workspaceId === workspaceId && c.id === id && x.tag && !c.tags.includes(x.tag) ? { ...c, tags: [...c.tags, x.tag] } : c)) }, workspaceId, id, 'webinar', 'Registrace na webinář (ručně)', x.title, 'webinare/' + x.id), d));
    toast.success(`Registrováno: ${plural(picked.length, 'kontakt', 'kontakty', 'kontaktů')}.`); setPicked([]); onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Registrovat kontakty" desc={`Kontakty dostanou štítek „${x.tag || '—'}“. Potvrzovací e-mail je v prototypu simulovaný.`}>
      <div className="stack">
        <ContactPicker candidates={candidates} picked={picked} onChange={setPicked} emptyText="Všechny kontakty už jsou registrované." />
      </div>
      <div className="form-actions"><Btn onClick={onClose}>Zrušit</Btn><Btn primary disabled={!picked.length} onClick={add}>{picked.length ? `Registrovat ${plural(picked.length, 'kontakt', 'kontakty', 'kontaktů')}` : 'Registrovat'}</Btn></div>
    </Modal>
  );
}

const SOURCES: Webinar['video']['source'][] = ['LiveKit', 'Mux', 'YouTube', 'Vimeo', 'Jiný odkaz'];
function WebinarSettings({ x }: { x: Webinar }) {
  const { patch, w } = useHub();
  const init = { title: x.title, description: x.description, image: x.image, accent: x.accent, kind: x.kind, date: toDateInput(x.startsAt), time: toTimeInput(x.startsAt), timezone: x.timezone, durationMin: String(x.durationMin), host: x.host, sessions: x.sessions.join(', '), source: x.video.source, url: x.video.url, slug: x.slug, tag: x.tag, replayDays: String(x.replayDays), published: x.published };
  const [v, setV] = useState(init);
  const [error, setError] = useState('');
  const dirty = JSON.stringify(v) !== JSON.stringify(init);
  useUnsavedGuard(dirty, 'Nastavení webináře má neuložené změny.');
  const set = (p: Partial<typeof v>) => { setV({ ...v, ...p }); setError(''); };
  const save = () => {
    const sessions = v.sessions.split(',').map(s => s.trim()).filter(Boolean);
    const slug = slugify(v.slug || v.title);
    if (!v.title.trim()) return setError('Vyplňte název webináře.');
    if (v.kind === 'live' && (!v.date || !v.time)) return setError('Vyplňte datum a čas začátku.');
    if (v.kind === 'evergreen' && (!sessions.length || sessions.some(s => !/^([01]?\d|2[0-3]):[0-5]\d$/.test(s)))) return setError('Zadejte časy evergreen vysílání ve formátu HH:MM oddělené čárkou.');
    const dur = Number(v.durationMin); if (!Number.isInteger(dur) || dur < 10 || dur > 480) return setError('Délka musí být 10–480 minut.');
    if (v.url && !/^https:\/\/\S+$/.test(v.url)) return setError('Odkaz na video musí začínat https://');
    if (w.webinars.some(o => o.id !== x.id && o.slug === slug)) return setError('Tato adresa stránky už je použitá u jiného webináře.');
    const startsAt = v.kind === 'live' ? fromPragueInput(v.date, v.time) : x.startsAt;
    patch('webinars', x.id, o => ({ ...o, title: v.title.trim(), description: v.description, image: v.image, accent: v.accent, kind: v.kind, startsAt, timezone: v.timezone, durationMin: dur, host: v.host, sessions: v.kind === 'evergreen' ? sessions : [], video: { source: v.source, url: v.url }, slug, tag: v.tag.trim(), replayDays: Math.max(0, Number(v.replayDays) || 0), published: v.published }));
    setV({ ...v, slug });
    toast.success('Webinář byl uložen.');
    if (v.kind === 'live' && +new Date(startsAt) < Date.now()) toast.warning('Začátek je v minulosti – webinář se zobrazí jako proběhlý.');
  };
  return (
    <div className="split">
      <Section title="Webinář">
        <div className="sec-body stack">
          <Field label="Název"><input value={v.title} onChange={e => set({ title: e.target.value })} maxLength={150} /></Field>
          <Field label="Popis"><textarea rows={4} value={v.description} onChange={e => set({ description: e.target.value })} maxLength={2000} /></Field>
          <div className="form-grid">
            <Field label="Typ"><Pick value={v.kind} onChange={k => set({ kind: k as Webinar['kind'], source: k === 'live' ? 'LiveKit' : 'Mux' })} options={[['live', 'Živý (LiveKit)'], ['evergreen', 'Evergreen (záznam)']]} className="full" label="Typ webináře" /></Field>
            <Field label="Moderátor"><input value={v.host} onChange={e => set({ host: e.target.value })} /></Field>
          </div>
          {v.kind === 'live' ? (
            <div className="form-grid three">
              <div className="field"><span>Datum</span><DateField label="Datum webináře" value={v.date} onChange={x => set({ date: x })} /></div>
              <Field label="Čas"><input type="time" value={v.time} onChange={e => set({ time: e.target.value })} /></Field>
              <Field label="Časové pásmo"><Pick value={v.timezone} onChange={t => set({ timezone: t })} options={['Europe/Prague', 'Europe/Bratislava', 'Europe/Vienna', 'Europe/London']} className="full" label="Časové pásmo" /></Field>
            </div>
          ) : <Field label="Časy vysílání každý den" hint="Např. 10:00, 18:00 (Europe/Prague)"><input value={v.sessions} onChange={e => set({ sessions: e.target.value })} /></Field>}
          {v.kind === 'live' && v.timezone !== 'Europe/Prague' && <Notice>Čas se ukládá v čase Europe/Prague. Ostatní pásma se v prototypu jen zobrazují.</Notice>}
          <div className="form-grid">
            <Field label="Délka (minuty)"><input type="number" min={10} max={480} value={v.durationMin} onChange={e => set({ durationMin: e.target.value })} /></Field>
            <Field label="Záznam dostupný (dní)"><input type="number" min={0} max={365} value={v.replayDays} onChange={e => set({ replayDays: e.target.value })} /></Field>
          </div>
          <div className="form-grid">
            <Field label="Zdroj videa"><Pick value={v.source} onChange={s => set({ source: s as Webinar['video']['source'] })} options={SOURCES} className="full" label="Zdroj videa" /></Field>
            <Field label="Odkaz na video / stream" hint={v.source === 'LiveKit' ? 'Místnost LiveKit vznikne s backendem.' : 'Veřejný nebo podepsaný odkaz.'}><input type="url" value={v.url} onChange={e => set({ url: e.target.value })} placeholder="https://" /></Field>
          </div>
          <FormError>{error}</FormError>
          <div className="form-actions"><Btn onClick={() => setV(init)} disabled={!dirty}>Zahodit změny</Btn><Btn primary onClick={save} disabled={!dirty}>Uložit webinář</Btn></div>
        </div>
      </Section>
      <div className="stack">
        <Section title="Registrační stránka">
          <div className="sec-body stack">
            <Field label="Adresa stránky" hint={`softema.cz/w/${slugify(v.slug || v.title) || '…'}`}><input value={v.slug} onChange={e => set({ slug: e.target.value })} /></Field>
            <Field label="Štítek pro registrované" hint="Přidá se kontaktu v CRM."><input value={v.tag} onChange={e => set({ tag: e.target.value })} /></Field>
            <ToggleRow label="Publikováno" desc="Stránka přijímá registrace." checked={v.published} onChange={p => set({ published: p })} />
          </div>
        </Section>
        <Section title="Obrázek">
          <div className="sec-body stack">
            <ImagePicker value={v.image} onChange={image => set({ image })} label="Obrázek webináře" />
            <Field label="Barva (bez obrázku)"><Pick value={v.accent} onChange={a => set({ accent: a })} options={ACCENTS} className="full" label="Barva" /></Field>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Reminders({ x }: { x: Webinar }) {
  const { patch, w, go } = useHub();
  const start = +new Date(x.startsAt);
  const flow = w.workflows.find(f => f.nodes.some(n => n.data.kind === 'trigger' && n.data.config.event === 'webinar_registered'));
  const rows: [keyof Webinar['reminders'], string, string, string][] = [
    ['confirmation', 'Potvrzení registrace', 'Ihned po registraci', `Děkujeme za registraci na „${x.title}“. Odkaz do místnosti vám pošleme před začátkem.`],
    ['before24h', 'Připomínka 24 hodin předem', x.kind === 'live' ? fmtDateTime(new Date(start - DAY).toISOString()) : '24 h před zvoleným časem', `Zítra v ${x.kind === 'live' ? fmtDateTime(x.startsAt).split(' · ')[1] : 'zvolený čas'} začínáme. Těšíme se na vás.`],
    ['before1h', 'Připomínka 1 hodinu předem', x.kind === 'live' ? fmtDateTime(new Date(start - 3_600_000).toISOString()) : '1 h před zvoleným časem', 'Za hodinu začínáme. Tady je odkaz do místnosti.'],
    ['followUp', 'Follow-up po webináři', x.kind === 'live' ? fmtDateTime(new Date(start + (x.durationMin + 60) * 60_000).toISOString()) : 'hodinu po skončení', 'Díky za účast! Posíláme slíbené materiály a nabídku.'],
    ['replayMail', 'Záznam pro nepřítomné', `dostupný ${x.replayDays} dní`, 'Nestihli jste to? Záznam je k dispozici ještě několik dní.'],
  ];
  return (
    <div className="split">
      <Section title="Automatická e-mailová sekvence" desc="Pro každého registrovaného podle času webináře.">
        <div className="sec-body">
          {rows.map(([k, label, when, text]) => (
            <div key={k} className="reminder-row">
              <ToggleRow label={label} desc={when} checked={x.reminders[k]} onChange={v => { patch('webinars', x.id, o => ({ ...o, reminders: { ...o.reminders, [k]: v } })); toast.success(v ? `${label}: zapnuto.` : `${label}: vypnuto.`); }} />
              {x.reminders[k] && <p className="reminder-text">„{text}“</p>}
            </div>
          ))}
        </div>
      </Section>
      <div className="stack">
        <Notice>V prototypu se e-maily neodesílají. Sekvenci po napojení backendu spustí fronta (BullMQ) přes modul E-mailing a Resend.</Notice>
        {flow && <Section title="Navazující automatizace"><div className="sec-body"><button type="button" className="side-link" onClick={() => go('automatizace/' + flow.id)}><strong>{flow.name}</strong><small>Spouští se registrací na webinář · {flow.status}</small></button></div></Section>}
      </div>
    </div>
  );
}
