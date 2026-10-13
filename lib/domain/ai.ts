export type Provider = 'OpenAI' | 'Anthropic' | 'Google';
export type AgentKind = 'copy' | 'analysis' | 'custom';
export type Agent = { id: string; name: string; description: string; connectionId: string; model: string; instructions: string; kind: AgentKind };
/** Public metadata only: credentials belong exclusively to a server-side vault. */
export type Connection = { id: string; name: string; provider: Provider };
export type Automation = { id: string; name: string; agentId: string; trigger: 'manual' | 'daily' | 'weekly' | 'webhook'; time: string; input: string; enabled: boolean };
export type Run = { id: string; title: string; agentName: string; provider: string; model: string; instructions: string; input: string; output: string; at: string };
export type AIWorkspace = { agents: Agent[]; connections: Connection[]; automations: Automation[]; runs: Run[] };
