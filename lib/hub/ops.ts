/**
 * Cross-collection changes of the local dataset. Pure functions (HubData in → HubData out) that
 * always stay inside one workspace. Nothing here sends e-mails, charges cards or calls a server:
 * "sending" a campaign only simulates delivery results for the prototype.
 */
import type { Campaign, ConsentState, Contact, HubData, Lifecycle, Registration, RecipientResult } from './types';
import { normalize, newId } from './format';
import { audienceOf, newActivity } from './logic';
import { defaultBlocks } from './seed';
import { fireTrigger } from './flow';

const nowIso = () => new Date().toISOString();
export const nextContactIdIn = (d: HubData) => Math.max(0, ...d.contacts.map(c => c.id)) + 1;
export const findByEmail = (d: HubData, ws: string, email: string) => d.contacts.find(c => c.workspaceId === ws && normalize(c.email.trim()) === normalize(email.trim()));

export interface NewContactInput { name: string; email: string; phone?: string; company?: string; city?: string; stage?: Lifecycle; source: string; tags?: string[]; consent?: ConsentState; consentSource?: string; owner?: string; customFields?: { name: string; value: string }[] }
const COLORS = ['orange', 'blue', 'green', 'pink', 'purple'];

export function makeContact(d: HubData, ws: string, input: NewContactInput, id = nextContactIdIn(d)): Contact {
  const date = nowIso(); const state = input.consent ?? 'Bez souhlasu';
  return {
    id, workspaceId: ws, name: input.name.trim(), email: input.email.trim(), phone: input.phone?.trim() ?? '', company: input.company?.trim() ?? '', city: input.city?.trim() ?? '',
    tags: [...new Set(input.tags ?? [])], stage: input.stage ?? 'Lead', source: input.source, owner: input.owner ?? 'Marie Smolková', color: COLORS[id % COLORS.length], createdAt: date,
    notes: [], customFields: (input.customFields ?? []).filter(f => f.name.trim()).map(f => ({ id: newId('cf'), name: f.name.trim(), value: f.value.trim() })),
    consent: { state, source: input.consentSource ?? input.source, date, ip: '', doubleOptIn: false, history: [{ date, state, source: input.consentSource ?? input.source }] },
  };
}

/**
 * Finds a contact of the workspace by e-mail or creates it (deduplication for forms, webinars, chatbot, import).
 * An existing contact only gains the new tags; its consent is upgraded only from "Bez souhlasu" to a pending/given one.
 */
export function upsertContactByEmail(d: HubData, ws: string, input: NewContactInput): { data: HubData; contact: Contact; created: boolean } {
  const existing = findByEmail(d, ws, input.email);
  if (existing) {
    const tags = [...new Set([...existing.tags, ...(input.tags ?? [])])];
    let consent = existing.consent;
    if (input.consent && input.consent !== 'Bez souhlasu' && existing.consent.state === 'Bez souhlasu') {
      const date = nowIso(); consent = { ...consent, state: input.consent, source: input.consentSource ?? input.source, date, history: [...consent.history, { date, state: input.consent, source: input.consentSource ?? input.source }] };
    }
    const contact = { ...existing, tags, consent, phone: existing.phone || input.phone || '' };
    const added = tags.filter(t => !existing.tags.includes(t));
    const data = added.reduce((acc, t) => fireTrigger(acc, ws, 'tag_added', [contact.id], t), { ...d, contacts: d.contacts.map(c => (c === existing ? contact : c)) });
    return { data, contact, created: false };
  }
  const contact = makeContact(d, ws, input);
  return { data: afterContactCreated({ ...d, contacts: [contact, ...d.contacts] }, ws, contact), contact, created: true };
}

export function setConsent(d: HubData, ws: string, ids: number[], state: ConsentState, source: string, doubleOptIn?: boolean): HubData {
  const date = nowIso(); const set = new Set(ids);
  return {
    ...d,
    contacts: d.contacts.map(c => (c.workspaceId === ws && set.has(c.id) && c.consent.state !== state
      ? { ...c, consent: { ...c.consent, state, source, date, doubleOptIn: doubleOptIn ?? (state === 'Udělen' ? c.consent.doubleOptIn : false), history: [...c.consent.history, { date, state, source }] } }
      : c)),
  };
}

/** Automation triggers for a newly created contact: "new contact" and "tag added" for each initial tag. */
export function afterContactCreated(d: HubData, ws: string, c: Contact): HubData {
  return c.tags.reduce((acc, t) => fireTrigger(acc, ws, 'tag_added', [c.id], t), fireTrigger(d, ws, 'contact_created', [c.id], c.source));
}

/** Removes contacts and their CRM records. Accounting records (invoices, payments) stay for legal reasons and show "Smazaný kontakt". */
export function deleteContacts(d: HubData, ws: string, ids: number[]): HubData {
  const set = new Set(ids);
  const keep = <T extends { workspaceId: string; contactId: number }>(x: T) => x.workspaceId !== ws || !set.has(x.contactId);
  return {
    ...d,
    contacts: d.contacts.filter(c => c.workspaceId !== ws || !set.has(c.id)),
    deals: d.deals.filter(keep), activities: d.activities.filter(keep), enrollments: d.enrollments.filter(keep), purchases: d.purchases.filter(keep),
    memberships: d.memberships.filter(keep), registrations: d.registrations.filter(keep),
    subscriptions: d.subscriptions.map(s => (s.workspaceId === ws && set.has(s.contactId) && s.status !== 'Zrušeno' ? { ...s, status: 'Zrušeno' as const } : s)),
    campaigns: d.campaigns.map(c => (c.workspaceId === ws && c.extraContactIds.some(i => set.has(i)) ? { ...c, extraContactIds: c.extraContactIds.filter(i => !set.has(i)) } : c)),
    workflows: d.workflows.map(f => (f.workspaceId === ws && f.enrolled.some(e => set.has(e.contactId)) ? { ...f, enrolled: f.enrolled.filter(e => !set.has(e.contactId)) } : f)),
  };
}

/** GDPR anonymisation: keeps aggregated statistics and accounting, removes personal data. */
export function anonymizeContact(d: HubData, ws: string, id: number): HubData {
  const date = nowIso();
  return {
    ...deleteContacts({ ...d, contacts: [] }, ws, [id]),
    contacts: d.contacts.map(c => (c.workspaceId === ws && c.id === id ? {
      ...c, name: `Anonymizovaný kontakt ${id}`, email: `anonym-${id}@anonymizovano.invalid`, phone: '', company: '', city: '', tags: [], notes: [], customFields: [], color: 'gray',
      consent: { state: 'Bez souhlasu', source: 'Anonymizace (GDPR)', date, ip: '', doubleOptIn: false, history: [{ date, state: 'Bez souhlasu', source: 'Anonymizace (GDPR)' }] },
    } : c)),
  };
}

/** Everything the workspace holds about one contact (GDPR access request). */
export function contactExport(d: HubData, ws: string, id: number) {
  const mine = <T extends { workspaceId: string; contactId: number }>(xs: T[]) => xs.filter(x => x.workspaceId === ws && x.contactId === id);
  return {
    exportedAt: nowIso(),
    contact: d.contacts.find(c => c.workspaceId === ws && c.id === id),
    deals: mine(d.deals), activities: mine(d.activities), invoices: mine(d.invoices), transactions: mine(d.transactions), subscriptions: mine(d.subscriptions),
    enrollments: mine(d.enrollments), purchases: mine(d.purchases), memberships: mine(d.memberships), registrations: mine(d.registrations),
    emails: d.campaigns.filter(c => c.workspaceId === ws && c.results?.some(r => r.contactId === id)).map(c => ({ campaign: c.name, sentAt: c.sentAt, result: c.results!.find(r => r.contactId === id) })),
  };
}

/* ---------- campaigns ---------- */
export function makeCampaign(d: HubData, ws: string, patch: Partial<Campaign> = {}): Campaign {
  const id = Math.max(0, ...d.campaigns.map(c => c.id)) + 1;
  const s = d.settings.find(x => x.workspaceId === ws);
  const sender = s?.senders.find(x => x.isDefault) ?? s?.senders[0];
  const date = nowIso();
  return {
    id, workspaceId: ws, name: 'Nová kampaň', subject: '', preheader: '', sender: sender?.name ?? s?.name ?? '', senderEmail: sender?.email ?? '',
    status: 'Koncept', audience: { type: 'all' }, extraContactIds: [], editor: 'blocks', blocks: defaultBlocks.map(b => ({ ...b, id: newId('b') })),
    createdAt: date, updatedAt: date, links: [], ...patch,
  };
}

function rand(seed: number) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/**
 * Simulated delivery: snapshots the eligible audience (consent "Udělen") and generates plausible results.
 * Unsubscribes from the simulation revoke consent, so later audiences shrink accordingly.
 */
export function simulateSend(d: HubData, ws: string, id: number, at = nowIso()): { data: HubData; campaign?: Campaign } {
  const c = d.campaigns.find(x => x.workspaceId === ws && x.id === id);
  if (!c || c.status === 'Odesláno') return { data: d };
  const { eligible } = audienceOf(d, c);
  const r = rand(id * 7919 + eligible.length);
  const links = c.links.length ? c.links : ['Hlavní tlačítko'];
  const results: RecipientResult[] = eligible.map(x => {
    const delivered = r() > 0.015; const opened = delivered && r() < 0.44; const clicked = opened && r() < 0.24; const unsubscribed = delivered && r() < 0.004;
    return { contactId: x.id, delivered, opened, clicked, unsubscribed, link: clicked ? links[Math.floor(r() * links.length)] : undefined };
  });
  const campaign: Campaign = { ...c, status: 'Odesláno', sentAt: at, updatedAt: at, results };
  let data: HubData = { ...d, campaigns: d.campaigns.map(x => (x === c ? campaign : x)) };
  const unsub = results.filter(x => x.unsubscribed).map(x => x.contactId);
  if (unsub.length) data = setConsent(data, ws, unsub, 'Odvolán', `Odhlášení z kampaně ${c.name}`);
  return { data, campaign };
}

/** Scheduled campaigns whose time has passed are "sent" (simulated) when the app loads. */
export function processDueCampaigns(d: HubData, now = Date.now()): { data: HubData; sent: Campaign[] } {
  let data = d; const sent: Campaign[] = [];
  for (const c of d.campaigns) {
    if (c.status === 'Naplánováno' && c.scheduledAt && +new Date(c.scheduledAt) <= now) {
      const res = simulateSend(data, c.workspaceId, c.id, c.scheduledAt); data = res.data; if (res.campaign) sent.push(res.campaign);
    }
  }
  return { data, sent };
}

/* ---------- automations, courses, webinars ---------- */
export function enrollInWorkflow(d: HubData, ws: string, workflowId: string, contactIds: number[]): { data: HubData; added: number } {
  const f = d.workflows.find(x => x.workspaceId === ws && x.id === workflowId);
  if (!f) return { data: d, added: 0 };
  const trigger = f.nodes.find(n => n.data.kind === 'trigger');
  const firstStep = f.edges.find(e => e.source === trigger?.id)?.target ?? trigger?.id ?? f.nodes[0]?.id ?? '';
  const already = new Set(f.enrolled.map(e => e.contactId));
  const add = contactIds.filter(id => !already.has(id)).map(contactId => ({ contactId, nodeId: firstStep, since: nowIso() }));
  return { data: { ...d, workflows: d.workflows.map(x => (x === f ? { ...f, enrolled: [...f.enrolled, ...add] } : x)) }, added: add.length };
}

export function enrollInCourse(d: HubData, ws: string, courseId: string, contactId: number): { data: HubData; created: boolean } {
  if (d.enrollments.some(e => e.workspaceId === ws && e.courseId === courseId && e.contactId === contactId)) return { data: d, created: false };
  const date = nowIso();
  return { data: { ...d, enrollments: [{ id: newId('en'), workspaceId: ws, courseId, contactId, enrolledAt: date, completedLessonIds: [], status: 'Aktivní', lastActivityAt: date }, ...d.enrollments] }, created: true };
}

/** Webinar registration from the public page or admin: deduplicates the contact and the registration. */
export function registerForWebinar(d: HubData, ws: string, webinarId: string, input: { name: string; email: string; source: string; consent: boolean; session?: string }): { data: HubData; contact: Contact; registration: Registration; createdContact: boolean; duplicate: boolean } {
  const webinar = d.webinars.find(w => w.workspaceId === ws && w.id === webinarId);
  const up = upsertContactByEmail(d, ws, { name: input.name, email: input.email, source: 'Webinář', tags: webinar?.tag ? [webinar.tag] : [], consent: input.consent ? 'Čeká na potvrzení' : 'Bez souhlasu', consentSource: `Registrace: ${webinar?.title ?? 'webinář'}` });
  const existing = up.data.registrations.find(r => r.workspaceId === ws && r.webinarId === webinarId && r.contactId === up.contact.id);
  if (existing) return { data: up.data, contact: up.contact, registration: existing, createdContact: up.created, duplicate: true };
  const registration: Registration = { id: newId('rg'), workspaceId: ws, webinarId, contactId: up.contact.id, registeredAt: nowIso(), source: input.session ? `${input.source} · ${input.session}` : input.source, attended: null, watchMinutes: 0, replay: false };
  return { data: fireTrigger({ ...up.data, registrations: [registration, ...up.data.registrations] }, ws, 'webinar_registered', [up.contact.id], webinar?.title ?? ''), contact: up.contact, registration, createdContact: up.created, duplicate: false };
}

export const logActivity = (d: HubData, ...args: Parameters<typeof newActivity>): HubData => ({ ...d, activities: [newActivity(...args), ...d.activities] });
