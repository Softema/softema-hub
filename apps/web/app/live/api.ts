/** Client of the local API. Every request reports failure explicitly: nothing here assumes a write succeeded. */
import { keepPreviousData, QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActivityPageDto, ApiErrorBody, ContactCreateInput, ContactDetailDto, ContactDto, ContactListDto, ContactUpdateInput, ErrorCode, MeDto, MemberDto, NoteDto, TagDto } from '@softema/shared';

export class ApiFailure extends Error {
  constructor(readonly status: number, readonly code: ErrorCode | 'NETWORK', message: string, readonly fields?: Record<string, string>) { super(message); }
}
const UNAVAILABLE = 'Server je dočasně nedostupný.';
const outcome = (write: boolean) => (write ? ' Změna se neuložila.' : '');

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const write = !!init?.method && init.method !== 'GET';
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, { ...init, headers: { ...(init?.body ? { 'content-type': 'application/json' } : {}), ...init?.headers } });
  } catch { throw new ApiFailure(0, 'NETWORK', `Nepodařilo se spojit se serverem.${outcome(write)}`); }
  if (res.status === 204) return undefined as T;
  let body: unknown = null;
  try { body = await res.json(); } catch { /* proxy error page */ }
  if (res.ok) return body as T;
  const e = body as Partial<ApiErrorBody> | null;
  if (res.status === 401) { window.location.assign('/prihlaseni'); }
  if (!e?.code) throw new ApiFailure(res.status, 'SERVICE_UNAVAILABLE', `${UNAVAILABLE}${outcome(write)}`);
  throw new ApiFailure(res.status, e.code, e.message ?? `${UNAVAILABLE}${outcome(write)}`, e.fields);
}
const send = <T,>(method: string, path: string, body?: unknown) => request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
export const message = (e: unknown) => (e instanceof ApiFailure ? e.message : UNAVAILABLE);
export async function signOut() { await fetch('/api/auth/sign-out', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); window.location.assign('/prihlaseni'); }

export const createQueryClient = () => new QueryClient({
  defaultOptions: { queries: { staleTime: 5_000, refetchOnWindowFocus: true, retry: (n, e) => n < 2 && !(e instanceof ApiFailure && e.status >= 400 && e.status < 500) } },
});

const ws = (id: string) => `/workspaces/${id}`;
export interface ListParams { q?: string; stage?: string; tag?: string; source?: string; sort?: string; page?: number }
const qs = (p: ListParams) => { const u = new URLSearchParams(); for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== '') u.set(k, String(v)); const s = u.toString(); return s ? `?${s}` : ''; };

export const useMe = () => useQuery({ queryKey: ['me'], queryFn: () => request<MeDto>('/me') });
export const useContacts = (w: string, p: ListParams) => useQuery({ queryKey: ['contacts', w, p], queryFn: () => request<ContactListDto>(`${ws(w)}/contacts${qs(p)}`), placeholderData: keepPreviousData });
export const useContact = (w: string, id: string) => useQuery({ queryKey: ['contact', w, id], queryFn: () => request<ContactDetailDto>(`${ws(w)}/contacts/${id}`) });
export const useActivities = (w: string, id: string) => useQuery({ queryKey: ['activities', w, id], queryFn: () => request<ActivityPageDto>(`${ws(w)}/contacts/${id}/activities`) });
export const useTags = (w: string) => useQuery({ queryKey: ['tags', w], queryFn: () => request<TagDto[]>(`${ws(w)}/tags`) });
export const useMembers = (w: string) => useQuery({ queryKey: ['members', w], queryFn: () => request<MemberDto[]>(`${ws(w)}/members`) });

/** Writes refresh what they touched from the server; the screen never shows a state the server did not confirm. */
export function useContactMutations(w: string, id?: string) {
  const qc = useQueryClient();
  const refresh = async () => { await Promise.all([qc.invalidateQueries({ queryKey: ['contacts', w] }), qc.invalidateQueries({ queryKey: ['tags', w] }), ...(id ? [qc.invalidateQueries({ queryKey: ['contact', w, id] }), qc.invalidateQueries({ queryKey: ['activities', w, id] })] : [])]); };
  const base = `${ws(w)}/contacts/${id}`;
  return {
    refresh,
    create: useMutation({ mutationFn: (v: ContactCreateInput) => send<ContactDetailDto>('POST', `${ws(w)}/contacts`, v), onSuccess: refresh }),
    update: useMutation({ mutationFn: (v: ContactUpdateInput) => send<ContactDto>('PATCH', base, v), onSuccess: refresh }),
    remove: useMutation({ mutationFn: () => send<void>('DELETE', base) }),
    addTag: useMutation({ mutationFn: (name: string) => send<TagDto>('POST', `${base}/tags`, { name }), onSuccess: refresh }),
    removeTag: useMutation({ mutationFn: (tagId: string) => send<void>('DELETE', `${base}/tags/${tagId}`), onSuccess: refresh }),
    addNote: useMutation({ mutationFn: (body: string) => send<NoteDto>('POST', `${base}/notes`, { body }), onSuccess: refresh }),
    updateNote: useMutation({ mutationFn: (v: { id: string; body: string }) => send<NoteDto>('PATCH', `${base}/notes/${v.id}`, { body: v.body }), onSuccess: refresh }),
    removeNote: useMutation({ mutationFn: (noteId: string) => send<void>('DELETE', `${base}/notes/${noteId}`), onSuccess: refresh }),
  };
}
