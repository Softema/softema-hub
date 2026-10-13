'use client';

import React, { createContext, useContext, useState, useSyncExternalStore } from 'react';
import { useHub } from './state';

import { demoWorkspaces } from '@/lib/domain/tenancy';
import { DemoWorkspaceStore } from '@/lib/data/demo-workspace-store';
import type { Agent, Automation, Provider, AIWorkspace } from '@/lib/domain/ai';
export type { Agent, Automation, Connection, Provider, Run } from '@/lib/domain/ai';

const initial: AIWorkspace = {
  connections: [{ id: 'openai-demo', name: 'Marketingový tým', provider: 'OpenAI' }, { id: 'anthropic-demo', name: 'Analýzy a reporting', provider: 'Anthropic' }],
  agents: [
    { id: 'copywriter', name: 'AI copywriter', description: 'Návrhy newsletterů, předmětů e-mailů a příspěvků.', connectionId: 'openai-demo', model: 'GPT · ukázka', kind: 'copy', instructions: 'Jsi copywriter týmu Softema. Piš česky, stručně a přirozeně. Navrhni předmět e-mailu, krátký text a jednu výzvu k akci. Neuváděj neověřená tvrzení. Výstup vždy připrav ke kontrole člověkem.' },
    { id: 'analyst', name: 'Marketingový analytik', description: 'Podklady pro pravidelné vyhodnocení kampaní.', connectionId: 'anthropic-demo', model: 'Claude · ukázka', kind: 'analysis', instructions: 'Pomáháš vyhodnocovat marketingové kampaně. Vycházej pouze z dodaných dat. Odděl zjištění od návrhů, označ chybějící podklady a zakonči výstup třemi doporučenými kroky.' },
    { id: 'assistant', name: 'Asistent pro nové poptávky', description: 'Návrh odpovědi a podkladů pro obchodní tým.', connectionId: 'openai-demo', model: 'GPT · ukázka', kind: 'custom', instructions: 'Z poptávky připrav stručné shrnutí, seznam chybějících informací a návrh odpovědi. Neslibuj ceny ani termíny. Odpověď neposílej, připrav ji pouze jako návrh.' },
  ],
  automations: [
    { id: 'newsletter', name: 'Pondělní newsletter', agentId: 'copywriter', trigger: 'weekly', time: '09:00', input: 'Připrav návrh newsletteru o chytrém e-mailingu. Cílová skupina: majitelé malých firem. Cíl: pozvánka na konzultaci.', enabled: true },
    { id: 'report', name: 'Týdenní marketingový souhrn', agentId: 'analyst', trigger: 'weekly', time: '08:00', input: 'Ukázková data: 2 486 příjemců, otevření 42,8 %, prokliky 6,4 %. Připrav osnovu reportu a otázky pro další vyhodnocení.', enabled: false },
  ],
  runs: [],
};
const empty = (): AIWorkspace => ({ agents: [], connections: [], automations: [], runs: [] });
type AIContextValue = AIWorkspace & { update: (fn: (data: AIWorkspace) => AIWorkspace) => void };
const AIContext = createContext<AIContextValue>(null!);
export function AIProvider({ children }: { children: React.ReactNode }) {
  const { scope } = useHub();
  const [store] = useState(() => new DemoWorkspaceStore<AIWorkspace>(empty, [{ scope: { organizationId: demoWorkspaces[0].organizationId, workspaceId: demoWorkspaces[0].id }, value: initial }]));
  const data = useSyncExternalStore(store.subscribe, () => store.get(scope), () => store.get(scope));
  const update = (fn: (data: AIWorkspace) => AIWorkspace) => store.update(scope, fn);
  return <AIContext.Provider value={{ ...data, update }}>{children}</AIContext.Provider>;
}
export const useAI = () => useContext(AIContext);
export const newId = () => crypto.randomUUID();
export const triggerLabel = (a: Automation) => a.trigger === 'daily' ? `Denně v ${a.time} · Praha` : a.trigger === 'weekly' ? `Pondělí v ${a.time} · Praha` : a.trigger === 'webhook' ? 'Příchozí webhook' : 'Ruční spuštění';
export const providerModel = (p?: Provider) => p === 'Anthropic' ? 'Claude · ukázka' : p === 'Google' ? 'Gemini · ukázka' : 'GPT · ukázka';
export function exampleOutput(agent: Agent, input: string) {
  const brief = input.trim().slice(0, 500);
  const body = agent.kind === 'copy'
    ? 'Předmět: Dejte svému marketingu jasný plán\n\nDobrý den,\npřipravili jsme inspiraci pro váš další marketingový krok. Vyberte si jeden cíl, oslovte správné publikum a sledujte výsledek.\n\nVýzva k akci: Domluvit konzultaci'
    : agent.kind === 'analysis'
      ? 'Osnova reportu\n1. Cíl kampaně a dodané výsledky\n2. Srovnání s předchozím obdobím — doplnit podklady\n3. Návrhy na testování další kampaně\n\nKe kontrole: období, zdroj dat a počet konverzí.'
      : 'Osnova výstupu\n1. Shrnutí zadání\n2. Chybějící informace a otázky k doplnění\n3. Návrh dalšího kroku ke schválení';
  return `UKÁZKOVÝ VÝSTUP · pevná šablona, nikoli odpověď AI\n\nZadání: ${brief}\n\n${body}\n\nV ostrém provozu bude model zpracovávat vaše zadání podle uložených pokynů agenta.`;
}
