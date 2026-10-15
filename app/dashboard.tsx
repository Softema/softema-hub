'use client';
import React, { useMemo, useState } from 'react';
import { ChevronRight, Info, Plus, Workflow } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, Tooltip, XAxis, YAxis } from 'recharts';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DAY, fmt, fmtDate, fmtShortDate, money, NB, percent, plural, relTime } from '@/lib/hub/format';
import { audienceLabel, campaignStats, revenue } from '@/lib/hub/logic';
import type { Campaign } from '@/lib/hub/types';
import { useHub } from './state';
import { Badge, Btn, Metric, Pick } from './ui';
import { ChartBox } from './chart-box';
import { useShell } from './shell-context';
import { hubEvents } from './events';
import { withQuery } from './hash-route';
import './dashboard.css';

/* ---------- period model: everything is computed from the stored records ---------- */
type PeriodKey = '7' | '30' | '90';
type ChartMetric = 'revenue' | 'emails';
const PERIODS: Record<PeriodKey, { days: number; buckets: number; bucket: string }> = {
  '7': { days: 7, buckets: 7, bucket: 'denní součty' },
  '30': { days: 30, buckets: 10, bucket: 'součty za 3 dny' },
  '90': { days: 90, buckets: 13, bucket: 'týdenní součty' },
};
const WJ = '⁠'; // keeps "1. 9. – 25. 9." together after the dash
const iso = (t: number) => new Date(t).toISOString();
const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return +d; };
const range = (a: number, b: number) => (fmtDate(iso(a)) === fmtDate(iso(b)) ? fmtDate(iso(b)) : `${fmtShortDate(iso(a))}${NB}–${WJ}${NB}${fmtDate(iso(b))}`);
function periodOf(key: PeriodKey, now: number) {
  const { days } = PERIODS[key];
  const end = startOfDay(now) + DAY; // exclusive: end of today
  const start = end - days * DAY;
  return { start, end, prevStart: start - days * DAY, prevEnd: start };
}
const pctChange = (cur: number, prev: number) => (prev > 0 ? ((cur - prev) / prev) * 100 : null);
const inRange = (value: string | undefined, a: number, b: number) => !!value && +new Date(value) >= a && +new Date(value) < b;
const SOURCE_COLORS = ['#c2410c', '#e46f3a', '#f2ae88', '#8b5e3c', '#4f7c8a', '#a7b0bb', '#d9c2b2'];
const one = new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function CardHeader({ id, title, sub, children }: { id: string; title: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  return <header className="dcard-head"><div><h2 id={id}>{title}</h2>{sub && <p>{sub}</p>}</div>{children}</header>;
}
function CardLink({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className="card-link" onClick={onClick}>{label}<ChevronRight size={16} aria-hidden /></button>;
}
type Point = { label: string; range: string; prevRange: string; v: number; p: number };
function ChartTip({ active, payload, format }: { active?: boolean; payload?: readonly { payload?: unknown }[]; format: (v: number) => string }) {
  const d = payload?.[0]?.payload as Point | undefined;
  if (!active || !d) return null;
  return (
    <div className="chart-tip">
      <div className="chart-tip-row"><span><i className="key cur" aria-hidden />{d.range}</span><strong>{format(d.v)}</strong></div>
      <div className="chart-tip-row muted-row"><span><i className="key prev" aria-hidden />{d.prevRange}</span><span>{format(d.p)}</span></div>
    </div>
  );
}
function campaignWhen(c: Campaign) {
  if (c.status === 'Odesláno' && c.sentAt) return `Odesláno ${fmtDate(c.sentAt)}`;
  if (c.status === 'Naplánováno' && c.scheduledAt) return `Naplánováno na ${fmtDate(c.scheduledAt)}`;
  return `Upraveno ${fmtDate(c.updatedAt)}`;
}

export default function Dashboard() {
  const { go, w, data, workspaceId, profile } = useHub();
  const { openNotifications } = useShell();
  const [period, setPeriod] = useState<PeriodKey>('30');
  const [metric, setMetric] = useState<ChartMetric>('revenue');
  const [now] = useState(() => Date.now());
  const cfg = PERIODS[period];
  const p = periodOf(period, now);

  const kpi = useMemo(() => {
    const newCur = w.contacts.filter(c => inRange(c.createdAt, p.start, p.end));
    const sent = (a: number, b: number) => w.campaigns.filter(c => c.status === 'Odesláno' && inRange(c.sentAt, a, b));
    const agg = (list: Campaign[]) => list.map(campaignStats).reduce((s, x) => (x ? { delivered: s.delivered + x.delivered, opened: s.opened + x.opened, clicked: s.clicked + x.clicked } : s), { delivered: 0, opened: 0, clicked: 0 });
    const cur = agg(sent(p.start, p.end)); const prev = agg(sent(p.prevStart, p.prevEnd));
    return {
      total: w.contacts.length, newCur, cur, prev, sentCount: sent(p.start, p.end).length,
      openCur: cur.delivered ? (cur.opened / cur.delivered) * 100 : null, openPrev: prev.delivered ? (prev.opened / prev.delivered) * 100 : null,
      revCur: revenue(w.transactions, p.start, p.end), revPrev: revenue(w.transactions, p.prevStart, p.prevEnd),
    };
  }, [w, p.start, p.end, p.prevStart, p.prevEnd]);

  const series = useMemo((): Point[] => {
    const { days, buckets } = cfg; const size = days / buckets;
    const value = (a: number, b: number) => (metric === 'revenue' ? revenue(w.transactions, a, b) : w.campaigns.filter(c => inRange(c.sentAt, a, b)).reduce((s, c) => s + (campaignStats(c)?.delivered ?? 0), 0));
    return Array.from({ length: buckets }, (_, i) => {
      const a = p.start + Math.round(i * size) * DAY; const b = p.start + Math.round((i + 1) * size) * DAY;
      return { label: fmtShortDate(iso(b - 1)), range: range(a, b - 1), prevRange: range(a - days * DAY, b - 1 - days * DAY), v: value(a, b), p: value(a - days * DAY, b - days * DAY) };
    });
  }, [w, cfg, metric, p.start]);

  const sources = useMemo(() => {
    const m = new Map<string, number>();
    kpi.newCur.forEach(c => m.set(c.source, (m.get(c.source) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, value], k) => ({ name, value, color: SOURCE_COLORS[k % SOURCE_COLORS.length] }));
  }, [kpi.newCur]);
  const activity = useMemo(() => hubEvents(data, workspaceId, now).slice(0, 5), [data, workspaceId, now]);
  const recent = [...w.campaigns].sort((a, b) => (b.sentAt ?? b.scheduledAt ?? b.updatedAt).localeCompare(a.sentAt ?? a.scheduledAt ?? a.updatedAt)).slice(0, 5);
  const activeFlows = w.workflows.filter(f => f.status === 'Aktivní');
  const running = activeFlows.reduce((s, f) => s + f.enrolled.length, 0);

  const change = (v: number | null, unit: '%' | 'p. b.') => (v === null ? undefined : `${one.format(Math.abs(v))}${NB}${unit}`);
  const trend = (v: number | null) => ((v ?? 0) >= 0 ? 'up' as const : 'down' as const);
  const growth = kpi.total - kpi.newCur.length > 0 ? (kpi.newCur.length / (kpi.total - kpi.newCur.length)) * 100 : null;
  const emailChange = pctChange(kpi.cur.delivered, kpi.prev.delivered);
  const openChange = kpi.openCur !== null && kpi.openPrev !== null ? kpi.openCur - kpi.openPrev : null;
  const revChange = pctChange(kpi.revCur, kpi.revPrev);
  const kpis = [
    { label: 'Kontakty celkem', value: fmt(kpi.total), change: change(growth, '%'), trend: 'up' as const, desc: `${plural(kpi.newCur.length, 'nový', 'nové', 'nových')} v období` },
    { label: 'Odeslané e-maily', value: fmt(kpi.cur.delivered), change: change(emailChange, '%'), trend: trend(emailChange), desc: kpi.sentCount ? plural(kpi.sentCount, 'odeslaná kampaň', 'odeslané kampaně', 'odeslaných kampaní') : 'v období nic neodešlo' },
    { label: 'Míra otevření', value: kpi.openCur === null ? '—' : percent(kpi.openCur), change: change(openChange, 'p. b.'), trend: trend(openChange), desc: kpi.cur.delivered ? `míra prokliku ${percent((kpi.cur.clicked / kpi.cur.delivered) * 100)}` : 'bez odeslaných kampaní' },
    { label: 'Tržby', value: money(kpi.revCur), change: change(revChange, '%'), trend: trend(revChange), desc: `předtím ${money(kpi.revPrev)}` },
  ];
  const metricTotal = series.reduce((s, x) => s + x.v, 0);
  const formatValue = (v: number) => (metric === 'revenue' ? money(v) : plural(v, 'e-mail', 'e-maily', 'e-mailů'));
  const formatAxis = (v: number) => (metric === 'revenue' && v >= 1000 ? `${fmt(Math.round(v / 1000))}${NB}tis.` : fmt(v));
  const periodOptions = (['7', '30', '90'] as PeriodKey[]).map(k => { const r = periodOf(k, now); return [k, `Posledních ${PERIODS[k].days} dní · ${fmtShortDate(iso(r.start))} – ${fmtShortDate(iso(r.end - 1))}`] as [string, string]; });
  const totalNew = kpi.newCur.length;

  return (
    <div className="dash">
      <header className="dash-head">
        <div className="dash-title">
          <h1>Dobrý den, {profile.name.split(' ')[0]}</h1>
          <p>Výsledky pracovního prostoru za vybrané období.</p>
        </div>
        <div className="dash-actions">
          <div className="dash-period">
            <Pick value={period} onChange={v => setPeriod(v as PeriodKey)} options={periodOptions} label="Období přehledu" />
            <Popover>
              <PopoverTrigger asChild><button type="button" className="icon-btn period-help" aria-label="Jak porovnáváme období"><Info aria-hidden /></button></PopoverTrigger>
              <PopoverContent align="end" className="period-help-panel">
                <strong>Jak porovnáváme období</strong>
                <p>Změny ukazatelů jsou proti předchozím {cfg.days} dnům ({range(p.prevStart, p.prevEnd - 1)}). U míry otevření jde o rozdíl v procentních bodech, u ostatních o relativní změnu.</p>
                <p>Hodnoty se počítají z kontaktů, kampaní a plateb v tomto pracovním prostoru. Graf ukazuje {cfg.bucket}.</p>
              </PopoverContent>
            </Popover>
          </div>
          <Btn primary onClick={() => go('kampane/nova')}><Plus aria-hidden />Nová kampaň</Btn>
        </div>
      </header>

      <div className="metric-grid" role="group" aria-label="Klíčové ukazatele za vybrané období">
        {kpis.map(k => <Metric key={k.label} label={k.label} value={k.value} change={k.change} trend={k.trend} desc={k.change ? k.desc : `${k.desc} · bez srovnání`} />)}
      </div>

      <div className="dash-cols">
        <div className="dash-main">
          <section className="dcard dash-chart" aria-labelledby="dash-chart-title">
            <CardHeader id="dash-chart-title" title="Výkon v čase" sub={`${metric === 'revenue' ? 'Tržby v Kč' : 'Doručené e-maily'} · ${cfg.bucket}`}>
              <div className="seg" role="group" aria-label="Ukazatel v grafu">
                {([['revenue', 'Tržby'], ['emails', 'E-maily']] as [ChartMetric, string][]).map(([id, label]) => <button key={id} type="button" aria-pressed={metric === id} onClick={() => setMetric(id)}>{label}</button>)}
              </div>
            </CardHeader>
            <div className="chart-body">
              <ChartBox>
                <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} title={`${metric === 'revenue' ? 'Tržby' : 'Doručené e-maily'} za ${range(p.start, p.end - 1)}, celkem ${formatValue(metricTotal)}`} desc={`${cfg.bucket}; přerušovaná čára je předchozí období. Šipkami vlevo a vpravo procházíte jednotlivé úseky.`}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine tickMargin={8} minTickGap={20} interval="preserveStartEnd" tick={{ fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} width={64} tickMargin={4} tick={{ fontSize: 12 }} tickFormatter={formatAxis} allowDecimals={false} />
                  <Tooltip cursor={{ stroke: 'var(--line-strong)' }} content={props => <ChartTip active={props.active} payload={props.payload} format={formatValue} />} />
                  <Area dataKey="p" type="monotone" className="series-prev" stroke="#6f7782" strokeWidth={1.5} strokeDasharray="4 4" fill="none" dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
                  <Area dataKey="v" type="monotone" className="series-cur" stroke="#d4511e" strokeWidth={2.25} fill="#d4511e" fillOpacity={0.07} dot={false} activeDot={{ r: 4, strokeWidth: 2 }} isAnimationActive={false} />
                </AreaChart>
              </ChartBox>
            </div>
            <ul className="perf-legend">
              <li><i className="key cur" aria-hidden />Aktuální období <span>{range(p.start, p.end - 1)}</span></li>
              <li><i className="key prev" aria-hidden />Předchozí období <span>{range(p.prevStart, p.prevEnd - 1)}</span></li>
            </ul>
          </section>

          <section className="dcard dash-campaigns" aria-labelledby="dash-campaigns-title">
            <CardHeader id="dash-campaigns-title" title="Poslední kampaně"><CardLink label="Všechny kampaně" onClick={() => go('kampane')} /></CardHeader>
            {recent.length ? (
              <>
                <table className="camp-table">
                  <thead><tr><th scope="col">Kampaň</th><th scope="col">Stav</th><th scope="col" className="num">Příjemci</th><th scope="col" className="num">Otevření</th><th scope="col" className="num">Prokliky</th></tr></thead>
                  <tbody>
                    {recent.map(c => { const s = campaignStats(c); return (
                      <tr key={c.id} onClick={() => go('kampane/' + c.id)}>
                        <td><button type="button" className="camp-name" onClick={e => { e.stopPropagation(); go('kampane/' + c.id); }}>{c.name}</button><span className="camp-meta">{campaignWhen(c)} · {audienceLabel(data, c)}</span></td>
                        <td><Badge>{c.status}</Badge></td>
                        <td className="num">{s ? fmt(s.recipients) : '—'}</td>
                        <td className="num">{s ? percent(s.openRate) : '—'}</td>
                        <td className="num">{s ? percent(s.clickRate) : '—'}</td>
                      </tr>
                    ); })}
                  </tbody>
                </table>
                <ul className="camp-list">
                  {recent.map(c => { const s = campaignStats(c); return (
                    <li key={c.id}>
                      <button type="button" className="camp-rec" onClick={() => go('kampane/' + c.id)}>
                        <span className="camp-rec-top"><span className="camp-name">{c.name}</span><Badge>{c.status}</Badge></span>
                        <span className="camp-meta">{campaignWhen(c)}</span>
                        <span className="camp-stats">
                          <span><span className="lbl">Příjemci</span><span className="val">{s ? fmt(s.recipients) : '—'}</span></span>
                          <span><span className="lbl">Otevření</span><span className="val">{s ? percent(s.openRate) : '—'}</span></span>
                          <span><span className="lbl">Prokliky</span><span className="val">{s ? percent(s.clickRate) : '—'}</span></span>
                        </span>
                      </button>
                    </li>
                  ); })}
                </ul>
              </>
            ) : (
              <div className="dash-empty"><p>V tomto pracovním prostoru zatím nejsou žádné kampaně.</p><Btn primary onClick={() => go('kampane/nova')}><Plus aria-hidden />Vytvořit kampaň</Btn></div>
            )}
          </section>
        </div>

        <div className="dash-side">
          <section className="dcard dash-sources" aria-labelledby="dash-sources-title">
            <CardHeader id="dash-sources-title" title="Zdroje nových kontaktů" sub={range(p.start, p.end - 1)} />
            {totalNew ? (
              <div className="src-donut-wrap">
                <div className="src-donut" role="img" aria-label={`Nové kontakty podle zdroje: ${sources.map(s => `${s.name} ${s.value}`).join(', ')}. Celkem ${totalNew}.`}>
                  <ChartBox>
                    <PieChart>
                      <Pie data={sources} dataKey="value" nameKey="name" innerRadius="70%" outerRadius="100%" startAngle={90} endAngle={-270} paddingAngle={sources.length > 1 ? 2 : 0} stroke="none" isAnimationActive={false}>
                        {sources.map(s => <Cell key={s.name} fill={s.color} />)}
                      </Pie>
                    </PieChart>
                  </ChartBox>
                  <div className="src-donut-center" aria-hidden><strong>{fmt(totalNew)}</strong><span>{plural(totalNew, 'nový kontakt', 'nové kontakty', 'nových kontaktů', false)}</span></div>
                </div>
                <ul className="src-list">
                  {sources.map(s => (
                    <li key={s.name}>
                      <button type="button" className="src-row" onClick={() => go(withQuery('kontakty', { zdroj: s.name, novi: String(cfg.days) }))}>
                        <span className="src-sw" style={{ background: s.color }} aria-hidden />
                        <span className="src-name">{s.name}</span>
                        <span className="src-count">{fmt(s.value)}</span>
                        <span className="src-pct">{Math.round((s.value / totalNew) * 100)}{NB}%</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : <p className="dash-empty">V tomto období nepřibyly žádné kontakty.</p>}
          </section>

          <section className="dcard dash-activity" aria-labelledby="dash-activity-title">
            <CardHeader id="dash-activity-title" title="Nedávná aktivita"><CardLink label="Oznámení" onClick={openNotifications} /></CardHeader>
            {activity.length ? (
              <ul className="act-list">
                {activity.map(a => { const Icon = a.icon; return (
                  <li key={a.id}>
                    <button type="button" className="act-item" onClick={() => go(a.to)}>
                      <span className="act-icon"><Icon size={16} aria-hidden /></span>
                      <span className="act-text"><span className="act-title">{a.who && <b>{a.who} </b>}{a.what}</span><span className="act-desc">{a.desc}</span></span>
                      <span className="act-time">{relTime(a.date, now)}</span>
                    </button>
                  </li>
                ); })}
              </ul>
            ) : <p className="dash-empty">Zatím tu není žádná aktivita.</p>}
            <button type="button" className="act-foot" onClick={() => go('automatizace')}>
              <Workflow size={16} aria-hidden />
              <span><b>{plural(activeFlows.length, 'aktivní scénář', 'aktivní scénáře', 'aktivních scénářů')}</b> · {plural(running, 'kontakt', 'kontakty', 'kontaktů')} v běhu</span>
              <ChevronRight size={16} aria-hidden className="ml-auto" />
            </button>
          </section>
        </div>
      </div>

      <p className="dash-foot">Data uložená v tomto prohlížeči · stav k {fmtDate(iso(now))}</p>
    </div>
  );
}
