'use client';
/* Chatbot: appearance, knowledge base, behaviour and installation with a live widget preview and a clearly
   labelled demo test chat. Answers come from a simple local search over the knowledge base – no Claude API. */
import React, { useMemo, useState } from 'react';
import { Bot, Check, Copy, FileText, Globe, HelpCircle, ListChecks, MoreHorizontal, Plus, RefreshCcw, RotateCcw, Send, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { fmtDateTime, isEmail, newId, normalize, plural } from '@/lib/hub/format';
import { logActivity, upsertContactByEmail } from '@/lib/hub/ops';
import type { ChatbotConfig, KnowledgeSource } from '@/lib/hub/types';
import { useHub, useUnsavedGuard } from './state';
import { Badge, Btn, Field, Modal, PageHead, Pick } from './ui';
import { FormError, Notice, Section, SubNav, ToggleRow, useConfirm, useRoute } from './kit';

const LANGS = ['čeština', 'slovenština', 'angličtina', 'němčina'];
const TONES = ['Přátelský a profesionální', 'Formální', 'Neformální a hravý', 'Stručný a věcný'];

export default function Chatbot() {
  const { w, workspaceId, mutate } = useHub();
  const bot = w.chatbots[0];
  if (!bot) return (
    <div className="page"><section className="panel empty"><Bot size={28} aria-hidden /><h3>Chatbot zatím není nastavený</h3><p>Vytvořte chatbota pro tento pracovní prostor.</p>
      <Btn primary onClick={() => mutate(d => ({ ...d, chatbots: [...d.chatbots, { id: newId('bot'), workspaceId, name: 'Asistent', color: '#ed6637', avatar: 'A', welcome: 'Dobrý den, s čím vám mohu pomoct?', placeholder: 'Napište zprávu…', position: 'Vpravo dole', launcher: 'Potřebujete poradit?', active: false, persona: '', tone: TONES[0], fallback: 'Tohle zatím nevím. Nechte mi e-mail a ozveme se.', languages: ['čeština'], leadCapture: { enabled: true, askName: true, askEmail: true, askPhone: false, tag: 'Chatbot lead' }, handoff: { enabled: false, email: '' }, sources: [] }] }))}><Plus aria-hidden />Vytvořit chatbota</Btn></section></div>
  );
  return <ChatbotEditor key={bot.id} bot={bot} />;
}

function ChatbotEditor({ bot }: { bot: ChatbotConfig }) {
  const { patch } = useHub();
  const { parts } = useRoute();
  const tab = ['znalosti', 'chovani', 'instalace'].includes(parts[1] ?? '') ? parts[1] : 'vzhled';
  const [draft, setDraft] = useState(bot);
  const [error, setError] = useState('');
  const settingsOnly = (c: ChatbotConfig) => JSON.stringify({ ...c, sources: undefined });
  const dirty = settingsOnly(draft) !== settingsOnly(bot);
  useUnsavedGuard(dirty, 'Nastavení chatbota má neuložené změny.');
  const set = (p: Partial<ChatbotConfig>) => { setDraft(d => ({ ...d, ...p })); setError(''); };
  const save = () => {
    if (!draft.name.trim()) return setError('Vyplňte jméno chatbota.');
    if (!/^#[0-9a-f]{6}$/i.test(draft.color)) return setError('Barva musí být ve formátu #RRGGBB.');
    if (!draft.welcome.trim()) return setError('Vyplňte uvítací zprávu.');
    if (draft.leadCapture.enabled && !draft.leadCapture.askEmail && !draft.leadCapture.askPhone) return setError('Sběr kontaktů potřebuje alespoň e-mail nebo telefon.');
    if (draft.handoff.enabled && !isEmail(draft.handoff.email)) return setError('Zadejte platný e-mail pro předání na člověka.');
    if (!draft.languages.length) return setError('Vyberte alespoň jeden jazyk.');
    patch('chatbots', bot.id, x => ({ ...draft, sources: x.sources, name: draft.name.trim() }));
    toast.success('Nastavení chatbota bylo uloženo.');
  };
  const live = { ...draft, sources: bot.sources };
  return (
    <div className="page">
      <PageHead title="Chatbot" desc="Webový chatbot: vzhled, znalostní báze a chování. Odpovědi přes Claude API a trénink (pgvector) se zapojí s backendem.">
        <Badge tone={bot.active ? 'green' : 'gray'}>{bot.active ? 'Aktivní na webu' : 'Vypnutý'}</Badge>
        {dirty && <Btn onClick={() => { setDraft(bot); setError(''); }}><RotateCcw aria-hidden />Zahodit změny</Btn>}
        <Btn primary onClick={save} disabled={!dirty}><Check aria-hidden />Uložit</Btn>
      </PageHead>
      <SubNav active={tab === 'vzhled' ? 'chatbot' : `chatbot/${tab}`} items={[['chatbot', 'Vzhled'], ['chatbot/znalosti', 'Znalostní báze', bot.sources.length], ['chatbot/chovani', 'Chování'], ['chatbot/instalace', 'Instalace']]} />
      <FormError>{error}</FormError>
      <div className="chat-layout">
        <div className="stack">
          {tab === 'vzhled' && <Appearance v={draft} set={set} />}
          {tab === 'znalosti' && <Knowledge bot={bot} />}
          {tab === 'chovani' && <Behaviour v={draft} set={set} />}
          {tab === 'instalace' && <Install bot={bot} />}
        </div>
        <div className="chat-side">
          <TestChat key={JSON.stringify([live.name, live.welcome, live.leadCapture, live.handoff, live.fallback])} bot={live} />
        </div>
      </div>
    </div>
  );
}

function Appearance({ v, set }: { v: ChatbotConfig; set: (p: Partial<ChatbotConfig>) => void }) {
  return (
    <Section title="Vzhled widgetu" desc="Změny vidíte hned v náhledu vpravo. Uloží se tlačítkem Uložit.">
      <div className="sec-body stack">
        <div className="form-grid">
          <Field label="Jméno chatbota"><input value={v.name} onChange={e => set({ name: e.target.value })} maxLength={40} /></Field>
          <Field label="Avatar (1–2 znaky)"><input value={v.avatar} onChange={e => set({ avatar: e.target.value.slice(0, 2).toUpperCase() })} maxLength={2} /></Field>
        </div>
        <Field label="Barva"><div className="flex-row"><input type="color" value={v.color} onChange={e => set({ color: e.target.value })} aria-label="Barva chatbota" /><input value={v.color} onChange={e => set({ color: e.target.value })} className="mono" maxLength={7} aria-label="Barva v HEX" /></div></Field>
        <Field label="Uvítací zpráva"><textarea rows={3} value={v.welcome} onChange={e => set({ welcome: e.target.value })} maxLength={300} /></Field>
        <div className="form-grid">
          <Field label="Placeholder pole"><input value={v.placeholder} onChange={e => set({ placeholder: e.target.value })} maxLength={60} /></Field>
          <Field label="Text spouštěče"><input value={v.launcher} onChange={e => set({ launcher: e.target.value })} maxLength={40} /></Field>
        </div>
        <Field label="Pozice na webu"><Pick value={v.position} onChange={p => set({ position: p as ChatbotConfig['position'] })} options={['Vpravo dole', 'Vlevo dole']} className="full" label="Pozice" /></Field>
        <ToggleRow label="Aktivní na webu" desc="Po uložení se widget zobrazí na webu s instalačním kódem." checked={v.active} onChange={a => set({ active: a })} />
      </div>
    </Section>
  );
}

function Behaviour({ v, set }: { v: ChatbotConfig; set: (p: Partial<ChatbotConfig>) => void }) {
  return (
    <>
      <Section title="Osobnost a odpovědi">
        <div className="sec-body stack">
          <Field label="Persona / systémový pokyn" hint="Určuje, jak chatbot odpovídá. Ve finální verzi jde do Claude API."><textarea rows={5} value={v.persona} onChange={e => set({ persona: e.target.value })} maxLength={2000} /></Field>
          <Field label="Tón"><Pick value={v.tone} onChange={t => set({ tone: t })} options={[...new Set([v.tone, ...TONES])]} className="full" label="Tón" /></Field>
          <Field label="Odpověď, když chatbot neví"><textarea rows={2} value={v.fallback} onChange={e => set({ fallback: e.target.value })} maxLength={300} /></Field>
          <div className="field"><span>Jazyky</span><div className="flex-row wrap">{LANGS.map(l => <label key={l} className="check-row"><input type="checkbox" checked={v.languages.includes(l)} onChange={e => set({ languages: e.target.checked ? [...v.languages, l] : v.languages.filter(x => x !== l) })} />{l}</label>)}</div></div>
        </div>
      </Section>
      <Section title="Sběr kontaktů (lead capture)" desc="Kontakt se uloží do CRM se štítkem a může spustit automatizaci.">
        <div className="sec-body stack">
          <ToggleRow label="Sbírat kontakty" checked={v.leadCapture.enabled} onChange={x => set({ leadCapture: { ...v.leadCapture, enabled: x } })} />
          {v.leadCapture.enabled && <>
            <div className="flex-row wrap">
              {([['askName', 'Jméno'], ['askEmail', 'E-mail'], ['askPhone', 'Telefon']] as const).map(([k, l]) => <label key={k} className="check-row"><input type="checkbox" checked={v.leadCapture[k]} onChange={e => set({ leadCapture: { ...v.leadCapture, [k]: e.target.checked } })} />{l}</label>)}
            </div>
            <Field label="Štítek pro nové kontakty"><input value={v.leadCapture.tag} onChange={e => set({ leadCapture: { ...v.leadCapture, tag: e.target.value } })} maxLength={40} /></Field>
          </>}
        </div>
      </Section>
      <Section title="Předání na člověka">
        <div className="sec-body stack">
          <ToggleRow label="Nabídnout předání kolegovi" desc="Když návštěvník napíše „člověk“, „operátor“ nebo „kolega“." checked={v.handoff.enabled} onChange={x => set({ handoff: { ...v.handoff, enabled: x } })} />
          {v.handoff.enabled && <Field label="E-mail pro předání"><input type="email" value={v.handoff.email} onChange={e => set({ handoff: { ...v.handoff, email: e.target.value } })} /></Field>}
        </div>
      </Section>
    </>
  );
}

const KIND_ICON: Record<KnowledgeSource['kind'], typeof Globe> = { 'Webová stránka': Globe, Dokument: FileText, 'Otázky a odpovědi': HelpCircle, FAQ: ListChecks };
function Knowledge({ bot }: { bot: ChatbotConfig }) {
  const { patch } = useHub();
  const [editing, setEditing] = useState<KnowledgeSource | 'new' | null>(null);
  const [confirmEl, confirm] = useConfirm();
  const setSources = (fn: (s: KnowledgeSource[]) => KnowledgeSource[]) => patch('chatbots', bot.id, x => ({ ...x, sources: fn(x.sources) }));
  const train = (id: string) => {
    setSources(s => s.map(x => (x.id === id ? { ...x, status: 'Zpracovává se', updatedAt: new Date().toISOString() } : x)));
    setTimeout(() => { setSources(s => s.map(x => (x.id === id ? { ...x, status: 'Natrénováno', updatedAt: new Date().toISOString() } : x))); toast.success('Zdroj je zpracovaný (simulace).'); }, 1400);
  };
  return (
    <Section title="Znalostní báze" desc="Zdroje, ze kterých chatbot odpovídá. Zpracování je v prototypu simulované." actions={<Btn primary onClick={() => setEditing('new')}><Plus aria-hidden />Přidat zdroj</Btn>}>
      <ul className="row-list sec-body">
        {bot.sources.map(s => { const I = KIND_ICON[s.kind]; return (
          <li key={s.id} className="row-item">
            <span className="row-icon"><I size={16} aria-hidden /></span>
            <button type="button" className="row-main" onClick={() => setEditing(s)}><strong>{s.title}</strong><small>{s.kind} · {s.url ?? s.file?.name ?? plural(s.content.split('\n').filter(Boolean).length, 'řádek', 'řádky', 'řádků')} · {fmtDateTime(s.updatedAt)}</small></button>
            <Badge tone={s.status === 'Natrénováno' ? 'green' : s.status === 'Chyba' ? 'red' : 'orange'}>{s.status}</Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><button type="button" className="icon-btn" aria-label={`Akce zdroje ${s.title}`}><MoreHorizontal aria-hidden /></button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditing(s)}>Upravit</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => train(s.id)}><RefreshCcw aria-hidden />Znovu zpracovat</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => confirm({ title: `Odebrat zdroj ${s.title}?`, desc: 'Chatbot z něj přestane odpovídat.', confirm: 'Odebrat', danger: true, onConfirm: () => { setSources(x => x.filter(y => y.id !== s.id)); toast.success('Zdroj byl odebrán.'); } })}><Trash2 aria-hidden />Odebrat</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        ); })}
        {!bot.sources.length && <li className="muted">Zatím žádné zdroje. Bez nich chatbot odpovídá jen záložní odpovědí.</li>}
      </ul>
      {editing && <SourceDialog source={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSave={s => { setSources(list => (list.some(x => x.id === s.id) ? list.map(x => (x.id === s.id ? s : x)) : [...list, s])); train(s.id); }} />}
      {confirmEl}
    </Section>
  );
}

function SourceDialog({ source, onClose, onSave }: { source?: KnowledgeSource; onClose: () => void; onSave: (s: KnowledgeSource) => void }) {
  const [v, setV] = useState<KnowledgeSource>(source ?? { id: newId('ks'), kind: 'Otázky a odpovědi', title: '', content: '', status: 'Zpracovává se', updatedAt: new Date().toISOString() });
  const [error, setError] = useState('');
  const save = () => {
    if (!v.title.trim()) return setError('Vyplňte název zdroje.');
    if (v.kind === 'Webová stránka' && !/^https:\/\/\S+$/.test(v.url ?? '')) return setError('Adresa stránky musí začínat https://');
    if ((v.kind === 'Otázky a odpovědi' || v.kind === 'FAQ') && !v.content.split('\n').some(l => l.includes('|'))) return setError('Zadejte alespoň jeden řádek ve formátu „otázka | odpověď“.');
    if (v.kind === 'Dokument' && !v.file && !v.content.trim()) return setError('Vyberte soubor nebo vložte text dokumentu.');
    onSave({ ...v, title: v.title.trim(), updatedAt: new Date().toISOString() }); onClose();
  };
  return (
    <Modal open onClose={onClose} title={source ? 'Upravit zdroj' : 'Nový zdroj znalostí'} desc="Obsah zůstává v tomto prohlížeči. Stahování webu (SSRF-safe) a čtení PDF přijde s backendem." wide>
      <div className="stack">
        <div className="form-grid">
          <Field label="Typ"><Pick value={v.kind} onChange={k => setV({ ...v, kind: k as KnowledgeSource['kind'] })} options={['Otázky a odpovědi', 'FAQ', 'Webová stránka', 'Dokument']} className="full" label="Typ zdroje" /></Field>
          <Field label="Název"><input value={v.title} onChange={e => { setV({ ...v, title: e.target.value }); setError(''); }} maxLength={80} /></Field>
        </div>
        {v.kind === 'Webová stránka' && <Field label="Adresa stránky" hint="V prototypu se stránka nestahuje – do pole níže vložte text, ze kterého má chatbot odpovídat."><input type="url" value={v.url ?? ''} onChange={e => setV({ ...v, url: e.target.value })} placeholder="https://" /></Field>}
        {v.kind === 'Dokument' && <Field label="Soubor (PDF, DOCX)" hint="Uloží se jen název a velikost."><input type="file" accept=".pdf,.doc,.docx,.txt" onChange={e => { const f = e.target.files?.[0]; if (f) setV({ ...v, file: { id: newId('f'), name: f.name, size: f.size, type: f.type, addedAt: new Date().toISOString() }, title: v.title || f.name }); }} /></Field>}
        <Field label={v.kind === 'Otázky a odpovědi' || v.kind === 'FAQ' ? 'Otázky a odpovědi (jedna na řádek: otázka | odpověď)' : 'Text, ze kterého chatbot odpovídá'}><textarea rows={8} value={v.content} onChange={e => { setV({ ...v, content: e.target.value }); setError(''); }} placeholder={v.kind === 'Otázky a odpovědi' || v.kind === 'FAQ' ? 'Jaká je otevírací doba? | Po–Pá 9–17 h.' : ''} /></Field>
        <FormError>{error}</FormError>
      </div>
      <div className="form-actions"><Btn onClick={onClose}>Zrušit</Btn><Btn primary onClick={save}>{source ? 'Uložit a zpracovat' : 'Přidat a zpracovat'}</Btn></div>
    </Modal>
  );
}

function Install({ bot }: { bot: ChatbotConfig }) {
  const snippet = `<script src="https://chat.softema.example/widget.js" data-bot="${bot.id}" async></script>`;
  return (
    <Section title="Instalace na web" desc="Vložte kód před </body> na každé stránce webu.">
      <div className="sec-body stack">
        {!bot.active && <Notice tone="warn">Chatbot je vypnutý. Zapněte „Aktivní na webu“ v záložce Vzhled a uložte.</Notice>}
        <pre className="code-block" aria-label="Instalační kód">{snippet}</pre>
        <div><Btn onClick={() => navigator.clipboard?.writeText(snippet).then(() => toast.success('Kód je zkopírovaný.'), () => toast.error('Kód se nepodařilo zkopírovat.'))}><Copy aria-hidden />Kopírovat kód</Btn></div>
        <Notice>Doména skriptu je ukázková. Skutečný widget se servíruje až s backendem (odpovědi přes Claude API, logování konverzací, izolace znalostí per prostor).</Notice>
      </div>
    </Section>
  );
}

/* ---------- live preview + demo test chat ---------- */
type Msg = { id: number; from: 'bot' | 'user'; text: string; source?: string };
const tokens = (s: string) => normalize(s).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
function answer(bot: ChatbotConfig, q: string): { text: string; source?: string } | null {
  const qt = new Set(tokens(q)); if (!qt.size) return null;
  let best: { score: number; text: string; source: string } | null = null;
  for (const s of bot.sources.filter(x => x.status === 'Natrénováno')) {
    const units = s.content.split('\n').filter(Boolean).flatMap(line => (line.includes('|') ? [{ key: line.split('|')[0], text: line.split('|').slice(1).join('|').trim() }] : line.split(/(?<=[.!?])\s+/).map(t => ({ key: t, text: t }))));
    for (const u of units) { const score = tokens(u.key).filter(t => qt.has(t)).length + tokens(u.text).filter(t => qt.has(t)).length * 0.5; if (score >= 1 && (!best || score > best.score)) best = { score, text: u.text, source: s.title }; }
  }
  return best ? { text: best.text, source: best.source } : null;
}

function TestChat({ bot }: { bot: ChatbotConfig }) {
  const { workspaceId, mutate } = useHub();
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 0, from: 'bot', text: bot.welcome }]);
  const [text, setText] = useState('');
  const [lead, setLead] = useState<{ step: 'name' | 'email' | 'phone' | 'done' | null; name: string; email: string; phone: string }>({ step: null, name: '', email: '', phone: '' });
  const [open, setOpen] = useState(true);
  const steps = useMemo(() => (['name', 'email', 'phone'] as const).filter(k => (k === 'name' ? bot.leadCapture.askName : k === 'email' ? bot.leadCapture.askEmail : bot.leadCapture.askPhone)), [bot.leadCapture]);
  const ask = (k: 'name' | 'email' | 'phone') => (k === 'name' ? 'Jak se jmenujete?' : k === 'email' ? 'Na jaký e-mail vám můžeme odpovědět?' : 'A telefon (nepovinné, napište „ne“)?');
  const push = (m: Omit<Msg, 'id'>[]) => setMsgs(x => [...x, ...m.map((y, k) => ({ ...y, id: Date.now() + k }))]);
  const saveLead = (l: typeof lead) => {
    let created = false;
    mutate(d => { const r = upsertContactByEmail(d, workspaceId, { name: l.name || l.email.split('@')[0], email: l.email, phone: l.phone, source: 'Chatbot', tags: bot.leadCapture.tag ? [bot.leadCapture.tag] : [], consentSource: `Chatbot ${bot.name}` }); created = r.created; return logActivity(r.data, workspaceId, r.contact.id, 'chatbot', `Konverzace s chatbotem ${bot.name}`, `${msgs.filter(m => m.from === 'user').length + 1} zpráv · lead z testovacího chatu`, 'chatbot'); });
    toast.success(created ? 'Lead je uložený v CRM jako nový kontakt.' : 'Lead byl připojen k existujícímu kontaktu (stejný e-mail).');
  };
  const send = (e: React.FormEvent) => {
    e.preventDefault(); const t = text.trim(); if (!t) return; setText('');
    const user: Omit<Msg, 'id'> = { from: 'user', text: t };
    if (lead.step && lead.step !== 'done') {
      const l = { ...lead };
      if (lead.step === 'email' && !isEmail(t)) { push([user, { from: 'bot', text: 'Tohle nevypadá jako e-mail. Zkuste to prosím znovu.' }]); return; }
      if (lead.step === 'name') l.name = t; if (lead.step === 'email') l.email = t; if (lead.step === 'phone') l.phone = /^ne$/i.test(t) ? '' : t;
      const next = steps[steps.indexOf(lead.step) + 1];
      if (next) { setLead({ ...l, step: next }); push([user, { from: 'bot', text: ask(next) }]); return; }
      setLead({ ...l, step: 'done' });
      if (l.email) saveLead(l);
      push([user, { from: 'bot', text: l.email ? 'Děkuji, kolegové se vám brzy ozvou.' : 'Děkuji! Bez e-mailu vás bohužel nemůžeme kontaktovat.' }]);
      return;
    }
    if (bot.handoff.enabled && /\b(clovek|cloveka|operator|kolega|kolegu|clovekem)\b/.test(normalize(t))) { push([user, { from: 'bot', text: `Rozumím, předám vás kolegům. Napište nám prosím na ${bot.handoff.email}, nebo nechte kontakt.` }]); if (bot.leadCapture.enabled && steps.length && lead.step === null) { setLead({ ...lead, step: steps[0] }); push([{ from: 'bot', text: ask(steps[0]) }]); } return; }
    const a = answer(bot, t);
    const reply: Omit<Msg, 'id'>[] = [user, a ? { from: 'bot', text: a.text, source: a.source } : { from: 'bot', text: bot.fallback }];
    if (bot.leadCapture.enabled && steps.length && lead.step === null) { setLead({ ...lead, step: steps[0] }); reply.push({ from: 'bot', text: `Můžu vám poslat víc informací. ${ask(steps[0])}` }); }
    push(reply);
  };
  const reset = () => { setMsgs([{ id: 0, from: 'bot', text: bot.welcome }]); setLead({ step: null, name: '', email: '', phone: '' }); };
  return (
    <div className="chat-preview-v2">
      <div className="flex-row spread"><strong>Náhled a testovací chat</strong><Btn onClick={reset}><RotateCcw aria-hidden />Začít znovu</Btn></div>
      <Notice>Ukázka: odpovědi vybírá jednoduché vyhledávání ve znalostní bázi v prohlížeči, ne Claude API. Lead se ale opravdu uloží do CRM.</Notice>
      <div className={`chat-stage ${bot.position === 'Vlevo dole' ? 'left' : 'right'}`}>
        {open ? (
          <div className="chat-widget" style={{ '--bot': bot.color } as React.CSSProperties}>
            <div className="chat-widget-head" style={{ background: bot.color }}>
              <span className="bot-avatar">{bot.avatar}</span>
              <div><h3>{bot.name}</h3><p>{bot.active ? 'Online' : 'Vypnutý (náhled)'}</p></div>
              <button type="button" className="chat-close" aria-label="Zavřít widget" onClick={() => setOpen(false)}><X size={16} aria-hidden /></button>
            </div>
            <div className="chat-messages" aria-live="polite">
              {msgs.map(m => <div key={m.id} className={`chat-message ${m.from === 'user' ? 'user' : ''}`}>{m.text}{m.source && <small className="chat-source">Zdroj: {m.source}</small>}</div>)}
            </div>
            <form className="chat-input" onSubmit={send}>
              <input value={text} onChange={e => setText(e.target.value)} placeholder={bot.placeholder} aria-label="Zpráva pro chatbota" maxLength={500} />
              <button type="submit" className="chat-send" style={{ background: bot.color }} aria-label="Odeslat" disabled={!text.trim()}><Send size={15} aria-hidden /></button>
            </form>
            <div className="chat-widget-foot">Testovací chat · Softema Hub</div>
          </div>
        ) : null}
        <button type="button" className="chat-launcher" style={{ background: bot.color }} onClick={() => setOpen(o => !o)} aria-expanded={open}>{open ? <X size={18} aria-hidden /> : <><Bot size={18} aria-hidden />{bot.launcher}</>}</button>
      </div>
    </div>
  );
}
