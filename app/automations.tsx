'use client';
/* Automations: workflow list and the React Flow builder (node settings, branching, validation, save,
   activation and a simulated run step). Execution itself is local simulation; BullMQ comes with the backend. */
import React, { createContext, useContext, useMemo, useState } from 'react';
import '@xyflow/react/dist/style.css';
import { BaseEdge, Background, Controls, EdgeLabelRenderer, Handle, Position, ReactFlow, ReactFlowProvider, addEdge, getSmoothStepPath, useEdgesState, useNodesState, type Connection, type Edge, type EdgeProps, type Node, type NodeProps } from '@xyflow/react';
import { useTheme } from 'next-themes';
import { AlertTriangle, ArrowLeft, Bell, CheckCircle2, Clock, Copy, Flag, GitBranch, Globe, ListChecks, Mail, MoreHorizontal, Pause, Play, Plus, Save, StepForward, Tag, Tags, Trash2, UserCog, Workflow as WorkflowIcon, X, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { fmt, fmtDate, newId, plural, relTime } from '@/lib/hub/format';
import { CONDITIONS, KIND_LABEL, TRIGGERS, advanceWorkflow, summary, validateWorkflow, type TriggerEvent } from '@/lib/hub/flow';
import type { FlowEdge, FlowNode, FlowNodeData, FlowNodeKind, Workflow } from '@/lib/hub/types';
import { useHub, useUnsavedGuard } from './state';
import { Avatar, Badge, Btn, Field, IconBtn, Metric, Modal, PageHead, Pick } from './ui';
import { FormError, Notice, OptionCombobox, Section, useConfirm, useRoute } from './kit';

const ICON: Record<FlowNodeKind, typeof Mail> = { trigger: Zap, email: Mail, wait: Clock, condition: GitBranch, tag: Tag, untag: Tags, stage: UserCog, campaign: ListChecks, webhook: Globe, notify: Bell, end: Flag };
const STEP_KINDS: FlowNodeKind[] = ['email', 'wait', 'condition', 'tag', 'untag', 'stage', 'campaign', 'webhook', 'notify', 'end'];
const DEFAULTS: Record<FlowNodeKind, Record<string, string>> = { trigger: { event: 'contact_created' }, email: { subject: '' }, wait: { amount: '1', unit: 'dní' }, condition: { check: 'email_opened' }, tag: { tag: '' }, untag: { tag: '' }, stage: { stage: 'Zájemce' }, campaign: {}, webhook: { url: '', method: 'POST' }, notify: { to: '' }, end: {} };
const STEP_Y = 160;
const statusTone = (s: Workflow['status']) => (s === 'Aktivní' ? 'green' : s === 'Pozastaveno' ? 'orange' : 'gray');

type StepData = FlowNodeData & Record<string, unknown>;
type StepNode = Node<StepData, 'step'>;
type PlusEdge = Edge<Record<string, unknown>, 'plus'>;
const toRf = (f: Pick<Workflow, 'nodes' | 'edges'>) => ({
  nodes: f.nodes.map(n => ({ id: n.id, type: 'step' as const, position: n.position, data: { ...n.data } as StepData, deletable: false })),
  edges: f.edges.map(e => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null, type: 'plus' as const, deletable: false })),
});
const fromRf = (nodes: StepNode[], edges: PlusEdge[]): { nodes: FlowNode[]; edges: FlowEdge[] } => ({
  nodes: nodes.map(n => ({ id: n.id, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) }, data: { kind: n.data.kind, title: n.data.title, config: { ...n.data.config } } })),
  edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target, sourceHandle: (e.sourceHandle as 'yes' | 'no' | null | undefined) ?? null })),
});

/* ---------- templates ---------- */
type Spec = [id: string, kind: FlowNodeKind, title: string, config: Record<string, string>][];
function fromSpec(nodes: Spec, edges: [string, string, ('yes' | 'no')?][]): Pick<Workflow, 'nodes' | 'edges'> {
  const pos: Record<string, { x: number; y: number }> = { [nodes[0][0]]: { x: 0, y: 0 } };
  edges.forEach(([s, t, h]) => { pos[t] = { x: (pos[s]?.x ?? 0) + (h === 'yes' ? -170 : h === 'no' ? 170 : 0), y: (pos[s]?.y ?? 0) + STEP_Y }; });
  const ids = Object.fromEntries(nodes.map(([id]) => [id, newId('n')]));
  return {
    nodes: nodes.map(([id, kind, title, config]) => ({ id: ids[id], position: pos[id] ?? { x: 0, y: 0 }, data: { kind, title, config } })),
    edges: edges.map(([s, t, h]) => ({ id: newId('e'), source: ids[s], target: ids[t], sourceHandle: h ?? null })),
  };
}
const TEMPLATES: { id: string; name: string; desc: string; make: () => Pick<Workflow, 'nodes' | 'edges'> }[] = [
  { id: 'blank', name: 'Prázdný scénář', desc: 'Jen spouštěč, kroky přidáte sami.', make: () => fromSpec([['t', 'trigger', 'Nový kontakt', { event: 'contact_created' }]], []) },
  { id: 'welcome', name: 'Uvítací sekvence', desc: 'Přivítání, čekání a větvení podle otevření.', make: () => fromSpec([['t', 'trigger', 'Kontakt získá štítek', { event: 'tag_added', tag: 'Newsletter' }], ['m', 'email', 'Uvítací e-mail', { subject: 'Vítejte!' }], ['w', 'wait', 'Počkat 2 dny', { amount: '2', unit: 'dní' }], ['c', 'condition', 'Otevřel uvítací e-mail?', { check: 'email_opened' }], ['y', 'tag', 'Přidat štítek Aktivní', { tag: 'Aktivní' }], ['n', 'email', 'Připomenutí', { subject: 'Něco vám uteklo' }]], [['t', 'm'], ['m', 'w'], ['w', 'c'], ['c', 'y', 'yes'], ['c', 'n', 'no']]) },
  { id: 'cart', name: 'Opuštěný košík', desc: 'Připomínka a sleva, když nákup nedokončí.', make: () => fromSpec([['t', 'trigger', 'Webhook: opuštěný košík', { event: 'webhook', source: 'E-shop' }], ['w', 'wait', 'Počkat 1 hodinu', { amount: '1', unit: 'hodin' }], ['m', 'email', 'Připomínka košíku', { subject: 'Něco jste zapomněli' }], ['c', 'condition', 'Dokončil nákup?', { check: 'payment_succeeded' }], ['e', 'end', 'Konec', {}], ['s', 'email', 'Sleva 10 %', { subject: 'Sleva 10 % jen pro vás' }]], [['t', 'w'], ['w', 'm'], ['m', 'c'], ['c', 'e', 'yes'], ['c', 's', 'no']]) },
];

export default function Automations() {
  const { parts } = useRoute();
  return parts[1] ? <ReactFlowProvider key={parts[1]}><Builder id={parts[1]} /></ReactFlowProvider> : <WorkflowList />;
}

function useFlowActions() {
  const { workspaceId, mutate, patch, go } = useHub();
  const [confirmEl, confirm] = useConfirm();
  const activate = (f: Workflow) => {
    const issues = validateWorkflow(f.nodes, f.edges);
    if (issues.length) { toast.error('Scénář nelze aktivovat', { description: issues.slice(0, 3).map(i => i.text).join(' ') }); return false; }
    patch('workflows', f.id, x => ({ ...x, status: 'Aktivní', updatedAt: new Date().toISOString() }));
    toast.success('Scénář je aktivní.', { description: 'Nové události z CRM a dalších modulů do něj zařadí kontakty. Běh je simulovaný.' }); return true;
  };
  const pause = (f: Workflow) => { patch('workflows', f.id, x => ({ ...x, status: 'Pozastaveno', updatedAt: new Date().toISOString() })); toast.success('Scénář je pozastavený. Kontakty v běhu čekají.'); };
  const duplicate = (f: Workflow) => { const copy: Workflow = { ...f, id: newId('wf'), name: `${f.name} (kopie)`, status: 'Koncept', enrolled: [], completed: 0, updatedAt: new Date().toISOString() }; mutate(d => ({ ...d, workflows: [copy, ...d.workflows] })); toast.success('Kopie vznikla jako koncept.'); go('automatizace/' + copy.id); };
  const remove = (f: Workflow) => confirm({ title: `Smazat scénář ${f.name}?`, danger: true, confirm: 'Smazat scénář', desc: f.enrolled.length ? `${plural(f.enrolled.length, 'kontakt', 'kontakty', 'kontaktů')} v běhu scénář opustí.` : 'Scénář se nevratně smaže.', onConfirm: () => { mutate(d => ({ ...d, workflows: d.workflows.filter(x => !(x.workspaceId === workspaceId && x.id === f.id)) })); toast.success('Scénář byl smazán.'); go('automatizace'); } });
  return { confirmEl, activate, pause, duplicate, remove };
}

function WorkflowList() {
  const { w, go, workspaceId, mutate } = useHub();
  const actions = useFlowActions();
  const [creating, setCreating] = useState(false);
  const [now] = useState(() => Date.now());
  const create = (t: (typeof TEMPLATES)[number], name: string) => {
    const f: Workflow = { id: newId('wf'), workspaceId, name, description: t.desc, status: 'Koncept', enrolled: [], completed: 0, updatedAt: new Date().toISOString(), ...t.make() };
    mutate(d => ({ ...d, workflows: [f, ...d.workflows] })); toast.success('Scénář vznikl jako koncept.'); go('automatizace/' + f.id);
  };
  return (
    <div className="page">
      <PageHead title="Automatizace" desc="Scénáře reagují na události z CRM, e-mailingu, plateb, kurzů a webinářů. Běh je v prototypu simulovaný.">
        <Btn primary onClick={() => setCreating(true)}><Plus aria-hidden />Nový scénář</Btn>
      </PageHead>
      <div className="metric-grid">
        <Metric label="Aktivní scénáře" value={fmt(w.workflows.filter(f => f.status === 'Aktivní').length)} desc={`z ${w.workflows.length}`} />
        <Metric label="Kontakty v běhu" value={fmt(w.workflows.reduce((s, f) => s + f.enrolled.length, 0))} desc="napříč scénáři" />
        <Metric label="Dokončené běhy" value={fmt(w.workflows.reduce((s, f) => s + f.completed, 0))} desc="celkem" />
        <Metric label="Pozastavené" value={fmt(w.workflows.filter(f => f.status === 'Pozastaveno').length)} desc="čekají na aktivaci" />
      </div>
      {w.workflows.length ? (
        <section className="panel">
          <div className="table-scroll">
            <table className="hub-table data-table">
              <thead><tr><th>Scénář</th><th className="col-opt">Spouštěč</th><th>Stav</th><th className="num">V běhu</th><th className="num col-opt">Dokončeno</th><th className="col-opt">Upraveno</th><th aria-label="Akce" /></tr></thead>
              <tbody>
                {w.workflows.map(f => { const t = f.nodes.find(n => n.data.kind === 'trigger'); return (
                  <tr key={f.id} onClick={() => go('automatizace/' + f.id)}>
                    <td><div className="name-cell"><span className="mail-box"><WorkflowIcon size={15} aria-hidden /></span><button type="button">{f.name}<small>{f.description || plural(f.nodes.length, 'krok', 'kroky', 'kroků')}</small></button></div></td>
                    <td className="col-opt muted wrap">{t ? summary(t.data) : '—'}</td>
                    <td><Badge tone={statusTone(f.status)}>{f.status}</Badge></td>
                    <td className="num">{fmt(f.enrolled.length)}</td>
                    <td className="num col-opt">{fmt(f.completed)}</td>
                    <td className="col-opt muted">{relTime(f.updatedAt, now)}</td>
                    <td className="col-actions" onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><button type="button" className="icon-btn" aria-label={`Akce scénáře ${f.name}`}><MoreHorizontal aria-hidden /></button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {f.status === 'Aktivní' ? <DropdownMenuItem onSelect={() => actions.pause(f)}><Pause aria-hidden />Pozastavit</DropdownMenuItem> : <DropdownMenuItem onSelect={() => actions.activate(f)}><Play aria-hidden />Aktivovat</DropdownMenuItem>}
                          <DropdownMenuItem onSelect={() => actions.duplicate(f)}><Copy aria-hidden />Duplikovat</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => actions.remove(f)}><Trash2 aria-hidden />Smazat</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
        </section>
      ) : <section className="panel empty"><WorkflowIcon size={28} aria-hidden /><h3>Zatím nemáte žádný scénář</h3><p>Začněte šablonou uvítací sekvence nebo opuštěného košíku.</p><Btn primary onClick={() => setCreating(true)}><Plus aria-hidden />Nový scénář</Btn></section>}
      <NewWorkflow open={creating} onClose={() => setCreating(false)} onCreate={create} />
      {actions.confirmEl}
    </div>
  );
}

function NewWorkflow({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (t: (typeof TEMPLATES)[number], name: string) => void }) {
  const [tpl, setTpl] = useState(TEMPLATES[1].id);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const t = TEMPLATES.find(x => x.id === tpl)!;
  return (
    <Modal open={open} onClose={onClose} title="Nový scénář" desc="Scénář vznikne jako koncept. Aktivujete ho po kontrole." wide>
      <form onSubmit={e => { e.preventDefault(); if (!name.trim()) { setError('Pojmenujte scénář.'); return; } onCreate(t, name.trim()); setName(''); onClose(); }} noValidate>
        <div className="stack">
          <Field label="Název scénáře"><input value={name} onChange={e => { setName(e.target.value); setError(''); }} maxLength={100} autoFocus placeholder="Např. Přivítání nových odběratelů" /></Field>
          <div className="tpl-pick" role="radiogroup" aria-label="Šablona">
            {TEMPLATES.map(x => <button key={x.id} type="button" role="radio" aria-checked={tpl === x.id} className={`audience-card ${tpl === x.id ? 'selected' : ''}`} onClick={() => setTpl(x.id)}><span className="radio-circle" /><span><strong>{x.name}</strong><p>{x.desc}</p></span></button>)}
          </div>
          <FormError>{error}</FormError>
        </div>
        <div className="form-actions"><Btn type="button" onClick={onClose}>Zrušit</Btn><Btn primary type="submit">Vytvořit scénář</Btn></div>
      </form>
    </Modal>
  );
}

/* ---------- builder ---------- */
type Ctx = { counts: Map<string, number>; issues: Set<string>; edges: PlusEdge[]; addAfter: (id: string, handle: 'yes' | 'no' | null, kind: FlowNodeKind) => void; insertOn: (edgeId: string, kind: FlowNodeKind) => void };
const BuilderCtx = createContext<Ctx>(null!);

function AddMenu({ onPick, label, small = false }: { onPick: (k: FlowNodeKind) => void; label: string; small?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><button type="button" className={`flow-add nodrag nopan ${small ? 'small' : ''}`} aria-label={label} title={label}><Plus aria-hidden /></button></DropdownMenuTrigger>
      <DropdownMenuContent align="center">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {STEP_KINDS.map(k => { const I = ICON[k]; return <DropdownMenuItem key={k} onSelect={() => onPick(k)}><I aria-hidden />{KIND_LABEL[k]}</DropdownMenuItem>; })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StepCard({ id, data, selected }: NodeProps<StepNode>) {
  const ctx = useContext(BuilderCtx);
  const Icon = ICON[data.kind];
  const outs = ctx.edges.filter(e => e.source === id);
  const count = ctx.counts.get(id) ?? 0;
  return (
    <div className={`fnode kind-${data.kind} ${selected ? 'sel' : ''} ${ctx.issues.has(id) ? 'bad' : ''}`}>
      {data.kind !== 'trigger' && <Handle type="target" position={Position.Top} />}
      <div className="fnode-head"><span className="fnode-icon"><Icon size={14} aria-hidden /></span><span>{KIND_LABEL[data.kind]}</span>{count > 0 && <span className="fnode-count" title="Kontakty čekající v tomto kroku">{count}</span>}{ctx.issues.has(id) && <AlertTriangle size={14} className="fnode-warn" aria-label="Krok má chybu" />}</div>
      <strong>{data.title}</strong>
      <small>{summary(data)}</small>
      {data.kind === 'condition' ? (
        <>
          <Handle type="source" id="yes" position={Position.Bottom} style={{ left: '25%' }} />
          <Handle type="source" id="no" position={Position.Bottom} style={{ left: '75%' }} />
          <span className="fnode-branch yes">Ano</span><span className="fnode-branch no">Ne</span>
          {!outs.some(e => e.sourceHandle === 'yes') && <div className="flow-add-wrap yes"><AddMenu onPick={k => ctx.addAfter(id, 'yes', k)} label="Přidat krok do větve Ano" /></div>}
          {!outs.some(e => e.sourceHandle === 'no') && <div className="flow-add-wrap no"><AddMenu onPick={k => ctx.addAfter(id, 'no', k)} label="Přidat krok do větve Ne" /></div>}
        </>
      ) : data.kind !== 'end' && (
        <>
          <Handle type="source" position={Position.Bottom} />
          {!outs.length && <div className="flow-add-wrap"><AddMenu onPick={k => ctx.addAfter(id, null, k)} label="Přidat další krok" /></div>}
        </>
      )}
    </div>
  );
}

function PlusEdgeView({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style }: EdgeProps<PlusEdge>) {
  const ctx = useContext(BuilderCtx);
  const [path, lx, ly] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 14 });
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div className="fedge-label nodrag nopan" style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}>
          <AddMenu small onPick={k => ctx.insertOn(id, k)} label="Vložit krok sem" />
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
const nodeTypes = { step: StepCard };
const edgeTypes = { plus: PlusEdgeView };

function Builder({ id }: { id: string }) {
  const { w, go, patch, mutate, workspaceId } = useHub();
  const f = w.workflows.find(x => x.id === id);
  const initial = useMemo(() => (f ? toRf(f) : { nodes: [], edges: [] }), [f]);
  const [nodes, setNodes, onNodesChange] = useNodesState<StepNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<PlusEdge>(initial.edges);
  const [meta, setMeta] = useState({ name: f?.name ?? '', description: f?.description ?? '' });
  const [selected, setSelected] = useState<string | null>(null);
  const [showIssues, setShowIssues] = useState(false);
  const { resolvedTheme } = useTheme();
  const actions = useFlowActions();
  const draft = fromRf(nodes, edges);
  const saved = f ? { nodes: f.nodes, edges: f.edges, name: f.name, description: f.description } : null;
  const dirty = !!saved && JSON.stringify({ ...draft, ...meta }) !== JSON.stringify({ nodes: saved.nodes, edges: saved.edges, name: saved.name, description: saved.description });
  useUnsavedGuard(dirty, 'Scénář má neuložené změny.');
  const issues = useMemo(() => validateWorkflow(draft.nodes, draft.edges), [draft.nodes, draft.edges]);
  const counts = useMemo(() => { const m = new Map<string, number>(); f?.enrolled.forEach(e => m.set(e.nodeId, (m.get(e.nodeId) ?? 0) + 1)); return m; }, [f]);
  const ctxValue = useMemo<Ctx>(() => {
    const descendants = (start: string, es: PlusEdge[]) => { const out = new Set<string>(); const st = [start]; while (st.length) { const x = st.pop()!; if (out.has(x)) continue; out.add(x); es.filter(e => e.source === x).forEach(e => st.push(e.target)); } return out; };
    const make = (kind: FlowNodeKind, position: { x: number; y: number }): StepNode => ({ id: newId('n'), type: 'step', position, data: { kind, title: KIND_LABEL[kind], config: { ...DEFAULTS[kind] } } as StepData, deletable: false });
    return {
      counts, edges, issues: new Set(issues.map(i => i.nodeId).filter((x): x is string => !!x)),
      addAfter: (src, handle, kind) => {
        const s = nodes.find(n => n.id === src); if (!s) return;
        const n = make(kind, { x: s.position.x + (handle === 'yes' ? -170 : handle === 'no' ? 170 : 0), y: s.position.y + STEP_Y });
        setNodes(ns => [...ns, n]); setEdges(es => [...es, { id: newId('e'), source: src, target: n.id, sourceHandle: handle, type: 'plus', deletable: false }]); setSelected(n.id);
      },
      insertOn: (edgeId, kind) => {
        const e = edges.find(x => x.id === edgeId); const t = nodes.find(n => n.id === e?.target); if (!e || !t) return;
        const n = make(kind, { ...t.position });
        const shift = descendants(t.id, edges);
        setNodes(ns => [...ns.map(x => (shift.has(x.id) ? { ...x, position: { x: x.position.x, y: x.position.y + STEP_Y } } : x)), n]);
        setEdges(es => [...es.filter(x => x.id !== edgeId), { id: newId('e'), source: e.source, target: n.id, sourceHandle: e.sourceHandle ?? null, type: 'plus', deletable: false }, { id: newId('e'), source: n.id, target: t.id, sourceHandle: kind === 'condition' ? 'yes' : null, type: 'plus', deletable: false }]);
        setSelected(n.id);
      },
    };
  }, [counts, edges, issues, nodes, setEdges, setNodes]);

  if (!f) return <div className="page"><section className="panel empty"><h3>Scénář nenalezen</h3><p>V tomto pracovním prostoru scénář neexistuje.</p><Btn primary onClick={() => go('automatizace')}>Zpět na automatizace</Btn></section></div>;
  const sel = nodes.find(n => n.id === selected);
  const updateNode = (patchData: Partial<FlowNodeData>) => setNodes(ns => ns.map(n => (n.id === selected ? { ...n, data: { ...n.data, ...patchData } as StepData } : n)));
  const removeNode = (nid: string) => {
    const node = nodes.find(n => n.id === nid); if (!node || node.data.kind === 'trigger') return;
    const ins = edges.filter(e => e.target === nid); const outs = edges.filter(e => e.source === nid);
    let next = edges.filter(e => e.source !== nid && e.target !== nid);
    if (outs.length === 1 && node.data.kind !== 'condition') next = [...next, ...ins.map(i => ({ id: newId('e'), source: i.source, target: outs[0].target, sourceHandle: i.sourceHandle ?? null, type: 'plus' as const, deletable: false }))];
    setEdges(next); setNodes(ns => ns.filter(n => n.id !== nid)); setSelected(null);
    toast.success(node.data.kind === 'condition' && outs.length ? 'Podmínka byla odebrána. Větve zůstaly bez napojení – připojte je nebo smažte.' : 'Krok byl odebrán.');
  };
  const save = () => {
    if (!meta.name.trim()) { toast.error('Pojmenujte scénář.'); return; }
    const next = fromRf(nodes, edges);
    if (f.status === 'Aktivní' && issues.length) { toast.error('Aktivní scénář lze uložit jen bez chyb. Opravte je, nebo scénář nejdřív pozastavte.'); setShowIssues(true); return; }
    const valid = new Set(next.nodes.map(n => n.id));
    patch('workflows', f.id, x => ({ ...x, ...next, name: meta.name.trim(), description: meta.description.trim(), enrolled: x.enrolled.filter(e => valid.has(e.nodeId)), updatedAt: new Date().toISOString() }));
    toast.success('Scénář byl uložen.');
  };
  const step = () => {
    let r = { moved: 0, finished: 0, removed: 0 };
    mutate(d => { const x = advanceWorkflow(d, workspaceId, f.id); r = x; return x.data; });
    toast.success('Simulace posunula běh o jeden krok.', { description: `Posunuto ${r.moved}, dokončeno ${r.finished}${r.removed ? `, vyřazeno (bez souhlasu) ${r.removed}` : ''}.` });
  };
  const trig = nodes.find(n => n.data.kind === 'trigger');
  return (
    <div className="page flow-page">
      <button type="button" className="back-link" onClick={() => go('automatizace')}><ArrowLeft size={15} aria-hidden />Všechny scénáře</button>
      <PageHead title={meta.name || 'Scénář'} desc={`${f.status} · ${plural(nodes.length, 'krok', 'kroky', 'kroků')} · ${plural(f.enrolled.length, 'kontakt', 'kontakty', 'kontaktů')} v běhu`}>
        <Badge tone={statusTone(f.status)}>{f.status}</Badge>
        <Btn onClick={() => setShowIssues(s => !s)} aria-expanded={showIssues}>{issues.length ? <><AlertTriangle aria-hidden />{plural(issues.length, 'chyba', 'chyby', 'chyb')}</> : <><CheckCircle2 aria-hidden />Bez chyb</>}</Btn>
        {f.status === 'Aktivní' && <Btn onClick={step} disabled={!f.enrolled.length || dirty} title={dirty ? 'Nejdřív uložte změny' : undefined}><StepForward aria-hidden />Simulovat krok</Btn>}
        {f.status === 'Aktivní' ? <Btn onClick={() => actions.pause(f)}><Pause aria-hidden />Pozastavit</Btn> : <Btn onClick={() => { if (dirty) { toast.error('Nejdřív scénář uložte.'); return; } actions.activate(f); }}><Play aria-hidden />Aktivovat</Btn>}
        <Btn primary onClick={save} disabled={!dirty}><Save aria-hidden />Uložit</Btn>
      </PageHead>
      {showIssues && (
        <div className="flow-issues" role="region" aria-label="Kontrola scénáře">
          {issues.length ? <ul>{issues.map((i, k) => <li key={k}><button type="button" onClick={() => i.nodeId && setSelected(i.nodeId)} disabled={!i.nodeId}><AlertTriangle size={14} aria-hidden />{i.text}</button></li>)}</ul> : <p><CheckCircle2 size={16} aria-hidden className="positive" /> Scénář je v pořádku a lze ho aktivovat.</p>}
          <IconBtn label="Zavřít kontrolu" onClick={() => setShowIssues(false)}><X /></IconBtn>
        </div>
      )}
      <div className="flow-builder">
        <div className="flow-canvas" aria-label="Plátno scénáře">
          <BuilderCtx.Provider value={ctxValue}>
            <ReactFlow<StepNode, PlusEdge>
              nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
              onConnect={(c: Connection) => setEdges(es => addEdge({ ...c, id: newId('e'), type: 'plus', deletable: false }, es))}
              nodeTypes={nodeTypes} edgeTypes={edgeTypes} deleteKeyCode={null}
              onNodeClick={(_, n) => setSelected(n.id)} onPaneClick={() => setSelected(null)}
              fitView fitViewOptions={{ padding: 0.25, maxZoom: 1 }} minZoom={0.3} maxZoom={1.5}
              colorMode={resolvedTheme === 'dark' ? 'dark' : 'light'}
            >
              <Background gap={18} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </BuilderCtx.Provider>
        </div>
        <aside className="flow-side" aria-label={sel ? 'Nastavení kroku' : 'Nastavení scénáře'}>
          {sel ? <NodeSettings key={sel.id} node={sel} onChange={updateNode} onRemove={() => removeNode(sel.id)} onClose={() => setSelected(null)} edges={edges} nodes={nodes} onRemoveEdge={eid => setEdges(es => es.filter(e => e.id !== eid))} /> : (
            <div className="stack">
              <Section title="Scénář">
                <div className="sec-body stack">
                  <Field label="Název"><input value={meta.name} onChange={e => setMeta({ ...meta, name: e.target.value })} maxLength={100} /></Field>
                  <Field label="Popis"><textarea rows={3} value={meta.description} onChange={e => setMeta({ ...meta, description: e.target.value })} maxLength={300} /></Field>
                  <div className="kv"><span>Spouštěč</span><strong>{trig ? summary(trig.data) : '—'}</strong></div>
                  <div className="kv"><span>Dokončené běhy</span><strong>{fmt(f.completed)}</strong></div>
                  <div className="kv"><span>Upraveno</span><strong>{fmtDate(f.updatedAt)}</strong></div>
                  <p className="small muted">Klikněte na krok pro nastavení. Tlačítkem + na spojnici vložíte krok doprostřed, + pod krokem přidáte další.</p>
                </div>
              </Section>
              <Enrolled f={f} />
            </div>
          )}
        </aside>
      </div>
      {actions.confirmEl}
    </div>
  );
}

function NodeSettings({ node, onChange, onRemove, onClose, edges, nodes, onRemoveEdge }: { node: StepNode; onChange: (p: Partial<FlowNodeData>) => void; onRemove: () => void; onClose: () => void; edges: PlusEdge[]; nodes: StepNode[]; onRemoveEdge: (id: string) => void }) {
  const { w } = useHub();
  const d = node.data; const c = d.config;
  const set = (k: string, v: string) => onChange({ config: { ...c, [k]: v } });
  const tags = [...new Set(w.contacts.flatMap(x => x.tags))].sort((a, b) => a.localeCompare(b, 'cs'));
  const outs = edges.filter(e => e.source === node.id);
  const title = (id: string) => nodes.find(n => n.id === id)?.data.title ?? '?';
  const Icon = ICON[d.kind];
  return (
    <section className="panel sec flow-settings-panel">
      <header className="sec-head"><div><h2><Icon size={16} aria-hidden /> {KIND_LABEL[d.kind]}</h2><p>Změny se projeví hned, uloží se tlačítkem Uložit.</p></div><IconBtn label="Zavřít nastavení kroku" onClick={onClose}><X /></IconBtn></header>
      <div className="sec-body stack">
        <Field label="Název kroku"><input value={d.title} onChange={e => onChange({ title: e.target.value })} maxLength={80} /></Field>
        {d.kind === 'trigger' && <>
          <Field label="Událost"><Pick value={c.event ?? ''} onChange={v => onChange({ config: { event: v } })} options={(Object.keys(TRIGGERS) as TriggerEvent[]).map(k => [k, TRIGGERS[k].label] as [string, string])} className="full" label="Událost spouštěče" /></Field>
          {(() => { const p = TRIGGERS[c.event as TriggerEvent]?.param; if (!p) return null;
            if (p.key === 'webinar') return <Field label={p.label}><Pick value={c.webinar ?? 'Jakýkoli'} onChange={v => set('webinar', v)} options={['Jakýkoli', ...w.webinars.map(x => x.title)]} className="full" label={p.label} /></Field>;
            if (p.key === 'course') return <Field label={p.label}><Pick value={c.course ?? ''} onChange={v => set('course', v)} options={w.courses.map(x => x.title)} className="full" label={p.label} /></Field>;
            if (p.key === 'tag') return <div className="field"><span>{p.label}</span><OptionCombobox value={c.tag ?? ''} onChange={v => set('tag', v)} options={tags} label={p.label} placeholder="Vyberte štítek" /></div>;
            return <Field label={p.label}><input value={c[p.key] ?? ''} onChange={e => set(p.key, e.target.value)} /></Field>; })()}
          <Notice>Spouštěč reaguje na události z ostatních modulů jen u aktivního scénáře.</Notice>
        </>}
        {d.kind === 'email' && <>
          <Field label="Předmět"><input value={c.subject ?? ''} onChange={e => set('subject', e.target.value)} maxLength={150} /></Field>
          <Field label="Text e-mailu" hint="Personalizace {{jmeno}}. Obsah lze později navrhnout v editoru kampaní."><textarea rows={5} value={c.body ?? ''} onChange={e => set('body', e.target.value)} /></Field>
        </>}
        {d.kind === 'wait' && <div className="form-grid">
          <Field label="Délka"><input type="number" min={1} value={c.amount ?? ''} onChange={e => set('amount', e.target.value)} /></Field>
          <Field label="Jednotka"><Pick value={c.unit ?? 'dní'} onChange={v => set('unit', v)} options={[...new Set(['minut', 'hodin', 'dní', 'týdnů', c.unit ?? 'dní'])]} className="full" label="Jednotka" /></Field>
        </div>}
        {d.kind === 'condition' && <>
          <Field label="Podmínka"><Pick value={c.check ?? ''} onChange={v => onChange({ config: { check: v } })} options={Object.entries(CONDITIONS)} className="full" label="Podmínka" /></Field>
          {c.check === 'has_tag' && <div className="field"><span>Štítek</span><OptionCombobox value={c.value ?? ''} onChange={v => set('value', v)} options={tags} label="Štítek podmínky" placeholder="Vyberte štítek" /></div>}
          {c.check === 'stage_is' && <Field label="Fáze"><Pick value={c.value ?? ''} onChange={v => set('value', v)} options={['Lead', 'Zájemce', 'Klient']} className="full" label="Fáze" /></Field>}
          <p className="small muted">Kontakt pokračuje větví Ano, nebo Ne.</p>
        </>}
        {(d.kind === 'tag' || d.kind === 'untag') && <div className="field"><span>Štítek</span><OptionCombobox value={c.tag ?? ''} onChange={v => set('tag', v)} options={tags} allowCreate={d.kind === 'tag'} label="Štítek kroku" placeholder="Vyberte štítek" /></div>}
        {d.kind === 'stage' && <Field label="Nová fáze kontaktu"><Pick value={c.stage ?? ''} onChange={v => set('stage', v)} options={['Lead', 'Zájemce', 'Klient']} className="full" label="Fáze" /></Field>}
        {d.kind === 'campaign' && <Field label="Kampaň (koncept nebo naplánovaná)"><Pick value={c.campaignId ?? ''} onChange={v => onChange({ config: { campaignId: v, campaignName: w.campaigns.find(x => String(x.id) === v)?.name ?? '' } })} options={w.campaigns.filter(x => x.status !== 'Odesláno').map(x => [String(x.id), x.name] as [string, string])} className="full" label="Kampaň" /></Field>}
        {d.kind === 'webhook' && <>
          <Field label="URL (např. n8n)" hint="Volání proběhne až s backendem (podepsaný požadavek)."><input type="url" value={c.url ?? ''} onChange={e => set('url', e.target.value)} placeholder="https://" /></Field>
          <Field label="Metoda"><Pick value={c.method ?? 'POST'} onChange={v => set('method', v)} options={['POST', 'PUT']} className="full" label="Metoda" /></Field>
        </>}
        {d.kind === 'notify' && <>
          <Field label="Komu"><input value={c.to ?? ''} onChange={e => set('to', e.target.value)} placeholder="e-mail kolegy" /></Field>
          <Field label="Zpráva"><textarea rows={3} value={c.message ?? ''} onChange={e => set('message', e.target.value)} /></Field>
        </>}
        {d.kind === 'end' && <p className="muted small">Kontakt v tomto kroku scénář dokončí.</p>}
        {outs.length > 0 && (
          <div className="field"><span>Pokračuje do</span>
            <ul className="file-list">{outs.map(e => <li key={e.id}><span>{e.sourceHandle === 'yes' ? 'Ano → ' : e.sourceHandle === 'no' ? 'Ne → ' : ''}{title(e.target)}</span><IconBtn label={`Odpojit ${title(e.target)}`} onClick={() => onRemoveEdge(e.id)}><X /></IconBtn></li>)}</ul>
          </div>
        )}
        {d.kind !== 'trigger' && <Btn className="danger-ghost" onClick={onRemove}><Trash2 aria-hidden />Odebrat krok</Btn>}
      </div>
    </section>
  );
}

function Enrolled({ f }: { f: Workflow }) {
  const { w, workspaceId, mutate, go } = useHub();
  const contacts = new Map(w.contacts.map(c => [c.id, c]));
  const nodes = new Map(f.nodes.map(n => [n.id, n]));
  const [now] = useState(() => Date.now());
  return (
    <Section title="Kontakty v běhu" desc={plural(f.enrolled.length, 'kontakt', 'kontakty', 'kontaktů')}>
      <ul className="mini-list sec-body">
        {f.enrolled.slice(0, 12).map(e => { const c = contacts.get(e.contactId); return (
          <li key={e.contactId}><span className="mini-row">
            {c && <Avatar name={c.name} color={c.color} size="sm" />}
            <button type="button" className="row-main" onClick={() => c && go('kontakty/' + c.id)}>{c?.name ?? 'Smazaný kontakt'}<small>{nodes.get(e.nodeId)?.data.title ?? '?'} · {relTime(e.since, now)}</small></button>
            <IconBtn label={`Vyřadit ${c?.name ?? ''} ze scénáře`} onClick={() => { mutate(d => ({ ...d, workflows: d.workflows.map(x => (x.workspaceId === workspaceId && x.id === f.id ? { ...x, enrolled: x.enrolled.filter(y => y.contactId !== e.contactId) } : x)) })); toast.success('Kontakt byl ze scénáře vyřazen.'); }}><X /></IconBtn>
          </span></li>
        ); })}
        {!f.enrolled.length && <li className="muted small">Nikdo není v běhu. Kontakty přidáte z CRM (hromadná akce nebo detail kontaktu) nebo je zařadí spouštěč aktivního scénáře.</li>}
        {f.enrolled.length > 12 && <li className="muted small">a dalších {f.enrolled.length - 12}</li>}
      </ul>
    </Section>
  );
}
