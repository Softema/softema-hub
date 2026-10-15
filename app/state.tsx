'use client';
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { toast } from 'sonner';
import { demoWorkspaces, type WorkspaceScope } from '@/lib/domain/tenancy';
import { hubStore, removeIn, scoped, upsertIn } from '@/lib/hub/store';
import { newActivity } from '@/lib/hub/logic';
import { processDueCampaigns } from '@/lib/hub/ops';
import { normalize, newId } from '@/lib/hub/format';
import type { ActivityType, Campaign, CollectionKey, Contact, HubData, ItemOf, UserProfile, WorkspaceSettings } from '@/lib/hub/types';
import { navItems } from './data';
import { Btn, Modal } from './ui';

// WebMCP (document.modelContext) is optional; only the members used here are typed.
type ModelContextTool = { name: string; title: string; description: string; inputSchema: object; annotations: Record<string, boolean>; execute: (input: unknown) => unknown };
type ModelContext = { registerTool?: (tool: ModelContextTool, options: { signal: AbortSignal }) => unknown };

/** Collections of the active workspace only. */
export type Scoped = { [K in CollectionKey]: ItemOf<K>[] };
const KEYS: CollectionKey[] = ['contacts', 'segments', 'deals', 'activities', 'campaigns', 'workflows', 'invoices', 'transactions', 'subscriptions', 'paymentLinks', 'coupons', 'courses', 'enrollments', 'products', 'purchases', 'groups', 'memberships', 'posts', 'webinars', 'registrations', 'chatbots', 'settings'];

export type HubState = {
  ready: boolean;
  route: string; go: (r: string, opts?: { replace?: boolean }) => void;
  scope: WorkspaceScope; workspaceId: string; workspace: string; setWorkspace: (id: string) => void;
  data: HubData; w: Scoped; settings: WorkspaceSettings; profile: UserProfile;
  contacts: Contact[]; campaigns: Campaign[];
  /** Insert or replace a record of the active workspace. */
  upsert: <K extends CollectionKey>(key: K, item: ItemOf<K>) => void;
  /** Update one record of the active workspace by id. */
  patch: <K extends CollectionKey>(key: K, id: ItemOf<K>['id'], fn: (item: ItemOf<K>) => ItemOf<K>) => void;
  remove: <K extends CollectionKey>(key: K, id: ItemOf<K>['id'] | ItemOf<K>['id'][]) => void;
  /** Free-form atomic change over the whole dataset (keep workspace boundaries!). */
  mutate: (fn: (d: HubData) => HubData) => void;
  log: (contactId: number, type: ActivityType, title: string, detail: string, route?: string) => void;
  updateSettings: (fn: (s: WorkspaceSettings) => WorkspaceSettings) => void;
  updateProfile: (fn: (p: UserProfile) => UserProfile) => void;
  nextContactId: () => number;
  /** Register unsaved changes; navigation asks for confirmation while a guard is set. */
  setGuard: (message: string | null) => void;
};
const HubContext = createContext<HubState>(null!);

/* ---------- selected workspace (UI preference, per browser) ---------- */
const UI_KEY = 'softema-hub:workspace';
const wsListeners = new Set<() => void>();
const wsStore = {
  get: () => { try { const id = localStorage.getItem(UI_KEY); return demoWorkspaces.some(w => w.id === id) ? id! : demoWorkspaces[0].id; } catch { return demoWorkspaces[0].id; } },
  server: () => demoWorkspaces[0].id,
  set: (id: string) => { try { localStorage.setItem(UI_KEY, id); } catch { /* private mode */ } wsListeners.forEach(l => l()); },
  subscribe: (l: () => void) => { wsListeners.add(l); return () => { wsListeners.delete(l); }; },
};

const EMPTY_SETTINGS = { name: '', team: [], domains: [], senders: [], integrations: {}, notifications: {}, portal: {}, company: {}, invoicing: { prefix: '', dueDays: 14, nextNumber: 0 }, community: { gracePeriodDays: 7 } } as unknown as WorkspaceSettings;

export function HubProvider({ children }: { children: React.ReactNode }) {
  const data = useSyncExternalStore(hubStore.subscribe, hubStore.getSnapshot, hubStore.getServerSnapshot);
  const workspaceId = useSyncExternalStore(wsStore.subscribe, wsStore.get, wsStore.server);
  const ready = data !== hubStore.getServerSnapshot();
  const [route, setRoute] = useState('prehled');
  const guard = useRef<string | null>(null);
  const [pending, setPending] = useState<null | { route: string; ws?: string; message: string }>(null);
  const lastRoute = useRef('prehled');

  const applyRoute = useCallback((r: string, replace = false) => {
    const hash = '#' + r;
    if (replace) history.replaceState(null, '', hash); else if (location.hash !== hash) history.pushState(null, '', hash);
    lastRoute.current = r; setRoute(r); if (!replace) window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);
  const go = useCallback((r: string, opts?: { replace?: boolean }) => {
    if (guard.current && r !== lastRoute.current) { setPending({ route: r, message: guard.current }); return; }
    applyRoute(r, opts?.replace);
  }, [applyRoute]);

  useEffect(() => {
    const read = () => {
      const r = decodeURIComponent(location.hash.slice(1)) || 'prehled';
      if (guard.current && r !== lastRoute.current) { history.pushState(null, '', '#' + lastRoute.current); setPending({ route: r, message: guard.current }); return; }
      lastRoute.current = r; setRoute(r);
    };
    read(); window.addEventListener('hashchange', read); window.addEventListener('popstate', read);
    const unload = (e: BeforeUnloadEvent) => { if (guard.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', unload);
    return () => { window.removeEventListener('hashchange', read); window.removeEventListener('popstate', read); window.removeEventListener('beforeunload', unload); };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const issue = hubStore.consumeLoadIssue();
    if (issue) toast.warning('Uložená data nebylo možné načíst', { description: `${issue} Původní data jsme zálohovali a načetli ukázková.` });
    // Scheduled campaigns whose time has passed are "sent" by the local simulation.
    const due = processDueCampaigns(hubStore.getSnapshot());
    if (due.sent.length) { hubStore.set(due.data); toast.info(due.sent.length === 1 ? `Naplánovaná kampaň „${due.sent[0].name}“ byla odeslána (simulace).` : `${due.sent.length} naplánované kampaně byly odeslány (simulace).`); }
  }, [ready]);

  const w = useMemo(() => Object.fromEntries(KEYS.map(k => [k, scoped(data, k, workspaceId)])) as Scoped, [data, workspaceId]);
  const settings = w.settings[0] ?? EMPTY_SETTINGS;
  const selected = demoWorkspaces.find(x => x.id === workspaceId) ?? demoWorkspaces[0];
  const scope = { organizationId: selected.organizationId, workspaceId };

  const api = useMemo(() => {
    const withWs = <T,>(item: T) => ({ ...item, workspaceId }) as T;
    return {
      upsert: <K extends CollectionKey>(key: K, item: ItemOf<K>) => hubStore.update(d => upsertIn(d, key, withWs(item))),
      patch: <K extends CollectionKey>(key: K, id: ItemOf<K>['id'], fn: (item: ItemOf<K>) => ItemOf<K>) => hubStore.update(d => ({ ...d, [key]: (d[key] as ItemOf<K>[]).map(x => ((x as { id: unknown }).id === id && (x as { workspaceId: string }).workspaceId === workspaceId ? withWs(fn(x)) : x)) })),
      remove: <K extends CollectionKey>(key: K, id: ItemOf<K>['id'] | ItemOf<K>['id'][]) => hubStore.update(d => removeIn(d, key, workspaceId, id)),
      mutate: (fn: (d: HubData) => HubData) => hubStore.update(fn),
      log: (contactId: number, type: ActivityType, title: string, detail: string, r?: string) => hubStore.update(d => ({ ...d, activities: [newActivity(workspaceId, contactId, type, title, detail, r), ...d.activities] })),
      updateSettings: (fn: (s: WorkspaceSettings) => WorkspaceSettings) => hubStore.update(d => ({ ...d, settings: d.settings.map(s => (s.workspaceId === workspaceId ? fn(s) : s)) })),
      updateProfile: (fn: (p: UserProfile) => UserProfile) => hubStore.update(d => ({ ...d, profile: fn(d.profile) })),
      nextContactId: () => Math.max(0, ...hubStore.getSnapshot().contacts.map(c => c.id)) + 1,
      setGuard: (message: string | null) => { guard.current = message; },
    };
  }, [workspaceId]);

  const setWorkspace = useCallback((id: string) => {
    if (!demoWorkspaces.some(x => x.id === id)) return;
    if (guard.current) { setPending({ route: 'prehled', ws: id, message: guard.current }); return; }
    wsStore.set(id); applyRoute('prehled');
  }, [applyRoute]);

  // Latest values for WebMCP tool callbacks; refreshed in a layout effect so it is current right after flushSync.
  const current = useRef({ route, contacts: w.contacts, go, api, workspace: settings.name });
  useLayoutEffect(() => { current.current = { route, contacts: w.contacts, go, api, workspace: settings.name }; });
  useEffect(() => {
    const mc = (document as Document & { modelContext?: ModelContext }).modelContext; if (!mc?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (t: ModelContextTool) => { try { Promise.resolve(mc.registerTool?.(t, { signal: lifecycle.signal })).catch(() => {}); } catch { /* optional API */ } };
    register({ name: 'get_softema_contacts', title: 'Vyhledat kontakty', description: 'Vrátí ukázkové kontakty a jejich poznámky pouze z aktuálního pracovního prostoru. Data nemění.', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: (input: unknown) => { const i = input as { query?: string } | null; if (!i || typeof i !== 'object' || (i.query !== undefined && typeof i.query !== 'string')) throw new Error('Dotaz musí být text.'); const c = current.current; return { workspace: c.workspace, contacts: c.contacts.filter(x => normalize(x.name + ' ' + x.email).includes(normalize(i.query || ''))).map(x => ({ id: x.id, name: x.name, email: x.email, notes: x.notes.map(n => n.text) })) }; } });
    register({ name: 'navigate_softema_module', title: 'Otevřít modul', description: 'Pouze přepne viditelný modul prototypu Softema Hub.', inputSchema: { type: 'object', properties: { module: { type: 'string', enum: navItems.map(n => n[0]) } }, required: ['module'], additionalProperties: false }, annotations: { readOnlyHint: false }, execute: (input: unknown) => { const i = input as { module?: string } | null; if (!i || typeof i.module !== 'string' || !navItems.some(n => n[0] === i.module)) throw new Error('Neplatný modul.'); const target = i.module; flushSync(() => current.current.go(target)); return { route: current.current.route }; } });
    register({ name: 'start_softema_campaign_creation', title: 'Otevřít průvodce kampaní', description: 'Otevře čtyřkrokový průvodce. Kampaň nevytváří ani neodesílá.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false }, execute: (input: unknown) => { if (!input || typeof input !== 'object' || Object.keys(input).length) throw new Error('Akce nepřijímá parametry.'); flushSync(() => current.current.go('kampane/nova')); return { route: current.current.route, step: 1 }; } });
    register({ name: 'add_softema_contact_note', title: 'Přidat poznámku kontaktu', description: 'Přidá interní poznámku ukázkovému kontaktu v aktuálním pracovním prostoru a otevře jeho detail. Ukládá jen v tomto prohlížeči.', inputSchema: { type: 'object', properties: { contactId: { type: 'integer' }, text: { type: 'string', minLength: 1, maxLength: 2000 } }, required: ['contactId', 'text'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: true }, execute: (input: unknown) => { const i = input as { contactId?: number; text?: string } | null; const c = current.current; if (!i || !Number.isInteger(i.contactId) || typeof i.text !== 'string' || !i.text.trim() || i.text.length > 2000) throw new Error('Zadejte platné ID kontaktu a neprázdnou poznámku.'); const found = c.contacts.find(x => x.id === i.contactId); if (!found) throw new Error('Kontakt v tomto pracovním prostoru neexistuje.'); const text = i.text.trim(); flushSync(() => { c.api.patch('contacts', found.id, x => ({ ...x, notes: [{ id: newId('note'), text, author: 'Asistent (WebMCP)', date: new Date().toISOString() }, ...x.notes] })); c.go('kontakty/' + found.id); }); return { contactId: found.id, noteCount: hubStore.getSnapshot().contacts.find(x => x.id === found.id)?.notes.length }; } });
    return () => lifecycle.abort();
  }, []);

  const value: HubState = { ready, route, go, scope, workspaceId, workspace: settings.name || selected.name, setWorkspace, data, w, settings, profile: data.profile, contacts: w.contacts, campaigns: w.campaigns, ...api };
  return (
    <HubContext.Provider value={value}>
      {children}
      <Modal open={!!pending} onClose={() => setPending(null)} title="Odejít bez uložení?" desc={pending?.message ?? 'Máte neuložené změny.'}>
        <div className="form-actions">
          <Btn onClick={() => setPending(null)}>Zůstat a dokončit</Btn>
          <Btn primary onClick={() => { const p = pending; guard.current = null; setPending(null); if (p?.ws) wsStore.set(p.ws); if (p) applyRoute(p.route); }}>Zahodit změny</Btn>
        </div>
      </Modal>
    </HubContext.Provider>
  );
}
export const useHub = () => useContext(HubContext);

/** Keeps a navigation guard active while `dirty` is true. */
export function useUnsavedGuard(dirty: boolean, message = 'Máte neuložené změny. Pokud odejdete, ztratíte je.') {
  const { setGuard } = useHub();
  useEffect(() => { setGuard(dirty ? message : null); return () => setGuard(null); }, [dirty, message, setGuard]);
}
