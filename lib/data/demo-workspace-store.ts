import { scopeKey, type WorkspaceScope } from '../domain/tenancy';

/** Per-provider in-memory cache. This is NOT an authorization or persistence layer. */
export class DemoWorkspaceStore<T> {
  private data = new Map<string, T>();
  private listeners = new Set<() => void>();
  constructor(private empty: () => T, seeds: { scope: WorkspaceScope; value: T }[] = []) {
    for (const seed of seeds) this.data.set(scopeKey(seed.scope), seed.value);
  }
  get(scope: WorkspaceScope): T {
    const key = scopeKey(scope);
    if (!this.data.has(key)) this.data.set(key, this.empty());
    return this.data.get(key)!;
  }
  update(scope: WorkspaceScope, mutate: (value: T) => T) {
    this.data.set(scopeKey(scope), mutate(this.get(scope)));
    for (const listener of this.listeners) listener();
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
}
