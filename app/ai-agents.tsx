'use client';

import React, { useState } from 'react';
import { Bot, Plus, KeyRound, Workflow, Play, Pencil, Trash2, FileText, Clock3, Plug, History, Check, Copy, FlaskConical, ShieldCheck } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Btn, Badge, PageHead, Modal, Pick, Field, IconBtn, SearchInput } from './ui';
import { useHub } from './state';
import { useAI, Agent, Automation, Connection, Provider, Run, newId, triggerLabel, providerModel, exampleOutput } from './ai-state';
import { normalize } from './data';
import './ai-agents.css';

const sections = [['agenti', 'Moji agenti', Bot], ['automatizace', 'Automatizace', Workflow], ['pripojeni', 'Připojení modelů', KeyRound], ['historie', 'Historie běhů', History]] as const;
const blankAgent = (): Agent => ({ id: '', name: '', description: '', connectionId: '', model: '', instructions: '', kind: 'custom' });
const blankAutomation = (): Automation => ({ id: '', name: '', agentId: '', trigger: 'manual', time: '09:00', input: '', enabled: false });

function DemoNote() {
  return <div className="ai-demo-note"><FlaskConical size={18} /><span><strong>Ukázkový režim.</strong> AI se nevolá, plány neběží na pozadí a změny se po obnovení stránky smažou.</span></div>;
}
function Blank({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return <div className="ai-empty"><Bot size={30} /><h2>{title}</h2><p>{text}</p>{children}</div>;
}
function AgentEditor({ initial, close }: { initial: Agent; close: () => void }) {
  const { connections, update } = useAI();
  const [form, setForm] = useState<Agent>(initial);
  const [error, setError] = useState('');
  const field = <K extends keyof Agent>(key: K, value: Agent[K]) => setForm(s => ({ ...s, [key]: value }));
  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!connections.some(c => c.id === form.connectionId)) { setError('Vyberte připojení modelu. Pokud žádné nemáte, nejprve ho přidejte v záložce Připojení modelů.'); return; }
    if (!form.name.trim() || !form.instructions.trim() || !form.model.trim()) { setError('Vyplňte název, model a pokyny agenta.'); return; }
    const agent = { ...form, id: form.id || newId(), name: form.name.trim(), model: form.model.trim(), instructions: form.instructions.trim(), description: form.description.trim() };
    update(s => ({ ...s, agents: form.id ? s.agents.map(a => a.id === form.id ? agent : a) : [...s.agents, agent] }));
    toast.success(form.id ? 'Změny agenta jsou uložené v ukázce.' : 'Agent je připravený k vyzkoušení.'); close();
  }
  return <Modal open onClose={close} title={initial.id ? 'Upravit agenta' : 'Nový AI agent'} desc="Dejte agentovi úkol, model a jasné pokyny." wide><form className="ai-form" onSubmit={save}>
    <Field label="Název agenta"><Input autoFocus required maxLength={70} value={form.name} onChange={e => field('name', e.target.value)} placeholder="Např. Asistent pro zákaznickou péči" /></Field>
    <Field label="Krátký popis"><Input maxLength={180} value={form.description} onChange={e => field('description', e.target.value)} placeholder="S čím vám agent pomůže?" /></Field>
    <div className="ai-form-grid"><Field label="Připojení modelu"><Pick label="Připojení agenta" value={form.connectionId || 'none'} onChange={v => { const c = connections.find(c => c.id === v); setForm(s => ({ ...s, connectionId: v === 'none' ? '' : v, model: providerModel(c?.provider) })); }} options={[["none", 'Vybrat připojení'], ...connections.map(c => [c.id, `${c.provider} · ${c.name}`] as [string, string])]} /></Field><Field label="Model" hint="V ukázce se zvolený model nevolá."><Input required maxLength={100} value={form.model} onChange={e => field('model', e.target.value)} placeholder="Název nebo ID modelu" /></Field></div>
    <Field label="Pokyny pro agenta" hint="Popište roli, tón komunikace, požadovaný výstup a omezení."><Textarea required maxLength={5000} rows={6} value={form.instructions} onChange={e => field('instructions', e.target.value)} placeholder="Jsi asistent našeho týmu. Tvým úkolem je…" /></Field>
    <Field label="Šablona ukázkového výstupu"><Pick label="Šablona výstupu" value={form.kind} onChange={v => field('kind', v as Agent['kind'])} options={[["custom", 'Vlastní asistent'], ["copy", 'Návrh marketingového textu'], ["analysis", 'Osnova reportu']]} /></Field>
    {error && <p className="ai-error" role="alert">{error}</p>}<div className="ai-form-footer"><Btn type="button" onClick={close}>Zrušit</Btn><Btn type="submit" primary><Check size={16} />Uložit agenta</Btn></div>
  </form></Modal>;
}

function ConnectionEditor({ close }: { close: () => void }) {
  const { update } = useAI(); const [provider, setProvider] = useState<Provider>('OpenAI'); const [name, setName] = useState('');
  function save(e: React.FormEvent) { e.preventDefault(); if (!name.trim()) return; const connection: Connection = { id: newId(), provider, name: name.trim() }; update(s => ({ ...s, connections: [...s.connections, connection] })); toast.success('Ukázkové připojení bylo přidáno. Žádný API klíč se neukládá.'); close(); }
  return <Modal open onClose={close} title="Připojení AI modelu" desc="Vyberte poskytovatele a pojmenujte připojení pro svůj tým."><form className="ai-form" onSubmit={save}>
    <Field label="Poskytovatel"><Pick label="Poskytovatel AI" value={provider} onChange={v => setProvider(v as Provider)} options={['OpenAI', 'Anthropic', 'Google']} /></Field>
    <Field label="Název připojení"><Input autoFocus required maxLength={60} value={name} onChange={e => setName(e.target.value)} placeholder="Např. Marketingový tým" /></Field>
    <Field label="API token" hint="Ukázková hodnota. Skutečné klíče sem nelze vložit."><Input type="password" value="demo-no-real-secret" disabled autoComplete="off" /></Field>
    <div className="ai-security"><ShieldCheck size={21} /><div><strong>Skutečné klíče až v ostrém provozu</strong><p>Ten bude vyžadovat přihlášení a bezpečné uložení na serveru. Toto připojení slouží jen k vyzkoušení nastavení agentů.</p></div></div>
    <div className="ai-form-footer"><Btn type="button" onClick={close}>Zrušit</Btn><Btn primary type="submit">Přidat ukázkové připojení</Btn></div>
  </form></Modal>;
}

function AutomationEditor({ initial, close }: { initial: Automation; close: () => void }) {
  const { agents, connections, update } = useAI(); const [form, setForm] = useState(initial); const [error, setError] = useState('');
  const field = <K extends keyof Automation>(key: K, value: Automation[K]) => setForm(s => ({ ...s, [key]: value }));
  const selected = agents.find(a => a.id === form.agentId); const connection = connections.find(c => c.id === selected?.connectionId);
  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !connection) { setError('Vyberte agenta s dostupným připojením modelu.'); return; }
    if (!form.name.trim() || !form.input.trim()) { setError('Vyplňte název a zadání automatizace.'); return; }
    if ((form.trigger === 'daily' || form.trigger === 'weekly') && !/^([01]\d|2[0-3]):[0-5]\d$/.test(form.time)) { setError('Vyberte platný čas spuštění.'); return; }
    const automation = { ...form, id: form.id || newId(), name: form.name.trim(), input: form.input.trim() };
    update(s => ({ ...s, automations: form.id ? s.automations.map(a => a.id === form.id ? automation : a) : [...s.automations, automation] }));
    toast.success('Scénář je uložený v ukázce. Automatické spouštění není zapojené.'); close();
  }
  return <Modal open onClose={close} title={initial.id ? 'Upravit automatizaci' : 'Vlastní AI automatizace'} desc="Sestavte scénář od spouštěče po výstup ke kontrole." wide><form className="ai-form" onSubmit={save}>
    <Field label="Název automatizace"><Input autoFocus required maxLength={80} value={form.name} onChange={e => field('name', e.target.value)} placeholder="Např. Ranní přehled nových poptávek" /></Field>
    <div className="ai-builder-step"><span className="ai-step-number">1</span><div><h3>Kdy se má spustit</h3><div className="ai-form-grid"><Field label="Spouštěč"><Pick label="Spouštěč automatizace" value={form.trigger} onChange={v => field('trigger', v as Automation['trigger'])} options={[["manual", 'Ručně'], ["daily", 'Každý den'], ["weekly", 'Každé pondělí'], ["webhook", 'Příchozí webhook']]} /></Field>{['daily', 'weekly'].includes(form.trigger) && <Field label="Čas · Europe/Prague"><Input required type="time" value={form.time} onChange={e => field('time', e.target.value)} /></Field>}</div>{form.trigger === 'webhook' && <p className="ai-helper">V ukázce se webhook nevytváří. Příchozí událost můžete otestovat ručním spuštěním.</p>}</div></div>
    <div className="ai-builder-step"><span className="ai-step-number">2</span><div><h3>Co má agent udělat</h3><Field label="AI agent"><Pick label="Agent automatizace" value={form.agentId || 'none'} onChange={v => field('agentId', v === 'none' ? '' : v)} options={[["none", 'Vybrat agenta'], ...agents.map(a => [a.id, a.name] as [string, string])]} /></Field><Field label="Zadání a vstupní data" hint="Vložte vlastní ukázkové zadání. Přístup k živým datům CRM zatím není zapojený."><Textarea required rows={5} maxLength={6000} value={form.input} onChange={e => field('input', e.target.value)} placeholder="Co má agent zpracovat a jak má vypadat výsledek?" /></Field></div></div>
    <div className="ai-builder-step"><span className="ai-step-number">3</span><div><h3>Výstup ke kontrole</h3><p className="ai-helper">Návrh se zobrazí v historii běhů. Nic se automaticky neodesílá ani nezveřejňuje.</p><label className="ai-switch-row"><span>Připravit jako aktivní scénář <small>Pouze stav v ukázce; plánovač není spuštěný.</small></span><Switch checked={form.enabled} onCheckedChange={v => field('enabled', v)} /></label></div></div>
    {error && <p className="ai-error" role="alert">{error}</p>}<div className="ai-form-footer"><Btn type="button" onClick={close}>Zrušit</Btn><Btn primary type="submit"><Check size={16} />Uložit scénář</Btn></div>
  </form></Modal>;
}

function RunDetail({ run }: { run: Run }) {
  const [copied, setCopied] = useState(false);
  async function copy() { try { await navigator.clipboard.writeText(run.output); setCopied(true); toast.success('Ukázkový výstup zkopírován.'); } catch { toast.error('Kopírování není dostupné. Označte text a zkopírujte ho ručně.'); } }
  return <div className="ai-run-detail"><div className="ai-run-success"><Check size={20} /><div><strong>Ukázka dokončena</strong><span>0 API požadavků · bez spotřeby tokenů</span></div><Badge tone="gray">Simulace</Badge></div>
    <dl className="ai-run-meta"><div><dt>Agent</dt><dd>{run.agentName}</dd></div><div><dt>Model</dt><dd>{run.provider} · {run.model}</dd></div></dl>
    <div className="ai-result-heading"><h3>Výstup ke kontrole</h3><Btn onClick={copy}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Zkopírováno' : 'Kopírovat'}</Btn></div><pre className="ai-output">{run.output}</pre>
    <details className="ai-input-details"><summary>Zadání a pokyny při spuštění</summary><h4>Zadání</h4><p>{run.input}</p><h4>Pokyny agenta</h4><p>{run.instructions}</p></details>
  </div>;
}
function RunDialog({ agent, automation, close }: { agent: Agent; automation?: Automation; close: () => void }) {
  const { connections, update } = useAI(); const [input, setInput] = useState(automation?.input || 'Připrav návrh pro náš marketingový tým. Cílová skupina: malé firmy.'); const [result, setResult] = useState<Run | null>(null);
  const connection = connections.find(c => c.id === agent.connectionId);
  function run(e: React.FormEvent) {
    e.preventDefault(); if (!input.trim() || !connection) return;
    const record: Run = { id: newId(), title: automation?.name || agent.name, agentName: agent.name, provider: connection.provider, model: agent.model, instructions: agent.instructions, input: input.trim(), output: exampleOutput(agent, input), at: new Date().toISOString() };
    update(s => ({ ...s, runs: [record, ...s.runs] })); setResult(record);
  }
  return <Modal open onClose={close} title={result ? 'Výsledek ukázkového běhu' : `Vyzkoušet: ${automation?.name || agent.name}`} desc="Simulace používá pevnou šablonu. Nejde o odpověď skutečného AI modelu." wide>{result ? <><RunDetail run={result} /><div className="ai-form-footer"><Btn onClick={() => setResult(null)}>Upravit zadání</Btn><Btn primary onClick={close}>Hotovo</Btn></div></> : <form className="ai-form" onSubmit={run}><div className="ai-run-agent"><span className="ai-icon"><Bot size={22} /></span><div><strong>{agent.name}</strong><small>{connection?.provider || 'Chybí připojení'} · {agent.model}</small></div></div><Field label="Testovací zadání"><Textarea autoFocus required rows={6} maxLength={6000} value={input} onChange={e => setInput(e.target.value)} /></Field>{!connection && <p className="ai-error" role="alert">Nejdřív přiřaďte agentovi dostupné připojení modelu.</p>}<div className="ai-form-footer"><Btn type="button" onClick={close}>Zrušit</Btn><Btn primary type="submit" disabled={!connection || !input.trim()}><Play size={16} />Spustit ukázku</Btn></div></form>}</Modal>;
}

export default function AIAgents() {
  const { route, go } = useHub(); const { agents, connections, automations, runs, update } = useAI();
  const requested = route.split('/')[1]; const tab = sections.some(s => s[0] === requested) ? requested : 'agenti';
  const [query, setQuery] = useState(''); const [editingAgent, setEditingAgent] = useState<Agent | null>(null); const [editingAutomation, setEditingAutomation] = useState<Automation | null>(null); const [connecting, setConnecting] = useState(false);
  const [running, setRunning] = useState<{ agent: Agent; automation?: Automation } | null>(null); const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; description: string; action: () => void } | null>(null);
  const changeTab = (value: string) => { setQuery(''); go(`ai-agenti/${value}`); };
  const available = (agent?: Agent) => !!agent && connections.some(c => c.id === agent.connectionId);
  function createAgent() { const c = connections[0]; setEditingAgent({ ...blankAgent(), connectionId: c?.id || '', model: providerModel(c?.provider) }); }
  function createAutomation(agentId?: string) { setEditingAutomation({ ...blankAutomation(), agentId: agentId || agents.find(available)?.id || '' }); }
  function removeAgent(agent: Agent) { setConfirm({ title: `Smazat agenta „${agent.name}“?`, description: 'Navázané automatizace se pozastaví. Historie ukázkových běhů zůstane zachovaná.', action: () => update(s => ({ ...s, agents: s.agents.filter(a => a.id !== agent.id), automations: s.automations.map(a => a.agentId === agent.id ? { ...a, enabled: false } : a) })) }); }
  function removeConnection(c: Connection) { setConfirm({ title: `Odpojit „${c.name}“?`, description: 'Agenti s tímto připojením nepůjdou spustit, dokud jim nepřiřadíte jiné. Jejich automatizace se pozastaví.', action: () => update(s => { const affected = new Set(s.agents.filter(a => a.connectionId === c.id).map(a => a.id)); return { ...s, connections: s.connections.filter(x => x.id !== c.id), automations: s.automations.map(a => affected.has(a.agentId) ? { ...a, enabled: false } : a) }; }) }); }
  const matches = (text: string) => normalize(text).includes(normalize(query));
  const visibleAgents = agents.filter(a => matches(`${a.name} ${a.description}`)); const visibleAutomations = automations.filter(a => matches(a.name)); const visibleConnections = connections.filter(c => matches(`${c.name} ${c.provider}`)); const visibleRuns = runs.filter(r => matches(`${r.title} ${r.agentName}`));
  return <div className="page ai-page"><PageHead title="AI agenti" desc="Vlastní asistenti a automatizace pro váš tým."><Btn onClick={() => setConnecting(true)}><KeyRound size={16} />Připojit model</Btn><Btn primary onClick={createAgent}><Plus size={17} />Nový agent</Btn></PageHead><DemoNote />
    <div className="ai-overview"><div><Bot /><span>Moji agenti<strong>{agents.length}</strong></span></div><div><Workflow /><span>Aktivní scénáře v ukázce<strong>{automations.filter(a => a.enabled && available(agents.find(g => g.id === a.agentId))).length}</strong></span></div><div><Plug /><span>Ukázková připojení<strong>{connections.length}</strong></span></div><div><History /><span>Vyzkoušené běhy<strong>{runs.length}</strong></span></div></div>
    <Tabs value={tab} onValueChange={changeTab} className="ai-tabs"><div className="ai-tabs-scroll"><TabsList variant="line" className="ai-tab-list">{sections.map(([id, label, Icon]) => <TabsTrigger key={id} value={id}><Icon size={16} />{label}</TabsTrigger>)}</TabsList></div>
      <div className="ai-toolbar"><SearchInput value={query} onChange={setQuery} placeholder={tab === 'historie' ? 'Hledat v historii…' : tab === 'pripojeni' ? 'Hledat připojení…' : tab === 'automatizace' ? 'Hledat automatizaci…' : 'Hledat agenta…'} />{tab === 'automatizace' ? <Btn primary onClick={() => createAutomation()}><Plus size={16} />Nová automatizace</Btn> : <span className="ai-toolbar-note">{tab === 'agenti' ? 'Váš tým digitálních pomocníků' : tab === 'pripojeni' ? 'Připojení tohoto pracovního prostoru' : 'Pouze ukázkové běhy této relace'}</span>}</div>
      <TabsContent value="agenti">{!visibleAgents.length ? <Blank title={query ? 'Žádný agent neodpovídá hledání' : 'Váš první AI agent'} text={query ? 'Zkuste jiný název nebo popis.' : 'Přidejte připojení modelu a vytvořte asistenta pro svůj tým.'}>{!query && <Btn primary onClick={connections.length ? createAgent : () => setConnecting(true)}><Plus size={16} />{connections.length ? 'Vytvořit agenta' : 'Přidat připojení'}</Btn>}</Blank> : <div className="ai-agent-grid">{visibleAgents.map((a) => { const connection = connections.find(c => c.id === a.connectionId); return <article className="ai-agent-card" key={a.id}><div className="ai-card-top"><span className={`ai-icon ${a.kind}`}><Bot size={24} /></span><Badge tone={connection ? 'gray' : 'orange'}>{connection ? 'Připraven k ukázce' : 'Chybí připojení'}</Badge></div><h2>{a.name}</h2><p>{a.description || 'Vlastní asistent s vašimi pokyny.'}</p><div className="ai-model-label"><span className="ai-provider-mark">{connection?.provider[0] || '?'}</span><div>{connection?.provider || 'Model není připojen'}<small>{a.model}</small></div></div><div className="ai-card-meta"><Workflow size={15} />{automations.filter(x => x.agentId === a.id).length} navázaných scénářů</div><footer><Btn onClick={() => setRunning({ agent: a })} disabled={!connection}><Play size={15} />Vyzkoušet</Btn><IconBtn label={`Upravit agenta ${a.name}`} onClick={() => setEditingAgent(a)}><Pencil size={16} /></IconBtn><IconBtn label={`Smazat agenta ${a.name}`} onClick={() => removeAgent(a)}><Trash2 size={16} /></IconBtn></footer></article>; })}</div>}
        <div className="ai-next-step"><span className="ai-icon"><Workflow size={24} /></span><div><h2>Nechte agenta pracovat podle scénáře</h2><p>Vyberte spouštěč, přidejte zadání a vyzkoušejte výstup.</p></div><Btn onClick={() => { changeTab('automatizace'); createAutomation(); }}>Sestavit automatizaci</Btn></div>
      </TabsContent>
      <TabsContent value="automatizace"><div className="ai-automation-list">{visibleAutomations.map(a => { const agent = agents.find(g => g.id === a.agentId); const ready = available(agent); return <article className="ai-automation-card" key={a.id}><div className="ai-automation-top"><span className="ai-icon"><Workflow size={22} /></span><div><h2>{a.name}</h2><p>{triggerLabel(a)}</p></div><Badge tone={!ready ? 'orange' : a.enabled ? 'green' : 'gray'}>{!ready ? 'Vyžaduje nastavení' : a.enabled ? 'Aktivní · demo' : 'Pozastaveno'}</Badge><Switch aria-label={`Aktivovat scénář ${a.name} v ukázce`} checked={a.enabled && ready} disabled={!ready} onCheckedChange={enabled => { update(s => ({ ...s, automations: s.automations.map(x => x.id === a.id ? { ...x, enabled } : x) })); toast.message(enabled ? 'Scénář aktivní v ukázce. Na pozadí se nespouští.' : 'Scénář pozastaven.'); }} /></div><div className="ai-pipeline"><div><Clock3 size={17} /><span><small>SPUŠTĚČ</small>{triggerLabel(a)}</span></div><div><Bot size={17} /><span><small>AI AGENT</small>{agent?.name || 'Vyberte agenta'}</span></div><div><FileText size={17} /><span><small>VÝSTUP</small>Návrh ke kontrole</span></div></div><footer><p>{a.input}</p><div><Btn disabled={!ready} onClick={() => agent && setRunning({ agent, automation: a })}><Play size={15} />Spustit ukázku</Btn><IconBtn label={`Upravit automatizaci ${a.name}`} onClick={() => setEditingAutomation(a)}><Pencil size={16} /></IconBtn><IconBtn label={`Smazat automatizaci ${a.name}`} onClick={() => setConfirm({ title: `Smazat scénář „${a.name}“?`, description: 'Smaže se nastavení tohoto ukázkového scénáře. Historie běhů zůstane zachovaná.', action: () => update(s => ({ ...s, automations: s.automations.filter(x => x.id !== a.id) })) })}><Trash2 size={16} /></IconBtn></div></footer></article>; })}</div>{!visibleAutomations.length && <Blank title={query ? 'Žádný odpovídající scénář' : 'První automatizace začíná úkolem'} text={query ? 'Zkuste hledat jiný název.' : 'Nastavte, co má agent zpracovat a kdy se má scénář spouštět.'}>{!query && <Btn primary onClick={() => createAutomation()}>Vytvořit automatizaci</Btn>}</Blank>}</TabsContent>
      <TabsContent value="pripojeni"><div className="ai-connections-grid">{visibleConnections.map(c => <article key={c.id} className="ai-connection-card"><div className="ai-card-top"><span className="ai-provider-mark large">{c.provider[0]}</span><Badge tone="gray">Ukázkové připojení</Badge></div><h2>{c.provider}</h2><p>{c.name}</p><div className="ai-key-preview"><KeyRound size={15} /><code>demo-••••••••</code><span>Neobsahuje klíč</span></div><footer><span>{agents.filter(a => a.connectionId === c.id).length} přiřazených agentů</span><Btn onClick={() => removeConnection(c)}>Odpojit</Btn></footer></article>)}</div>{!visibleConnections.length && <Blank title={query ? 'Žádné odpovídající připojení' : 'Připojte model pro své agenty'} text={query ? 'Zkuste jiný název nebo poskytovatele.' : 'Vyzkoušejte připojení OpenAI, Anthropic nebo Google.'}>{!query && <Btn primary onClick={() => setConnecting(true)}>Přidat připojení</Btn>}</Blank>}<div className="ai-security ai-security-wide"><ShieldCheck size={24} /><div><h2>API token patří do bezpečného úložiště</h2><p>V této ukázce nejsou žádné skutečné klíče. Pro ostré spuštění bude potřeba serverové uložení klíčů, přístup podle uživatelských účtů a běh automatizací na pozadí.</p></div></div></TabsContent>
      <TabsContent value="historie">{!visibleRuns.length ? <Blank title={query ? 'Žádný odpovídající běh' : 'Tady uvidíte práci svých agentů'} text={query ? 'Zkuste jiný název agenta nebo scénáře.' : 'Spusťte první ukázku. U každého běhu pak najdete zadání, použitý model i výstup.'}>{!query && <Btn onClick={() => changeTab('agenti')}><Bot size={16} />Vybrat agenta</Btn>}</Blank> : <div className="ai-history">{visibleRuns.map(r => <button className="ai-history-row" key={r.id} onClick={() => setSelectedRun(r)}><span className="ai-run-check"><Check size={18} /></span><span><strong>{r.title}</strong><small>{r.agentName} · {r.provider}</small></span><Badge tone="gray">Simulace dokončena</Badge><time dateTime={r.at}>{new Date(r.at).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}</time><span className="ai-history-open">Zobrazit výstup</span></button>)}</div>}</TabsContent>
    </Tabs>
    {editingAgent && <AgentEditor initial={editingAgent} close={() => setEditingAgent(null)} />}{editingAutomation && <AutomationEditor initial={editingAutomation} close={() => setEditingAutomation(null)} />}{connecting && <ConnectionEditor close={() => setConnecting(false)} />}{running && <RunDialog {...running} close={() => setRunning(null)} />}{selectedRun && <Modal open onClose={() => setSelectedRun(null)} title={selectedRun.title} desc="Záznam ukázkového běhu v tomto pracovním prostoru." wide><RunDetail run={selectedRun} /></Modal>}
    <AlertDialog open={!!confirm} onOpenChange={open => !open && setConfirm(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{confirm?.title}</AlertDialogTitle><AlertDialogDescription>{confirm?.description}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Zrušit</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => { confirm?.action(); setConfirm(null); toast.success('Změna byla provedena v ukázce.'); }}>Potvrdit</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
