/** Product tenancy, independent of Sites, Supabase and the hosting provider. */
export type OrganizationRole = 'owner' | 'admin' | 'member' | 'guest';
export type WorkspaceRole = 'manager' | 'editor' | 'viewer';
export type Organization = { id: string; name: string; kind: 'agency' | 'business' };
export type Workspace = { id: string; organizationId: string; name: string; kind: 'internal' | 'client'; clientName?: string };
export type WorkspaceScope = { organizationId: string; workspaceId: string };
export type ScopedRecord = WorkspaceScope & { id: string; createdAt: string; updatedAt: string };

// Fixed demo identities. Display names must never serve as database keys.
export const demoOrganization: Organization = { id: '10000000-0000-4000-8000-000000000001', name: 'Softema', kind: 'agency' };
export const demoWorkspaces: Workspace[] = [
  { id: '20000000-0000-4000-8000-000000000001', organizationId: demoOrganization.id, name: 'Softema Creative', kind: 'internal' },
  { id: '20000000-0000-4000-8000-000000000002', organizationId: demoOrganization.id, name: '4legs.cz', kind: 'client', clientName: '4legs.cz' },
];
export function scopeKey(scope: WorkspaceScope) {
  if (!scope.organizationId || !scope.workspaceId) throw new Error('Chybí organizace nebo pracovní prostor.');
  return `${scope.organizationId}:${scope.workspaceId}`;
}
export const demoWorkspace = (name: string) => demoWorkspaces.find(w => w.name === name) || demoWorkspaces[0];
