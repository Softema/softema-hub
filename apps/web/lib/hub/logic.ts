/** Derived, read-only views over HubData (segments, audiences, stats, timelines). Pure functions only. */
import type { Activity, ActivityType, Campaign, Contact, Course, Enrollment, HubData, Invoice, Segment, SegmentRule, Transaction, Webinar } from './types';
import { daysSince, fmt, money, normalize, percent } from './format';

/* ---------- segments & audiences ---------- */
export interface SegmentContext { courseContacts: Map<string, Set<number>>; webinarContacts: Map<string, Set<number>> }
export function segmentContext(data: HubData, ws: string): SegmentContext {
  const courseContacts = new Map<string, Set<number>>(); const webinarContacts = new Map<string, Set<number>>();
  for (const e of data.enrollments) if (e.workspaceId === ws) (courseContacts.get(e.courseId) ?? courseContacts.set(e.courseId, new Set()).get(e.courseId)!).add(e.contactId);
  for (const r of data.registrations) if (r.workspaceId === ws) (webinarContacts.get(r.webinarId) ?? webinarContacts.set(r.webinarId, new Set()).get(r.webinarId)!).add(r.contactId);
  return { courseContacts, webinarContacts };
}
export function matchesRule(c: Contact, r: SegmentRule, ctx: SegmentContext, now = Date.now()): boolean {
  const v = normalize(r.value.trim());
  const eq = (s: string) => normalize(s) === v;
  let hit: boolean;
  switch (r.field) {
    case 'tag': hit = r.op === 'contains' ? c.tags.some(t => normalize(t).includes(v)) : c.tags.some(eq); break;
    case 'stage': hit = eq(c.stage); break;
    case 'source': hit = eq(c.source); break;
    case 'consent': hit = eq(c.consent.state); break;
    case 'city': hit = r.op === 'contains' ? normalize(c.city).includes(v) : eq(c.city); break;
    case 'company': hit = normalize(c.company).includes(v); break;
    case 'createdDays': return daysSince(c.createdAt, now) < Number(r.value || 0);
    case 'customField': { const f = c.customFields.find(x => normalize(x.name) === normalize(r.key || '')); hit = !!f && (r.op === 'contains' ? normalize(f.value).includes(v) : eq(f.value)); break; }
    case 'course': hit = ctx.courseContacts.get(r.value)?.has(c.id) ?? false; break;
    case 'webinar': hit = ctx.webinarContacts.get(r.value)?.has(c.id) ?? false; break;
    default: hit = false;
  }
  return r.op === 'isNot' ? !hit : hit;
}
export function segmentMembers(contacts: Contact[], seg: Segment, ctx: SegmentContext): Contact[] {
  if (!seg.rules.length) return contacts;
  return contacts.filter(c => (seg.match === 'all' ? seg.rules.every(r => matchesRule(c, r, ctx)) : seg.rules.some(r => matchesRule(c, r, ctx))));
}
export const canEmail = (c: Contact) => c.consent.state === 'Udělen';

export interface AudienceBreakdown { members: Contact[]; eligible: Contact[]; excluded: { noConsent: number; unsubscribed: number; pending: number } }
export function audienceOf(data: HubData, campaign: Pick<Campaign, 'workspaceId' | 'audience' | 'extraContactIds'>): AudienceBreakdown {
  const contacts = data.contacts.filter(c => c.workspaceId === campaign.workspaceId);
  let members = campaign.audience.type === 'manual' ? [] : contacts;
  if (campaign.audience.type === 'segment') {
    const id = campaign.audience.segmentId;
    const seg = data.segments.find(s => s.id === id && s.workspaceId === campaign.workspaceId);
    members = seg ? segmentMembers(contacts, seg, segmentContext(data, campaign.workspaceId)) : [];
  }
  const extra = contacts.filter(c => campaign.extraContactIds.includes(c.id) && !members.includes(c));
  members = [...members, ...extra];
  return {
    members, eligible: members.filter(canEmail),
    excluded: { noConsent: members.filter(c => c.consent.state === 'Bez souhlasu').length, unsubscribed: members.filter(c => c.consent.state === 'Odvolán').length, pending: members.filter(c => c.consent.state === 'Čeká na potvrzení').length },
  };
}
export function audienceLabel(data: HubData, c: Pick<Campaign, 'workspaceId' | 'audience'> & { extraContactIds?: number[] }) {
  if (c.audience.type === 'all') return 'Všechny kontakty se souhlasem';
  if (c.audience.type === 'manual') return `Vybrané kontakty (${fmt(c.extraContactIds?.length ?? 0)})`;
  const id = c.audience.segmentId;
  return data.segments.find(s => s.id === id && s.workspaceId === c.workspaceId)?.name ?? 'Smazaný segment';
}

/* ---------- campaign statistics ---------- */
export interface CampaignStats { recipients: number; delivered: number; opened: number; clicked: number; unsubscribed: number; bounced: number; openRate: number; clickRate: number }
export function campaignStats(c: Campaign): CampaignStats | null {
  if (!c.results) return null;
  const r = c.results; const recipients = r.length;
  const delivered = r.filter(x => x.delivered).length; const opened = r.filter(x => x.opened).length; const clicked = r.filter(x => x.clicked).length;
  return { recipients, delivered, opened, clicked, unsubscribed: r.filter(x => x.unsubscribed).length, bounced: recipients - delivered, openRate: delivered ? (opened / delivered) * 100 : 0, clickRate: delivered ? (clicked / delivered) * 100 : 0 };
}
export const statText = (s: CampaignStats | null, k: 'openRate' | 'clickRate') => (s ? percent(s[k]) : '—');

/* ---------- payments ---------- */
export const invoiceTotal = (i: Invoice) => i.items.reduce((s, x) => s + x.qty * x.price, 0);
export type InvoiceView = 'Koncept' | 'Odeslaná' | 'Po splatnosti' | 'Zaplacená' | 'Stornovaná';
export function invoiceView(i: Invoice, now = Date.now()): InvoiceView {
  if (i.status === 'Odeslaná' && new Date(i.dueAt).getTime() < now) return 'Po splatnosti';
  return i.status;
}
/** Net revenue in [from, to): successful payments minus refunds. */
export function revenue(tx: Transaction[], from: number, to: number) {
  return tx.filter(t => (t.status === 'Úspěšná' || t.status === 'Vrácená') && +new Date(t.date) >= from && +new Date(t.date) < to).reduce((s, t) => s + t.amount, 0);
}

/* ---------- courses & webinars ---------- */
export const courseLessons = (c: Course) => c.modules.flatMap(m => m.lessons);
export const progressOf = (e: Enrollment, c: Course) => { const total = courseLessons(c).length; return total ? Math.round((e.completedLessonIds.filter(id => courseLessons(c).some(l => l.id === id)).length / total) * 100) : 0; };
export type WebinarState = 'Koncept' | 'Naplánováno' | 'Probíhá' | 'Proběhlo' | 'Zrušeno' | 'Evergreen';
export function webinarState(w: Webinar, now = Date.now()): WebinarState {
  if (w.cancelled) return 'Zrušeno';
  if (!w.published) return 'Koncept';
  if (w.kind === 'evergreen') return 'Evergreen';
  const start = +new Date(w.startsAt); const end = start + w.durationMin * 60_000;
  return now < start ? 'Naplánováno' : now < end ? 'Probíhá' : 'Proběhlo';
}

/* ---------- contact timeline (derived from every module + stored activities) ---------- */
export interface TimelineItem { id: string; type: ActivityType; title: string; detail: string; date: string; route?: string }
export function contactTimeline(data: HubData, ws: string, contactId: number): TimelineItem[] {
  const out: TimelineItem[] = [];
  const contact = data.contacts.find(c => c.id === contactId && c.workspaceId === ws);
  if (!contact) return out;
  out.push({ id: 'created', type: 'contact', title: 'Kontakt přidán do databáze', detail: `Zdroj: ${contact.source}`, date: contact.createdAt });
  contact.consent.history.forEach((h, k) => out.push({ id: `consent-${k}`, type: 'consent', title: h.state === 'Udělen' ? 'Souhlas s e-mailingem udělen' : h.state === 'Odvolán' ? 'Odhlášení z e-mailingu' : h.state === 'Čeká na potvrzení' ? 'Čeká na potvrzení souhlasu' : 'Souhlas odebrán', detail: h.source, date: h.date }));
  contact.notes.forEach(n => out.push({ id: n.id, type: 'note', title: 'Interní poznámka', detail: n.text, date: n.date }));
  for (const c of data.campaigns) {
    if (c.workspaceId !== ws || !c.results || !c.sentAt) continue;
    const r = c.results.find(x => x.contactId === contactId); if (!r) continue;
    const base = new Date(c.sentAt).getTime();
    out.push({ id: `cs-${c.id}`, type: r.delivered ? 'email_sent' : 'email_bounce', title: r.delivered ? 'Doručen e-mail' : 'E-mail se nepodařilo doručit', detail: c.name, date: c.sentAt, route: `kampane/${c.id}` });
    if (r.opened) out.push({ id: `co-${c.id}`, type: 'email_open', title: 'Otevřen e-mail', detail: c.name, date: new Date(base + 47 * 60_000).toISOString(), route: `kampane/${c.id}` });
    if (r.clicked) out.push({ id: `cc-${c.id}`, type: 'email_click', title: 'Kliknutí na odkaz v e-mailu', detail: `${c.name} → ${r.link ?? 'odkaz'}`, date: new Date(base + 52 * 60_000).toISOString(), route: `kampane/${c.id}` });
    if (r.unsubscribed) out.push({ id: `cu-${c.id}`, type: 'consent', title: 'Odhlášení přes odkaz v e-mailu', detail: c.name, date: new Date(base + 60 * 60_000).toISOString(), route: `kampane/${c.id}` });
  }
  for (const i of data.invoices) if (i.workspaceId === ws && i.contactId === contactId && i.status !== 'Koncept') out.push({ id: `inv-${i.id}`, type: 'invoice', title: `Vystavena faktura ${i.number}`, detail: `${i.items.map(x => x.name).join(', ')} · ${money(invoiceTotal(i))}`, date: i.issuedAt, route: `platby/faktury/${i.id}` });
  for (const t of data.transactions) if (t.workspaceId === ws && t.contactId === contactId) out.push({ id: `tx-${t.id}`, type: t.status === 'Vrácená' ? 'refund' : 'payment', title: t.status === 'Úspěšná' ? 'Přijatá platba' : t.status === 'Vrácená' ? 'Vrácení platby' : 'Neúspěšná platba', detail: `${t.description} · ${money(Math.abs(t.amount))}`, date: t.date, route: 'platby/transakce' });
  for (const s of data.subscriptions) if (s.workspaceId === ws && s.contactId === contactId) out.push({ id: `sub-${s.id}`, type: 'subscription', title: `Předplatné: ${s.plan}`, detail: `${money(s.price)} ${s.interval} · ${s.status}`, date: s.startedAt, route: 'platby/predplatne' });
  for (const e of data.enrollments) if (e.workspaceId === ws && e.contactId === contactId) { const course = data.courses.find(c => c.id === e.courseId); if (course) out.push({ id: `en-${e.id}`, type: 'course', title: `Přístup ke kurzu ${course.title}`, detail: `Dokončeno ${progressOf(e, course)} % · ${e.status}`, date: e.enrolledAt, route: `kurzy/${course.id}/studenti` }); }
  for (const p of data.purchases) if (p.workspaceId === ws && p.contactId === contactId) { const prod = data.products.find(x => x.id === p.productId); if (prod) out.push({ id: `pu-${p.id}`, type: 'product', title: `Koupen digitální produkt`, detail: `${prod.title} · staženo ${fmt(p.downloads)}×`, date: p.date, route: `kurzy/produkty/${prod.id}` }); }
  for (const m of data.memberships) if (m.workspaceId === ws && m.contactId === contactId) { const g = data.groups.find(x => x.id === m.groupId); if (g) out.push({ id: `mb-${m.id}`, type: 'community', title: `Vstup do skupiny ${g.name}`, detail: `${m.role} · ${m.status}`, date: m.joinedAt, route: `komunita/${g.id}` }); }
  for (const r of data.registrations) if (r.workspaceId === ws && r.contactId === contactId) { const w = data.webinars.find(x => x.id === r.webinarId); if (w) { out.push({ id: `rg-${r.id}`, type: 'webinar', title: 'Registrace na webinář', detail: `${w.title} · ${r.source}`, date: r.registeredAt, route: `webinare/${w.id}` }); if (r.attended) out.push({ id: `at-${r.id}`, type: 'webinar', title: 'Účast na webináři', detail: `${w.title} · sledoval(a) ${r.watchMinutes} min`, date: w.startsAt, route: `webinare/${w.id}` }); } }
  for (const d of data.deals) if (d.workspaceId === ws && d.contactId === contactId) out.push({ id: `deal-${d.id}`, type: 'deal', title: `Obchod: ${d.title}`, detail: `${d.stage} · ${money(d.value)}`, date: d.updatedAt, route: 'kontakty/pipeline' });
  for (const a of data.activities) if (a.workspaceId === ws && a.contactId === contactId) out.push({ id: a.id, type: a.type, title: a.title, detail: a.detail, date: a.date, route: a.route });
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/** Lifetime value: paid payments minus refunds. */
export const contactValue = (data: HubData, ws: string, id: number) => data.transactions.filter(t => t.workspaceId === ws && t.contactId === id && t.status !== 'Neúspěšná').reduce((s, t) => s + t.amount, 0);

export function newActivity(ws: string, contactId: number, type: ActivityType, title: string, detail: string, route?: string): Activity {
  return { id: `act-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, workspaceId: ws, contactId, type, title, detail, date: new Date().toISOString(), route };
}
