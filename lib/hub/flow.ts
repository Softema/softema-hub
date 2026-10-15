/**
 * Workflow logic of the prototype: validation of the graph, trigger matching (events from other modules
 * enrol contacts into active workflows) and a simulated step that moves contacts through the graph.
 * Real execution (BullMQ + persistent WorkflowRun) belongs to the backend.
 */
import type { FlowEdge, FlowNode, FlowNodeKind, HubData, Workflow } from './types';
import { normalize } from './format';
import { newActivity } from './logic';

export type TriggerEvent = 'contact_created' | 'tag_added' | 'tag_removed' | 'form' | 'payment_succeeded' | 'webinar_registered' | 'course_completed' | 'date' | 'webhook';
export const TRIGGERS: Record<TriggerEvent, { label: string; param?: { key: string; label: string } }> = {
  contact_created: { label: 'Nový kontakt', param: { key: 'source', label: 'Zdroj (prázdné = jakýkoli)' } },
  tag_added: { label: 'Přidán štítek', param: { key: 'tag', label: 'Štítek' } },
  tag_removed: { label: 'Odebrán štítek', param: { key: 'tag', label: 'Štítek' } },
  form: { label: 'Odeslán formulář', param: { key: 'form', label: 'Formulář (prázdné = jakýkoli)' } },
  payment_succeeded: { label: 'Provedena platba', param: { key: 'product', label: 'Produkt (prázdné = jakýkoli)' } },
  webinar_registered: { label: 'Registrace na webinář', param: { key: 'webinar', label: 'Webinář' } },
  course_completed: { label: 'Dokončen kurz', param: { key: 'course', label: 'Kurz' } },
  date: { label: 'Datum / výročí', param: { key: 'rule', label: 'Pravidlo' } },
  webhook: { label: 'Webhook (n8n, e-shop)', param: { key: 'source', label: 'Zdroj' } },
};
export const KIND_LABEL: Record<FlowNodeKind, string> = {
  trigger: 'Spouštěč', email: 'Odeslat e-mail', wait: 'Počkat', condition: 'Podmínka', tag: 'Přidat štítek', untag: 'Odebrat štítek',
  stage: 'Změnit fázi', campaign: 'Zařadit do kampaně', webhook: 'Webhook', notify: 'Notifikace týmu', end: 'Konec',
};
export const CONDITIONS: Record<string, string> = { email_opened: 'Otevřel předchozí e-mail', email_clicked: 'Klikl v předchozím e-mailu', has_tag: 'Má štítek', stage_is: 'Je ve fázi', payment_succeeded: 'Zaplatil', has_consent: 'Má souhlas s e-mailingem' };

export function summary(n: FlowNode['data']): string {
  const c = n.config;
  switch (n.kind) {
    case 'trigger': { const t = TRIGGERS[c.event as TriggerEvent]; const p = t?.param ? c[t.param.key] : ''; return `${t?.label ?? 'Neznámý spouštěč'}${p ? `: ${p}` : ''}`; }
    case 'email': return c.subject ? `Předmět: ${c.subject}` : 'Chybí předmět';
    case 'wait': return c.amount ? `${c.amount} ${c.unit || 'dní'}` : 'Chybí délka čekání';
    case 'condition': return `${CONDITIONS[c.check] ?? 'Podmínka'}${c.value ? `: ${c.value}` : ''}`;
    case 'tag': case 'untag': return c.tag ? `Štítek: ${c.tag}` : 'Chybí štítek';
    case 'stage': return c.stage ? `Fáze: ${c.stage}` : 'Chybí fáze';
    case 'campaign': return c.campaignName ? `Kampaň: ${c.campaignName}` : 'Chybí kampaň';
    case 'webhook': return c.url || 'Chybí adresa';
    case 'notify': return c.to ? `Komu: ${c.to}` : 'Chybí příjemce';
    default: return 'Kontakt opustí scénář';
  }
}

export interface FlowIssue { nodeId?: string; text: string }
/** Graph and configuration checks before a workflow can be activated. */
export function validateWorkflow(nodes: FlowNode[], edges: FlowEdge[]): FlowIssue[] {
  const issues: FlowIssue[] = [];
  const triggers = nodes.filter(n => n.data.kind === 'trigger');
  if (triggers.length !== 1) issues.push({ text: triggers.length ? 'Scénář smí mít jen jeden spouštěč.' : 'Chybí spouštěč.' });
  const out = (id: string) => edges.filter(e => e.source === id);
  const byId = new Map(nodes.map(n => [n.id, n]));
  for (const e of edges) if (!byId.has(e.source) || !byId.has(e.target)) issues.push({ text: 'Spojení vede na neexistující krok.' });
  for (const n of nodes) {
    const o = out(n.id); const k = n.data.kind; const c = n.data.config;
    if (k === 'condition') {
      if (!o.some(e => e.sourceHandle === 'yes') || !o.some(e => e.sourceHandle === 'no')) issues.push({ nodeId: n.id, text: `„${n.data.title}“ potřebuje větev Ano i Ne.` });
    } else if (k !== 'end' && o.length > 1) issues.push({ nodeId: n.id, text: `„${n.data.title}“ smí pokračovat jen jedním směrem.` });
    if (k === 'end' && o.length) issues.push({ nodeId: n.id, text: 'Za krokem Konec už nic nesmí následovat.' });
    if (k === 'trigger' && edges.some(e => e.target === n.id)) issues.push({ nodeId: n.id, text: 'Do spouštěče nesmí vést spojení.' });
    const need = (ok: unknown, text: string) => { if (!ok) issues.push({ nodeId: n.id, text: `„${n.data.title}“: ${text}` }); };
    if (k === 'trigger') { need(TRIGGERS[c.event as TriggerEvent], 'vyberte událost.'); const p = TRIGGERS[c.event as TriggerEvent]?.param; if (p && ['tag', 'webinar', 'course'].includes(p.key)) need(c[p.key], `vyplňte „${p.label}“.`); }
    if (k === 'email') need(c.subject?.trim(), 'vyplňte předmět e-mailu.');
    if (k === 'wait') need(Number(c.amount) > 0, 'délka čekání musí být větší než 0.');
    if (k === 'condition') { need(CONDITIONS[c.check], 'vyberte podmínku.'); if (c.check === 'has_tag' || c.check === 'stage_is') need(c.value, 'vyplňte hodnotu podmínky.'); }
    if (k === 'tag' || k === 'untag') need(c.tag?.trim(), 'vyplňte štítek.');
    if (k === 'stage') need(c.stage, 'vyberte fázi.');
    if (k === 'campaign') need(c.campaignId, 'vyberte kampaň.');
    if (k === 'webhook') need(/^https:\/\/\S+$/.test(c.url ?? ''), 'adresa musí začínat https://');
    if (k === 'notify') need(c.to?.trim(), 'vyplňte příjemce.');
  }
  // reachability and cycles
  if (triggers.length === 1) {
    const seen = new Set<string>(); const stack = [triggers[0].id];
    while (stack.length) { const id = stack.pop()!; if (seen.has(id)) continue; seen.add(id); out(id).forEach(e => stack.push(e.target)); }
    for (const n of nodes) if (!seen.has(n.id)) issues.push({ nodeId: n.id, text: `„${n.data.title}“ není napojený na spouštěč.` });
    const visiting = new Set<string>(); const done = new Set<string>(); let cycle = false;
    const dfs = (id: string) => { if (cycle || done.has(id)) return; if (visiting.has(id)) { cycle = true; return; } visiting.add(id); out(id).forEach(e => dfs(e.target)); visiting.delete(id); done.add(id); };
    dfs(triggers[0].id);
    if (cycle) issues.push({ text: 'Scénář obsahuje smyčku. Kroky musí vést jen dopředu.' });
  }
  if (nodes.length < 2) issues.push({ text: 'Přidejte za spouštěč alespoň jeden krok.' });
  return issues;
}

/** Events from other modules enrol contacts into active workflows with a matching trigger. */
export function fireTrigger(d: HubData, ws: string, event: TriggerEvent, contactIds: number[], param = ''): HubData {
  if (!contactIds.length) return d;
  const date = new Date().toISOString();
  let activities = d.activities;
  const workflows = d.workflows.map(f => {
    if (f.workspaceId !== ws || f.status !== 'Aktivní') return f;
    const t = f.nodes.find(n => n.data.kind === 'trigger');
    if (!t || t.data.config.event !== event) return f;
    const p = TRIGGERS[event].param; const want = p ? (t.data.config[p.key] ?? '') : '';
    if (want && !['Jakýkoli', 'Jakákoli', 'jakýkoli'].includes(want) && normalize(want) !== normalize(param)) return f;
    const first = f.edges.find(e => e.source === t.id)?.target; if (!first) return f;
    const already = new Set(f.enrolled.map(e => e.contactId));
    const add = contactIds.filter(id => !already.has(id));
    if (!add.length) return f;
    activities = [...add.map(id => newActivity(ws, id, 'automation', `Vstup do automatizace ${f.name}`, TRIGGERS[event].label + (param ? `: ${param}` : ''), `automatizace/${f.id}`)), ...activities];
    return { ...f, enrolled: [...f.enrolled, ...add.map(contactId => ({ contactId, nodeId: first, since: date }))] };
  });
  return { ...d, workflows, activities };
}

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) / 4294967296; };

/**
 * Simulated run step: every enrolled contact performs its current node and moves to the next one.
 * Actions really change local data (tags, stage, campaign recipients, timeline). Unsubscribed contacts leave immediately.
 */
export function advanceWorkflow(d: HubData, ws: string, workflowId: string): { data: HubData; moved: number; finished: number; removed: number } {
  const f = d.workflows.find(x => x.workspaceId === ws && x.id === workflowId);
  if (!f) return { data: d, moved: 0, finished: 0, removed: 0 };
  const nodes = new Map(f.nodes.map(n => [n.id, n]));
  let contacts = d.contacts; let campaigns = d.campaigns; const acts = [] as HubData['activities'];
  const enrolled: Workflow['enrolled'] = []; let finished = 0, moved = 0, removed = 0;
  const date = new Date().toISOString();
  for (const run of f.enrolled) {
    const c = contacts.find(x => x.workspaceId === ws && x.id === run.contactId);
    if (!c || c.consent.state === 'Odvolán') { removed++; continue; }
    const node = nodes.get(run.nodeId);
    if (!node) { finished++; continue; }
    const cfg = node.data.config; const log = (title: string, detail: string) => acts.push(newActivity(ws, c.id, 'automation', title, detail, `automatizace/${f.id}`));
    let handle: 'yes' | 'no' | null = null;
    switch (node.data.kind) {
      case 'email': log(`Automatizace odeslala e-mail (simulace)`, cfg.subject || node.data.title); break;
      case 'tag': if (cfg.tag && !c.tags.includes(cfg.tag)) { contacts = contacts.map(x => (x === c ? { ...x, tags: [...x.tags, cfg.tag] } : x)); log(`Automatizace přidala štítek ${cfg.tag}`, f.name); } break;
      case 'untag': contacts = contacts.map(x => (x === c ? { ...x, tags: x.tags.filter(t => normalize(t) !== normalize(cfg.tag ?? '')) } : x)); log(`Automatizace odebrala štítek ${cfg.tag}`, f.name); break;
      case 'stage': if (cfg.stage === 'Lead' || cfg.stage === 'Zájemce' || cfg.stage === 'Klient') { const stage = cfg.stage; contacts = contacts.map(x => (x === c ? { ...x, stage } : x)); log(`Automatizace změnila fázi na ${cfg.stage}`, f.name); } break;
      case 'campaign': campaigns = campaigns.map(x => (x.workspaceId === ws && String(x.id) === cfg.campaignId && x.status !== 'Odesláno' && !x.extraContactIds.includes(c.id) ? { ...x, extraContactIds: [...x.extraContactIds, c.id] } : x)); log('Automatizace zařadila kontakt do kampaně', cfg.campaignName ?? ''); break;
      case 'webhook': log('Automatizace zavolala webhook (simulace)', cfg.url ?? ''); break;
      case 'notify': log('Notifikace týmu (simulace)', cfg.to ?? ''); break;
      case 'condition': {
        const v = cfg.check === 'has_tag' ? c.tags.some(t => normalize(t) === normalize(cfg.value ?? '')) : cfg.check === 'stage_is' ? c.stage === cfg.value : cfg.check === 'has_consent' ? c.consent.state === 'Udělen' : hash(`${f.id}${c.id}${node.id}`) < 0.55;
        handle = v ? 'yes' : 'no'; break;
      }
      default: break;
    }
    const next = f.edges.find(e => e.source === node.id && (node.data.kind !== 'condition' || e.sourceHandle === handle));
    if (!next || node.data.kind === 'end') { finished++; continue; }
    moved++;
    enrolled.push({ contactId: c.id, nodeId: next.target, since: date });
  }
  const workflows = d.workflows.map(x => (x === f ? { ...f, enrolled, completed: f.completed + finished } : x));
  return { data: { ...d, contacts, campaigns, workflows, activities: [...acts, ...d.activities] }, moved, finished, removed };
}
