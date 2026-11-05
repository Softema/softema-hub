'use client';
/* E-mailing: campaign list with status-specific actions, campaign detail and report. Wizard and editor live in campaign-wizard.tsx. */
import React, { useMemo, useState } from 'react';
import { ArrowLeft, CalendarClock, ChevronRight, Copy, Download, Eye, Mail, MoreHorizontal, Pencil, Plus, RotateCcw, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { fmt, fmtDate, fmtDateTime, normalize, percent, plural, periodStart } from '@/lib/hub/format';
import { audienceLabel, audienceOf, campaignStats } from '@/lib/hub/logic';
import { makeCampaign, simulateSend } from '@/lib/hub/ops';
import type { Campaign, CampaignStatus } from '@/lib/hub/types';
import { useHub } from './state';
import { Avatar, Badge, Btn, Empty, Metric, PageHead, Pick, SearchInput, Tabbar } from './ui';
import { Bar, Notice, Pager, Section, download, paginate, toCsv, useConfirm, useRoute } from './kit';
import { CampaignEditor, CampaignPreview, CampaignWizard, PreviewModal } from './campaign-wizard';

export default function Campaigns() {
  const { parts } = useRoute();
  const sub = parts[1];
  if (!sub) return <CampaignList />;
  if (sub === 'nova') return <CampaignWizard />;
  const id = Number(sub);
  if (parts[2] === 'upravit') return <CampaignWizard id={id} />;
  if (parts[2] === 'editor') return <CampaignEditor id={id} />;
  return <CampaignDetail id={id} />;
}

const STATUS_TABS: [string, string][] = [['all', 'Všechny'], ['Koncept', 'Koncepty'], ['Naplánováno', 'Naplánované'], ['Odesláno', 'Odeslané']];
const statusTone = (s: CampaignStatus) => (s === 'Odesláno' ? 'green' : s === 'Naplánováno' ? 'blue' : 'gray');
const when = (c: Campaign) => (c.status === 'Odesláno' && c.sentAt ? `Odesláno ${fmtDateTime(c.sentAt)}` : c.status === 'Naplánováno' && c.scheduledAt ? `Naplánováno na ${fmtDateTime(c.scheduledAt)}` : `Upraveno ${fmtDateTime(c.updatedAt)}`);

/** Status-specific actions shared by the list menu and the detail header. */
function useCampaignActions() {
  const { data, workspaceId, mutate, go } = useHub();
  const [confirmEl, confirm] = useConfirm();
  const duplicate = (c: Campaign) => {
    const copy = makeCampaign(data, workspaceId, { name: `${c.name} (kopie)`, subject: c.subject, preheader: c.preheader, sender: c.sender, senderEmail: c.senderEmail, audience: c.audience, extraContactIds: c.extraContactIds, editor: c.editor, blocks: c.blocks, design: c.design, html: c.html, links: c.links });
    mutate(d => ({ ...d, campaigns: [copy, ...d.campaigns] }));
    toast.success('Kopie kampaně byla vytvořena jako koncept.');
    go(`kampane/${copy.id}/upravit`);
  };
  const remove = (c: Campaign) => confirm({ title: `Smazat koncept ${c.name}?`, desc: 'Koncept včetně obsahu se nevratně smaže.', confirm: 'Smazat koncept', danger: true, onConfirm: () => { mutate(d => ({ ...d, campaigns: d.campaigns.filter(x => !(x.workspaceId === workspaceId && x.id === c.id)) })); toast.success('Koncept byl smazán.'); go('kampane'); } });
  const unschedule = (c: Campaign) => { mutate(d => ({ ...d, campaigns: d.campaigns.map(x => (x.workspaceId === workspaceId && x.id === c.id ? { ...x, status: 'Koncept', scheduledAt: undefined, updatedAt: new Date().toISOString() } : x)) })); toast.success('Plán odeslání byl zrušen.'); };
  const sendNow = (c: Campaign) => confirm({ title: 'Odeslat kampaň hned?', desc: `Simulace: vygenerujeme ukázkové výsledky pro ${plural(audienceOf(data, c).eligible.length, 'příjemce', 'příjemce', 'příjemců')} se souhlasem. Nic se reálně neodešle.`, confirm: 'Odeslat (simulace)', onConfirm: () => { mutate(d => simulateSend(d, workspaceId, c.id).data); toast.success('Kampaň byla odeslána (simulace).'); go('kampane/' + c.id); } });
  const exportResults = (c: Campaign) => {
    const byId = new Map(data.contacts.filter(x => x.workspaceId === workspaceId).map(x => [x.id, x]));
    download(`vysledky-${c.id}.csv`, toCsv([['Kontakt', 'E-mail', 'Doručeno', 'Otevřeno', 'Kliknuto', 'Odkaz', 'Odhlášen'], ...(c.results ?? []).map(r => { const x = byId.get(r.contactId); return [x?.name ?? 'Smazaný kontakt', x?.email ?? '', r.delivered ? 'ano' : 'ne', r.opened ? 'ano' : 'ne', r.clicked ? 'ano' : 'ne', r.link ?? '', r.unsubscribed ? 'ano' : 'ne']; })]));
  };
  return { confirmEl, duplicate, remove, unschedule, sendNow, exportResults };
}

function CampaignMenu({ c, actions }: { c: Campaign; actions: ReturnType<typeof useCampaignActions> }) {
  const { go } = useHub();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><button type="button" className="icon-btn" aria-label={`Akce kampaně ${c.name}`} onClick={e => e.stopPropagation()}><MoreHorizontal aria-hidden /></button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
        {c.status === 'Koncept' && <DropdownMenuItem onSelect={() => go(`kampane/${c.id}/upravit`)}><Pencil aria-hidden />Pokračovat v úpravách</DropdownMenuItem>}
        {c.status === 'Koncept' && <DropdownMenuItem onSelect={() => go(`kampane/${c.id}/editor`)}><Mail aria-hidden />Upravit obsah e-mailu</DropdownMenuItem>}
        {c.status === 'Naplánováno' && <DropdownMenuItem onSelect={() => actions.sendNow(c)}><Send aria-hidden />Odeslat hned</DropdownMenuItem>}
        {c.status === 'Naplánováno' && <DropdownMenuItem onSelect={() => actions.unschedule(c)}><RotateCcw aria-hidden />Zrušit plán</DropdownMenuItem>}
        {c.status === 'Odesláno' && <DropdownMenuItem onSelect={() => go('kampane/' + c.id)}><Eye aria-hidden />Zobrazit report</DropdownMenuItem>}
        {c.status === 'Odesláno' && <DropdownMenuItem onSelect={() => actions.exportResults(c)}><Download aria-hidden />Export výsledků</DropdownMenuItem>}
        <DropdownMenuItem onSelect={() => actions.duplicate(c)}><Copy aria-hidden />Duplikovat</DropdownMenuItem>
        {c.status === 'Koncept' && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => actions.remove(c)}><Trash2 aria-hidden />Smazat koncept</DropdownMenuItem></>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CampaignList() {
  const { w, data, go } = useHub();
  const { query, setQuery } = useRoute();
  const status = query.get('stav') ?? 'all';
  const q = query.get('q') ?? '';
  const actions = useCampaignActions();
  const [now] = useState(() => Date.now());
  const list = useMemo(() => w.campaigns
    .filter(c => (status === 'all' || c.status === status) && normalize(`${c.name} ${c.subject}`).includes(normalize(q)))
    .sort((a, b) => (b.sentAt ?? b.scheduledAt ?? b.updatedAt).localeCompare(a.sentAt ?? a.scheduledAt ?? a.updatedAt)), [w.campaigns, status, q]);
  const { page, pages, slice, from, to } = paginate(list, Number(query.get('strana') || 1), 20);
  const month = w.campaigns.filter(c => c.status === 'Odesláno' && c.sentAt && +new Date(c.sentAt) >= periodStart(30, now)).map(campaignStats).filter((s): s is NonNullable<typeof s> => !!s);
  const delivered = month.reduce((s, x) => s + x.delivered, 0);
  const counts = Object.fromEntries(STATUS_TABS.map(([k]) => [k, k === 'all' ? w.campaigns.length : w.campaigns.filter(c => c.status === k).length]));
  return (
    <div className="page">
      <PageHead title="Kampaně" desc="E-mailové kampaně pracovního prostoru. Odesílání je v prototypu simulované.">
        <Btn primary onClick={() => go('kampane/nova')}><Plus aria-hidden />Nová kampaň</Btn>
      </PageHead>
      <div className="metric-grid">
        <Metric label="Odesláno za 30 dní" value={fmt(delivered)} desc={plural(month.length, 'kampaň', 'kampaně', 'kampaní')} />
        <Metric label="Průměrná míra otevření" value={delivered ? percent((month.reduce((s, x) => s + x.opened, 0) / delivered) * 100) : '—'} desc="za 30 dní" />
        <Metric label="Průměrná míra prokliku" value={delivered ? percent((month.reduce((s, x) => s + x.clicked, 0) / delivered) * 100) : '—'} desc="za 30 dní" />
        <Metric label="Naplánované" value={fmt(counts['Naplánováno'])} desc={counts['Koncept'] ? plural(counts['Koncept'], 'koncept', 'koncepty', 'konceptů') : 'žádné koncepty'} />
      </div>
      <Tabbar value={status} onChange={v => setQuery({ stav: v === 'all' ? undefined : v, strana: undefined })} items={STATUS_TABS.map(([k, l]) => [k, `${l} (${counts[k]})`] as [string, string])} />
      <div className="toolbar"><SearchInput value={q} onChange={v => setQuery({ q: v || undefined, strana: undefined })} placeholder="Hledat kampaň nebo předmět…" /></div>
      <section className="panel">
        {w.campaigns.length === 0 ? (
          <div className="empty"><h3>Zatím žádné kampaně</h3><p>Vytvořte první kampaň – průvodce vás provede příjemci, obsahem i odesláním.</p><Btn primary onClick={() => go('kampane/nova')}><Plus aria-hidden />Vytvořit kampaň</Btn></div>
        ) : (
          <>
            <div className="table-scroll">
              <table className="hub-table data-table">
                <thead><tr><th>Kampaň</th><th>Stav</th><th className="col-opt">Příjemci</th><th className="num">Otevření</th><th className="num col-opt">Prokliky</th><th aria-label="Akce" /></tr></thead>
                <tbody>
                  {slice.map(c => { const s = campaignStats(c); const a = s ? null : audienceOf(data, c); return (
                    <tr key={c.id} onClick={() => go(c.status === 'Koncept' ? `kampane/${c.id}/upravit` : 'kampane/' + c.id)}>
                      <td><div className="name-cell"><span className="mail-box"><Mail size={15} aria-hidden /></span><button type="button" onClick={e => { e.stopPropagation(); go(c.status === 'Koncept' ? `kampane/${c.id}/upravit` : 'kampane/' + c.id); }}>{c.name}<small>{when(c)}</small></button></div></td>
                      <td><Badge tone={statusTone(c.status)}>{c.status}</Badge></td>
                      <td className="col-opt muted">{s ? fmt(s.recipients) : fmt(a!.eligible.length)}<small className="block">{audienceLabel(data, c)}</small></td>
                      <td className="num">{s ? percent(s.openRate) : '—'}</td>
                      <td className="num col-opt">{s ? percent(s.clickRate) : '—'}</td>
                      <td className="col-actions" onClick={e => e.stopPropagation()}><CampaignMenu c={c} actions={actions} /></td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
            {!list.length && <Empty text="Žádná kampaň neodpovídá filtru." />}
            <Pager page={page} pages={pages} total={list.length} from={from} to={to} onPage={p => setQuery({ strana: p > 1 ? String(p) : undefined })} noun="kampaní" />
          </>
        )}
      </section>
      {actions.confirmEl}
    </div>
  );
}

function CampaignDetail({ id }: { id: number }) {
  const { w, data, go } = useHub();
  const c = w.campaigns.find(x => x.id === id);
  const actions = useCampaignActions();
  const [preview, setPreview] = useState(false);
  if (!c) return <div className="page"><section className="panel empty"><h3>Kampaň nenalezena</h3><p>V tomto pracovním prostoru kampaň neexistuje nebo byla smazána.</p><Btn primary onClick={() => go('kampane')}>Zpět na kampaně</Btn></section></div>;
  if (c.status === 'Odesláno') return <Report key={c.id} c={c} actions={actions} />;
  const a = audienceOf(data, c);
  return (
    <div className="page">
      <button type="button" className="back-link" onClick={() => go('kampane')}><ArrowLeft size={15} aria-hidden />Všechny kampaně</button>
      <PageHead title={c.name} desc={when(c)}>
        <Badge tone={statusTone(c.status)}>{c.status}</Badge>
        {c.status === 'Koncept' ? <Btn primary onClick={() => go(`kampane/${c.id}/upravit`)}><Pencil aria-hidden />Pokračovat v úpravách</Btn> : <>
          <Btn onClick={() => actions.unschedule(c)}><RotateCcw aria-hidden />Zrušit plán</Btn>
          <Btn primary onClick={() => actions.sendNow(c)}><Send aria-hidden />Odeslat hned</Btn>
        </>}
        <CampaignMenu c={c} actions={actions} />
      </PageHead>
      {c.status === 'Naplánováno' && <Notice><CalendarClock size={14} aria-hidden className="sr-only" />Kampaň se „odešle“ (simulace) {fmtDateTime(c.scheduledAt!)}, nebo při prvním otevření aplikace po tomto čase.</Notice>}
      <div className="split mt-4">
        <Section title="Souhrn">
          <div className="sec-body">
            <div className="review-row"><span>Předmět</span><strong>{c.subject || '—'}</strong></div>
            <div className="review-row"><span>Preheader</span><strong>{c.preheader || '—'}</strong></div>
            <div className="review-row"><span>Odesílatel</span><strong>{c.sender} &lt;{c.senderEmail}&gt;</strong></div>
            <div className="review-row"><span>Příjemci</span><strong>{audienceLabel(data, c)} · {fmt(a.eligible.length)} se souhlasem</strong></div>
            <div className="review-row"><span>Editor</span><strong>{c.editor === 'unlayer' ? 'Unlayer' : 'Vestavěný'}</strong></div>
            <div className="flex-row mt-4"><Btn onClick={() => setPreview(true)}><Eye aria-hidden />Náhled</Btn></div>
          </div>
        </Section>
        <div className="review-preview"><CampaignPreview c={c} device="mobile" /></div>
      </div>
      <PreviewModal c={c} open={preview} onClose={() => setPreview(false)} />
      {actions.confirmEl}
    </div>
  );
}

/** Deterministic pseudo times of opens (hash of campaign × contact) bucketed by 4 hours. */
function OpenTimeline({ c }: { c: Campaign }) {
  const buckets = Array.from({ length: 12 }, () => 0);
  for (const r of c.results ?? []) {
    if (!r.opened) continue;
    let h = 2166136261; for (const ch of `${c.id}:${r.contactId}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    const u = (h >>> 0) / 4294967296;
    const hours = Math.min(47.9, -Math.log(1 - u * 0.98) * 7);
    buckets[Math.floor(hours / 4)]++;
  }
  const max = Math.max(1, ...buckets);
  return (
    <div className="open-bars" role="img" aria-label={`Otevření po 4 hodinách: ${buckets.join(', ')}`}>
      {buckets.map((n, k) => <div key={k} className="open-bar"><span className="open-fill" style={{ height: `${(n / max) * 100}%` }} title={`${k * 4}–${k * 4 + 4} h: ${n}`} /><small>{k * 4} h</small></div>)}
    </div>
  );
}

type ResultFilter = 'all' | 'opened' | 'clicked' | 'unopened' | 'bounced' | 'unsub';
const FILTERS: [ResultFilter, string][] = [['all', 'Všichni'], ['opened', 'Otevřeli'], ['clicked', 'Klikli'], ['unopened', 'Neotevřeli'], ['bounced', 'Nedoručeno'], ['unsub', 'Odhlásili se']];

function Report({ c, actions }: { c: Campaign; actions: ReturnType<typeof useCampaignActions> }) {
  const { w, data, workspaceId, mutate, go } = useHub();
  const [tab, setTab] = useState('overview');
  const [filter, setFilter] = useState<ResultFilter>('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const s = campaignStats(c)!;
  const byId = useMemo(() => new Map(w.contacts.map(x => [x.id, x])), [w.contacts]);
  const links = Object.entries((c.results ?? []).reduce<Record<string, number>>((m, r) => { if (r.clicked) m[r.link ?? 'Odkaz'] = (m[r.link ?? 'Odkaz'] ?? 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]);
  const rows = (c.results ?? []).filter(r => (filter === 'all' || (filter === 'opened' && r.opened) || (filter === 'clicked' && r.clicked) || (filter === 'unopened' && r.delivered && !r.opened) || (filter === 'bounced' && !r.delivered) || (filter === 'unsub' && r.unsubscribed))
    && normalize(`${byId.get(r.contactId)?.name ?? ''} ${byId.get(r.contactId)?.email ?? ''}`).includes(normalize(q)));
  const pg = paginate(rows, page, 25);
  const unopened = (c.results ?? []).filter(r => r.delivered && !r.opened && byId.has(r.contactId)).map(r => r.contactId);
  const resend = () => {
    const copy = makeCampaign(data, workspaceId, { name: `${c.name} – neotevřeli`, subject: c.subject, preheader: c.preheader, sender: c.sender, senderEmail: c.senderEmail, audience: { type: 'manual' }, extraContactIds: unopened, editor: c.editor, blocks: c.blocks, design: c.design, html: c.html, links: c.links });
    mutate(d => ({ ...d, campaigns: [copy, ...d.campaigns] }));
    toast.success(`Koncept pro ${plural(unopened.length, 'kontakt', 'kontakty', 'kontaktů')}, kteří e-mail neotevřeli.`);
    go(`kampane/${copy.id}/upravit?krok=2`);
  };
  return (
    <div className="page">
      <button type="button" className="back-link" onClick={() => go('kampane')}><ArrowLeft size={15} aria-hidden />Všechny kampaně</button>
      <PageHead title={c.name} desc={`${when(c)} · ${audienceLabel(data, c)} · výsledky jsou simulované`}>
        <Badge tone="green">Odesláno</Badge>
        <Btn onClick={() => actions.exportResults(c)}><Download aria-hidden />Export</Btn>
        <Btn onClick={() => actions.duplicate(c)}><Copy aria-hidden />Duplikovat</Btn>
      </PageHead>
      <Tabbar value={tab} onChange={setTab} items={[['overview', 'Přehled'], ['recipients', `Příjemci (${fmt(s.recipients)})`], ['content', 'Obsah e-mailu']]} />
      {tab === 'overview' && (
        <>
          <div className="metric-grid mt">
            <Metric label="Doručeno" value={fmt(s.delivered)} desc={`${percent((s.delivered / Math.max(1, s.recipients)) * 100)} z ${fmt(s.recipients)}`} />
            <Metric label="Míra otevření" value={percent(s.openRate)} desc={plural(s.opened, 'otevření', 'otevření', 'otevření')} />
            <Metric label="Míra prokliku" value={percent(s.clickRate)} desc={plural(s.clicked, 'proklik', 'prokliky', 'prokliků')} />
            <Metric label="Odhlášení" value={fmt(s.unsubscribed)} desc={`nedoručeno ${fmt(s.bounced)}`} />
          </div>
          <Section title="Otevření v čase" desc="Prvních 48 hodin po odeslání · simulované rozložení, skutečné časy dodá tracking po napojení backendu" className="mb-4">
            <div className="sec-body"><OpenTimeline c={c} /></div>
          </Section>
          <div className="split">
            <Section title="Trychtýř">
              <div className="sec-body funnel">
                {[['Odesláno', s.recipients], ['Doručeno', s.delivered], ['Otevřeno', s.opened], ['Kliknuto', s.clicked]].map(([l, v]) => (
                  <div key={l as string} className="funnel-row"><span>{l}</span><Bar value={((v as number) / Math.max(1, s.recipients)) * 100} label={l as string} /><strong>{fmt(v as number)}</strong></div>
                ))}
              </div>
            </Section>
            <Section title="Odkazy" desc="Podle prokliků">
              <ul className="sec-body row-list">
                {links.map(([l, n]) => <li key={l} className="kv"><span>{l}</span><strong>{fmt(n)} · {percent((n / Math.max(1, s.clicked)) * 100)}</strong></li>)}
                {!links.length && <li className="muted">Zatím žádné prokliky.</li>}
              </ul>
            </Section>
          </div>
          <Section title="Další krok" className="mt-4">
            <div className="sec-body flex-row wrap">
              <Btn onClick={resend} disabled={!unopened.length}><Send aria-hidden />Poslat znovu neotevřeným ({fmt(unopened.length)})</Btn>
              <Btn onClick={() => { setTab('recipients'); setFilter('clicked'); }}>Zobrazit, kdo klikl<ChevronRight aria-hidden /></Btn>
            </div>
          </Section>
        </>
      )}
      {tab === 'recipients' && (
        <>
          <div className="toolbar"><SearchInput value={q} onChange={v => { setQ(v); setPage(1); }} placeholder="Hledat příjemce…" /><Pick value={filter} onChange={v => { setFilter(v as ResultFilter); setPage(1); }} options={FILTERS} label="Filtr výsledku" /></div>
          <section className="panel">
            <div className="table-scroll">
              <table className="hub-table data-table">
                <thead><tr><th>Kontakt</th><th>Výsledek</th><th className="col-opt">Odkaz</th><th aria-hidden /></tr></thead>
                <tbody>
                  {pg.slice.map(r => { const x = byId.get(r.contactId); const st = !r.delivered ? 'Nedoručeno' : r.unsubscribed ? 'Odhlásil(a) se' : r.clicked ? 'Kliknul(a)' : r.opened ? 'Otevřeno' : 'Doručeno'; return (
                    <tr key={r.contactId} onClick={() => x && go('kontakty/' + x.id)}>
                      <td><div className="name-cell">{x ? <><Avatar name={x.name} color={x.color} /><button type="button">{x.name}<small>{x.email}</small></button></> : <span className="muted">Smazaný kontakt</span>}</div></td>
                      <td><Badge tone={st === 'Kliknul(a)' ? 'orange' : st === 'Otevřeno' ? 'blue' : st === 'Doručeno' ? 'gray' : 'red'}>{st}</Badge></td>
                      <td className="col-opt muted">{r.link ?? '—'}</td>
                      <td className="col-go"><ChevronRight size={16} aria-hidden className="muted" /></td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
            {!rows.length && <Empty text="Žádný příjemce neodpovídá filtru." />}
            <Pager page={pg.page} pages={pg.pages} total={rows.length} from={pg.from} to={pg.to} onPage={setPage} noun="příjemců" />
          </section>
        </>
      )}
      {tab === 'content' && <div className="content-preview mt"><p className="muted small">Předmět: {c.subject} · Odesílatel: {c.sender} &lt;{c.senderEmail}&gt; · odesláno {c.sentAt ? fmtDate(c.sentAt) : ''}</p><CampaignPreview c={c} /></div>}
      {actions.confirmEl}
    </div>
  );
}
