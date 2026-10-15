'use client';
/* Payments: overview, invoices (create, send, pay, cancel), transactions (refund, retry), subscriptions,
   payment links and coupons. All operations are local simulations – no Stripe or Fakturoid calls. */
import React, { useMemo, useState } from 'react';
import { ArrowLeft, Ban, Check, Copy, CreditCard, Download, FileText, Link2, MoreHorizontal, Pause, Play, Plus, Receipt, RotateCcw, Send, Tag, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { DAY, fmt, fmtDate, fmtDateTime, fromPragueInput, money, newId, normalize, percent, periodStart, plural, slugify, toDateInput } from '@/lib/hub/format';
import { invoiceTotal, invoiceView, revenue, type InvoiceView } from '@/lib/hub/logic';
import { cancelInvoice, chargeSubscription, newInvoice, payInvoice, payLink, refund, retry, sendInvoice, setSubscription } from '@/lib/hub/payments';
import type { Contact, Coupon, Invoice, InvoiceItem, PaymentLink, Subscription, Transaction } from '@/lib/hub/types';
import { useHub, useUnsavedGuard } from './state';
import { Avatar, Badge, Btn, Empty, Field, IconBtn, Metric, Modal, PageHead, Pick, SearchInput } from './ui';
import { Bar, DateField, FilterTabs, FormError, Notice, OptionCombobox, Pager, Section, SubNav, ToggleRow, download, paginate, toCsv, useConfirm, useRoute } from './kit';

export const invoiceTone = (v: InvoiceView) => (v === 'Zaplacená' ? 'green' : v === 'Po splatnosti' ? 'red' : v === 'Odeslaná' ? 'blue' : v === 'Stornovaná' ? 'gray' : 'gray');
const txTone = (s: Transaction['status']) => (s === 'Úspěšná' ? 'green' : s === 'Vrácená' ? 'orange' : 'red');

export default function Payments() {
  const { parts } = useRoute();
  const [, sub, id] = parts;
  if (sub === 'faktury' && id) return <InvoiceDetail key={id} id={id} />;
  const tab = sub ?? 'prehled';
  return (
    <div className="page">
      <PageHead title="Platby" desc="Faktury, platby, předplatné a platební odkazy. V prototypu se nic neúčtuje – Stripe a Fakturoid se napojí s backendem." />
      <PayNav active={sub ? `platby/${sub}` : 'platby'} />
      {tab === 'prehled' && <Overview />}
      {tab === 'faktury' && <Invoices />}
      {tab === 'transakce' && <Transactions />}
      {tab === 'predplatne' && <Subscriptions />}
      {tab === 'odkazy' && <Links />}
      {tab === 'kupony' && <Coupons />}
    </div>
  );
}

function PayNav({ active }: { active: string }) {
  const { w } = useHub();
  const [now] = useState(() => Date.now());
  const overdue = w.invoices.filter(i => invoiceView(i, now) === 'Po splatnosti').length;
  return <SubNav active={active} items={[['platby', 'Přehled'], ['platby/faktury', 'Faktury', overdue || undefined], ['platby/transakce', 'Transakce'], ['platby/predplatne', 'Předplatné', w.subscriptions.filter(s => s.status === 'Aktivní').length], ['platby/odkazy', 'Platební odkazy'], ['platby/kupony', 'Kupóny']]} />;
}

function useContacts() { const { w } = useHub(); return useMemo(() => new Map(w.contacts.map(c => [c.id, c])), [w.contacts]); }
function ContactCell({ c }: { c?: Contact }) {
  return <div className="name-cell">{c ? <><Avatar name={c.name} color={c.color} /><button type="button">{c.name}<small>{c.company || c.email}</small></button></> : <span className="muted">Smazaný kontakt</span>}</div>;
}

/* ---------- overview ---------- */
function Overview() {
  const { w, go, settings } = useHub();
  const [now] = useState(() => Date.now());
  const contacts = useContacts();
  const r30 = revenue(w.transactions, periodStart(30, now), now + DAY); const rPrev = revenue(w.transactions, periodStart(60, now), periodStart(30, now));
  const open = w.invoices.filter(i => invoiceView(i, now) === 'Odeslaná'); const overdue = w.invoices.filter(i => invoiceView(i, now) === 'Po splatnosti');
  const mrr = w.subscriptions.filter(s => s.status === 'Aktivní').reduce((s, x) => s + (x.interval === 'ročně' ? x.price / 12 : x.price), 0);
  const months = Array.from({ length: 4 }, (_, k) => { const d = new Date(now); d.setDate(1); d.setHours(0, 0, 0, 0); d.setMonth(d.getMonth() - 3 + k); const e = new Date(d); e.setMonth(e.getMonth() + 1); return { label: d.toLocaleDateString('cs-CZ', { month: 'long' }), v: revenue(w.transactions, +d, +e) }; });
  const max = Math.max(1, ...months.map(m => m.v));
  const integ = settings.integrations;
  return (
    <>
      <div className="metric-grid">
        <Metric label="Tržby za 30 dní" value={money(r30)} change={rPrev ? `${percent(Math.abs(((r30 - rPrev) / rPrev) * 100))}` : undefined} trend={r30 >= rPrev ? 'up' : 'down'} desc={`předtím ${money(rPrev)}`} />
        <Metric label="Čeká na úhradu" value={money(open.reduce((s, i) => s + invoiceTotal(i), 0))} desc={plural(open.length, 'faktura', 'faktury', 'faktur')} />
        <Metric label="Po splatnosti" value={money(overdue.reduce((s, i) => s + invoiceTotal(i), 0))} desc={plural(overdue.length, 'faktura', 'faktury', 'faktur')} />
        <Metric label="Měsíční opakované tržby" value={money(mrr)} desc={`${w.subscriptions.filter(s => s.status === 'Aktivní').length} aktivních předplatných`} />
      </div>
      {/* two independent columns: the main column continues below the chart, the side column does not stretch it */}
      <div className="split">
        <div className="stack">
          <Section title="Tržby po měsících" desc="Úspěšné platby po odečtení vratek">
            <div className="sec-body month-bars">
              {months.map(m => <div key={m.label} className="month-bar"><span>{m.label}</span><Bar value={(m.v / max) * 100} label={`Tržby ${m.label}`} /><strong>{money(m.v)}</strong></div>)}
            </div>
          </Section>
          <Section title="Poslední platby" actions={<Btn onClick={() => go('platby/transakce')}>Všechny transakce</Btn>}>
            <ul className="row-list sec-body">
              {w.transactions.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6).map(t => <li key={t.id}><button type="button" className="row-item" onClick={() => go('kontakty/' + t.contactId)}><span className="row-icon"><CreditCard size={16} aria-hidden /></span><span className="row-main"><strong>{contacts.get(t.contactId)?.name ?? 'Smazaný kontakt'}</strong><small>{t.description} · {fmtDateTime(t.date)}</small></span><span className="num">{money(t.amount)}</span><Badge tone={txTone(t.status)}>{t.status}</Badge></button></li>)}
            </ul>
          </Section>
        </div>
        <div className="stack">
          <Section title="Po splatnosti" actions={<Btn onClick={() => go('platby/faktury?stav=Po%20splatnosti')}>Všechny</Btn>}>
            <ul className="row-list sec-body">
              {overdue.slice(0, 5).map(i => <li key={i.id}><button type="button" className="row-item" onClick={() => go('platby/faktury/' + i.id)}><span className="row-icon"><FileText size={16} aria-hidden /></span><span className="row-main"><strong>{i.number} · {contacts.get(i.contactId)?.name ?? 'Smazaný kontakt'}</strong><small>splatnost {fmtDate(i.dueAt)}</small></span><span className="num">{money(invoiceTotal(i))}</span></button></li>)}
              {!overdue.length && <li className="muted">Žádné faktury po splatnosti.</li>}
            </ul>
          </Section>
          <Section title="Integrace">
            <div className="sec-body stack-sm">
              <div className="kv"><span>Stripe</span><strong>{integ.stripe?.connected ? 'Připraveno (simulace)' : 'Nepřipojeno'}</strong></div>
              <div className="kv"><span>Fakturoid</span><strong>{integ.fakturoid?.connected ? 'Připraveno (simulace)' : 'Nepřipojeno'}</strong></div>
              <Btn onClick={() => go('nastaveni/integrace')}>Nastavení integrací</Btn>
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}

/* ---------- invoices ---------- */
const VIEWS: InvoiceView[] = ['Koncept', 'Odeslaná', 'Po splatnosti', 'Zaplacená', 'Stornovaná'];
export function useInvoiceActions() {
  const { workspaceId, mutate, data } = useHub();
  const [confirmEl, confirm] = useConfirm();
  const contactOf = (i: Invoice) => data.contacts.find(c => c.workspaceId === workspaceId && c.id === i.contactId);
  return {
    confirmEl,
    send: (i: Invoice) => { mutate(d => sendInvoice(d, workspaceId, i.id)); toast.success(`Faktura ${i.number} je odeslaná (simulace).`, { description: `E-mail na ${contactOf(i)?.email ?? 'kontakt'} se v prototypu neodesílá.` }); },
    pay: (i: Invoice) => confirm({ title: `Označit fakturu ${i.number} jako zaplacenou?`, desc: `Zapíše se platba ${money(invoiceTotal(i))} a spustí automatizace „Provedena platba“.`, confirm: 'Označit jako zaplacenou', onConfirm: () => { mutate(d => payInvoice(d, workspaceId, i.id)); toast.success('Faktura je zaplacená.'); } }),
    remind: (i: Invoice) => { mutate(d => ({ ...d, activities: [{ id: newId('act'), workspaceId, contactId: i.contactId, type: 'invoice', title: `Upomínka k faktuře ${i.number} (simulace)`, detail: money(invoiceTotal(i)), date: new Date().toISOString(), route: `platby/faktury/${i.id}` }, ...d.activities] })); toast.success('Upomínka je zapsaná u kontaktu (simulace, nic se neodeslalo).'); },
    cancel: (i: Invoice) => confirm({ title: `Stornovat fakturu ${i.number}?`, desc: 'Faktura zůstane v evidenci jako stornovaná.', confirm: 'Stornovat', danger: true, onConfirm: () => { mutate(d => cancelInvoice(d, workspaceId, i.id)); toast.success('Faktura je stornovaná.'); } }),
    remove: (i: Invoice, after?: () => void) => confirm({ title: `Smazat koncept ${i.number}?`, desc: 'Koncept faktury se nevratně smaže.', confirm: 'Smazat', danger: true, onConfirm: () => { mutate(d => ({ ...d, invoices: d.invoices.filter(x => !(x.workspaceId === workspaceId && x.id === i.id)) })); toast.success('Koncept byl smazán.'); after?.(); } }),
  };
}

function InvoiceMenu({ i, view, actions }: { i: Invoice; view: InvoiceView; actions: ReturnType<typeof useInvoiceActions> }) {
  const { go } = useHub();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><button type="button" className="icon-btn" aria-label={`Akce faktury ${i.number}`} onClick={e => e.stopPropagation()}><MoreHorizontal aria-hidden /></button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
        <DropdownMenuItem onSelect={() => go('platby/faktury/' + i.id)}><FileText aria-hidden />{view === 'Koncept' ? 'Upravit' : 'Zobrazit'}</DropdownMenuItem>
        {view === 'Koncept' && <DropdownMenuItem onSelect={() => actions.send(i)}><Send aria-hidden />Odeslat</DropdownMenuItem>}
        {(view === 'Odeslaná' || view === 'Po splatnosti') && <DropdownMenuItem onSelect={() => actions.pay(i)}><Check aria-hidden />Označit jako zaplacenou</DropdownMenuItem>}
        {view === 'Po splatnosti' && <DropdownMenuItem onSelect={() => actions.remind(i)}><Send aria-hidden />Poslat upomínku</DropdownMenuItem>}
        {(view === 'Odeslaná' || view === 'Po splatnosti') && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => actions.cancel(i)}><Ban aria-hidden />Stornovat</DropdownMenuItem></>}
        {view === 'Koncept' && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => actions.remove(i)}><Trash2 aria-hidden />Smazat koncept</DropdownMenuItem></>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Invoices() {
  const { w, go } = useHub();
  const { query, setQuery } = useRoute();
  const [now] = useState(() => Date.now());
  const contacts = useContacts();
  const actions = useInvoiceActions();
  const stav = query.get('stav') ?? ''; const q = query.get('q') ?? '';
  const list = w.invoices.filter(i => (!stav || invoiceView(i, now) === stav) && normalize(`${i.number} ${contacts.get(i.contactId)?.name ?? ''} ${i.items.map(x => x.name).join(' ')}`).includes(normalize(q))).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  const pg = paginate(list, Number(query.get('strana') || 1), 20);
  return (
    <>
      <div className="filter-bar">
        <SearchInput value={q} onChange={v => setQuery({ q: v || undefined, strana: undefined })} placeholder="Hledat číslo, kontakt, položku…" />
        <div className="filter-row">
          <Pick value={stav || 'all'} onChange={v => setQuery({ stav: v === 'all' ? undefined : v, strana: undefined })} options={[['all', 'Všechny stavy'], ...VIEWS.map(v => [v, `${v} (${w.invoices.filter(i => invoiceView(i, now) === v).length})`] as [string, string])]} label="Stav faktury" />
          <Btn onClick={() => download('faktury.csv', toCsv([['Číslo', 'Kontakt', 'Vystaveno', 'Splatnost', 'Částka', 'Stav'], ...list.map(i => [i.number, contacts.get(i.contactId)?.name ?? '', fmtDate(i.issuedAt), fmtDate(i.dueAt), invoiceTotal(i), invoiceView(i, now)])]))} disabled={!list.length}><Download aria-hidden />Export</Btn>
          <Btn primary onClick={() => go('platby/faktury/nova')}><Plus aria-hidden />Nová faktura</Btn>
        </div>
      </div>
      <section className="panel">
        <div className="table-scroll">
          <table className="hub-table data-table">
            <thead><tr><th>Faktura</th><th>Kontakt</th><th className="col-opt">Splatnost</th><th className="num">Částka</th><th>Stav</th><th aria-label="Akce" /></tr></thead>
            <tbody>
              {pg.slice.map(i => { const v = invoiceView(i, now); return (
                <tr key={i.id} onClick={() => go('platby/faktury/' + i.id)}>
                  <td><div className="name-cell"><span className="mail-box"><FileText size={15} aria-hidden /></span><button type="button">{i.number}<small>{i.items.map(x => x.name).join(', ') || 'Bez položek'}</small></button></div></td>
                  <td className="muted">{contacts.get(i.contactId)?.name ?? 'Smazaný kontakt'}</td>
                  <td className="col-opt muted">{fmtDate(i.dueAt)}</td>
                  <td className="num">{money(invoiceTotal(i))}</td>
                  <td><Badge tone={invoiceTone(v)}>{v}</Badge></td>
                  <td className="col-actions" onClick={e => e.stopPropagation()}><InvoiceMenu i={i} view={v} actions={actions} /></td>
                </tr>
              ); })}
            </tbody>
          </table>
        </div>
        {!list.length && <Empty text="Žádná faktura neodpovídá filtru." />}
        <Pager page={pg.page} pages={pg.pages} total={list.length} from={pg.from} to={pg.to} onPage={p => setQuery({ strana: p > 1 ? String(p) : undefined })} noun="faktur" />
      </section>
      {actions.confirmEl}
    </>
  );
}

function invoiceHtml(i: Invoice, c: Contact | undefined, supplier: { legalName: string; ico: string; dic: string; vatPayer: boolean; address: string; email: string }) {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const total = invoiceTotal(i);
  return `<!doctype html><html lang="cs"><meta charset="utf-8"><title>Faktura ${i.number}</title><body style="font-family:Arial,sans-serif;max-width:760px;margin:40px auto;color:#222"><h1>Faktura ${i.number}</h1><p style="color:#888">Ukázkový doklad z prototypu Softema Hub – není daňovým dokladem.</p><table width="100%"><tr><td valign="top"><b>Dodavatel</b><br>${esc(supplier.legalName)}<br>${esc(supplier.address)}<br>IČO ${supplier.ico}${supplier.dic ? `, DIČ ${supplier.dic}` : ''}</td><td valign="top"><b>Odběratel</b><br>${esc(c?.name ?? '')}<br>${esc(c?.company ?? '')}<br>${esc(c?.email ?? '')}</td></tr></table><p>Vystaveno ${fmtDate(i.issuedAt)} · splatnost ${fmtDate(i.dueAt)}</p><table width="100%" cellpadding="6" style="border-collapse:collapse"><tr style="background:#f3f4f6"><th align="left">Položka</th><th>Množství</th><th align="right">Cena</th><th align="right">Celkem</th></tr>${i.items.map(x => `<tr><td>${esc(x.name)}</td><td align="center">${x.qty}</td><td align="right">${money(x.price)}</td><td align="right">${money(x.qty * x.price)}</td></tr>`).join('')}</table><h2 style="text-align:right">Celkem ${money(total)}</h2>${supplier.vatPayer ? `<p style="text-align:right;color:#666">z toho DPH 21 %: ${money(total - total / 1.21)}</p>` : '<p style="text-align:right;color:#666">Dodavatel není plátce DPH.</p>'}</body></html>`;
}

function InvoiceDetail({ id }: { id: string }) {
  const { w, go, settings } = useHub();
  const { query } = useRoute();
  const contacts = useContacts();
  const actions = useInvoiceActions();
  const [now] = useState(() => Date.now());
  const isNew = id === 'nova';
  const existing = isNew ? undefined : w.invoices.find(i => i.id === id);
  if (!isNew && !existing) return <div className="page"><section className="panel empty"><h3>Faktura nenalezena</h3><Btn primary onClick={() => go('platby/faktury')}>Zpět na faktury</Btn></section></div>;
  if (isNew || existing!.status === 'Koncept') return <InvoiceEditor key={id} existing={existing} contactId={Number(query.get('kontakt')) || undefined} />;
  const i = existing!; const v = invoiceView(i, now); const c = contacts.get(i.contactId);
  const txs = w.transactions.filter(t => t.invoiceId === i.id);
  const total = invoiceTotal(i);
  return (
    <div className="page">
      <button type="button" className="back-link" onClick={() => go('platby/faktury')}><ArrowLeft size={15} aria-hidden />Faktury</button>
      <PageHead title={`Faktura ${i.number}`} desc={`${c?.name ?? 'Smazaný kontakt'} · ${money(total)} · splatnost ${fmtDate(i.dueAt)}`}>
        <Badge tone={invoiceTone(v)}>{v}</Badge>
        <Btn onClick={() => download(`faktura-${i.number}.html`, invoiceHtml(i, c, settings.company), 'text/html;charset=utf-8')}><Download aria-hidden />Stáhnout</Btn>
        {(v === 'Odeslaná' || v === 'Po splatnosti') && <Btn primary onClick={() => actions.pay(i)}><Check aria-hidden />Označit jako zaplacenou</Btn>}
        <InvoiceMenu i={i} view={v} actions={actions} />
      </PageHead>
      <div className="split">
        <section className="panel invoice-paper-v2" aria-label="Náhled faktury">
          <div className="inv-top"><div><span className="eyebrow">Dodavatel</span><strong>{settings.company.legalName}</strong><p>{settings.company.address}<br />IČO {settings.company.ico}{settings.company.dic ? ` · DIČ ${settings.company.dic}` : ''}</p></div><div><span className="eyebrow">Odběratel</span><strong>{c?.name ?? 'Smazaný kontakt'}</strong><p>{c?.company}<br />{c?.email}</p></div></div>
          <div className="inv-dates"><span>Vystaveno <b>{fmtDate(i.issuedAt)}</b></span><span>Splatnost <b>{fmtDate(i.dueAt)}</b></span>{i.paidAt && <span>Zaplaceno <b>{fmtDate(i.paidAt)}</b></span>}</div>
          <table className="inv-items"><thead><tr><th>Položka</th><th className="num">Množství</th><th className="num">Cena</th><th className="num">Celkem</th></tr></thead><tbody>{i.items.map(x => <tr key={x.id}><td>{x.name}</td><td className="num">{x.qty}</td><td className="num">{money(x.price)}</td><td className="num">{money(x.qty * x.price)}</td></tr>)}</tbody></table>
          <div className="inv-total"><span>Celkem k úhradě</span><strong>{money(total)}</strong></div>
          <p className="small muted">{settings.company.vatPayer ? `Ceny jsou včetně DPH 21 % (${money(total - total / 1.21)}).` : 'Dodavatel není plátce DPH.'}{i.note ? ` · ${i.note}` : ''}</p>
        </section>
        <div className="stack">
          <Section title="Odběratel">{c ? <div className="sec-body"><button type="button" className="side-link" onClick={() => go('kontakty/' + c.id)}><strong>{c.name}</strong><small>{c.email}</small></button></div> : <p className="sec-body muted">Kontakt byl smazán, faktura zůstává v evidenci.</p>}</Section>
          <Section title="Platby">
            <ul className="row-list sec-body">
              {txs.map(t => <li key={t.id} className="kv"><span>{t.method} · {fmtDateTime(t.date)}</span><strong>{money(t.amount)} · {t.status}</strong></li>)}
              {!txs.length && <li className="muted small">Zatím bez platby.</li>}
            </ul>
          </Section>
          {settings.integrations.fakturoid?.connected && <Notice>Po napojení Fakturoidu vznikne doklad automaticky po úhradě. Teď jde o ukázku.</Notice>}
        </div>
      </div>
      {actions.confirmEl}
    </div>
  );
}

function InvoiceEditor({ existing, contactId }: { existing?: Invoice; contactId?: number }) {
  const { w, data, workspaceId, mutate, go, settings, setGuard } = useHub();
  const actions = useInvoiceActions();
  const [init] = useState(() => (existing ? { contact: String(existing.contactId), items: existing.items, dueDays: String(Math.max(1, Math.round((+new Date(existing.dueAt) - +new Date(existing.issuedAt)) / DAY))), note: existing.note }
    : { contact: contactId ? String(contactId) : '', items: [{ id: newId('it'), name: '', qty: 1, price: 0 }] as InvoiceItem[], dueDays: String(settings.invoicing.dueDays || 14), note: '' }));
  const [v, setV] = useState(init);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const dirty = JSON.stringify(v) !== JSON.stringify(init);
  useUnsavedGuard(dirty, 'Faktura má neuložené změny.');
  const options = w.contacts.filter(c => String(c.id) === v.contact || normalize(`${c.name} ${c.email} ${c.company}`).includes(normalize(q))).slice(0, 60);
  const total = v.items.reduce((s, x) => s + x.qty * x.price, 0);
  const setItem = (iid: string, p: Partial<InvoiceItem>) => setV({ ...v, items: v.items.map(x => (x.id === iid ? { ...x, ...p } : x)) });
  const save = (andSend = false) => {
    if (!v.contact) return setError('Vyberte odběratele.');
    if (!v.items.length || v.items.some(x => !x.name.trim() || x.qty <= 0 || x.price < 0)) return setError('Každá položka potřebuje název, kladné množství a cenu.');
    const due = Number(v.dueDays); if (!Number.isInteger(due) || due < 1 || due > 120) return setError('Splatnost musí být 1–120 dní.');
    const base = existing ?? newInvoice(data, workspaceId, Number(v.contact));
    const inv: Invoice = { ...base, contactId: Number(v.contact), items: v.items.map(x => ({ ...x, name: x.name.trim() })), note: v.note.trim(), dueAt: new Date(+new Date(base.issuedAt) + due * DAY).toISOString() };
    mutate(d => { const next = { ...d, invoices: existing ? d.invoices.map(i => (i.workspaceId === workspaceId && i.id === inv.id ? inv : i)) : [inv, ...d.invoices] }; return andSend ? sendInvoice(next, workspaceId, inv.id) : next; });
    toast.success(andSend ? `Faktura ${inv.number} je odeslaná (simulace).` : `Koncept faktury ${inv.number} je uložený.`);
    setGuard(null);
    go(andSend ? 'platby/faktury/' + inv.id : 'platby/faktury', { replace: !existing });
  };
  return (
    <div className="page">
      <button type="button" className="back-link" onClick={() => go('platby/faktury')}><ArrowLeft size={15} aria-hidden />Faktury</button>
      <PageHead title={existing ? `Faktura ${existing.number}` : 'Nová faktura'} desc="Koncept · ceny jsou konečné (včetně DPH, je-li dodavatel plátce)">
        {existing && <Btn className="danger-ghost" onClick={() => actions.remove(existing, () => go('platby/faktury'))}><Trash2 aria-hidden />Smazat</Btn>}
        <Btn onClick={() => save(false)} disabled={!dirty && !!existing}>Uložit koncept</Btn>
        <Btn primary onClick={() => save(true)}><Send aria-hidden />Uložit a odeslat</Btn>
      </PageHead>
      <div className="split">
        <Section title="Položky">
          <div className="sec-body stack">
            <div className="inv-edit">
              {v.items.map((x, k) => (
                <div key={x.id} className="inv-row">
                  <Field label={k === 0 ? 'Název' : ''}><input value={x.name} onChange={e => setItem(x.id, { name: e.target.value })} aria-label={`Název položky ${k + 1}`} placeholder="Např. Marketingová konzultace" /></Field>
                  <Field label={k === 0 ? 'Množství' : ''}><input type="number" min={1} value={x.qty} onChange={e => setItem(x.id, { qty: Number(e.target.value) })} aria-label={`Množství položky ${k + 1}`} /></Field>
                  <Field label={k === 0 ? 'Cena (Kč)' : ''}><input type="number" min={0} value={x.price} onChange={e => setItem(x.id, { price: Number(e.target.value) })} aria-label={`Cena položky ${k + 1}`} /></Field>
                  <IconBtn label={`Odebrat položku ${k + 1}`} onClick={() => setV({ ...v, items: v.items.filter(y => y.id !== x.id) })} disabled={v.items.length === 1}><X /></IconBtn>
                </div>
              ))}
            </div>
            <div><Btn onClick={() => setV({ ...v, items: [...v.items, { id: newId('it'), name: '', qty: 1, price: 0 }] })}><Plus aria-hidden />Přidat položku</Btn></div>
            <div className="inv-total"><span>Celkem</span><strong>{money(total)}</strong></div>
            <Field label="Poznámka na faktuře (nepovinné)"><input value={v.note} onChange={e => setV({ ...v, note: e.target.value })} maxLength={200} /></Field>
            <FormError>{error}</FormError>
          </div>
        </Section>
        <Section title="Odběratel a splatnost" className="sticky-side">
          <div className="sec-body stack">
            <Field label="Hledat kontakt"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Jméno, e-mail, firma…" /></Field>
            <Field label="Odběratel"><Pick value={v.contact} onChange={c => { setV({ ...v, contact: c }); setError(''); }} options={options.map(c => [String(c.id), `${c.name}${c.company ? ` · ${c.company}` : ''}`] as [string, string])} className="full" label="Odběratel" /></Field>
            <Field label="Splatnost (dní)"><input type="number" min={1} max={120} value={v.dueDays} onChange={e => setV({ ...v, dueDays: e.target.value })} /></Field>
            <Notice>Odeslání je simulace. Po napojení backendu fakturu vystaví Fakturoid a odešle e-mail.</Notice>
          </div>
        </Section>
      </div>
      {actions.confirmEl}
    </div>
  );
}

/* ---------- transactions ---------- */
function Transactions() {
  const { w, workspaceId, mutate, go } = useHub();
  const { query, setQuery } = useRoute();
  const contacts = useContacts();
  const [confirmEl, confirm] = useConfirm();
  const st = query.get('stav') ?? ''; const method = query.get('metoda') ?? ''; const q = query.get('q') ?? '';
  const list = w.transactions.filter(t => (!st || t.status === st) && (!method || t.method === method) && normalize(`${t.description} ${contacts.get(t.contactId)?.name ?? ''}`).includes(normalize(q))).sort((a, b) => b.date.localeCompare(a.date));
  const pg = paginate(list, Number(query.get('strana') || 1), 25);
  const refunded = new Set(w.transactions.filter(t => t.status === 'Vrácená').map(t => t.id.replace(/-r$/, '')));
  return (
    <>
      <div className="filter-bar">
        <SearchInput value={q} onChange={v => setQuery({ q: v || undefined, strana: undefined })} placeholder="Hledat popis nebo kontakt…" />
        <div className="filter-row">
          <Pick value={st || 'all'} onChange={v => setQuery({ stav: v === 'all' ? undefined : v, strana: undefined })} options={[['all', 'Všechny stavy'], ['Úspěšná', 'Úspěšné'], ['Neúspěšná', 'Neúspěšné'], ['Vrácená', 'Vrácené']]} label="Stav transakce" />
          <Pick value={method || 'all'} onChange={v => setQuery({ metoda: v === 'all' ? undefined : v, strana: undefined })} options={[['all', 'Všechny metody'], ['Karta', 'Karta'], ['Bankovní převod', 'Bankovní převod'], ['Platební odkaz', 'Platební odkaz']]} label="Metoda" />
          <Btn onClick={() => download('transakce.csv', toCsv([['Datum', 'Kontakt', 'Popis', 'Metoda', 'Částka', 'Stav'], ...list.map(t => [fmtDateTime(t.date), contacts.get(t.contactId)?.name ?? '', t.description, t.method, t.amount, t.status])]))} disabled={!list.length}><Download aria-hidden />Export</Btn>
        </div>
      </div>
      <section className="panel">
        <div className="table-scroll">
          <table className="hub-table data-table">
            <thead><tr><th>Kontakt</th><th className="col-opt">Popis</th><th className="col-opt">Datum</th><th className="num">Částka</th><th>Stav</th><th aria-label="Akce" /></tr></thead>
            <tbody>
              {pg.slice.map(t => (
                <tr key={t.id} onClick={() => go('kontakty/' + t.contactId)}>
                  <td><ContactCell c={contacts.get(t.contactId)} /></td>
                  <td className="col-opt muted wrap">{t.description}<small className="block">{t.method}{t.invoiceId ? ' · faktura' : ''}</small></td>
                  <td className="col-opt muted">{fmtDateTime(t.date)}</td>
                  <td className="num">{money(t.amount)}</td>
                  <td><Badge tone={txTone(t.status)}>{t.status}</Badge></td>
                  <td className="col-actions" onClick={e => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><button type="button" className="icon-btn" aria-label={`Akce transakce ${t.description}`}><MoreHorizontal aria-hidden /></button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {t.invoiceId && <DropdownMenuItem onSelect={() => go('platby/faktury/' + t.invoiceId)}><FileText aria-hidden />Otevřít fakturu</DropdownMenuItem>}
                        {t.status === 'Úspěšná' && !refunded.has(t.id) && <DropdownMenuItem onSelect={() => confirm({ title: 'Vrátit platbu?', desc: `Vrácení ${money(t.amount)} kontaktu ${contacts.get(t.contactId)?.name ?? ''}. V prototypu se nic nevrací na kartu.`, confirm: 'Vrátit platbu', danger: true, onConfirm: () => { mutate(d => refund(d, workspaceId, t.id)); toast.success('Vrácení je zapsané (simulace).'); } })}><RotateCcw aria-hidden />Vrátit platbu</DropdownMenuItem>}
                        {t.status === 'Neúspěšná' && <DropdownMenuItem onSelect={() => { mutate(d => retry(d, workspaceId, t.id)); toast.success('Opakovaná platba proběhla (simulace).'); }}><RotateCcw aria-hidden />Zkusit znovu</DropdownMenuItem>}
                        {t.status === 'Úspěšná' && refunded.has(t.id) && <DropdownMenuItem disabled>Platba už byla vrácena</DropdownMenuItem>}
                        <DropdownMenuItem onSelect={() => go('kontakty/' + t.contactId)}>Otevřít kontakt</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!list.length && <Empty text="Žádná transakce neodpovídá filtru." />}
        <Pager page={pg.page} pages={pg.pages} total={list.length} from={pg.from} to={pg.to} onPage={p => setQuery({ strana: p > 1 ? String(p) : undefined })} noun="transakcí" />
      </section>
      {confirmEl}
    </>
  );
}

/* ---------- subscriptions ---------- */
function Subscriptions() {
  const { w, workspaceId, mutate, go } = useHub();
  const contacts = useContacts();
  const [confirmEl, confirm] = useConfirm();
  const [status, setStatus] = useState('all');
  const [editing, setEditing] = useState<Subscription | null | 'new'>(null);
  const list = w.subscriptions.filter(s => status === 'all' || s.status === status).sort((a, b) => a.nextPaymentAt.localeCompare(b.nextPaymentAt));
  const mrr = w.subscriptions.filter(s => s.status === 'Aktivní').reduce((s, x) => s + (x.interval === 'ročně' ? x.price / 12 : x.price), 0);
  return (
    <>
      <div className="metric-grid">
        <Metric label="Aktivní" value={fmt(w.subscriptions.filter(s => s.status === 'Aktivní').length)} desc="předplatných" />
        <Metric label="MRR" value={money(mrr)} desc="měsíční opakované tržby" />
        <Metric label="Pozastavená" value={fmt(w.subscriptions.filter(s => s.status === 'Pozastaveno').length)} desc="bez plateb" />
        <Metric label="Zrušená" value={fmt(w.subscriptions.filter(s => s.status === 'Zrušeno').length)} desc="celkem" />
      </div>
      <div className="toolbar">
        <FilterTabs label="Stav předplatného" value={status} onChange={setStatus} items={[['all', 'Vše', w.subscriptions.length], ['Aktivní', 'Aktivní', w.subscriptions.filter(s => s.status === 'Aktivní').length], ['Pozastaveno', 'Pozastavená', w.subscriptions.filter(s => s.status === 'Pozastaveno').length], ['Zrušeno', 'Zrušená', w.subscriptions.filter(s => s.status === 'Zrušeno').length]]} />
        <Btn primary onClick={() => setEditing('new')}><Plus aria-hidden />Nové předplatné</Btn>
      </div>
      <section className="panel">
        <div className="table-scroll">
          <table className="hub-table data-table">
            <thead><tr><th>Kontakt</th><th>Plán</th><th className="num">Cena</th><th className="col-opt">Další platba</th><th>Stav</th><th aria-label="Akce" /></tr></thead>
            <tbody>
              {list.map(s => (
                <tr key={s.id} onClick={() => go('kontakty/' + s.contactId)}>
                  <td><ContactCell c={contacts.get(s.contactId)} /></td>
                  <td className="muted">{s.plan}</td>
                  <td className="num">{money(s.price)}<small className="block">{s.interval}</small></td>
                  <td className="col-opt muted">{s.status === 'Aktivní' ? fmtDate(s.nextPaymentAt) : '—'}</td>
                  <td><Badge tone={s.status === 'Aktivní' ? 'green' : s.status === 'Pozastaveno' ? 'orange' : 'gray'}>{s.status}</Badge></td>
                  <td className="col-actions" onClick={e => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><button type="button" className="icon-btn" aria-label={`Akce předplatného ${s.plan}`}><MoreHorizontal aria-hidden /></button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {s.status === 'Aktivní' && <DropdownMenuItem onSelect={() => { mutate(d => chargeSubscription(d, workspaceId, s.id)); toast.success('Platba předplatného proběhla (simulace).', { description: 'Vznikla zaplacená faktura a transakce.' }); }}><CreditCard aria-hidden />Simulovat platbu</DropdownMenuItem>}
                        {s.status !== 'Zrušeno' && <DropdownMenuItem onSelect={() => setEditing(s)}><Receipt aria-hidden />Změnit plán</DropdownMenuItem>}
                        {s.status === 'Aktivní' && <DropdownMenuItem onSelect={() => { mutate(d => setSubscription(d, workspaceId, s.id, { status: 'Pozastaveno' }, 'Předplatné pozastaveno')); toast.success('Předplatné je pozastavené.'); }}><Pause aria-hidden />Pozastavit</DropdownMenuItem>}
                        {s.status === 'Pozastaveno' && <DropdownMenuItem onSelect={() => { mutate(d => setSubscription(d, workspaceId, s.id, { status: 'Aktivní', nextPaymentAt: new Date(Date.now() + 30 * DAY).toISOString() }, 'Předplatné obnoveno')); toast.success('Předplatné je znovu aktivní.'); }}><Play aria-hidden />Obnovit</DropdownMenuItem>}
                        {s.status !== 'Zrušeno' && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => confirm({ title: 'Zrušit předplatné?', desc: `${contacts.get(s.contactId)?.name ?? 'Kontakt'} ztratí přístup po skončení období (grace period se nastavuje v Nastavení).`, confirm: 'Zrušit předplatné', danger: true, onConfirm: () => { mutate(d => setSubscription(d, workspaceId, s.id, { status: 'Zrušeno' }, 'Předplatné zrušeno')); toast.success('Předplatné je zrušené.'); } })}><Ban aria-hidden />Zrušit</DropdownMenuItem></>}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!list.length && <Empty text="Žádné předplatné v tomto stavu." />}
      </section>
      {editing && <SubscriptionDialog sub={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {confirmEl}
    </>
  );
}

function SubscriptionDialog({ sub, onClose }: { sub?: Subscription; onClose: () => void }) {
  const { w, workspaceId, mutate } = useHub();
  const [v, setV] = useState({ contact: sub ? String(sub.contactId) : '', plan: sub?.plan ?? '', price: String(sub?.price ?? ''), interval: sub?.interval ?? 'měsíčně' as Subscription['interval'] });
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const options = w.contacts.filter(c => String(c.id) === v.contact || normalize(`${c.name} ${c.email}`).includes(normalize(q))).slice(0, 50);
  const save = () => {
    const price = Number(v.price);
    if (!v.contact) return setError('Vyberte kontakt.');
    if (!v.plan.trim()) return setError('Vyplňte název plánu.');
    if (!Number.isFinite(price) || price <= 0) return setError('Cena musí být kladná.');
    if (sub) mutate(d => setSubscription(d, workspaceId, sub.id, { plan: v.plan.trim(), price, interval: v.interval }, 'Změna plánu předplatného'));
    else mutate(d => ({ ...d, subscriptions: [{ id: newId('sub'), workspaceId, contactId: Number(v.contact), plan: v.plan.trim(), price, interval: v.interval, status: 'Aktivní', startedAt: new Date().toISOString(), nextPaymentAt: new Date(Date.now() + (v.interval === 'ročně' ? 365 : 30) * DAY).toISOString() }, ...d.subscriptions], activities: [{ id: newId('act'), workspaceId, contactId: Number(v.contact), type: 'subscription', title: 'Založeno předplatné', detail: `${v.plan} · ${money(price)}`, date: new Date().toISOString(), route: 'platby/predplatne' }, ...d.activities] }));
    toast.success(sub ? 'Plán byl změněn.' : 'Předplatné bylo založeno (simulace bez platby).'); onClose();
  };
  return (
    <Modal open onClose={onClose} title={sub ? 'Změnit plán' : 'Nové předplatné'} desc="Bez skutečné platby. Se Stripe se předplatné založí přes Checkout.">
      <div className="stack">
        {!sub && <><Field label="Hledat kontakt"><input value={q} onChange={e => setQ(e.target.value)} /></Field><Field label="Kontakt"><Pick value={v.contact} onChange={c => setV({ ...v, contact: c })} options={options.map(c => [String(c.id), `${c.name} · ${c.email}`] as [string, string])} className="full" label="Kontakt" /></Field></>}
        <div className="field"><span>Plán</span><OptionCombobox value={v.plan} onChange={p => setV({ ...v, plan: p, price: v.price || String(w.subscriptions.find(s => s.plan === p)?.price ?? '') })} options={[...new Set(w.subscriptions.map(s => s.plan))]} label="Plán" placeholder="Vyberte nebo vytvořte plán" /></div>
        <div className="form-grid">
          <Field label="Cena (Kč)"><input type="number" min={1} value={v.price} onChange={e => setV({ ...v, price: e.target.value })} /></Field>
          <Field label="Interval"><Pick value={v.interval} onChange={i => setV({ ...v, interval: i as Subscription['interval'] })} options={['měsíčně', 'ročně']} className="full" label="Interval" /></Field>
        </div>
        <FormError>{error}</FormError>
      </div>
      <div className="form-actions"><Btn onClick={onClose}>Zrušit</Btn><Btn primary onClick={save}>{sub ? 'Uložit plán' : 'Založit předplatné'}</Btn></div>
    </Modal>
  );
}

/* ---------- payment links ---------- */
function Links() {
  const { w, workspaceId, mutate, patch } = useHub();
  const [confirmEl, confirm] = useConfirm();
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState<PaymentLink | null>(null);
  return (
    <>
      <div className="toolbar"><span className="muted small">Odkaz pošlete e-mailem nebo dáte na web. Zaplacení vytvoří fakturu, transakci a spustí automatizace.</span><Btn primary onClick={() => setCreating(true)}><Plus aria-hidden />Nový odkaz</Btn></div>
      <div className="card-grid">
        {w.paymentLinks.map(l => (
          <article key={l.id} className="panel link-card">
            <div className="flex-row spread"><Badge tone={l.kind === 'Předplatné' ? 'purple' : 'blue'}>{l.kind}</Badge><Badge tone={l.active ? 'green' : 'gray'}>{l.active ? 'Aktivní' : 'Vypnutý'}</Badge></div>
            <h3>{l.name}</h3>
            <p className="link-amount">{money(l.amount)}{l.kind === 'Předplatné' ? ' / měsíc' : ''}</p>
            <button type="button" className="link-url" onClick={() => { navigator.clipboard?.writeText(`https://pay.softema.cz/${l.slug}`).then(() => toast.success('Odkaz je zkopírovaný.'), () => toast.error('Odkaz se nepodařilo zkopírovat.')); }}><Link2 size={14} aria-hidden />pay.softema.cz/{l.slug}<Copy size={14} aria-hidden /></button>
            <div className="course-stats"><span><strong>{fmt(l.opened)}</strong> otevření</span><span><strong>{fmt(l.paid)}</strong> plateb · {l.opened ? percent((l.paid / l.opened) * 100, 0) : '—'}</span></div>
            <ToggleRow label="Přijímat platby" checked={l.active} onChange={a => { patch('paymentLinks', l.id, x => ({ ...x, active: a })); toast.success(a ? 'Odkaz je aktivní.' : 'Odkaz je vypnutý.'); }} />
            <div className="flex-row wrap">
              <Btn onClick={() => setPaying(l)} disabled={!l.active}><CreditCard aria-hidden />Simulovat platbu</Btn>
              <IconBtn label={`Smazat odkaz ${l.name}`} onClick={() => confirm({ title: `Smazat odkaz ${l.name}?`, desc: 'Odkaz přestane fungovat. Platby zůstanou v evidenci.', confirm: 'Smazat', danger: true, onConfirm: () => { mutate(d => ({ ...d, paymentLinks: d.paymentLinks.filter(x => !(x.workspaceId === workspaceId && x.id === l.id)) })); toast.success('Odkaz byl smazán.'); } })}><Trash2 /></IconBtn>
            </div>
          </article>
        ))}
      </div>
      {!w.paymentLinks.length && <section className="panel empty"><Link2 size={28} aria-hidden /><h3>Zatím žádné platební odkazy</h3><Btn primary onClick={() => setCreating(true)}><Plus aria-hidden />Vytvořit odkaz</Btn></section>}
      {creating && <LinkDialog onClose={() => setCreating(false)} />}
      {paying && <PayDialog link={paying} onClose={() => setPaying(null)} />}
      {confirmEl}
    </>
  );
}

function LinkDialog({ onClose }: { onClose: () => void }) {
  const { w, workspaceId, mutate } = useHub();
  const [v, setV] = useState({ name: '', amount: '', kind: 'Jednorázová' as PaymentLink['kind'] });
  const [error, setError] = useState('');
  const save = () => {
    const amount = Number(v.amount); const slug = slugify(v.name);
    if (!v.name.trim()) return setError('Vyplňte název.');
    if (!Number.isFinite(amount) || amount < 10) return setError('Částka musí být alespoň 10 Kč.');
    const unique = w.paymentLinks.some(l => l.slug === slug) ? `${slug}-${Date.now().toString(36).slice(-4)}` : slug;
    mutate(d => ({ ...d, paymentLinks: [{ id: newId('pl'), workspaceId, name: v.name.trim(), amount: Math.round(amount), kind: v.kind, active: true, opened: 0, paid: 0, slug: unique, createdAt: new Date().toISOString() }, ...d.paymentLinks] }));
    toast.success('Platební odkaz byl vytvořen.'); onClose();
  };
  return (
    <Modal open onClose={onClose} title="Nový platební odkaz" desc="Skutečnou platbu zpracuje Stripe Checkout po napojení backendu.">
      <div className="stack">
        <Field label="Název"><input value={v.name} onChange={e => { setV({ ...v, name: e.target.value }); setError(''); }} maxLength={100} autoFocus /></Field>
        <div className="form-grid">
          <Field label="Částka (Kč)"><input type="number" min={10} value={v.amount} onChange={e => setV({ ...v, amount: e.target.value })} /></Field>
          <Field label="Typ"><Pick value={v.kind} onChange={k => setV({ ...v, kind: k as PaymentLink['kind'] })} options={['Jednorázová', 'Předplatné']} className="full" label="Typ platby" /></Field>
        </div>
        <FormError>{error}</FormError>
      </div>
      <div className="form-actions"><Btn onClick={onClose}>Zrušit</Btn><Btn primary onClick={save}>Vytvořit odkaz</Btn></div>
    </Modal>
  );
}

function PayDialog({ link, onClose }: { link: PaymentLink; onClose: () => void }) {
  const { w, workspaceId, mutate } = useHub();
  const [q, setQ] = useState('');
  const [id, setId] = useState('');
  const options = w.contacts.filter(c => String(c.id) === id || normalize(`${c.name} ${c.email}`).includes(normalize(q))).slice(0, 50);
  return (
    <Modal open onClose={onClose} title="Simulovat platbu" desc={`${link.name} · ${money(link.amount)}. Nic se neúčtuje.`}>
      <div className="stack">
        <Field label="Hledat plátce"><input value={q} onChange={e => setQ(e.target.value)} /></Field>
        <Field label="Plátce"><Pick value={id} onChange={setId} options={options.map(c => [String(c.id), `${c.name} · ${c.email}`] as [string, string])} className="full" label="Plátce" /></Field>
      </div>
      <div className="form-actions"><Btn onClick={onClose}>Zrušit</Btn><Btn primary disabled={!id} onClick={() => { mutate(d => payLink(d, workspaceId, link.id, Number(id))); toast.success('Platba proběhla (simulace).', { description: 'Vznikla zaplacená faktura a transakce u kontaktu.' }); onClose(); }}><Check aria-hidden />Zaplatit</Btn></div>
    </Modal>
  );
}

/* ---------- coupons ---------- */
function Coupons() {
  const { w, workspaceId, mutate, patch } = useHub();
  const [confirmEl, confirm] = useConfirm();
  const [creating, setCreating] = useState(false);
  const [now] = useState(() => Date.now());
  return (
    <>
      <div className="toolbar"><span className="muted small">Kupóny se po napojení předají do Stripe. Platnost a limit hlídá pokladna.</span><Btn primary onClick={() => setCreating(true)}><Plus aria-hidden />Nový kupón</Btn></div>
      <section className="panel">
        <div className="table-scroll">
          <table className="hub-table data-table">
            <thead><tr><th>Kód</th><th>Sleva</th><th>Využití</th><th className="col-opt">Platí do</th><th>Stav</th><th aria-label="Akce" /></tr></thead>
            <tbody>
              {w.coupons.map(c => { const expired = +new Date(c.expiresAt) < now; const full = c.used >= c.limit; const state = !c.active ? 'Vypnutý' : expired ? 'Vypršel' : full ? 'Vyčerpaný' : 'Aktivní'; return (
                <tr key={c.id}>
                  <td><div className="name-cell"><span className="mail-box"><Tag size={15} aria-hidden /></span><strong className="mono">{c.code}</strong></div></td>
                  <td>{c.kind === 'percent' ? `${c.value} %` : money(c.value)}</td>
                  <td className="progress-cell"><Bar value={(c.used / Math.max(1, c.limit)) * 100} label={`Využití ${c.code}`} /><small>{c.used} z {c.limit}</small></td>
                  <td className="col-opt muted">{fmtDate(c.expiresAt)}</td>
                  <td><Badge tone={state === 'Aktivní' ? 'green' : state === 'Vypnutý' ? 'gray' : 'orange'}>{state}</Badge></td>
                  <td className="col-actions">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><button type="button" className="icon-btn" aria-label={`Akce kupónu ${c.code}`}><MoreHorizontal aria-hidden /></button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => { patch('coupons', c.id, x => ({ ...x, active: !x.active })); toast.success(c.active ? 'Kupón je vypnutý.' : 'Kupón je zapnutý.'); }}>{c.active ? <><Pause aria-hidden />Vypnout</> : <><Play aria-hidden />Zapnout</>}</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => { navigator.clipboard?.writeText(c.code).then(() => toast.success('Kód je zkopírovaný.'), () => toast.error('Kód se nepodařilo zkopírovat.')); }}><Copy aria-hidden />Kopírovat kód</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => confirm({ title: `Smazat kupón ${c.code}?`, desc: 'Kód přestane platit.', confirm: 'Smazat', danger: true, onConfirm: () => { mutate(d => ({ ...d, coupons: d.coupons.filter(x => !(x.workspaceId === workspaceId && x.id === c.id)) })); toast.success('Kupón byl smazán.'); } })}><Trash2 aria-hidden />Smazat</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ); })}
            </tbody>
          </table>
        </div>
        {!w.coupons.length && <Empty text="Zatím žádné kupóny." />}
      </section>
      {creating && <CouponDialog onClose={() => setCreating(false)} />}
      {confirmEl}
    </>
  );
}

function CouponDialog({ onClose }: { onClose: () => void }) {
  const { w, workspaceId, mutate } = useHub();
  const [now] = useState(() => Date.now());
  const [v, setV] = useState({ code: '', kind: 'percent' as Coupon['kind'], value: '', limit: '100', expires: toDateInput(new Date(now + 30 * DAY).toISOString()) });
  const [error, setError] = useState('');
  const save = () => {
    const code = v.code.trim().toUpperCase(); const value = Number(v.value); const limit = Number(v.limit);
    if (!/^[A-Z0-9_-]{3,20}$/.test(code)) return setError('Kód má 3–20 znaků: písmena bez diakritiky, čísla, - nebo _.');
    if (w.coupons.some(c => c.code === code)) return setError('Kupón s tímto kódem už existuje.');
    if (v.kind === 'percent' ? !(value >= 1 && value <= 100) : !(value >= 1)) return setError(v.kind === 'percent' ? 'Procentní sleva musí být 1–100 %.' : 'Sleva musí být alespoň 1 Kč.');
    if (!Number.isInteger(limit) || limit < 1) return setError('Limit použití musí být kladné celé číslo.');
    const expiresAt = fromPragueInput(v.expires, '23:59');
    if (+new Date(expiresAt) < now) return setError('Platnost musí končit v budoucnosti.');
    mutate(d => ({ ...d, coupons: [{ id: newId('cp'), workspaceId, code, kind: v.kind, value, limit, used: 0, expiresAt, active: true }, ...d.coupons] }));
    toast.success(`Kupón ${code} byl vytvořen.`); onClose();
  };
  return (
    <Modal open onClose={onClose} title="Nový kupón" desc="Procentní nebo pevná sleva s limitem a platností.">
      <div className="stack">
        <Field label="Kód"><input value={v.code} onChange={e => { setV({ ...v, code: e.target.value.toUpperCase() }); setError(''); }} maxLength={20} autoFocus className="mono" /></Field>
        <div className="form-grid">
          <Field label="Typ slevy"><Pick value={v.kind} onChange={k => setV({ ...v, kind: k as Coupon['kind'] })} options={[['percent', 'Procenta'], ['fixed', 'Pevná částka (Kč)']]} className="full" label="Typ slevy" /></Field>
          <Field label={v.kind === 'percent' ? 'Sleva (%)' : 'Sleva (Kč)'}><input type="number" min={1} value={v.value} onChange={e => setV({ ...v, value: e.target.value })} /></Field>
          <Field label="Limit použití"><input type="number" min={1} value={v.limit} onChange={e => setV({ ...v, limit: e.target.value })} /></Field>
          <div className="field"><span>Platí do</span><DateField label="Platí do" value={v.expires} min={toDateInput(new Date(now).toISOString())} onChange={x => { setV({ ...v, expires: x }); setError(''); }} /></div>
        </div>
        <FormError>{error}</FormError>
      </div>
      <div className="form-actions"><Btn onClick={onClose}>Zrušit</Btn><Btn primary onClick={save}>Vytvořit kupón</Btn></div>
    </Modal>
  );
}
