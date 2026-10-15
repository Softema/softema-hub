/** Hash routes: "modul/část/id?param=hodnota". */
export function parseRoute(route: string) {
  const [path, query = ''] = route.split('?');
  return { parts: path.split('/').filter(Boolean), query: new URLSearchParams(query) };
}
export function withQuery(path: string, params: Record<string, string | undefined>) {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
  return q ? `${path}?${q}` : path;
}
