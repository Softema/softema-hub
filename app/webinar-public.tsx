'use client';
/* Public-facing previews of a webinar: the registration page (working local registration → CRM without
   duplicates) and the participant view (waiting room, simulated live room with chat, replay). */
import React, { useState } from 'react';
import { ArrowLeft, CalendarClock, CheckCircle2, Clock, MessageSquare, PlayCircle, Send, User, Users } from 'lucide-react';
import { toast } from 'sonner';
import { DAY, fmtDate, fmtDateTime, isEmail, plural, relTime } from '@/lib/hub/format';
import { webinarState } from '@/lib/hub/logic';
import { logActivity, registerForWebinar } from '@/lib/hub/ops';
import type { Webinar } from '@/lib/hub/types';
import { useHub } from './state';
import { Btn, Field, Pick } from './ui';
import { FormError, Notice, useRoute } from './kit';
import { Art } from './learn-shared';

function Frame({ x, label, children }: { x: Webinar; label: string; children: React.ReactNode }) {
  const { go } = useHub();
  return (
    <div className="player-page">
      <div className="preview-banner" role="note">
        <span><strong>{label}</strong> · softema.cz/w/{x.slug}</span>
        <Btn onClick={() => go('webinare/' + x.id)}><ArrowLeft aria-hidden />Zpět do správy</Btn>
      </div>
      {children}
    </div>
  );
}
function useWebinar(id: string) { const { w } = useHub(); return w.webinars.find(v => v.id === id); }
function Missing() { const { go } = useHub(); return <div className="page"><section className="panel empty"><h3>Webinář nenalezen</h3><Btn primary onClick={() => go('webinare')}>Zpět na webináře</Btn></section></div>; }

export function RegistrationPage({ id }: { id: string }) {
  const x = useWebinar(id);
  const { workspaceId, mutate, settings, w } = useHub();
  const [now] = useState(() => Date.now());
  const [v, setV] = useState({ name: '', email: '', consent: false, session: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState<null | { duplicate: boolean; created: boolean; name: string }>(null);
  if (!x) return <Missing />;
  const s = webinarState(x, now);
  const open = x.published && !x.cancelled && (s === 'Naplánováno' || s === 'Evergreen' || s === 'Probíhá');
  const count = w.registrations.filter(r => r.webinarId === x.id).length;
  const sessions = x.sessions.map(t => [t, `Dnes nebo zítra v ${t}`] as [string, string]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!v.name.trim()) return setError('Vyplňte jméno.');
    if (!isEmail(v.email)) return setError('Zadejte platný e-mail.');
    if (x.kind === 'evergreen' && !v.session) return setError('Vyberte čas vysílání.');
    let result: ReturnType<typeof registerForWebinar> | undefined;
    mutate(d => {
      result = registerForWebinar(d, workspaceId, x.id, { name: v.name, email: v.email, source: 'Registrační stránka', consent: v.consent, session: v.session || undefined });
      return result.duplicate ? result.data : logActivity(result.data, workspaceId, result.contact.id, 'form', 'Odeslán registrační formulář', x.title, 'webinare/' + x.id);
    });
    if (!result) return;
    setDone({ duplicate: result.duplicate, created: result.createdContact, name: result.contact.name });
    toast.success(result.duplicate ? 'Tento e-mail už je na webinář registrovaný.' : 'Registrace proběhla.', { description: result.createdContact ? 'V CRM vznikl nový kontakt.' : 'Registrace se připojila k existujícímu kontaktu.' });
  };
  return (
    <Frame x={x} label="Náhled registrační stránky">
      <div className="landing">
        <div className="landing-hero">
          <Art accent={x.accent} image={x.image} eyebrow={x.kind === 'live' ? 'Živý webinář zdarma' : 'Webinář ze záznamu'} title={x.title} />
          <div className="landing-meta">
            <span><CalendarClock size={16} aria-hidden />{x.kind === 'live' ? fmtDateTime(x.startsAt) : `Každý den ${x.sessions.join(' a ')}`}</span>
            <span><Clock size={16} aria-hidden />{x.durationMin} minut</span>
            <span><User size={16} aria-hidden />{x.host}</span>
            <span><Users size={16} aria-hidden />{plural(count, 'registrovaný', 'registrovaní', 'registrovaných')}</span>
          </div>
          {x.description && <p className="landing-desc">{x.description}</p>}
        </div>
        <section className="landing-form" aria-labelledby="reg-title">
          {done ? (
            <div className="landing-done" role="status">
              <CheckCircle2 size={36} aria-hidden />
              <h2 id="reg-title">{done.duplicate ? 'Už jste registrovaní' : 'Registrace je potvrzená'}</h2>
              <p>{done.duplicate ? 'Na tento e-mail už registrace existuje. Nic dalšího není potřeba.' : `Díky, ${done.name.split(' ')[0]}. Potvrzení a odkaz do místnosti by přišly e-mailem (v prototypu se e-maily neodesílají).`}</p>
              <Btn onClick={() => { setDone(null); setV({ name: '', email: '', consent: false, session: '' }); }}>Registrovat další osobu</Btn>
            </div>
          ) : open ? (
            <form onSubmit={submit} noValidate className="stack">
              <h2 id="reg-title">Rezervujte si místo</h2>
              <Field label="Jméno a příjmení"><input value={v.name} onChange={e => { setV({ ...v, name: e.target.value }); setError(''); }} autoComplete="name" /></Field>
              <Field label="E-mail"><input type="email" value={v.email} onChange={e => { setV({ ...v, email: e.target.value }); setError(''); }} autoComplete="email" /></Field>
              {x.kind === 'evergreen' && <Field label="Čas vysílání"><Pick value={v.session} onChange={t => setV({ ...v, session: t })} options={sessions} className="full" label="Čas vysílání" /></Field>}
              <label className="check-row"><input type="checkbox" checked={v.consent} onChange={e => setV({ ...v, consent: e.target.checked })} /><span>Chci dostávat novinky e-mailem (nepovinné, lze kdykoli odhlásit).</span></label>
              <FormError>{error}</FormError>
              <Btn primary type="submit"><Send aria-hidden />Registrovat se zdarma</Btn>
              <small className="muted">Správce údajů: {settings.company?.legalName || settings.name}. Registrace slouží k zaslání odkazu a připomínek.</small>
            </form>
          ) : (
            <div className="landing-done">
              <h2 id="reg-title">{x.cancelled ? 'Webinář byl zrušen' : !x.published ? 'Stránka zatím není zveřejněná' : 'Webinář už proběhl'}</h2>
              <p>{x.cancelled ? 'Registrace jsou uzavřené.' : !x.published ? 'Po publikování webináře začne stránka přijímat registrace.' : `Záznam je pro registrované dostupný do ${fmtDate(new Date(+new Date(x.startsAt) + x.replayDays * DAY).toISOString())}.`}</p>
            </div>
          )}
        </section>
      </div>
    </Frame>
  );
}

type Msg = { id: number; who: string; text: string; me?: boolean };
export function WebinarRoom({ id }: { id: string }) {
  const x = useWebinar(id);
  const { w, workspaceId, mutate } = useHub();
  const { query, setQuery } = useRoute();
  const [now] = useState(() => Date.now());
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 1, who: 'Moderátor', text: 'Vítejte! Otázky pište sem do chatu.' }, { id: 2, who: 'Petra', text: 'Dobrý den ze Brna 👋' }]);
  const [text, setText] = useState('');
  if (!x) return <Missing />;
  const s = webinarState(x, now);
  const regs = w.registrations.filter(r => r.webinarId === x.id);
  const contacts = new Map(w.contacts.map(c => [c.id, c]));
  const reg = regs.find(r => String(r.contactId) === query.get('ucastnik')) ?? regs[0];
  const me = reg ? contacts.get(reg.contactId) : undefined;
  const start = +new Date(x.startsAt);
  const replayEnd = start + x.durationMin * 60_000 + x.replayDays * DAY;
  const phase = s === 'Probíhá' || s === 'Evergreen' ? 'live' : s === 'Naplánováno' ? 'waiting' : s === 'Proběhlo' ? (now < replayEnd ? 'replay' : 'expired') : 'closed';
  const watch = () => {
    if (!reg) return;
    mutate(d => logActivity({ ...d, registrations: d.registrations.map(r => (r.workspaceId === workspaceId && r.id === reg.id ? (phase === 'replay' ? { ...r, replay: true } : { ...r, attended: true, watchMinutes: Math.max(r.watchMinutes, Math.round(x.durationMin * 0.8)) }) : r)) }, workspaceId, reg.contactId, 'webinar', phase === 'replay' ? 'Shlédnut záznam webináře' : 'Účast na webináři', x.title, 'webinare/' + x.id));
    toast.success(phase === 'replay' ? 'Zhlédnutí záznamu je zapsané u kontaktu.' : 'Účast je zapsaná u kontaktu.');
  };
  return (
    <Frame x={x} label="Pohled účastníka">
      <div className="room-head">
        <span className="small muted">Zobrazit jako</span>
        <Pick value={reg ? String(reg.contactId) : ''} onChange={v => setQuery({ ucastnik: v })} options={regs.length ? regs.slice(0, 50).map(r => [String(r.contactId), contacts.get(r.contactId)?.name ?? 'Smazaný kontakt'] as [string, string]) : [['', 'Žádný registrovaný']]} label="Účastník" />
      </div>
      <div className="room">
        <div className="room-stage">
          {phase === 'waiting' && <div className="room-wait"><CalendarClock size={40} aria-hidden /><h2>Vysílání začne {relTime(x.startsAt, now)}</h2><p>{fmtDateTime(x.startsAt)} · {x.host}</p><small>Odkaz do místnosti dostane účastník v připomínce 1 h předem.</small></div>}
          {(phase === 'live' || phase === 'replay') && (
            <div className="player-video">
              <PlayCircle size={56} aria-hidden />
              <span>{phase === 'live' ? (x.kind === 'evergreen' ? 'Evergreen vysílání (simulované živě)' : 'Živé vysílání') : 'Záznam webináře'}</span>
              <small>{x.video.source}{x.video.url ? ` · ${x.video.url}` : ''}. Skutečné video ({x.kind === 'live' ? 'LiveKit, záznam v Mux' : 'Mux'}) se zapojí s backendem.</small>
              {me && <Btn primary onClick={watch}>{phase === 'replay' ? 'Simulovat zhlédnutí záznamu' : 'Simulovat účast'}</Btn>}
            </div>
          )}
          {phase === 'expired' && <div className="room-wait"><h2>Záznam už není dostupný</h2><p>Platnost záznamu skončila {fmtDate(new Date(replayEnd).toISOString())}.</p></div>}
          {phase === 'closed' && <div className="room-wait"><h2>{x.cancelled ? 'Webinář byl zrušen' : 'Webinář není zveřejněný'}</h2></div>}
          <h1 className="room-title">{x.title}</h1>
          {me && <p className="small muted">Přihlášen(a) jako {me.name} · {reg?.attended ? `účast ${reg.watchMinutes} min` : reg?.replay ? 'záznam zhlédnut' : 'registrace'}</p>}
        </div>
        <aside className="room-chat" aria-label="Chat">
          <h2><MessageSquare size={16} aria-hidden />Chat {phase === 'live' ? '' : '(dostupný při vysílání)'}</h2>
          <ul>{msgs.map(m => <li key={m.id} className={m.me ? 'me' : ''}><strong>{m.who}</strong>{m.text}</li>)}</ul>
          <form onSubmit={e => { e.preventDefault(); if (!text.trim()) return; setMsgs(m => [...m, { id: Date.now(), who: me?.name.split(' ')[0] ?? 'Já', text: text.trim(), me: true }]); setText(''); }}>
            <input value={text} onChange={e => setText(e.target.value)} placeholder="Napište zprávu…" aria-label="Zpráva do chatu" disabled={phase !== 'live'} />
            <Btn type="submit" primary disabled={phase !== 'live' || !text.trim()} aria-label="Odeslat zprávu"><Send aria-hidden /></Btn>
          </form>
          <Notice>Chat v náhledu není ukládaný ani sdílený.</Notice>
        </aside>
      </div>
    </Frame>
  );
}
