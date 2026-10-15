import { AlertTriangle, CalendarClock, Flag, Mail, UserPlus, Video, Wallet, type LucideIcon } from 'lucide-react';
import { fmtDateTime, money, percent, plural } from '@/lib/hub/format';
import { campaignStats, invoiceTotal, invoiceView } from '@/lib/hub/logic';
import type { HubData } from '@/lib/hub/types';

/** Recent events of one workspace, derived from its records. Shared by the dashboard activity and the notifications panel. */
export type HubEvent = { id: string; icon: LucideIcon; who: string; what: string; desc: string; date: string; to: string };

export function hubEvents(data: HubData, ws: string, now = Date.now()): HubEvent[] {
  const contacts = new Map(data.contacts.filter(c => c.workspaceId === ws).map(c => [c.id, c]));
  const out: HubEvent[] = [];
  const past = (iso: string) => +new Date(iso) <= now;

  data.transactions.filter(t => t.workspaceId === ws && t.status === 'Úspěšná' && past(t.date)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 2)
    .forEach(t => { const c = contacts.get(t.contactId); out.push({ id: `tx-${t.id}`, icon: Wallet, who: c?.name ?? 'Neznámý kontakt', what: 'zaplatil(a)', desc: `${t.description} · ${money(t.amount)}`, date: t.date, to: c ? `kontakty/${c.id}` : 'platby/transakce' }); });
  [...contacts.values()].filter(c => past(c.createdAt)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 2)
    .forEach(c => out.push({ id: `ct-${c.id}`, icon: UserPlus, who: c.name, what: 'je nový kontakt', desc: `Zdroj: ${c.source}`, date: c.createdAt, to: `kontakty/${c.id}` }));
  data.registrations.filter(r => r.workspaceId === ws && past(r.registeredAt)).sort((a, b) => b.registeredAt.localeCompare(a.registeredAt)).slice(0, 1)
    .forEach(r => { const w = data.webinars.find(x => x.id === r.webinarId); const c = contacts.get(r.contactId); if (w && c) out.push({ id: `rg-${r.id}`, icon: Video, who: c.name, what: 'se registroval(a) na webinář', desc: w.title, date: r.registeredAt, to: `webinare/${w.id}` }); });
  data.campaigns.filter(c => c.workspaceId === ws && c.status === 'Naplánováno' && c.scheduledAt).slice(0, 1)
    .forEach(c => out.push({ id: `cp-${c.id}`, icon: CalendarClock, who: '', what: 'Kampaň je naplánovaná', desc: `${c.name} · ${fmtDateTime(c.scheduledAt!)}`, date: c.updatedAt, to: `kampane/${c.id}` }));
  data.campaigns.filter(c => c.workspaceId === ws && c.status === 'Odesláno' && c.sentAt).sort((a, b) => b.sentAt!.localeCompare(a.sentAt!)).slice(0, 1)
    .forEach(c => { const s = campaignStats(c); if (s) out.push({ id: `cs-${c.id}`, icon: Mail, who: '', what: `Kampaň má ${percent(s.openRate)} otevření`, desc: c.name, date: c.sentAt!, to: `kampane/${c.id}` }); });
  const reports = data.posts.filter(p => p.workspaceId === ws).flatMap(p => p.reports.filter(r => !r.resolved).map(r => ({ p, r })));
  if (reports.length) { const { r } = reports[0]; out.push({ id: `rp-${r.id}`, icon: Flag, who: '', what: `${plural(reports.length, 'nahlášený příspěvek', 'nahlášené příspěvky', 'nahlášených příspěvků')} čeká na moderaci`, desc: `Důvod: ${r.reason}`, date: r.date, to: 'komunita/moderace' }); }
  const overdue = data.invoices.filter(i => i.workspaceId === ws && invoiceView(i, now) === 'Po splatnosti');
  if (overdue.length) out.push({ id: 'overdue', icon: AlertTriangle, who: '', what: `${plural(overdue.length, 'faktura', 'faktury', 'faktur')} po splatnosti`, desc: `Celkem ${money(overdue.reduce((s, i) => s + invoiceTotal(i), 0))}`, date: overdue.map(i => i.dueAt).sort().reverse()[0], to: 'platby/faktury?stav=Po%20splatnosti' });
  return out.sort((a, b) => b.date.localeCompare(a.date));
}
