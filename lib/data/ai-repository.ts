import type { WorkspaceScope } from '../domain/tenancy';
import type { Agent, Automation, Connection, AIWorkspace } from '../domain/ai';

/** Future async boundary. Not a fake Supabase implementation; no network calls yet.
 * Implement with authenticated server endpoints, then hydrate the UI cache.
 * The server must verify membership independently of the submitted scope.
 */
export interface AIRepository {
  load(scope: WorkspaceScope): Promise<AIWorkspace>;
  saveAgent(scope: WorkspaceScope, agent: Agent): Promise<Agent>;
  deleteAgent(scope: WorkspaceScope, id: string): Promise<void>;
  saveAutomation(scope: WorkspaceScope, automation: Automation): Promise<Automation>;
  deleteAutomation(scope: WorkspaceScope, id: string): Promise<void>;
  listConnections(scope: WorkspaceScope): Promise<Connection[]>;
  disconnect(scope: WorkspaceScope, connectionId: string): Promise<void>;
  enqueueRun(scope: WorkspaceScope, request: { agentId: string; automationId?: string; input: string; idempotencyKey: string }): Promise<{ runId: string; status: 'queued' }>;
}

// Token provisioning is intentionally absent from the browser repository.
// Implement a dedicated authenticated, authorized server endpoint at migration time.
