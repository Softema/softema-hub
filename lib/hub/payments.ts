/**
 * Payment operations of the prototype. Nothing is charged: Stripe and Fakturoid come with the backend.
 * Every operation keeps invoices, transactions, subscriptions and the contact timeline consistent and
 * fires the "payment succeeded" automation trigger.
 */
import type { HubData, Invoice, InvoiceItem, Subscription, Transaction } from './types';
import { DAY, money, newId } from './format';
import { invoiceTotal, newActivity } from './logic';
import { fireTrigger } from './flow';

const nowIso = () => new Date().toISOString();

/** Next number in the workspace series "<prefix><0001>" (prefix = year by default). */
export function nextInvoiceNumber(d: HubData, ws: string): string {
  const s = d.settings.find(x => x.workspaceId === ws);
  const prefix = s?.invoicing.prefix || String(new Date().getFullYear());
  const max = d.invoices.filter(i => i.workspaceId === ws && i.number.startsWith(prefix)).reduce((m, i) => Math.max(m, Number(i.number.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(Math.max(max, s?.invoicing.nextNumber ?? 0) + 1).padStart(4, '0')}`;
}

export function newInvoice(d: HubData, ws: string, contactId: number, items: InvoiceItem[] = []): Invoice {
  const s = d.settings.find(x => x.workspaceId === ws);
  const issued = new Date();
  return { id: newId('inv'), workspaceId: ws, number: nextInvoiceNumber(d, ws), contactId, items, status: 'Koncept', issuedAt: issued.toISOString(), dueAt: new Date(+issued + (s?.invoicing.dueDays ?? 14) * DAY).toISOString(), note: '' };
}

const act = (d: HubData, ws: string, contactId: number, type: Parameters<typeof newActivity>[2], title: string, detail: string, route?: string): HubData => ({ ...d, activities: [newActivity(ws, contactId, type, title, detail, route), ...d.activities] });

export function sendInvoice(d: HubData, ws: string, id: string): HubData {
  const inv = d.invoices.find(i => i.workspaceId === ws && i.id === id);
  if (!inv || inv.status !== 'Koncept') return d;
  const s = d.settings.find(x => x.workspaceId === ws);
  const issued = new Date();
  const next = { ...d, invoices: d.invoices.map(i => (i === inv ? { ...i, status: 'Odeslaná' as const, issuedAt: issued.toISOString(), dueAt: new Date(+issued + (s?.invoicing.dueDays ?? 14) * DAY).toISOString() } : i)) };
  return act(next, ws, inv.contactId, 'invoice', `Odeslána faktura ${inv.number} (simulace)`, money(invoiceTotal(inv)), `platby/faktury/${inv.id}`);
}

/** Marks an invoice paid and records the matching successful transaction. */
export function payInvoice(d: HubData, ws: string, id: string, method: Transaction['method'] = 'Bankovní převod'): HubData {
  const inv = d.invoices.find(i => i.workspaceId === ws && i.id === id);
  if (!inv || inv.status === 'Zaplacená' || inv.status === 'Stornovaná') return d;
  const date = nowIso(); const total = invoiceTotal(inv); const desc = inv.items.map(x => x.name).join(', ') || `Faktura ${inv.number}`;
  const tx: Transaction = { id: newId('tx'), workspaceId: ws, contactId: inv.contactId, amount: total, status: 'Úspěšná', method, date, description: desc, invoiceId: inv.id };
  let next: HubData = { ...d, invoices: d.invoices.map(i => (i === inv ? { ...i, status: 'Zaplacená' as const, paidAt: date } : i)), transactions: [tx, ...d.transactions] };
  next = act(next, ws, inv.contactId, 'payment', `Zaplacena faktura ${inv.number}`, `${desc} · ${money(total)}`, `platby/faktury/${inv.id}`);
  return inv.items.reduce((acc, item) => fireTrigger(acc, ws, 'payment_succeeded', [inv.contactId], item.name), next);
}

export function cancelInvoice(d: HubData, ws: string, id: string): HubData {
  const inv = d.invoices.find(i => i.workspaceId === ws && i.id === id);
  if (!inv || inv.status === 'Zaplacená') return d;
  return act({ ...d, invoices: d.invoices.map(i => (i === inv ? { ...i, status: 'Stornovaná' as const } : i)) }, ws, inv.contactId, 'invoice', `Stornována faktura ${inv.number}`, money(invoiceTotal(inv)), `platby/faktury/${inv.id}`);
}

/** Refund of a successful transaction: a negative "Vrácená" transaction (no card is touched). */
export function refund(d: HubData, ws: string, txId: string): HubData {
  const t = d.transactions.find(x => x.workspaceId === ws && x.id === txId);
  if (!t || t.status !== 'Úspěšná' || d.transactions.some(x => x.id === `${t.id}-r`)) return d;
  const r: Transaction = { ...t, id: `${t.id}-r`, amount: -t.amount, status: 'Vrácená', date: nowIso(), description: `Vrácení: ${t.description}` };
  return act({ ...d, transactions: [r, ...d.transactions] }, ws, t.contactId, 'refund', 'Vrácení platby', `${t.description} · ${money(t.amount)}`, 'platby/transakce');
}

/** A failed payment retried successfully (simulation). */
export function retry(d: HubData, ws: string, txId: string): HubData {
  const t = d.transactions.find(x => x.workspaceId === ws && x.id === txId);
  if (!t || t.status !== 'Neúspěšná') return d;
  const ok: Transaction = { ...t, id: newId('tx'), status: 'Úspěšná', date: nowIso(), description: t.description.replace(' – zamítnuto bankou', '') };
  return fireTrigger(act({ ...d, transactions: [ok, ...d.transactions] }, ws, t.contactId, 'payment', 'Přijatá platba (opakovaný pokus)', `${ok.description} · ${money(ok.amount)}`, 'platby/transakce'), ws, 'payment_succeeded', [t.contactId], ok.description);
}

/** Simulated renewal: invoice + transaction and the next payment date moves by one period. */
export function chargeSubscription(d: HubData, ws: string, id: string): HubData {
  const s = d.subscriptions.find(x => x.workspaceId === ws && x.id === id);
  if (!s || s.status !== 'Aktivní') return d;
  const inv = { ...newInvoice(d, ws, s.contactId, [{ id: newId('it'), name: `${s.plan} (${s.interval})`, qty: 1, price: s.price }]), status: 'Odeslaná' as const };
  let next: HubData = { ...d, invoices: [inv, ...d.invoices] };
  next = payInvoice(next, ws, inv.id, 'Karta');
  const step = s.interval === 'ročně' ? 365 : 30;
  return { ...next, subscriptions: next.subscriptions.map(x => (x === s ? { ...x, nextPaymentAt: new Date(Math.max(Date.now(), +new Date(x.nextPaymentAt)) + step * DAY).toISOString() } : x)) };
}

export function setSubscription(d: HubData, ws: string, id: string, patch: Partial<Subscription>, note: string): HubData {
  const s = d.subscriptions.find(x => x.workspaceId === ws && x.id === id);
  if (!s) return d;
  return act({ ...d, subscriptions: d.subscriptions.map(x => (x === s ? { ...x, ...patch } : x)) }, ws, s.contactId, 'subscription', note, `${patch.plan ?? s.plan} · ${money(patch.price ?? s.price)}`, 'platby/predplatne');
}

/** Payment through a payment link (simulation): paid invoice + transaction, link counters, trigger. */
export function payLink(d: HubData, ws: string, linkId: string, contactId: number): HubData {
  const l = d.paymentLinks.find(x => x.workspaceId === ws && x.id === linkId);
  if (!l || !l.active) return d;
  const inv = { ...newInvoice(d, ws, contactId, [{ id: newId('it'), name: l.name, qty: 1, price: l.amount }]), status: 'Odeslaná' as const };
  let next: HubData = { ...d, invoices: [inv, ...d.invoices], paymentLinks: d.paymentLinks.map(x => (x === l ? { ...x, opened: x.opened + 1, paid: x.paid + 1 } : x)) };
  next = payInvoice(next, ws, inv.id, 'Platební odkaz');
  if (l.kind === 'Předplatné') next = { ...next, subscriptions: [{ id: newId('sub'), workspaceId: ws, contactId, plan: l.name, price: l.amount, interval: 'měsíčně', status: 'Aktivní', startedAt: nowIso(), nextPaymentAt: new Date(Date.now() + 30 * DAY).toISOString() }, ...next.subscriptions] };
  return next;
}
