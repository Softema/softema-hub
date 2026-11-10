'use client';
/* Account security: two-factor authentication (TOTP + backup codes) and password change, over Better-Auth. */
import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, Download, KeyRound, LogOut, ShieldCheck, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { encode } from 'uqr';
import { PASSWORD_MIN } from '@softema/shared';
import { Badge, Btn, Field, Modal, PageHead } from '../ui';
import { FormError, Notice } from '../kit-core';
import { authCall, message, signOut } from './api';
import './live-account.css';

const PASSWORD_HINT = `Aspoň ${PASSWORD_MIN} znaků. Nejlépe několik slov, která spolu nesouvisí.`;

/** The key from the otpauth URI, in groups of four for typing into an authenticator app. */
const keyOf = (uri: string) => (new URL(uri).searchParams.get('secret') ?? '').match(/.{1,4}/g)?.join(' ') ?? '';

/**
 * QR code of the otpauth URI, generated in the browser: the secret never goes to any service.
 * Drawn as one SVG path from the module matrix; always dark on white so phones can read it in dark mode too.
 */
function TotpQr({ uri }: { uri: string }) {
  const { data, size } = React.useMemo(() => encode(uri, { ecc: 'M', border: 2 }), [uri]);
  const d = data.flatMap((row, y) => row.map((on, x) => (on ? `M${x} ${y}h1v1h-1z` : ''))).join('');
  return (
    <svg className="totp-qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="QR kód pro autentizační aplikaci" shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" /><path d={d} fill="#000" />
    </svg>
  );
}

function saveCodes(codes: string[]) {
  const blob = new Blob([`Softema Hub: záložní kódy pro dvoufázové ověření\nKaždý kód platí jen jednou.\n\n${codes.join('\n')}\n`], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'softema-hub-zalozni-kody.txt'; a.click(); URL.revokeObjectURL(a.href);
}

export function BackupCodes({ codes }: { codes: string[] }) {
  const copy = async () => { try { await navigator.clipboard.writeText(codes.join('\n')); toast.success('Kódy jsou zkopírované.'); } catch { toast.error('Kopírování se nepodařilo. Kódy si opište nebo stáhněte.'); } };
  return (
    <div className="stack-sm">
      <Notice tone="warn">Uložte si kódy na bezpečné místo, třeba do správce hesel. Když přijdete o telefon, přihlásíte se jedním z nich. Každý platí jen jednou a znovu je neuvidíte.</Notice>
      <ul className="backup-codes mono" aria-label="Záložní kódy">{codes.map(c => <li key={c}>{c}</li>)}</ul>
      <div className="account-row"><Btn type="button" onClick={() => saveCodes(codes)}><Download aria-hidden />Stáhnout jako soubor</Btn><Btn type="button" onClick={() => void copy()}><Copy aria-hidden />Kopírovat</Btn></div>
    </div>
  );
}

/** Enabling 2FA: password, then a key for the authenticator app, then a code that proves it works, then backup codes. */
export function TwoFactorSetup({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const qc = useQueryClient();
  const [step, setStep] = useState<'password' | 'scan' | 'codes'>('password');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState<{ totpURI: string; backupCodes: string[] } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(''); try { await fn(); } catch (e) { setError(message(e)); } finally { setBusy(false); } };

  if (step === 'password') return (
    <form className="stack" onSubmit={e => { e.preventDefault(); void run(async () => { setSetup(await authCall('/two-factor/enable', { password })); setPassword(''); setStep('scan'); }); }}>
      <Field label="Současné heslo"><input type="password" autoComplete="current-password" value={password} onChange={e => { setPassword(e.target.value); setError(''); }} required autoFocus /></Field>
      <FormError>{error}</FormError>
      <div className="account-row"><Btn primary type="submit" disabled={busy || !password} aria-busy={busy}>{busy ? 'Ověřuji…' : 'Pokračovat'}</Btn>{onCancel && <Btn type="button" onClick={onCancel}>Zrušit</Btn>}</div>
    </form>
  );
  if (step === 'scan' && setup) return (
    <form className="stack" onSubmit={e => { e.preventDefault(); void run(async () => { await authCall('/two-factor/verify-totp', { code: code.replace(/\s/g, '') }); setStep('codes'); }); }}>
      <ol className="totp-steps">
        <li>Otevřete v telefonu autentizační aplikaci, například Google Authenticator, Microsoft Authenticator nebo 1Password.</li>
        <li>Přidejte nový účet a naskenujte QR kód:<br /><TotpQr uri={setup.totpURI} /><br />Skenovat nejde? Zadejte v aplikaci ručně tento klíč:<br /><code className="totp-key mono" aria-label="Klíč pro autentizační aplikaci">{keyOf(setup.totpURI)}</code><br /><a href={setup.totpURI} className="small"><Smartphone size={14} aria-hidden className="inline" /> Na telefonu otevřít rovnou v aplikaci</a></li>
        <li>Opište šestimístný kód, který aplikace ukáže.</li>
      </ol>
      <Field label="Ověřovací kód"><input inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={e => { setCode(e.target.value); setError(''); }} placeholder="123456" required autoFocus /></Field>
      <FormError>{error}</FormError>
      <div className="account-row"><Btn primary type="submit" disabled={busy || !code} aria-busy={busy}>{busy ? 'Ověřuji…' : 'Zapnout ověření'}</Btn>{onCancel && <Btn type="button" onClick={onCancel}>Zrušit</Btn>}</div>
    </form>
  );
  return (
    <div className="stack">
      <p role="status"><strong>Dvoufázové ověření je zapnuté.</strong> Při příštím přihlášení zadáte kromě hesla i kód z aplikace.</p>
      {setup && <BackupCodes codes={setup.backupCodes} />}
      <div className="account-row"><Btn primary onClick={() => { void qc.invalidateQueries({ queryKey: ['me'] }); onDone(); }}>Kódy mám uložené, pokračovat</Btn></div>
    </div>
  );
}

/** Small password confirmation for sensitive actions. */
function PasswordPrompt({ title, desc, action, danger, onConfirm, onClose }: { title: string; desc: string; action: string; danger?: boolean; onConfirm: (password: string) => Promise<void>; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await onConfirm(password); } catch (err) { setError(message(err)); setBusy(false); }
  };
  return (
    <Modal open onClose={() => { if (!busy) onClose(); }} title={title} desc={desc}>
      <form onSubmit={e => void submit(e)}>
        <fieldset disabled={busy} className="contents">
          <div className="stack"><Field label="Současné heslo"><input type="password" autoComplete="current-password" value={password} onChange={e => { setPassword(e.target.value); setError(''); }} required autoFocus /></Field><FormError>{error}</FormError></div>
          <div className="form-actions"><Btn type="button" onClick={onClose}>Zrušit</Btn><Btn primary className={danger ? 'danger' : ''} type="submit" aria-busy={busy}>{busy ? 'Ověřuji…' : action}</Btn></div>
        </fieldset>
      </form>
    </Modal>
  );
}

function ChangePassword() {
  const blank = { current: '', next: '', again: '' };
  const [v, setV] = useState(blank);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof blank>) => { setV(x => ({ ...x, ...p })); setError(''); };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (v.next.length < PASSWORD_MIN) { setError(`Nové heslo musí mít aspoň ${PASSWORD_MIN} znaků.`); return; }
    if (v.next !== v.again) { setError('Nová hesla se neshodují.'); return; }
    setBusy(true);
    try { await authCall('/change-password', { currentPassword: v.current, newPassword: v.next, revokeOtherSessions: true }); setV(blank); toast.success('Heslo bylo změněno. Ostatní přihlášená zařízení jsme odhlásili.'); }
    catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  };
  return (
    <form className="stack" onSubmit={e => void submit(e)}>
      <fieldset disabled={busy} className="contents">
        <Field label="Současné heslo"><input type="password" autoComplete="current-password" value={v.current} onChange={e => set({ current: e.target.value })} required /></Field>
        <div className="form-grid">
          <Field label="Nové heslo" hint={PASSWORD_HINT}><input type="password" autoComplete="new-password" minLength={PASSWORD_MIN} maxLength={128} value={v.next} onChange={e => set({ next: e.target.value })} required /></Field>
          <Field label="Nové heslo znovu"><input type="password" autoComplete="new-password" value={v.again} onChange={e => set({ again: e.target.value })} required /></Field>
        </div>
        <FormError>{error}</FormError>
        <div className="account-row"><Btn primary type="submit" aria-busy={busy}>{busy ? 'Ukládám…' : 'Změnit heslo'}</Btn></div>
      </fieldset>
    </form>
  );
}

export function LiveSecurity({ enabled, required }: { enabled: boolean; required: boolean }) {
  const qc = useQueryClient();
  const [setup, setSetup] = useState(false);
  const [prompt, setPrompt] = useState<'disable' | 'codes' | null>(null);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  return (
    <div className="page">
      <PageHead title="Zabezpečení účtu" desc="Přihlášení do Softema Hub chrání heslo a u správců také kód z telefonu." />
      <div className="account-grid">
        <section className="panel account-section" aria-labelledby="sec-2fa">
          <div className="account-row"><h2 id="sec-2fa"><ShieldCheck size={18} aria-hidden className="inline" /> Dvoufázové ověření</h2><Badge tone={enabled ? 'green' : 'gray'}>{enabled ? 'Zapnuto' : 'Vypnuto'}</Badge></div>
          <p>Kromě hesla zadáte při přihlášení šestimístný kód z autentizační aplikace v telefonu. {required ? 'Pro správce je povinné.' : 'Pro členy týmu je dobrovolné, ale doporučené.'}</p>
          {!enabled && (setup
            ? <TwoFactorSetup onDone={() => { setSetup(false); toast.success('Dvoufázové ověření je zapnuté.'); }} onCancel={() => setSetup(false)} />
            : <div className="account-row"><Btn primary onClick={() => setSetup(true)}><ShieldCheck aria-hidden />Zapnout dvoufázové ověření</Btn></div>)}
          {enabled && (newCodes
            ? <><BackupCodes codes={newCodes} /><div className="account-row"><Btn onClick={() => setNewCodes(null)}>Hotovo</Btn></div></>
            : <div className="account-row">
                <Btn onClick={() => setPrompt('codes')}><KeyRound aria-hidden />Vygenerovat nové záložní kódy</Btn>
                {!required && <Btn className="danger-ghost" onClick={() => setPrompt('disable')}>Vypnout ověření</Btn>}
              </div>)}
          {enabled && required && <p className="small muted">Správci ověření vypnout nemohou. Při ztrátě telefonu se přihlaste záložním kódem a zapněte ověření na novém telefonu.</p>}
        </section>
        <section className="panel account-section" aria-labelledby="sec-pass">
          <h2 id="sec-pass">Heslo</h2>
          <p>Po změně hesla vás na ostatních zařízeních odhlásíme.</p>
          <ChangePassword />
        </section>
      </div>
      {prompt === 'codes' && <PasswordPrompt title="Nové záložní kódy" desc="Původní záložní kódy přestanou platit." action="Vygenerovat" onClose={() => setPrompt(null)}
        onConfirm={async password => { const r = await authCall<{ backupCodes: string[] }>('/two-factor/generate-backup-codes', { password }); setNewCodes(r.backupCodes); setPrompt(null); }} />}
      {prompt === 'disable' && <PasswordPrompt title="Vypnout dvoufázové ověření?" desc="K přihlášení pak bude stačit heslo." action="Vypnout ověření" danger onClose={() => setPrompt(null)}
        onConfirm={async password => { await authCall('/two-factor/disable', { password }); setPrompt(null); await qc.invalidateQueries({ queryKey: ['me'] }); toast.success('Dvoufázové ověření je vypnuté.'); }} />}
    </div>
  );
}

/** Administrators without 2FA see only this until they turn it on; the API refuses them any data anyway. */
export function ForcedTwoFactor({ name }: { name: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="page">
      <section className="panel account-section forced-2fa" aria-labelledby="forced-title">
        <h2 id="forced-title"><ShieldCheck size={18} aria-hidden className="inline" /> Zapněte si dvoufázové ověření</h2>
        <p>{name.split(' ')[0]}, jako správce máte přístup k datům celého prostoru. Proto u vás kromě hesla vyžadujeme i kód z telefonu. Nastavení zabere asi dvě minuty.</p>
        {done ? <p role="status">Načítám aplikaci…</p> : <TwoFactorSetup onDone={() => setDone(true)} />}
        <div className="account-row"><Btn onClick={() => void signOut()}><LogOut aria-hidden />Odhlásit se</Btn></div>
      </section>
    </div>
  );
}
