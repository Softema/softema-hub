'use client';
import React, { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronRight, GraduationCap, Mail, Plus, UserPlus, Wallet, Workflow } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { useHub } from './state';
import { chartRows, fmt, money, type Campaign } from './data';
import { Badge, Btn, Pick } from './ui';
import { ChartBox } from './chart-box';
import './dashboard.css';

/* ---------- Period model ----------
   The prototype's "today" is 25. 9. 2026 (all mock data is dated relative to it).
   Factors and KPI changes are the original mock values; chart buckets are rescaled so
   that they always add up to the KPI total of the selected period. */
type PeriodKey = '7' | '30' | '90';
type Metric = 'revenue' | 'emails';
const TODAY = new Date(2026, 8, 25);
const PERIODS: Record<PeriodKey, { days: number; buckets: number; factor: number; openRate: string; bucket: string }> = {
  '7': { days: 7, buckets: 7, factor: 0.28, openRate: '46,2 %', bucket: 'denní součty' },
  '30': { days: 30, buckets: 10, factor: 1, openRate: '42,8 %', bucket: 'součty za 3 dny' },
  '90': { days: 90, buckets: 13, factor: 2.7, openRate: '42,8 %', bucket: 'týdenní součty' },
};
const CHANGES = { contacts: 12.8, emails: 18.6, openRate: 4.2, revenue: 24.3 };
const CLICK_RATE = '6,4 %';

const NB = '\u00a0';
const WJ = '\u2060'; // word joiner: an en dash would otherwise allow a line break right after it
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dayMonth = (d: Date) => `${d.getDate()}.${NB}${d.getMonth() + 1}.`;
const fullDate = (d: Date) => `${dayMonth(d)}${NB}${d.getFullYear()}`;
const span = (a: Date, b: Date) => (a.getTime() === b.getTime() ? fullDate(b) : `${dayMonth(a)}${NB}–${WJ}${NB}${fullDate(b)}`);
const decimal = (v: number) => new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);
const plural = new Intl.PluralRules('cs');
const pick = (n: number, forms: { one: string; few: string; other: string }) => {
  const c = plural.select(n);
  return c === 'one' ? forms.one : c === 'few' ? forms.few : forms.other;
};

function periodOf(key: PeriodKey) {
  const { days } = PERIODS[key];
  const start = addDays(TODAY, -(days - 1));
  const prevEnd = addDays(start, -1);
  return { start, end: TODAY, prevStart: addDays(start, -days), prevEnd };
}

/** Splits `total` along the shape of the mock series; rounding is corrected on the last bucket. */
function distribute(shape: number[], total: number) {
  const sum = shape.reduce((a, b) => a + b, 0);
  const out = shape.map(v => Math.round((v / sum) * total));
  out[out.length - 1] += total - out.reduce((a, b) => a + b, 0);
  return out;
}

type Point = { label: string; range: string; prevRange: string; v: number; p: number };
function buildSeries(key: PeriodKey, total: number, prevTotal: number): Point[] {
  const { days, buckets } = PERIODS[key];
  const { start, prevStart } = periodOf(key);
  const base = Math.floor(days / buckets);
  const sizes = Array.from({ length: buckets }, (_, i) => base + (i >= buckets - (days - base * buckets) ? 1 : 0));
  const rows = chartRows.slice(-buckets);
  const v = distribute(rows.map(r => r.v), total);
  const p = distribute(rows.map(r => r.p), prevTotal);
  let cur = start;
  let prev = prevStart;
  return sizes.map((size, i) => {
    const end = addDays(cur, size - 1);
    const prevEnd = addDays(prev, size - 1);
    const point = { label: dayMonth(end), range: span(cur, end), prevRange: span(prev, prevEnd), v: v[i], p: p[i] };
    cur = addDays(end, 1);
    prev = addDays(prevEnd, 1);
    return point;
  });
}

const campaignDate = (c: Campaign) => {
  const m = c.date.match(/(\d{1,2})\. (\d{1,2})\. (\d{4})/);
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
};

/* ---------- Small building blocks ---------- */
function Delta({ value, unit }: { value: number; unit: '%' | 'p. b.' }) {
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`delta ${up ? 'up' : 'down'}`} title={unit === 'p. b.' ? 'Změna v procentních bodech oproti předchozímu období' : 'Relativní změna oproti předchozímu období'}>
      <Icon size={14} aria-hidden />
      <span className="sr-only">{up ? 'Nárůst o' : 'Pokles o'} </span>
      {`${up ? '+' : '−'}${decimal(Math.abs(value))}${NB}${unit}`}
    </span>
  );
}

function CardHeader({ id, title, sub, children }: { id: string; title: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="dcard-head">
      <div>
        <h2 id={id}>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {children}
    </header>
  );
}

function CardLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="card-link" onClick={onClick}>
      {label}
      <ChevronRight size={16} aria-hidden />
    </button>
  );
}

function ChartTip({ active, payload, format }: { active?: boolean; payload?: readonly { payload?: unknown }[]; format: (v: number) => string }) {
  const d = payload?.[0]?.payload as Point | undefined;
  if (!active || !d) return null;
  return (
    <div className="chart-tip">
      <div className="chart-tip-row">
        <span><i className="key cur" aria-hidden />{d.range}</span>
        <strong>{format(d.v)}</strong>
      </div>
      <div className="chart-tip-row muted-row">
        <span><i className="key prev" aria-hidden />{d.prevRange}</span>
        <span>{format(d.p)}</span>
      </div>
    </div>
  );
}

/* ---------- Dashboard ---------- */
export default function Dashboard() {
  const { go, contacts, campaigns, workspace } = useHub();
  const [period, setPeriod] = useState<PeriodKey>('30');
  const [metric, setMetric] = useState<Metric>('revenue');
  const cfg = PERIODS[period];
  const range = periodOf(period);
  const alt = workspace !== 'Softema Creative';

  const totals = {
    contacts: alt ? 1450 : 3842,
    newContacts: Math.round(438 * cfg.factor),
    emails: Math.round((alt ? 12846 : 24856) * cfg.factor),
    revenue: Math.round((alt ? 105520 : 284950) * cfg.factor),
  };
  const prevRevenue = Math.round(totals.revenue / (1 + CHANGES.revenue / 100));
  const sentCampaigns = campaigns.filter(c => {
    const d = campaignDate(c);
    return c.status === 'Odesláno' && d && d >= range.start && d <= range.end;
  }).length;

  const kpis = [
    { label: 'Kontakty celkem', value: fmt(totals.contacts), change: CHANGES.contacts, unit: '%' as const, detail: `${fmt(totals.newContacts)} ${pick(totals.newContacts, { one: 'nový', few: 'nové', other: 'nových' })} v období` },
    { label: 'Odeslané e-maily', value: fmt(totals.emails), change: CHANGES.emails, unit: '%' as const, detail: `${sentCampaigns} ${pick(sentCampaigns, { one: 'odeslaná kampaň', few: 'odeslané kampaně', other: 'odeslaných kampaní' })}` },
    { label: 'Míra otevření', value: cfg.openRate, change: CHANGES.openRate, unit: 'p. b.' as const, detail: `míra prokliku ${CLICK_RATE}` },
    { label: 'Tržby', value: money(totals.revenue), change: CHANGES.revenue, unit: '%' as const, detail: `předtím ${money(prevRevenue)}` },
  ];

  const metricTotal = metric === 'revenue' ? totals.revenue : totals.emails;
  const metricChange = metric === 'revenue' ? CHANGES.revenue : CHANGES.emails;
  const series = buildSeries(period, metricTotal, Math.round(metricTotal / (1 + metricChange / 100)));
  const formatValue = (v: number) => (metric === 'revenue' ? money(v) : `${fmt(v)}${NB}${pick(v, { one: 'e-mail', few: 'e-maily', other: 'e-mailů' })}`);
  const formatAxis = (v: number) => (metric === 'revenue' ? (v >= 1000 ? `${fmt(Math.round(v / 1000))}${NB}tis.` : fmt(v)) : fmt(v));

  const reportCampaign = campaigns.find(c => c.status === 'Odesláno');
  const activity = [
    contacts[0] && { icon: Wallet, who: contacts[0].name, what: 'zaplatil fakturu', desc: `Marketingová konzultace · ${money(12900)}`, time: '12 min', full: 'před 12 minutami', to: 'kontakty/' + contacts[0].id },
    contacts[2] && { icon: UserPlus, who: contacts[2].name, what: 'je nový kontakt', desc: 'Registrace na webinář AI v marketingu', time: '34 min', full: 'před 34 minutami', to: 'kontakty/' + contacts[2].id },
    contacts[1] && { icon: GraduationCap, who: contacts[1].name, what: 'dokončila lekci', desc: 'Marketing od základů · Lekce 4', time: '1 h', full: 'před 1 hodinou', to: 'kontakty/' + contacts[1].id },
    reportCampaign && { icon: Mail, who: '', what: `Kampaň má ${reportCampaign.open} otevření`, desc: reportCampaign.name, time: '2 h', full: 'před 2 hodinami', to: 'kampane/' + reportCampaign.id },
  ].filter(Boolean) as { icon: typeof Wallet; who: string; what: string; desc: string; time: string; full: string; to: string }[];

  const recent = campaigns.slice(0, 4);
  const sources = [
    { name: 'Webové formuláře', value: 42, color: '#b83c10' },
    { name: 'E-mailové kampaně', value: 28, color: '#e46f3a' },
    { name: 'Webináře', value: 19, color: '#f2ae88' },
    { name: 'Ostatní', value: 11, color: '#bfc4cb' },
  ];
  const sourceCounts = distribute(sources.map(s => s.value), totals.newContacts);
  const periodOptions = (['7', '30', '90'] as PeriodKey[]).map(k => {
    const r = periodOf(k);
    return [k, `Posledních ${PERIODS[k].days} dní · ${dayMonth(r.start)} – ${dayMonth(r.end)}`] as [string, string];
  });

  return (
    <div className="dash">
      <header className="dash-head">
        <div className="dash-title">
          <h1>Dobrý den, Marie</h1>
          <p>Změny ukazatelů porovnáváme s předchozími {cfg.days} dny ({span(range.prevStart, range.prevEnd)}).</p>
        </div>
        <div className="dash-actions">
          <Pick value={period} onChange={v => setPeriod(v as PeriodKey)} options={periodOptions} label="Období přehledu" className="dash-period" />
          <Btn primary onClick={() => go('kampane/nova')}><Plus aria-hidden />Nová kampaň</Btn>
        </div>
      </header>

      <dl className="kpi-strip" aria-label="Klíčové ukazatele za vybrané období">
        {kpis.map(k => (
          <div className="kpi" key={k.label}>
            <dt>{k.label}</dt>
            <dd className="kpi-value">{k.value}</dd>
            <dd className="kpi-meta"><Delta value={k.change} unit={k.unit} /><span>{k.detail}</span></dd>
          </div>
        ))}
      </dl>

      <div className="dash-cols">
        <div className="dash-main">
          <section className="dcard dash-chart" aria-labelledby="dash-chart-title">
            <CardHeader id="dash-chart-title" title="Výkon v čase" sub={`${metric === 'revenue' ? 'Tržby v Kč' : 'Odeslané e-maily'} · ${cfg.bucket}`}>
              <div className="seg" role="group" aria-label="Ukazatel v grafu">
                {([['revenue', 'Tržby'], ['emails', 'E-maily']] as [Metric, string][]).map(([id, label]) => (
                  <button key={id} type="button" aria-pressed={metric === id} onClick={() => setMetric(id)}>{label}</button>
                ))}
              </div>
            </CardHeader>
            <div className="chart-body">
              <ChartBox>
                <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} title={`${metric === 'revenue' ? 'Tržby' : 'Odeslané e-maily'} za ${span(range.start, range.end)}, celkem ${formatValue(metricTotal)}`} desc={`${cfg.bucket}; přerušovaná čára je předchozí období. Šipkami vlevo a vpravo procházíte jednotlivé úseky.`}>
                  <CartesianGrid vertical={false} stroke="#eceef1" />
                  <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: '#d3d7dd' }} tickMargin={8} minTickGap={20} interval="preserveStartEnd" tick={{ fill: '#5e6570', fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} width={64} tickMargin={4} tick={{ fill: '#5e6570', fontSize: 12 }} tickFormatter={formatAxis} />
                  <Tooltip cursor={{ stroke: '#c3c8cf' }} content={props => <ChartTip active={props.active} payload={props.payload} format={formatValue} />} />
                  <Area dataKey="p" type="monotone" stroke="#6f7782" strokeWidth={1.5} strokeDasharray="4 4" fill="none" dot={false} activeDot={{ r: 3, fill: '#6f7782' }} isAnimationActive={false} />
                  <Area dataKey="v" type="monotone" stroke="#d4511e" strokeWidth={2.25} fill="#d4511e" fillOpacity={0.07} dot={false} activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }} isAnimationActive={false} />
                </AreaChart>
              </ChartBox>
            </div>
            <ul className="perf-legend">
              <li><i className="key cur" aria-hidden />Aktuální období <span>{span(range.start, range.end)}</span></li>
              <li><i className="key prev" aria-hidden />Předchozí období <span>{span(range.prevStart, range.prevEnd)}</span></li>
            </ul>
          </section>

          <section className="dcard dash-campaigns" aria-labelledby="dash-campaigns-title">
            <CardHeader id="dash-campaigns-title" title="Poslední kampaně">
              <CardLink label="Všechny kampaně" onClick={() => go('kampane')} />
            </CardHeader>
            {recent.length ? (
              <>
                <table className="camp-table">
                  <thead>
                    <tr>
                      <th scope="col">Kampaň</th>
                      <th scope="col">Stav</th>
                      <th scope="col" className="num">Příjemci</th>
                      <th scope="col" className="num">Otevření</th>
                      <th scope="col" className="num">Prokliky</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map(c => (
                      <tr key={c.id} onClick={() => go('kampane/' + c.id)}>
                        <td>
                          <button type="button" className="camp-name" onClick={e => { e.stopPropagation(); go('kampane/' + c.id); }}>{c.name}</button>
                          <span className="camp-meta">{c.date}</span>
                        </td>
                        <td><Badge>{c.status}</Badge></td>
                        <td className="num">{fmt(c.recipients)}</td>
                        <td className="num">{c.open}</td>
                        <td className="num">{c.click}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <ul className="camp-list">
                  {recent.map(c => (
                    <li key={c.id}>
                      <button type="button" className="camp-rec" onClick={() => go('kampane/' + c.id)}>
                        <span className="camp-rec-top"><span className="camp-name">{c.name}</span><Badge>{c.status}</Badge></span>
                        <span className="camp-meta">{c.date}</span>
                        <span className="camp-stats">
                          <span><span className="lbl">Příjemci</span><span className="val">{fmt(c.recipients)}</span></span>
                          <span><span className="lbl">Otevření</span><span className="val">{c.open}</span></span>
                          <span><span className="lbl">Prokliky</span><span className="val">{c.click}</span></span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="dash-empty">
                <p>V tomto pracovním prostoru zatím nejsou žádné kampaně.</p>
                <Btn primary onClick={() => go('kampane/nova')}><Plus aria-hidden />Vytvořit kampaň</Btn>
              </div>
            )}
          </section>
        </div>

        <div className="dash-side">
          <section className="dcard dash-activity" aria-labelledby="dash-activity-title">
            <CardHeader id="dash-activity-title" title="Nedávná aktivita">
              <CardLink label="Kontakty" onClick={() => go('kontakty')} />
            </CardHeader>
            {activity.length ? (
              <ul className="act-list">
                {activity.map(a => {
                  const Icon = a.icon;
                  return (
                    <li key={a.to + a.what}>
                      <button type="button" className="act-item" onClick={() => go(a.to)}>
                        <span className="act-icon"><Icon size={16} aria-hidden /></span>
                        <span className="act-text">
                          <span className="act-title">{a.who && <b>{a.who} </b>}{a.what}</span>
                          <span className="act-desc">{a.desc}</span>
                        </span>
                        <span className="act-time" title={a.full}><span aria-hidden>{a.time}</span><span className="sr-only">{a.full}</span></span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="dash-empty">Zatím tu není žádná aktivita.</p>
            )}
            <button type="button" className="act-foot" onClick={() => go('automatizace')}>
              <Workflow size={16} aria-hidden />
              <span><b>3 aktivní scénáře</b> · 126 kontaktů v běhu</span>
              <ChevronRight size={16} aria-hidden className="ml-auto" />
            </button>
          </section>

          <section className="dcard dash-sources" aria-labelledby="dash-sources-title">
            <CardHeader id="dash-sources-title" title="Zdroje nových kontaktů" sub={`${fmt(totals.newContacts)} ${pick(totals.newContacts, { one: 'nový kontakt', few: 'nové kontakty', other: 'nových kontaktů' })} za ${span(range.start, range.end)}`} />
            <div className="src-bar" role="img" aria-label={sources.map(s => `${s.name} ${s.value} %`).join(', ')}>
              {sources.map(s => <span key={s.name} style={{ flexGrow: s.value, background: s.color }} />)}
            </div>
            <ul className="src-list">
              {sources.map((s, i) => (
                <li key={s.name}>
                  <button type="button" className="src-row" onClick={() => go('kontakty')}>
                    <span className="src-sw" style={{ background: s.color }} aria-hidden />
                    <span className="src-name">{s.name}</span>
                    <span className="src-count">{fmt(sourceCounts[i])}</span>
                    <span className="src-pct">{s.value}{NB}%</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <p className="dash-foot">Ukázková data · aktualizováno {fullDate(TODAY)} v 10:42</p>
    </div>
  );
}
