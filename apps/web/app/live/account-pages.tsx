'use client';
/* Pages opened from e-mail links: new password and invitation. The one-time token arrives in the URL fragment,
   which the browser never sends to a server; it is moved out of the address bar right away. */
import React, { useEffect, useState } from 'react';
import { ArrowRight, CircleCheck, KeyRound, LogOut, MailWarning, UserPlus } from 'lucide-react';
import { type InvitationPreviewDto, PASSWORD_MIN, ROLE_LABEL } from '@softema/shared';
import { AccessFrame, useHydrated } from '../access';
import { ApiFailure, acceptInvitation, authCall, message, previewInvitation, signOut } from './api';
import { LIVE_WORKSPACE_KEY } from './live-state';
import { signIn } from './sign-in';

const INVITE_KEY = 'softema-hub:live:invitation';

/** Reads the token once and removes it from the address bar and history. */
function useFragmentToken(storageKey?: string) {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let t = decodeURIComponent(window.location.hash.slice(1)) || null;
    try {
      if (storageKey && t) sessionStorage.setItem(storageKey, t);
      if (storageKey && !t) t = sessionStorage.getItem(storageKey);
    } catch { /* private mode: the token from the link still works on this page */ }
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the fragment exists only in the browser
    setToken(t);
  }, [storageKey]);
  return token;
}

function Heading({ icon, eyebrow, title, intro }: { icon: React.ReactNode; eyebrow: string; title: string; intro: string }) {
  return <><span className="a-large-icon">{icon}</span><span className="m-eyebrow">{eyebrow}</span><h1>{title}</h1><p className="a-intro">{intro}</p></>;
}

function PasswordFields({ value, again, onChange, onAgain, disabled }: { value: string; again: string; onChange: (v: string) => void; onAgain: (v: string) => void; disabled: boolean }) {
  return <>
    <label className="a-field" htmlFor="new-password">Nové heslo<input disabled={disabled} id="new-password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} maxLength={128} value={value} onChange={e => onChange(e.target.value)} required aria-describedby="password-hint" /><small id="password-hint">Aspoň {PASSWORD_MIN} znaků. Nejlépe několik slov, která spolu nesouvisí.</small></label>
    <label className="a-field" htmlFor="new-password-again">Heslo znovu<input disabled={disabled} id="new-password-again" type="password" autoComplete="new-password" maxLength={128} value={again} onChange={e => onAgain(e.target.value)} required /></label>
  </>;
}
const checkPasswords = (a: string, b: string) => (a.length < PASSWORD_MIN ? `Heslo musí mít aspoň ${PASSWORD_MIN} znaků.` : a !== b ? 'Hesla se neshodují.' : '');

export function ResetPasswordPage() {
  const token = useFragmentToken();
  const ready = useHydrated();
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const invalid = checkPasswords(password, again);
    if (invalid) { setError(invalid); return; }
    setBusy(true); setError('');
    try { await authCall('/reset-password', { token, newPassword: password }); setPassword(''); setAgain(''); setDone(true); }
    catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  };
  if (token === undefined) return <AccessFrame><p role="status">Načítám…</p></AccessFrame>;
  if (!token) return <AccessFrame><Heading icon={<MailWarning />} eyebrow="OBNOVA PŘÍSTUPU" title="Odkaz je neúplný." intro="Otevřete prosím celý odkaz z e-mailu, nebo požádejte o nový." /><a className="m-btn m-primary a-submit" href="/obnova-hesla">Požádat o nový odkaz<ArrowRight size={18} /></a></AccessFrame>;
  if (done) return <AccessFrame><Heading icon={<CircleCheck />} eyebrow="OBNOVA PŘÍSTUPU" title="Heslo je změněné." intro="Ze všech zařízení jsme vás odhlásili. Přihlaste se novým heslem." /><a className="m-btn m-primary a-submit" href="/prihlaseni">Přihlásit se<ArrowRight size={18} /></a></AccessFrame>;
  return (
    <AccessFrame>
      <Heading icon={<KeyRound />} eyebrow="OBNOVA PŘÍSTUPU" title="Nastavte si nové heslo." intro="Po uložení vás odhlásíme ze všech zařízení." />
      <form className="a-form" onSubmit={e => void submit(e)}>
        <PasswordFields value={password} again={again} onChange={v => { setPassword(v); setError(''); }} onAgain={v => { setAgain(v); setError(''); }} disabled={!ready || busy} />
        {error && <p role="alert" className="a-error">{error}{/neplatný|vypršel/.test(error) && <> <a href="/obnova-hesla">Požádat o nový odkaz</a></>}</p>}
        <button className="m-btn m-primary a-submit" type="submit" disabled={!ready || busy} aria-busy={busy}>{busy ? 'Ukládám…' : 'Uložit nové heslo'}<ArrowRight size={18} /></button>
      </form>
    </AccessFrame>
  );
}

export function InvitationPage() {
  const token = useFragmentToken(INVITE_KEY);
  const ready = useHydrated();
  const [preview, setPreview] = useState<InvitationPreviewDto | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [wrongAccount, setWrongAccount] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    previewInvitation(token).then(setPreview, setLoadError);
  }, [token]);

  const finish = (workspaceId: string) => {
    try { sessionStorage.removeItem(INVITE_KEY); localStorage.setItem(LIVE_WORKSPACE_KEY, workspaceId); } catch { /* private mode */ }
    window.location.assign('/aplikace');
  };
  const accept = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setWrongAccount(false);
    if (!token || !preview) return;
    if (!preview.accountExists) { const invalid = (!name.trim() && 'Vyplňte jméno a příjmení.') || checkPasswords(password, again); if (invalid) { setError(invalid); return; } }
    setBusy(true);
    try {
      const r = await acceptInvitation(preview.accountExists ? { token } : { token, name: name.trim(), password });
      if (r.accountCreated) {
        const s = await signIn(r.email, password);
        setPassword(''); setAgain('');
        if (!('ok' in s)) { window.location.assign('/prihlaseni'); return; }
      }
      finish(r.workspaceId);
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiFailure && err.code === 'SIGN_IN_REQUIRED') { window.location.assign('/prihlaseni?dalsi=pozvanka'); return; }
      if (err instanceof ApiFailure && err.code === 'FORBIDDEN') setWrongAccount(true);
      setError(message(err));
    }
  };

  if (token === undefined) return <AccessFrame><p role="status">Načítám…</p></AccessFrame>;
  const gone = !token || (loadError instanceof ApiFailure && (loadError.code === 'INVITATION_INVALID' || loadError.status === 422));
  if (gone) return <AccessFrame><Heading icon={<MailWarning />} eyebrow="POZVÁNKA DO TÝMU" title="Pozvánka už neplatí." intro="Pozvánka byla použita, zrušena, nebo vypršela (platí 7 dní). Požádejte správce prostoru o novou." /><a className="m-btn m-secondary a-submit" href="/prihlaseni">Přejít na přihlášení<ArrowRight size={18} /></a></AccessFrame>;
  if (loadError) return <AccessFrame><Heading icon={<MailWarning />} eyebrow="POZVÁNKA DO TÝMU" title="Pozvánku se nepodařilo načíst." intro={message(loadError)} /><button type="button" className="m-btn m-primary a-submit" onClick={() => { setLoadError(null); void previewInvitation(token).then(setPreview, setLoadError); }}>Zkusit znovu<ArrowRight size={18} /></button></AccessFrame>;
  if (!preview) return <AccessFrame><p role="status">Načítám pozvánku…</p></AccessFrame>;
  return (
    <AccessFrame>
      <Heading icon={<UserPlus />} eyebrow="POZVÁNKA DO TÝMU" title={`Připojte se k prostoru ${preview.workspaceName}.`}
        intro={preview.accountExists ? `K adrese ${preview.email} už máte účet. Pozvánku přijmete po přihlášení.` : `Pozvánka je pro ${preview.email} s rolí ${ROLE_LABEL[preview.role]}. Založte si účet.`} />
      <form className="a-form" onSubmit={e => void accept(e)}>
        {!preview.accountExists && <>
          <label className="a-field" htmlFor="invite-email">E-mail<input id="invite-email" type="email" value={preview.email} readOnly autoComplete="username" /></label>
          <label className="a-field" htmlFor="invite-name">Jméno a příjmení<input disabled={!ready || busy} id="invite-name" autoComplete="name" placeholder="Jan Novák" value={name} onChange={e => { setName(e.target.value); setError(''); }} required maxLength={200} /></label>
          <PasswordFields value={password} again={again} onChange={v => { setPassword(v); setError(''); }} onAgain={v => { setAgain(v); setError(''); }} disabled={!ready || busy} />
          {preview.role === 'workspace_admin' && <p className="a-demo-explanation">Jako správce si po přihlášení zapnete dvoufázové ověření. Připravte si telefon s autentizační aplikací.</p>}
        </>}
        {error && <p role="alert" className="a-error">{error}</p>}
        <button className="m-btn m-primary a-submit" type="submit" disabled={!ready || busy} aria-busy={busy}>{busy ? 'Přijímám…' : preview.accountExists ? 'Přijmout pozvánku' : 'Založit účet a přijmout'}<ArrowRight size={18} /></button>
        {wrongAccount && <button type="button" className="a-link-button" onClick={() => void signOut()}><LogOut size={15} />Odhlásit se a přihlásit jako {preview.email}</button>}
      </form>
    </AccessFrame>
  );
}
