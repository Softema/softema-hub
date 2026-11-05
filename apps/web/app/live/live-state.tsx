'use client';
/* Live session state: signed-in user, selected workspace (a request, the API decides access) and the hash route. */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { can, type MeDto, type Permission, type WorkspaceDto } from '@softema/shared';
import { parseRoute, withQuery } from '../hash-route';

const KEY = 'softema-hub:live:workspace';
interface Live { me: MeDto; workspace: WorkspaceDto; setWorkspace: (id: string) => void; allowed: (p: Permission) => boolean; route: string; go: (r: string, replace?: boolean) => void }
const Ctx = createContext<Live>(null!);
export const useLive = () => useContext(Ctx);

const readHash = () => decodeURIComponent(location.hash.slice(1)) || 'kontakty';

export function LiveProvider({ me, children }: { me: MeDto; children: React.ReactNode }) {
  const [route, setRoute] = useState('kontakty');
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setRoute(readHash());
    let stored: string | null = null;
    try { stored = localStorage.getItem(KEY); } catch { /* private mode */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only values, unavailable during prerender
    setSelected(stored); read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  const go = useCallback((r: string, replace = false) => { if (replace) location.replace('#' + r); else location.hash = r; setRoute(r); }, []);
  const workspace = me.workspaces.find(w => w.id === selected) ?? me.workspaces[0];
  const value = useMemo<Live>(() => ({
    me, workspace, route, go,
    allowed: p => can(workspace.role, p),
    setWorkspace: id => { try { localStorage.setItem(KEY, id); } catch { /* private mode */ } setSelected(id); go('kontakty'); },
  }), [me, workspace, route, go]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLiveRoute() {
  const { route, go } = useLive();
  const { parts, query } = parseRoute(route);
  const path = route.split('?')[0];
  const setQuery = (patch: Record<string, string | undefined>) => go(withQuery(path, { ...Object.fromEntries(query.entries()), ...patch }), true);
  return { parts, query, setQuery, go };
}
