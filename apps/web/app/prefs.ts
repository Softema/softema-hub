'use client';
import { useCallback, useSyncExternalStore } from 'react';

/** Small per-browser UI preferences (never domain data, never secrets). */
const listeners = new Set<() => void>();
const cache = new Map<string, unknown>();
const read = <T,>(key: string, fallback: T): T => {
  if (cache.has(key)) return cache.get(key) as T;
  let v = fallback;
  try { const raw = localStorage.getItem(`softema-hub:pref:${key}`); if (raw) v = JSON.parse(raw) as T; } catch { /* private mode */ }
  cache.set(key, v); return v;
};
export function usePref<T>(key: string, fallback: T): [T, (v: T) => void] {
  const value = useSyncExternalStore(
    l => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => read(key, fallback),
    () => fallback,
  );
  const set = useCallback((v: T) => { cache.set(key, v); try { localStorage.setItem(`softema-hub:pref:${key}`, JSON.stringify(v)); } catch { /* quota */ } listeners.forEach(l => l()); }, [key]);
  return [value, set];
}
