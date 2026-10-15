/**
 * Single persistence layer of the prototype: one versioned record in localStorage.
 * - first start: demo data are generated once (lib/hub/seed.ts) and saved;
 * - afterwards only user changes are written; seed data are never re-applied automatically;
 * - unreadable or incompatible data are moved to a backup key and the demo data are used instead;
 * - the server snapshot (static prerender) is an empty dataset, the browser snapshot is the stored one.
 * Secrets are never stored here (see WorkspaceSettings.integrations).
 */
import { z } from 'zod';
import type { CollectionKey, HubData, ItemOf } from './types';
import { createSeed } from './seed';

export const STORAGE_KEY = 'softema-hub:data';
export const BACKUP_KEY = 'softema-hub:data-backup';
export const SCHEMA_VERSION = 1;

const record = z.object({ id: z.union([z.string(), z.number()]), workspaceId: z.string() }).passthrough();
const COLLECTIONS: CollectionKey[] = ['contacts', 'segments', 'deals', 'activities', 'campaigns', 'workflows', 'invoices', 'transactions', 'subscriptions', 'paymentLinks', 'coupons', 'courses', 'enrollments', 'products', 'purchases', 'groups', 'memberships', 'posts', 'webinars', 'registrations', 'chatbots', 'settings'];
const envelope = z.object({
  version: z.number(),
  createdAt: z.string(),
  data: z.object({
    ...Object.fromEntries(COLLECTIONS.map(k => [k, z.array(record)])),
    profile: z.object({ name: z.string(), email: z.string() }).passthrough(),
  }),
});
type Envelope = { version: number; createdAt: string; data: HubData };

const EMPTY: HubData = { ...(Object.fromEntries(COLLECTIONS.map(k => [k, []])) as unknown as HubData), profile: { name: '', email: '', phone: '', title: '', color: 'orange', twoFactor: false } };

/** Older formats are migrated here; unknown versions fall back to fresh demo data. */
function migrate(raw: { version: number; data: unknown }): HubData | null {
  if (raw.version === SCHEMA_VERSION) return raw.data as HubData;
  return null;
}

type Listener = () => void;
let state: HubData | null = null;
let createdAt = '';
let loadIssue: string | null = null;
const listeners = new Set<Listener>();

function storage(): Storage | null { try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; } }

function load(): HubData {
  const ls = storage();
  const raw = ls?.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = envelope.safeParse(JSON.parse(raw));
      if (parsed.success) {
        const data = migrate(parsed.data);
        if (data) { createdAt = parsed.data.createdAt; return data; }
        loadIssue = `Uložená data mají nepodporovanou verzi ${parsed.data.version}.`;
      } else loadIssue = 'Uložená data neodpovídají očekávanému formátu.';
    } catch { loadIssue = 'Uložená data nejsou čitelná.'; }
    try { ls?.setItem(BACKUP_KEY, raw); } catch { /* quota */ }
  }
  createdAt = new Date().toISOString();
  const seed = createSeed(new Date());
  persist(seed);
  return seed;
}

let saveError: string | null = null;
function persist(data: HubData) {
  const ls = storage(); if (!ls) return;
  try { ls.setItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, createdAt, data } satisfies Envelope)); saveError = null; }
  catch { saveError = 'Změny se nepodařilo uložit do prohlížeče (plné úložiště?). Zůstanou jen do obnovení stránky.'; }
}

/* Writes are batched (typing in a form changes the store on every key) and flushed when the page is hidden. */
let timer: ReturnType<typeof setTimeout> | null = null;
function flush() { if (timer) { clearTimeout(timer); timer = null; } if (state) persist(state); }
function schedule() { if (!timer) timer = setTimeout(flush, 300); }
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
}

export const hubStore = {
  getSnapshot(): HubData { if (!state) state = load(); return state; },
  getServerSnapshot(): HubData { return EMPTY; },
  subscribe(listener: Listener) {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY) { state = null; listeners.forEach(l => l()); } };
    window.addEventListener('storage', onStorage);
    return () => { listeners.delete(listener); window.removeEventListener('storage', onStorage); };
  },
  set(next: HubData) { state = next; schedule(); listeners.forEach(l => l()); },
  /** Writes pending changes immediately (tests, reset, export). */
  flush,
  update(fn: (d: HubData) => HubData) { hubStore.set(fn(hubStore.getSnapshot())); },
  /** Restores demo data for one workspace (others stay untouched) or for all of them. */
  reset(workspaceId?: string) {
    const fresh = createSeed(new Date());
    if (!workspaceId) { createdAt = new Date().toISOString(); hubStore.set(fresh); flush(); return; }
    const cur = hubStore.getSnapshot();
    const next = { ...cur } as HubData;
    for (const k of COLLECTIONS) {
      const keep = (cur[k] as { workspaceId: string }[]).filter(x => x.workspaceId !== workspaceId);
      const add = (fresh[k] as { workspaceId: string }[]).filter(x => x.workspaceId === workspaceId);
      (next as unknown as Record<string, unknown[]>)[k] = [...keep, ...add];
    }
    hubStore.set(next); flush();
  },
  info() { flush(); return { createdAt, loadIssue, saveError, bytes: storage()?.getItem(STORAGE_KEY)?.length ?? 0 }; },
  consumeLoadIssue() { const m = loadIssue; loadIssue = null; return m; },
};

/* ---------- typed collection helpers (always scoped to one workspace) ---------- */
export function scoped<K extends CollectionKey>(data: HubData, key: K, workspaceId: string): ItemOf<K>[] {
  return (data[key] as ItemOf<K>[]).filter(x => (x as { workspaceId: string }).workspaceId === workspaceId);
}
export function upsertIn<K extends CollectionKey>(data: HubData, key: K, item: ItemOf<K>): HubData {
  const list = data[key] as ItemOf<K>[];
  const i = list.findIndex(x => (x as { id: unknown }).id === (item as { id: unknown }).id && (x as { workspaceId: string }).workspaceId === (item as { workspaceId: string }).workspaceId);
  const next = i < 0 ? [item, ...list] : list.map((x, k) => (k === i ? item : x));
  return { ...data, [key]: next };
}
export function removeIn<K extends CollectionKey>(data: HubData, key: K, workspaceId: string, id: ItemOf<K>['id'] | ItemOf<K>['id'][]): HubData {
  const ids = Array.isArray(id) ? id : [id];
  return { ...data, [key]: (data[key] as ItemOf<K>[]).filter(x => !((x as { workspaceId: string }).workspaceId === workspaceId && (ids as unknown[]).includes((x as unknown as { id: unknown }).id))) };
}
