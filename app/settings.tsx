'use client';
/* Settings: profile, workspace & company, branding & client portal, team & roles, sending domains & senders,
   integrations (no secrets in the browser), notifications and "Data a obnova" (export, reset demo data). */
import React, { useState } from 'react';
import { Check, Copy, Database, Download, Globe, ImagePlus, KeyRound, Mail, MoreHorizontal, Plus, RefreshCcw, RotateCcw, ShieldCheck, Trash2, Upload, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { fmt, fmtDate, fmtDateTime, isEmail, newId } from '@/lib/hub/format';
import { demoWorkspaces } from '@/lib/domain/tenancy';
import { hubStore, parseExport, SCHEMA_VERSION } from '@/lib/hub/store';
import type { DnsRecord, IntegrationKey, Role, SendingDomain, TeamMember, UserProfile, WorkspaceSettings } from '@/lib/hub/types';
import { useHub, useUnsavedGuard } from './state';
import { Avatar, Badge, Btn, Field, IconBtn, Modal, PageHead, Pick } from './ui';
import { FormError, ImagePicker, Notice, Section, ToggleRow, download, readImage, useConfirm, useRoute } from './kit';

const SECTIONS: [string, string][] = [['profil', 'Můj profil'], ['prostor', 'Pracovní prostor'], ['branding', 'Branding a portál'], ['tym', 'Tým a role'], ['domeny', 'E-mailové domény'], ['integrace', 'Integrace'], ['notifikace', 'Notifikace'], ['data', 'Data a obnova']];
export const ROLE_LABEL: Record<Role, string> = { agency_admin: 'Správce agentury', workspace_admin: 'Správce prostoru', member: 'Člen týmu' };
const ROLE_DESC: Record<Role, string> = { agency_admin: 'Všechny prostory agentury, zakládání prostorů, fakturace agentury.', workspace_admin: 'Celý tento prostor včetně týmu, domén a integrací.', member: 'Práce s kontakty, kampaněmi a obsahem. Bez nastavení a plateb.' };
const COLORS = ['orange', 'blue', 'green', 'pink', 'purple'];

export default function SettingsPage() {
  const { parts } = useRoute();
  const { go } = useHub();
  const sec = SECTIONS.some(s => s[0] === parts[1]) ? parts[1] : 'profil';
  return (
    <div className="page">
      <PageHead title="Nastavení" desc="Profil, pracovní prostor, tým a integrace. Vše se ukládá jen v tomto prohlížeči." />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Sekce nastavení">
          {SECTIONS.map(([id, label]) => <button key={id} type="button" className={sec === id ? 'active' : ''} aria-current={sec === id ? 'page' : undefined} onClick={() => go('nastaveni/' + id)}>{label}</button>)}
        </nav>
        <div className="settings-main">
          {sec === 'profil' && <Profile />}
          {sec === 'prostor' && <Workspace />}
          {sec === 'branding' && <Branding />}
          {sec === 'tym' && <Team />}
          {sec === 'domeny' && <Domains />}
          {sec === 'integrace' && <Integrations />}
          {sec === 'notifikace' && <Notifications />}
          {sec === 'data' && <DataReset />}
        </div>
      </div>
    </div>
  );
}

function SaveBar({ dirty, onReset, onSave }: { dirty: boolean; onReset: () => void; onSave: () => void }) {
  return <div className="form-actions"><Btn onClick={onReset} disabled={!dirty}>Zahodit změny</Btn><Btn primary onClick={onSave} disabled={!dirty}><Check aria-hidden />Uložit</Btn></div>;
}

function Profile() {
  const { profile, updateProfile } = useHub();
  const [v, setV] = useState<UserProfile>(profile);
  const [error, setError] = useState('');
  const dirty = JSON.stringify(v) !== JSON.stringify(profile);
  useUnsavedGuard(dirty, 'Profil má neuložené změny.');
  const save = () => {
    if (!v.name.trim()) return setError('Vyplňte jméno.');
    if (!isEmail(v.email)) return setError('Zadejte platný e-mail.');
    updateProfile(() => ({ ...v, name: v.name.trim() })); toast.success('Profil byl uložen.');
  };
  return (
    <Section title="Můj profil" desc="Jméno a fotka se zobrazují v aplikaci a u poznámek.">
      <div className="sec-body stack">
        <div className="avatar-edit">
          <Avatar name={v.name || '?'} color={v.color} size="lg" src={v.photo?.dataUrl} />
          <div>
            <div className="flex-row wrap">
              <label className="hub-btn file-btn"><input type="file" accept="image/*" className="sr-only" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) readImage(f).then(photo => { setV(x => ({ ...x, photo })); setError(''); }, (err: Error) => setError(err.message)); }} /><ImagePlus aria-hidden />{v.photo ? 'Změnit fotku' : 'Nahrát fotku'}</label>
              {v.photo && <Btn onClick={() => setV(x => ({ ...x, photo: undefined }))}>Odebrat fotku</Btn>}
            </div>
            {!v.photo && <div className="flex-row wrap">{COLORS.map(c => <button key={c} type="button" className={`color-dot ${c} ${v.color === c ? 'on' : ''}`} aria-label={`Barva avataru ${c}`} aria-pressed={v.color === c} onClick={() => setV({ ...v, color: c })} />)}</div>}
            <small className="muted">Fotka se uloží jen v tomto prohlížeči (max. 400 kB). Bez fotky se zobrazí iniciály.</small>
          </div>
        </div>
        <div className="form-grid">
          <Field label="Jméno a příjmení"><input value={v.name} onChange={e => { setV({ ...v, name: e.target.value }); setError(''); }} /></Field>
          <Field label="Pozice"><input value={v.title} onChange={e => setV({ ...v, title: e.target.value })} /></Field>
          <Field label="E-mail"><input type="email" value={v.email} onChange={e => { setV({ ...v, email: e.target.value }); setError(''); }} /></Field>
          <Field label="Telefon"><input type="tel" value={v.phone} onChange={e => setV({ ...v, phone: e.target.value })} /></Field>
        </div>
        <ToggleRow label="Dvoufázové ověření (2FA)" desc="V prototypu jen nastavení. Skutečné 2FA zajistí Better-Auth na serveru." checked={v.twoFactor} onChange={t => setV({ ...v, twoFactor: t })} />
        <div className="kv"><span>Heslo</span><Btn onClick={() => toast.info('Změna hesla přijde s autentizací (Better-Auth). Prototyp nemá skutečné přihlášení.')}><KeyRound aria-hidden />Změnit heslo</Btn></div>
        <FormError>{error}</FormError>
        <SaveBar dirty={dirty} onReset={() => setV(profile)} onSave={save} />
      </div>
    </Section>
  );
}

type WsDraft = Pick<WorkspaceSettings, 'name' | 'company' | 'timezone' | 'invoicing' | 'community'>;
function Workspace() {
  const { settings, updateSettings } = useHub();
  const init: WsDraft = { name: settings.name, company: settings.company, timezone: settings.timezone, invoicing: settings.invoicing, community: settings.community };
  const [v, setV] = useState(init);
  const [error, setError] = useState('');
  const dirty = JSON.stringify(v) !== JSON.stringify(init);
  useUnsavedGuard(dirty, 'Nastavení prostoru má neuložené změny.');
  const c = v.company; const setC = (p: Partial<WsDraft['company']>) => { setV({ ...v, company: { ...c, ...p } }); setError(''); };
  const save = () => {
    if (!v.name.trim()) return setError('Vyplňte název prostoru.');
    if (!/^\d{8}$/.test(c.ico)) return setError('IČO musí mít 8 číslic.');
    if (c.vatPayer && !/^CZ\d{8,10}$/.test(c.dic)) return setError('Plátce DPH potřebuje DIČ ve tvaru CZ12345678.');
    if (c.email && !isEmail(c.email)) return setError('Fakturační e-mail není platný.');
    if (!(v.invoicing.dueDays >= 1 && v.invoicing.dueDays <= 120)) return setError('Splatnost faktur musí být 1–120 dní.');
    updateSettings(s => ({ ...s, ...v, name: v.name.trim() })); toast.success('Pracovní prostor byl uložen.', { description: 'Název se propsal do navigace.' });
  };
  return (
    <>
      <Section title="Pracovní prostor" desc={settings.kind}>
        <div className="sec-body stack">
          <Field label="Název prostoru" hint="Zobrazuje se v přepínači prostorů a v hlavičce."><input value={v.name} onChange={e => { setV({ ...v, name: e.target.value }); setError(''); }} maxLength={60} /></Field>
          <div className="form-grid">
            <Field label="Časové pásmo"><Pick value={v.timezone} onChange={t => setV({ ...v, timezone: t })} options={['Europe/Prague', 'Europe/Bratislava', 'Europe/Vienna']} className="full" label="Časové pásmo" /></Field>
            <Field label="Měna"><input value="CZK" disabled /></Field>
          </div>
        </div>
      </Section>
      <Section title="Fakturační údaje" desc="Použijí se na fakturách (Fakturoid po napojení).">
        <div className="sec-body stack">
          <Field label="Název firmy"><input value={c.legalName} onChange={e => setC({ legalName: e.target.value })} /></Field>
          <div className="form-grid">
            <Field label="IČO"><input value={c.ico} onChange={e => setC({ ico: e.target.value.replace(/\D/g, '').slice(0, 8) })} inputMode="numeric" /></Field>
            <Field label="DIČ"><input value={c.dic} onChange={e => setC({ dic: e.target.value.toUpperCase() })} /></Field>
            <Field label="Adresa"><input value={c.address} onChange={e => setC({ address: e.target.value })} /></Field>
            <Field label="Fakturační e-mail"><input type="email" value={c.email} onChange={e => setC({ email: e.target.value })} /></Field>
          </div>
          <ToggleRow label="Plátce DPH" desc="Na fakturách se uvede DPH 21 %." checked={c.vatPayer} onChange={x => setC({ vatPayer: x })} />
          <div className="form-grid">
            <Field label="Prefix čísla faktury"><input value={v.invoicing.prefix} onChange={e => setV({ ...v, invoicing: { ...v.invoicing, prefix: e.target.value.replace(/\D/g, '').slice(0, 6) } })} /></Field>
            <Field label="Splatnost (dní)"><input type="number" min={1} max={120} value={v.invoicing.dueDays} onChange={e => setV({ ...v, invoicing: { ...v.invoicing, dueDays: Number(e.target.value) } })} /></Field>
          </div>
          <Field label="Ochranná lhůta komunity po konci předplatného (dní)"><input type="number" min={0} max={60} value={v.community.gracePeriodDays} onChange={e => setV({ ...v, community: { gracePeriodDays: Number(e.target.value) } })} /></Field>
          <FormError>{error}</FormError>
          <SaveBar dirty={dirty} onReset={() => setV(init)} onSave={save} />
        </div>
      </Section>
    </>
  );
}

function Branding() {
  const { settings, updateSettings } = useHub();
  const init = { brandColor: settings.brandColor, logo: settings.logo, portal: settings.portal };
  const [v, setV] = useState(init);
  const [error, setError] = useState('');
  const dirty = JSON.stringify(v) !== JSON.stringify(init);
  useUnsavedGuard(dirty, 'Branding má neuložené změny.');
  const save = () => {
    if (!/^#[0-9a-f]{6}$/i.test(v.brandColor) || !/^#[0-9a-f]{6}$/i.test(v.portal.color)) return setError('Barvy musí být ve formátu #RRGGBB.');
    if (v.portal.customDomain && !/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(v.portal.customDomain)) return setError('Vlastní doména portálu není platná (např. akademie.firma.cz).');
    if (!v.portal.title.trim()) return setError('Vyplňte název portálu.');
    updateSettings(s => ({ ...s, ...v })); toast.success('Branding byl uložen.', { description: 'Logo a barva se zobrazují v přepínači prostorů.' });
  };
  return (
    <div className="split">
      <Section title="Branding a klientský portál">
        <div className="sec-body stack">
          <Field label="Barva značky"><div className="flex-row"><input type="color" value={v.brandColor} onChange={e => setV({ ...v, brandColor: e.target.value })} aria-label="Barva značky" /><input className="mono" value={v.brandColor} onChange={e => { setV({ ...v, brandColor: e.target.value }); setError(''); }} maxLength={7} aria-label="Barva značky HEX" /></div></Field>
          <ImagePicker value={v.logo} onChange={logo => setV({ ...v, logo })} label="Logo (čtvercové)" ratio="1 / 1" />
          <Field label="Název portálu"><input value={v.portal.title} onChange={e => { setV({ ...v, portal: { ...v.portal, title: e.target.value } }); setError(''); }} /></Field>
          <Field label="Barva portálu"><div className="flex-row"><input type="color" value={v.portal.color} onChange={e => setV({ ...v, portal: { ...v.portal, color: e.target.value } })} aria-label="Barva portálu" /><input className="mono" value={v.portal.color} onChange={e => setV({ ...v, portal: { ...v.portal, color: e.target.value } })} maxLength={7} aria-label="Barva portálu HEX" /></div></Field>
          <Field label="Vlastní doména (nepovinné)" hint="DNS a certifikát se nastaví s backendem."><input value={v.portal.customDomain} onChange={e => { setV({ ...v, portal: { ...v.portal, customDomain: e.target.value.trim() } }); setError(''); }} placeholder="akademie.firma.cz" /></Field>
          <ToggleRow label="Přihlášení odkazem (magic link)" desc="Klienti se přihlásí odkazem z e-mailu bez hesla." checked={v.portal.magicLink} onChange={m => setV({ ...v, portal: { ...v.portal, magicLink: m } })} />
          <FormError>{error}</FormError>
          <SaveBar dirty={dirty} onReset={() => setV(init)} onSave={save} />
        </div>
      </Section>
      <Section title="Náhled portálu" className="sticky-side">
        <div className="sec-body">
          <div className="portal-preview">
            <div className="portal-bar" style={{ background: v.portal.color }}>{v.logo ? <img src={v.logo.dataUrl} alt="" /> : <span>{v.portal.title.slice(0, 1)}</span>}<strong>{v.portal.title || 'Portál'}</strong></div>
            <div className="portal-body"><p>Moje kurzy · Komunita · Faktury</p><span className="portal-btn" style={{ background: v.portal.color }}>Pokračovat v kurzu</span></div>
          </div>
          <p className="small muted mt-3">{v.portal.customDomain || `portal.softema.example/${settings.name.toLowerCase().replace(/\W+/g, '-')}`}</p>
          <Notice>Klientský portál s oddělenou autentizací (ClientUser) vznikne s backendem. Náhledy studenta a účastníka najdete v Kurzech a Webinářích.</Notice>
        </div>
      </Section>
    </div>
  );
}

function Team() {
  const { settings, updateSettings, profile } = useHub();
  const [inviting, setInviting] = useState(false);
  const [confirmEl, confirm] = useConfirm();
  const admins = settings.team.filter(m => m.role !== 'member' && m.status === 'Aktivní');
  const setTeam = (fn: (t: TeamMember[]) => TeamMember[]) => updateSettings(s => ({ ...s, team: fn(s.team) }));
  return (
    <>
      <Section title="Tým a role" desc="Přepínač prostoru je v prototypu jen navigace, oprávnění se vynucují až na serveru (RLS)." actions={<Btn primary onClick={() => setInviting(true)}><UserPlus aria-hidden />Pozvat člena</Btn>}>
        <ul className="row-list sec-body">
          {settings.team.map(m => (
            <li key={m.id} className="row-item">
              <Avatar name={m.name} color={m.color} size="sm" />
              <span className="row-main"><strong>{m.name}{m.email === profile.email ? ' (vy)' : ''}</strong><small>{m.email}</small></span>
              {m.status !== 'Aktivní' && <Badge tone="orange">{m.status}</Badge>}
              <Pick value={m.role} onChange={r => { if (m.role !== 'member' && r === 'member' && admins.length <= 1) { toast.error('Prostor musí mít alespoň jednoho správce.'); return; } setTeam(t => t.map(x => (x.id === m.id ? { ...x, role: r as Role } : x))); toast.success(`Role změněna na ${ROLE_LABEL[r as Role]}.`); }} options={(Object.keys(ROLE_LABEL) as Role[]).map(r => [r, ROLE_LABEL[r]] as [string, string])} label={`Role ${m.name}`} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild><button type="button" className="icon-btn" aria-label={`Akce člena ${m.name}`}><MoreHorizontal aria-hidden /></button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {m.status !== 'Aktivní' && <DropdownMenuItem onSelect={() => toast.success(`Pozvánka pro ${m.email} je připravená znovu (simulace, e-mail se neodesílá).`)}><Mail aria-hidden />Poslat pozvánku znovu</DropdownMenuItem>}
                  {m.status !== 'Aktivní' && <DropdownMenuItem onSelect={() => { setTeam(t => t.map(x => (x.id === m.id ? { ...x, status: 'Aktivní' } : x))); toast.success('Pozvánka přijata (simulace).'); }}><Check aria-hidden />Simulovat přijetí</DropdownMenuItem>}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" disabled={m.email === profile.email} onSelect={() => { if (m.role !== 'member' && admins.length <= 1 && m.status === 'Aktivní') { toast.error('Nelze odebrat posledního správce.'); return; } confirm({ title: `Odebrat ${m.name} z týmu?`, desc: 'Ztratí přístup k tomuto prostoru.', confirm: 'Odebrat', danger: true, onConfirm: () => { setTeam(t => t.filter(x => x.id !== m.id)); toast.success('Člen byl odebrán.'); } }); }}><Trash2 aria-hidden />Odebrat z týmu</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Role">
        <ul className="row-list sec-body">
          {(Object.keys(ROLE_LABEL) as Role[]).map(r => <li key={r} className="kv"><span><strong>{ROLE_LABEL[r]}</strong> <code className="small muted">{r}</code></span><span className="small">{ROLE_DESC[r]}</span></li>)}
          <li className="kv"><span><strong>Klient</strong> <code className="small muted">client</code></span><span className="small">Jen klientský portál: vlastní kurzy, komunity, faktury.</span></li>
        </ul>
      </Section>
      {inviting && <InviteDialog onClose={() => setInviting(false)} onInvite={m => { setTeam(t => [...t, m]); toast.success(`Pozvánka pro ${m.email} je připravená (simulace).`); }} existing={settings.team} />}
      {confirmEl}
    </>
  );
}

function InviteDialog({ onClose, onInvite, existing }: { onClose: () => void; onInvite: (m: TeamMember) => void; existing: TeamMember[] }) {
  const [v, setV] = useState({ name: '', email: '', role: 'member' as Role });
  const [error, setError] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!v.name.trim()) return setError('Vyplňte jméno.');
    if (!isEmail(v.email)) return setError('Zadejte platný e-mail.');
    if (existing.some(m => m.email.toLowerCase() === v.email.trim().toLowerCase())) return setError('Tento e-mail už v týmu je.');
    onInvite({ id: newId('tm'), name: v.name.trim(), email: v.email.trim(), role: v.role, status: 'Pozvánka odeslána', color: COLORS[existing.length % COLORS.length] }); onClose();
  };
  return (
    <Modal open onClose={onClose} title="Pozvat člena týmu" desc="Pozvánka e-mailem se v prototypu neodesílá.">
      <form onSubmit={submit} noValidate>
        <div className="stack">
          <Field label="Jméno"><input value={v.name} onChange={e => { setV({ ...v, name: e.target.value }); setError(''); }} autoFocus /></Field>
          <Field label="E-mail"><input type="email" value={v.email} onChange={e => { setV({ ...v, email: e.target.value }); setError(''); }} /></Field>
          <Field label="Role"><Pick value={v.role} onChange={r => setV({ ...v, role: r as Role })} options={(Object.keys(ROLE_LABEL) as Role[]).map(r => [r, ROLE_LABEL[r]] as [string, string])} className="full" label="Role" /></Field>
          <FormError>{error}</FormError>
        </div>
        <div className="form-actions"><Btn type="button" onClick={onClose}>Zrušit</Btn><Btn primary type="submit">Pozvat</Btn></div>
      </form>
    </Modal>
  );
}

function Domains() {
  const { settings, updateSettings } = useHub();
  const [adding, setAdding] = useState(false);
  const [domain, setDomain] = useState('');
  const [sender, setSender] = useState<{ name: string; email: string } | null>(null);
  const [error, setError] = useState('');
  const [confirmEl, confirm] = useConfirm();
  const records = (d: string): DnsRecord[] => [
    { type: 'TXT', host: d, value: 'v=spf1 include:amazonses.com ~all', purpose: 'SPF', verified: false },
    { type: 'TXT', host: `resend._domainkey.${d}`, value: `p=MIGfMA0GCSqGSIb3DQEB…(ukázka-${d.length})`, purpose: 'DKIM', verified: false },
    { type: 'TXT', host: `_dmarc.${d}`, value: `v=DMARC1; p=none; rua=mailto:dmarc@${d.split('.').slice(-2).join('.')}`, purpose: 'DMARC', verified: false },
  ];
  const addDomain = () => {
    const d = domain.trim().toLowerCase();
    if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(d)) return setError('Zadejte doménu, např. mail.firma.cz.');
    if (settings.domains.some(x => x.domain === d)) return setError('Doména už je přidaná.');
    updateSettings(s => ({ ...s, domains: [...s.domains, { id: newId('dom'), domain: d, status: 'Čeká na DNS', records: records(d), addedAt: new Date().toISOString() }] }));
    setDomain(''); setAdding(false); toast.success('Doména je přidaná. Nastavte DNS záznamy a ověřte ji.');
  };
  const verify = (d: SendingDomain) => { updateSettings(s => ({ ...s, domains: s.domains.map(x => (x.id === d.id ? { ...x, status: 'Ověřeno', records: x.records.map(r => ({ ...r, verified: true })) } : x)) })); toast.success(`Doména ${d.domain} je ověřená (simulace kontroly DNS).`); };
  const saveSender = () => {
    if (!sender) return;
    if (!sender.name.trim()) return setError('Vyplňte jméno odesílatele.');
    if (!isEmail(sender.email)) return setError('Zadejte platný e-mail.');
    if (!settings.domains.some(d => sender.email.toLowerCase().endsWith('@' + d.domain))) return setError('E-mail musí být na některé z přidaných domén.');
    updateSettings(s => ({ ...s, senders: [...s.senders, { id: newId('snd'), name: sender.name.trim(), email: sender.email.trim().toLowerCase(), isDefault: !s.senders.length }] }));
    setSender(null); toast.success('Odesílatel byl přidán.');
  };
  return (
    <>
      <Section title="Odesílací domény" desc="SPF, DKIM a DMARC (start p=none). Ověření je v prototypu simulované, Resend ho provede po napojení." actions={<Btn primary onClick={() => { setAdding(true); setError(''); }}><Plus aria-hidden />Přidat doménu</Btn>}>
        <div className="sec-body stack">
          {adding && <div className="inline-form"><input value={domain} onChange={e => { setDomain(e.target.value); setError(''); }} placeholder="mail.firma.cz" aria-label="Nová doména" autoFocus /><Btn primary onClick={addDomain}>Přidat</Btn><Btn onClick={() => setAdding(false)}>Zrušit</Btn></div>}
          {settings.domains.map(d => (
            <div key={d.id} className="domain-card">
              <div className="flex-row spread wrap"><strong><Globe size={16} aria-hidden className="inline" /> {d.domain}</strong><span className="flex-row"><Badge tone={d.status === 'Ověřeno' ? 'green' : d.status === 'Chyba' ? 'red' : 'orange'}>{d.status}</Badge>
                {d.status !== 'Ověřeno' && <Btn onClick={() => verify(d)}><RefreshCcw aria-hidden />Ověřit DNS</Btn>}
                <IconBtn label={`Odebrat doménu ${d.domain}`} onClick={() => { if (settings.senders.some(s => s.email.endsWith('@' + d.domain))) { toast.error('Doménu používá odesílatel. Nejdřív ho odeberte.'); return; } confirm({ title: `Odebrat doménu ${d.domain}?`, desc: 'Z této domény už nepůjde odesílat.', confirm: 'Odebrat', danger: true, onConfirm: () => { updateSettings(s => ({ ...s, domains: s.domains.filter(x => x.id !== d.id) })); toast.success('Doména byla odebrána.'); } }); }}><Trash2 /></IconBtn></span></div>
              <div className="table-scroll"><table className="hub-table dns-table"><thead><tr><th>Účel</th><th>Typ</th><th>Host</th><th>Hodnota</th><th>Stav</th></tr></thead><tbody>
                {d.records.map(r => <tr key={r.purpose}><td>{r.purpose}</td><td>{r.type}</td><td className="mono small">{r.host}</td><td className="mono small wrap"><button type="button" className="copy-val" onClick={() => navigator.clipboard?.writeText(r.value).then(() => toast.success('Hodnota zkopírována.'), () => toast.error('Kopírování selhalo.'))} title="Kopírovat">{r.value}<Copy size={12} aria-hidden /></button></td><td>{r.verified ? <Badge tone="green">OK</Badge> : <Badge tone="orange">Čeká</Badge>}</td></tr>)}
              </tbody></table></div>
              <p className="small muted">Přidáno {fmtDate(d.addedAt)}</p>
            </div>
          ))}
          {!settings.domains.length && <p className="muted">Zatím žádná doména. Bez ověřené domény nelze odesílat kampaně.</p>}
          <FormError>{!sender ? error : ''}</FormError>
        </div>
      </Section>
      <Section title="Odesílatelé" actions={<Btn onClick={() => { setSender({ name: settings.name, email: '' }); setError(''); }}><Plus aria-hidden />Přidat odesílatele</Btn>}>
        <div className="sec-body stack">
          <ul className="row-list">
            {settings.senders.map(s => (
              <li key={s.id} className="row-item">
                <span className="row-icon"><Mail size={16} aria-hidden /></span>
                <span className="row-main"><strong>{s.name}</strong><small>{s.email}</small></span>
                {s.isDefault ? <Badge tone="blue">Výchozí</Badge> : <Btn onClick={() => { updateSettings(x => ({ ...x, senders: x.senders.map(y => ({ ...y, isDefault: y.id === s.id })) })); toast.success('Výchozí odesílatel změněn.'); }}>Nastavit jako výchozí</Btn>}
                <IconBtn label={`Odebrat odesílatele ${s.email}`} onClick={() => { if (s.isDefault && settings.senders.length > 1) { toast.error('Nejdřív nastavte jiného výchozího odesílatele.'); return; } updateSettings(x => ({ ...x, senders: x.senders.filter(y => y.id !== s.id) })); toast.success('Odesílatel byl odebrán.'); }}><Trash2 /></IconBtn>
              </li>
            ))}
          </ul>
          {sender && <div className="inline-form"><input value={sender.name} onChange={e => { setSender({ ...sender, name: e.target.value }); setError(''); }} placeholder="Jméno" aria-label="Jméno odesílatele" /><input value={sender.email} onChange={e => { setSender({ ...sender, email: e.target.value }); setError(''); }} placeholder={`novinky@${settings.domains[0]?.domain ?? 'domena.cz'}`} aria-label="E-mail odesílatele" /><Btn primary onClick={saveSender}>Uložit</Btn><Btn onClick={() => setSender(null)}>Zrušit</Btn></div>}
          <FormError>{sender ? error : ''}</FormError>
        </div>
      </Section>
      {confirmEl}
    </>
  );
}

const INTEGRATIONS: [IntegrationKey, string, string][] = [
  ['resend', 'Resend', 'Odesílání kampaní a systémových e-mailů, webhooky doručení.'],
  ['stripe', 'Stripe', 'Platby kartou, platební odkazy, předplatné, kupóny.'],
  ['fakturoid', 'Fakturoid', 'Automatické faktury po úhradě.'],
  ['mux', 'Mux', 'Hostování videa kurzů a záznamů webinářů.'],
  ['livekit', 'LiveKit', 'Živé webináře (místnosti, nahrávání).'],
  ['n8n', 'n8n', 'Webhooky z automatizací do dalších systémů.'],
  ['claude', 'Claude API', 'Odpovědi chatbota nad znalostní bází.'],
];
function Integrations() {
  const { settings, updateSettings } = useHub();
  const [connecting, setConnecting] = useState<IntegrationKey | null>(null);
  const [account, setAccount] = useState('');
  const [confirmEl, confirm] = useConfirm();
  return (
    <>
      <Notice><ShieldCheck size={14} aria-hidden className="sr-only" />API klíče se v prohlížeči nezadávají ani neukládají. Po napojení backendu se vloží na serveru (šifrovaně). Tady je jen stav připojení a neveřejné volby.</Notice>
      <div className="card-grid mt-4">
        {INTEGRATIONS.map(([k, name, desc]) => { const st = settings.integrations[k]; return (
          <article key={k} className="panel link-card">
            <div className="flex-row spread"><h3>{name}</h3><Badge tone={st?.connected ? 'green' : 'gray'}>{st?.connected ? 'Připojeno (ukázka)' : 'Nepřipojeno'}</Badge></div>
            <p className="small muted">{desc}</p>
            {st?.connected && st.account && <p className="small">Účet: <strong>{st.account}</strong></p>}
            {k === 'stripe' && st?.connected && <ToggleRow label="Testovací režim" checked={st.options.testMode !== false} onChange={t => { updateSettings(s => ({ ...s, integrations: { ...s.integrations, stripe: { ...s.integrations.stripe, options: { ...s.integrations.stripe.options, testMode: t } } } })); toast.success(t ? 'Stripe v testovacím režimu.' : 'Stripe v ostrém režimu (jen nastavení, nic se neúčtuje).'); }} />}
            <div>{st?.connected
              ? <Btn onClick={() => confirm({ title: `Odpojit ${name}?`, desc: 'Funkce, které integraci používají, přejdou do simulace.', confirm: 'Odpojit', danger: true, onConfirm: () => { updateSettings(s => ({ ...s, integrations: { ...s.integrations, [k]: { connected: false, account: '', options: {} } } })); toast.success(`${name} odpojeno.`); } })}>Odpojit</Btn>
              : <Btn primary onClick={() => { setConnecting(k); setAccount(''); }}>Připojit</Btn>}</div>
          </article>
        ); })}
      </div>
      {connecting && (
        <Modal open onClose={() => setConnecting(null)} title={`Připojit ${INTEGRATIONS.find(x => x[0] === connecting)?.[1]}`} desc="Simulace připojení – bez klíče a bez síťového volání.">
          <div className="stack">
            <Field label="Název účtu (pro přehled)" hint="Např. „Produkce“. Nezadávejte sem API klíč."><input value={account} onChange={e => setAccount(e.target.value)} maxLength={40} autoFocus /></Field>
            {/^(sk|pk|rk|re)_|^[A-Za-z0-9_-]{32,}$/.test(account.trim()) && <Notice tone="warn">Vypadá to jako API klíč. Ten sem nepatří – zadá se na serveru.</Notice>}
          </div>
          <div className="form-actions"><Btn onClick={() => setConnecting(null)}>Zrušit</Btn><Btn primary disabled={!account.trim() || /^(sk|pk|rk|re)_|^[A-Za-z0-9_-]{32,}$/.test(account.trim())} onClick={() => { const k = connecting; updateSettings(s => ({ ...s, integrations: { ...s.integrations, [k]: { connected: true, account: account.trim(), options: {} } } })); setConnecting(null); toast.success('Integrace je označená jako připojená (simulace).'); }}>Připojit (simulace)</Btn></div>
        </Modal>
      )}
      {confirmEl}
    </>
  );
}

function Notifications() {
  const { settings, updateSettings } = useHub();
  const n = settings.notifications;
  const rows: [keyof typeof n, string, string][] = [['payments', 'Platby', 'Přijaté platby a faktury po splatnosti'], ['newContacts', 'Nové kontakty', 'Kontakty z formulářů, webinářů a chatbota'], ['campaigns', 'Kampaně', 'Odeslání a výsledky kampaní'], ['community', 'Komunita', 'Nahlášené příspěvky k moderaci'], ['webinars', 'Webináře', 'Registrace a začátek webináře'], ['dailyDigest', 'Denní souhrn e-mailem', 'Ráno přehled za předchozí den (simulace)']];
  return (
    <Section title="Notifikace" desc="Co se ukazuje ve zvonečku a co by chodilo e-mailem.">
      <div className="sec-body">
        {rows.map(([k, l, d]) => <ToggleRow key={k} label={l} desc={d} checked={n[k]} onChange={v => { updateSettings(s => ({ ...s, notifications: { ...s.notifications, [k]: v } })); toast.success(`${l}: ${v ? 'zapnuto' : 'vypnuto'}.`); }} />)}
      </div>
    </Section>
  );
}

function DataReset() {
  const { data, workspaceId, settings, go } = useHub();
  const [confirmEl, confirm] = useConfirm();
  const [info, setInfo] = useState(() => hubStore.info());
  const [importError, setImportError] = useState('');
  const importFile = async (f: File) => {
    setImportError('');
    if (f.size > 10_000_000) return setImportError('Soubor je větší než 10 MB.');
    const text = await f.text();
    const known = demoWorkspaces.map(x => x.id);
    let names: string[];
    try { const { data: d, workspaces } = parseExport(text, known); names = workspaces.map(id => d.settings.find(s => s.workspaceId === id)?.name ?? id); }
    catch (e) { return setImportError((e as Error).message); }
    confirm({ title: `Importovat ${f.name}?`, confirm: 'Importovat', danger: true, desc: `Data ${names.length > 1 ? 'prostorů' : 'prostoru'} ${names.join(' a ')} se nahradí obsahem souboru. Ostatní prostory zůstanou beze změny. Dosavadní stav se uloží jako záloha v tomto prohlížeči.`, onConfirm: () => {
      try { hubStore.importData(text, known); setInfo(hubStore.info()); toast.success('Data byla importována.', { description: names.join(', ') }); }
      catch (e) { setImportError((e as Error).message); }
    } });
  };
  const exportData = (all: boolean) => {
    const payload = all ? data : Object.fromEntries(Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? v.filter((x: { workspaceId?: string }) => x.workspaceId === workspaceId) : v]));
    download(`softema-hub-${all ? 'vse' : settings.name.toLowerCase().replace(/\W+/g, '-')}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ version: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data: payload }, null, 2), 'application/json');
  };
  const counts: [string, number][] = [['Kontakty', data.contacts.filter(x => x.workspaceId === workspaceId).length], ['Kampaně', data.campaigns.filter(x => x.workspaceId === workspaceId).length], ['Faktury', data.invoices.filter(x => x.workspaceId === workspaceId).length], ['Kurzy', data.courses.filter(x => x.workspaceId === workspaceId).length], ['Webináře', data.webinars.filter(x => x.workspaceId === workspaceId).length], ['Aktivity', data.activities.filter(x => x.workspaceId === workspaceId).length]];
  return (
    <>
      <Section title="Data v tomto prohlížeči" desc="Prototyp nemá server. Vše je uložené v localStorage tohoto prohlížeče a jiní uživatelé to nevidí.">
        <div className="sec-body stack">
          <div className="import-stats">{counts.map(([l, n]) => <div key={l}><strong>{fmt(n)}</strong><span>{l}</span></div>)}</div>
          <div className="kv"><span>Formát dat</span><strong>verze {SCHEMA_VERSION}</strong></div>
          <div className="kv"><span>Ukázková data vytvořena</span><strong>{info.createdAt ? fmtDateTime(info.createdAt) : '—'}</strong></div>
          <div className="kv"><span>Velikost</span><strong>{fmt(Math.round(info.bytes / 1024))} kB</strong></div>
          {info.saveError && <Notice tone="warn">{info.saveError}</Notice>}
          <div className="flex-row wrap">
            <Btn onClick={() => exportData(false)}><Download aria-hidden />Export prostoru (JSON)</Btn>
            <Btn onClick={() => exportData(true)}><Database aria-hidden />Export všech prostorů</Btn>
            <label className="hub-btn file-btn"><input type="file" accept="application/json,.json" className="sr-only" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importFile(f); }} /><Upload aria-hidden />Import ze zálohy (JSON)</label>
          </div>
          <FormError>{importError}</FormError>
          <small className="muted">Import nahradí jen prostory obsažené v souboru. Ostatní prostory zůstanou beze změny a dosavadní stav se uloží jako záloha v prohlížeči.</small>
        </div>
      </Section>
      <Section title="Obnovit ukázková data" desc="Pro začátek review nebo po testování. Změny nelze vrátit – případně si je nejdřív exportujte.">
        <div className="sec-body flex-row wrap">
          <Btn onClick={() => confirm({ title: `Obnovit ukázková data prostoru ${settings.name}?`, danger: true, confirm: 'Obnovit prostor', desc: 'Všechny změny v tomto prostoru (kontakty, kampaně, kurzy…) se zahodí a nahradí výchozími ukázkovými daty. Ostatní prostory zůstanou beze změny.', onConfirm: () => { hubStore.reset(workspaceId); setInfo(hubStore.info()); toast.success('Ukázková data prostoru byla obnovena.'); go('prehled'); } })}><RotateCcw aria-hidden />Obnovit tento prostor</Btn>
          <Btn className="danger-ghost" onClick={() => confirm({ title: 'Obnovit všechna ukázková data?', danger: true, confirm: 'Obnovit vše', desc: 'Zahodí se změny ve všech prostorech včetně profilu. Akci nelze vrátit.', onConfirm: () => { hubStore.reset(); setInfo(hubStore.info()); toast.success('Všechna ukázková data byla obnovena.'); go('prehled'); } })}><Trash2 aria-hidden />Obnovit všechny prostory</Btn>
        </div>
      </Section>
      {confirmEl}
    </>
  );
}
