'use client';
/* Campaign wizard (details → recipients → content → review & send/schedule) and the full-screen content editor.
   Existing campaigns autosave every change to the local store, so nothing is lost between steps or screens. */
import React, { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTheme } from 'next-themes';
import { AlertTriangle, ArrowLeft, ArrowRight, CalendarClock, Check, CircleCheck, CircleX, Eye, Monitor, Pencil, Plus, Send, Smartphone, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { fmt, fmtDateTime, fromPragueInput, isEmail, normalize, plural, toDateInput, DAY } from '@/lib/hub/format';
import { audienceOf, segmentContext, segmentMembers, canEmail } from '@/lib/hub/logic';
import { makeCampaign, simulateSend } from '@/lib/hub/ops';
import type { Audience, Block, Campaign } from '@/lib/hub/types';
import { useHub } from './state';
import { Avatar, Badge, Btn, Field, IconBtn, Modal, PageHead, Pick } from './ui';
import { ContactPicker, DateField, FormError, Notice, Section, useConfirm, useRoute } from './kit';
import { BlockEditor, EmailContent, blocksToHtml, linksOf, makeBlock, personalize } from './email-blocks';
import { consentTone } from './crm-shared';

const UnlayerEditor = dynamic(() => import('./unlayer-editor'), { ssr: false, loading: () => <div className="editor-loading" role="status">Načítám editor Unlayer…</div> });

/* ---------- templates ---------- */
const tpl = (logo: string, heading: string, text: string, cta: string, extra: Block[] = []): Block[] => [
  { ...makeBlock('logo'), text: logo }, { ...makeBlock('heading'), text: heading }, { ...makeBlock('text'), text }, ...extra,
  { ...makeBlock('button'), text: cta }, makeBlock('divider'), makeBlock('footer'),
];
export const TEMPLATES: { id: string; name: string; desc: string; blocks: (brand: string) => Block[] }[] = [
  { id: 'newsletter', name: 'Newsletter', desc: 'Úvod, zvýraznění a výzva k akci', blocks: b => tpl(b, 'Novinky, které\nstojí za přečtení', 'Ahoj {{jmeno}},\n\npřinášíme výběr toho nejzajímavějšího z posledních týdnů.', 'Přečíst novinky', [{ ...makeBlock('callout'), text: 'Tip měsíce: méně rutiny, více výsledků.' }]) },
  { id: 'webinar', name: 'Pozvánka na webinář', desc: 'Datum, přínosy a registrace', blocks: b => tpl(b, 'Zveme vás na\nživý webinář', 'Ahoj {{jmeno}},\n\nza 60 minut projdeme praktické postupy, které můžete hned použít. Záznam pošleme všem registrovaným.', 'Chci se registrovat', [{ ...makeBlock('callout'), text: 'Středa 18:00 · online · zdarma' }]) },
  { id: 'promo', name: 'Akce a sleva', desc: 'Nabídka s kódem a termínem', blocks: b => tpl(b, 'Podzimní sleva\n20 % na vše', 'Ahoj {{jmeno}},\n\njen do konce týdne máte slevu na všechny kurzy a produkty.', 'Využít slevu', [{ ...makeBlock('callout'), text: 'Kód PODZIM20 · platí do neděle', color: '#eef6ff' }]) },
  { id: 'blank', name: 'Prázdný e-mail', desc: 'Jen logo, text a patička', blocks: b => [{ ...makeBlock('logo'), text: b }, makeBlock('text'), makeBlock('footer')] },
];

/* ---------- shared preview ---------- */
export function CampaignPreview({ c, device = 'desktop' }: { c: Campaign; device?: 'desktop' | 'mobile' }) {
  if (c.editor === 'unlayer' && c.html) {
    return <iframe title={`Náhled e-mailu ${c.name}`} className={`mail-frame ${device}`} sandbox="" srcDoc={personalize(c.html)} />;
  }
  return <div className={'email-paper ' + (device === 'mobile' ? 'mobile' : '')}><EmailContent blocks={c.blocks} preview /></div>;
}
export const campaignHtml = (c: Campaign) => (c.editor === 'unlayer' && c.html ? c.html : blocksToHtml(c.blocks, { preheader: c.preheader }));
const hasUnsubscribe = (c: Campaign) => /odhl[aá]s/i.test(normalize(campaignHtml(c)).replace(/&[a-z]+;/g, ''));

export function PreviewModal({ c, open, onClose }: { c: Campaign; open: boolean; onClose: () => void }) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  return (
    <Modal open={open} onClose={onClose} wide title="Náhled e-mailu" desc={`Předmět: ${personalize(c.subject || '(bez předmětu)')} · ukázková personalizace Jane / Novák Studio`}>
      <div className="flex-row justify-center"><div className="segmented" role="group" aria-label="Šířka náhledu">
        <button type="button" aria-pressed={device === 'desktop'} className={device === 'desktop' ? 'active' : ''} onClick={() => setDevice('desktop')}><Monitor size={16} aria-hidden />Počítač</button>
        <button type="button" aria-pressed={device === 'mobile'} className={device === 'mobile' ? 'active' : ''} onClick={() => setDevice('mobile')}><Smartphone size={16} aria-hidden />Mobil</button>
      </div></div>
      <div className="preview-stage"><CampaignPreview c={c} device={device} /></div>
    </Modal>
  );
}

export function TestMailModal({ c, open, onClose }: { c: Campaign; open: boolean; onClose: () => void }) {
  const { profile } = useHub();
  const [to, setTo] = useState(profile.email);
  const [error, setError] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const list = to.split(',').map(s => s.trim()).filter(Boolean);
    if (!list.length || list.some(x => !isEmail(x))) return setError('Zadejte platné e-maily oddělené čárkou.');
    if (list.length > 5) return setError('Test lze poslat nejvýše na 5 adres.');
    toast.success('Testovací e-mail je připravený (simulace).', { description: `Na ${list.join(', ')} se nic neodeslalo. Skutečné odesílání přijde s backendem (Resend).` });
    setError(''); onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Testovací e-mail" desc={`Simulace · předmět: ${personalize(c.subject || "(bez předmětu)")}`}>
      <form onSubmit={submit} noValidate>
        <div className="stack">
          <Field label="Příjemci testu" hint="Nejvýše 5 adres oddělených čárkou."><input value={to} onChange={e => { setTo(e.target.value); setError(''); }} /></Field>
          <FormError>{error}</FormError>
          <Notice>V prototypu se e-maily neodesílají. Test ověří jen vyplnění adres.</Notice>
        </div>
        <div className="form-actions"><Btn type="button" onClick={onClose}>Zrušit</Btn><Btn primary type="submit"><Send aria-hidden />Odeslat test</Btn></div>
      </form>
    </Modal>
  );
}

/* ---------- wizard ---------- */
const STEPS = ['Základní údaje', 'Příjemci', 'Obsah', 'Kontrola a odeslání'];

export function CampaignWizard({ id }: { id?: number }) {
  const { w, go } = useHub();
  const c = id ? w.campaigns.find(x => x.id === id) : undefined;
  if (id && !c) return <div className="page"><section className="panel empty"><h3>Kampaň nenalezena</h3><p>V tomto pracovním prostoru kampaň neexistuje.</p><Btn primary onClick={() => go('kampane')}>Zpět na kampaně</Btn></section></div>;
  if (c && c.status === 'Odesláno') return <div className="page"><section className="panel empty"><h3>Kampaň už byla odeslána</h3><p>Odeslanou kampaň nelze upravit. Vytvořte kopii.</p><Btn primary onClick={() => go('kampane/' + c.id)}>Zobrazit report</Btn></section></div>;
  return c ? <Wizard key={c.id} c={c} /> : <NewCampaign />;
}

function NewCampaign() {
  const { data, workspaceId, settings, mutate, go } = useHub();
  const { query } = useRoute();
  const segment = query.get('segment');
  const [v, setV] = useState({ name: '', subject: '', preheader: '', sender: settings.senders.find(s => s.isDefault)?.id ?? settings.senders[0]?.id ?? '' });
  const [error, setError] = useState('');
  const create = () => {
    if (!v.name.trim()) return setError('Pojmenujte kampaň.');
    if (!v.subject.trim()) return setError('Vyplňte předmět e-mailu.');
    const sender = settings.senders.find(s => s.id === v.sender);
    const audience: Audience = segment && data.segments.some(s => s.id === segment && s.workspaceId === workspaceId) ? { type: 'segment', segmentId: segment } : { type: 'all' };
    const c = makeCampaign(data, workspaceId, { name: v.name.trim(), subject: v.subject.trim(), preheader: v.preheader.trim(), sender: sender?.name ?? settings.name, senderEmail: sender?.email ?? '', audience, editor: 'unlayer', blocks: TEMPLATES[0].blocks(normalize(settings.name).split(/\W/)[0] || 'softema') });
    mutate(d => ({ ...d, campaigns: [c, ...d.campaigns] }));
    toast.success('Koncept kampaně byl vytvořen.', { description: 'Další změny se ukládají automaticky.' });
    go(`kampane/${c.id}/upravit?krok=2`, { replace: true });
  };
  return (
    <div className="page">
      <button type="button" className="back-link" onClick={() => go('kampane')}><ArrowLeft size={15} aria-hidden />Zpět na kampaně</button>
      <PageHead title="Nová kampaň" desc="Po prvním kroku se koncept uloží a všechny další změny se ukládají automaticky." />
      <section className="panel wizard">
        <Stepper step={1} />
        <div className="wizard-body">
          <DetailsForm v={v} set={p => { setV({ ...v, ...p }); setError(''); }} />
          <FormError>{error}</FormError>
        </div>
        <footer className="wizard-footer"><Btn onClick={() => go('kampane')}>Zrušit</Btn><Btn primary onClick={create}>Uložit a pokračovat<ArrowRight aria-hidden /></Btn></footer>
      </section>
    </div>
  );
}

function Stepper({ step, onStep, done = 0 }: { step: number; onStep?: (n: number) => void; done?: number }) {
  return (
    <ol className="wizard-steps" aria-label="Kroky kampaně">
      {STEPS.map((s, k) => (
        <React.Fragment key={s}>
          {k > 0 && <li className="step-line" aria-hidden />}
          <li className={`wizard-step ${step === k + 1 ? 'current' : ''} ${done > k + 1 || step > k + 1 ? 'complete' : ''}`} aria-current={step === k + 1 ? 'step' : undefined}>
            {onStep ? <button type="button" onClick={() => onStep(k + 1)}><b>{step > k + 1 ? <Check size={13} aria-hidden /> : k + 1}</b><span>{s}</span></button> : <><b>{k + 1}</b><span>{s}</span></>}
          </li>
        </React.Fragment>
      ))}
    </ol>
  );
}

function DetailsForm({ v, set }: { v: { name: string; subject: string; preheader: string; sender: string }; set: (p: Partial<{ name: string; subject: string; preheader: string; sender: string }>) => void }) {
  const { settings, go } = useHub();
  const sender = settings.senders.find(s => s.id === v.sender);
  const domain = sender ? settings.domains.find(d => sender.email.endsWith('@' + d.domain)) : undefined;
  const insert = (t: string) => set({ subject: (v.subject + ' ' + t).trim() });
  return (
    <div className="wizard-form">
      <Field label="Název kampaně" hint="Interní název, příjemci ho neuvidí."><input value={v.name} onChange={e => set({ name: e.target.value })} maxLength={120} placeholder="Např. Říjnový newsletter" /></Field>
      <Field label="Předmět e-mailu" hint={`${v.subject.length}/150 znaků · personalizace: {{jmeno}}, {{firma}}`}>
        <input value={v.subject} onChange={e => set({ subject: e.target.value })} maxLength={150} placeholder="Např. {{jmeno}}, máme pro vás novinky" />
      </Field>
      <div className="flex-row"><Btn type="button" onClick={() => insert('{{jmeno}}')}><Plus aria-hidden />Jméno</Btn><Btn type="button" onClick={() => insert('{{firma}}')}><Plus aria-hidden />Firma</Btn></div>
      <Field label="Preheader (nepovinné)" hint="Krátký text, který se zobrazí za předmětem ve schránce."><input value={v.preheader} onChange={e => set({ preheader: e.target.value })} maxLength={150} /></Field>
      <Field label="Odesílatel">
        {settings.senders.length ? <Pick value={v.sender} onChange={s => set({ sender: s })} options={settings.senders.map(s => [s.id, `${s.name} <${s.email}>`] as [string, string])} className="full" label="Odesílatel" /> : <Notice tone="warn">Nemáte nastaveného odesílatele. <button type="button" className="text-link inline" onClick={() => go('nastaveni/domeny')}>Přidat v Nastavení</button></Notice>}
      </Field>
      {domain && domain.status !== 'Ověřeno' && <Notice tone="warn">Doména {domain.domain} zatím není ověřená ({domain.status}). Kampaň půjde uložit, ale ne odeslat. <button type="button" className="text-link inline" onClick={() => go('nastaveni/domeny')}>Ověřit doménu</button></Notice>}
    </div>
  );
}

function Wizard({ c }: { c: Campaign }) {
  const { data, settings, go, patch } = useHub();
  const { query, setQuery } = useRoute();
  const step = Math.min(4, Math.max(1, Number(query.get('krok')) || 1));
  const setStep = (n: number) => setQuery({ krok: String(n) });
  const [dialog, setDialog] = useState<null | 'preview' | 'test' | 'send' | 'contacts'>(null);
  const [confirmEl, confirm] = useConfirm();
  const save = (p: Partial<Campaign>) => patch('campaigns', c.id, x => ({ ...x, ...p, updatedAt: new Date().toISOString() }));
  const audience = useMemo(() => audienceOf(data, c), [data, c]);
  const sender = settings.senders.find(s => s.email === c.senderEmail);
  const domain = settings.domains.find(d => c.senderEmail.endsWith('@' + d.domain));
  const checks: [boolean, string, number][] = [
    [!!c.name.trim() && !!c.subject.trim(), 'Název a předmět jsou vyplněné', 1],
    [!!c.senderEmail && (!domain || domain.status === 'Ověřeno'), domain && domain.status !== 'Ověřeno' ? `Doména ${domain.domain} není ověřená` : 'Odesílatel s ověřenou doménou', 1],
    [audience.eligible.length > 0, audience.eligible.length ? `${plural(audience.eligible.length, 'příjemce', 'příjemci', 'příjemců')} se souhlasem` : 'Žádný příjemce se souhlasem', 2],
    [c.editor === 'unlayer' ? !!c.html : c.blocks.length > 0, 'E-mail má obsah', 3],
    [hasUnsubscribe(c), 'Obsah obsahuje odkaz pro odhlášení', 3],
  ];
  const ready = checks.every(x => x[0]);

  if (c.status === 'Naplánováno') return (
    <div className="page">
      <button type="button" className="back-link" onClick={() => go('kampane/' + c.id)}><ArrowLeft size={15} aria-hidden />Zpět na kampaň</button>
      <section className="panel empty"><h3>Kampaň je naplánovaná na {fmtDateTime(c.scheduledAt!)}</h3><p>Pro úpravy ji vraťte do konceptu. Plán odeslání se tím zruší.</p>
        <Btn primary onClick={() => { save({ status: 'Koncept', scheduledAt: undefined }); toast.success('Plán byl zrušen, kampaň je znovu koncept.'); }}><Pencil aria-hidden />Zrušit plán a upravit</Btn></section>
    </div>
  );

  return (
    <div className="page">
      <button type="button" className="back-link" onClick={() => go('kampane')}><ArrowLeft size={15} aria-hidden />Zpět na kampaně</button>
      <PageHead title={c.name || 'Nová kampaň'} desc="Koncept · změny se ukládají automaticky">
        <Btn onClick={() => setDialog('preview')}><Eye aria-hidden />Náhled</Btn>
      </PageHead>
      <section className="panel wizard">
        <Stepper step={step} onStep={setStep} />
        <div className="wizard-body">
          {step === 1 && <DetailsForm v={{ name: c.name, subject: c.subject, preheader: c.preheader, sender: sender?.id ?? '' }} set={p => save({ ...(p.name !== undefined && { name: p.name }), ...(p.subject !== undefined && { subject: p.subject }), ...(p.preheader !== undefined && { preheader: p.preheader }), ...(p.sender !== undefined && (() => { const s = settings.senders.find(x => x.id === p.sender); return s ? { sender: s.name, senderEmail: s.email } : {}; })()) })} />}
          {step === 2 && <Recipients c={c} save={save} onAddContacts={() => setDialog('contacts')} />}
          {step === 3 && <Content c={c} save={save} confirm={confirm} onPreview={() => setDialog('preview')} />}
          {step === 4 && (
            <div className="review-grid">
              <div>
                <h2>Kontrola před odesláním</h2>
                <ul className="checklist-rows">
                  {checks.map(([ok, text, s]) => <li key={text} className={ok ? 'ok' : 'bad'}>{ok ? <CircleCheck size={18} aria-hidden /> : <CircleX size={18} aria-hidden />}<span>{text}</span>{!ok && <button type="button" className="text-link" onClick={() => setStep(s)}>Opravit</button>}</li>)}
                </ul>
                <div className="review-row"><span>Předmět</span><strong>{personalize(c.subject)}</strong></div>
                <div className="review-row"><span>Odesílatel</span><strong>{c.sender} &lt;{c.senderEmail}&gt;</strong></div>
                <div className="review-row"><span>Příjemci</span><strong>{fmt(audience.eligible.length)} se souhlasem z {fmt(audience.members.length)}</strong></div>
                {audience.members.length > audience.eligible.length && <p className="small muted">Vynecháme: {audience.excluded.noConsent} bez souhlasu, {audience.excluded.unsubscribed} odhlášených, {audience.excluded.pending} čeká na potvrzení.</p>}
                <div className="flex-row mt-4"><Btn onClick={() => setDialog('test')}><Send aria-hidden />Testovací e-mail</Btn><Btn onClick={() => setDialog('preview')}><Eye aria-hidden />Náhled</Btn></div>
              </div>
              <div className="review-preview"><CampaignPreview c={c} device="mobile" /></div>
            </div>
          )}
        </div>
        <footer className="wizard-footer">
          <Btn onClick={() => (step === 1 ? go('kampane') : setStep(step - 1))}><ArrowLeft aria-hidden />{step === 1 ? 'Zavřít' : 'Zpět'}</Btn>
          <span className="small muted">Uloženo {fmtDateTime(c.updatedAt)}</span>
          {step < 4 ? <Btn primary onClick={() => setStep(step + 1)} disabled={step === 1 && (!c.name.trim() || !c.subject.trim())}>Pokračovat<ArrowRight aria-hidden /></Btn>
            : <Btn primary disabled={!ready} onClick={() => setDialog('send')}><Send aria-hidden />Odeslat nebo naplánovat</Btn>}
        </footer>
      </section>
      <PreviewModal c={c} open={dialog === 'preview'} onClose={() => setDialog(null)} />
      <TestMailModal c={c} open={dialog === 'test'} onClose={() => setDialog(null)} />
      <SendDialog c={c} eligible={audience.eligible.length} open={dialog === 'send'} onClose={() => setDialog(null)} onDone={() => go('kampane/' + c.id)} />
      <AddContactsDialog c={c} open={dialog === 'contacts'} onClose={() => setDialog(null)} onAdd={ids => save({ extraContactIds: [...new Set([...c.extraContactIds, ...ids])] })} />
      {confirmEl}
    </div>
  );
}

function Recipients({ c, save, onAddContacts }: { c: Campaign; save: (p: Partial<Campaign>) => void; onAddContacts: () => void }) {
  const { w, data, workspaceId, go } = useHub();
  const ctx = useMemo(() => segmentContext(data, workspaceId), [data, workspaceId]);
  const segs = useMemo(() => w.segments.map(s => { const m = segmentMembers(w.contacts, s, ctx); return { s, members: m.length, eligible: m.filter(canEmail).length }; }), [w.segments, w.contacts, ctx]);
  const all = w.contacts.filter(canEmail).length;
  const a = audienceOf(data, c);
  const extras = w.contacts.filter(x => c.extraContactIds.includes(x.id));
  const card = (selected: boolean, onClick: () => void, title: string, desc: string, count: React.ReactNode) => (
    <button key={title} type="button" className={`audience-card ${selected ? 'selected' : ''}`} aria-pressed={selected} onClick={onClick}><span className="radio-circle" /><span><strong>{title}</strong><p>{desc}</p></span><span className="count">{count}</span></button>
  );
  return (
    <div className="split">
      <div>
        <h2>Komu kampaň pošleme?</h2>
        <p className="muted mb-4">Počty se počítají z aktuálních kontaktů. E-mail dostanou jen kontakty se souhlasem „Udělen“.</p>
        {card(c.audience.type === 'all', () => save({ audience: { type: 'all' } }), 'Všechny kontakty', 'Celá databáze pracovního prostoru', fmt(all))}
        {segs.map(({ s, eligible }) => card(c.audience.type === 'segment' && c.audience.segmentId === s.id, () => save({ audience: { type: 'segment', segmentId: s.id } }), `Segment: ${s.name}`, s.description || 'Dynamický segment', fmt(eligible)))}
        {card(c.audience.type === 'manual', () => save({ audience: { type: 'manual' } }), 'Jen vybrané kontakty', 'Ručně vybraní příjemci', fmt(extras.filter(canEmail).length))}
        <div className="flex-row mt-4"><Btn onClick={() => go('kontakty/segmenty/novy')}><Plus aria-hidden />Nový segment</Btn></div>
      </div>
      <div className="stack">
        <Section title="Souhrn příjemců">
          <div className="sec-body">
            <div className="seg-count"><strong>{fmt(a.eligible.length)}</strong><span>{plural(a.eligible.length, 'příjemce', 'příjemci', 'příjemců', false)}</span></div>
            <ul className="exclusions">
              <li><span>Kontaktů ve výběru</span><strong>{fmt(a.members.length)}</strong></li>
              <li><span>Bez souhlasu</span><strong>{fmt(a.excluded.noConsent)}</strong></li>
              <li><span>Odhlášení</span><strong>{fmt(a.excluded.unsubscribed)}</strong></li>
              <li><span>Čeká na potvrzení</span><strong>{fmt(a.excluded.pending)}</strong></li>
            </ul>
          </div>
        </Section>
        <Section title={c.audience.type === 'manual' ? 'Vybraní příjemci' : 'Další příjemci navíc'} actions={<Btn onClick={onAddContacts}><Users aria-hidden />Přidat kontakty</Btn>}>
          <ul className="mini-list sec-body">
            {extras.slice(0, 20).map(x => <li key={x.id}><span className="mini-row"><Avatar name={x.name} color={x.color} size="sm" /><span>{x.name}<small>{x.email}</small></span><Badge tone={consentTone(x.consent.state)}>{x.consent.state}</Badge><IconBtn label={`Odebrat ${x.name}`} onClick={() => save({ extraContactIds: c.extraContactIds.filter(i => i !== x.id) })}><X /></IconBtn></span></li>)}
            {!extras.length && <li className="muted">Žádné.</li>}
            {extras.length > 20 && <li className="muted small">a dalších {extras.length - 20}</li>}
          </ul>
        </Section>
      </div>
    </div>
  );
}

function AddContactsDialog({ c, open, onClose, onAdd }: { c: Campaign; open: boolean; onClose: () => void; onAdd: (ids: number[]) => void }) {
  const { w } = useHub();
  const [picked, setPicked] = useState<number[]>([]);
  const candidates = w.contacts.filter(x => !c.extraContactIds.includes(x.id));
  return (
    <Modal open={open} onClose={onClose} title="Přidat příjemce" desc="Vyhledejte kontakty podle jména, e-mailu nebo firmy.">
      <div className="stack">
        <ContactPicker candidates={candidates} picked={picked} onChange={setPicked} consent emptyText="Všechny kontakty už jsou mezi příjemci." />
      </div>
      <div className="form-actions"><Btn onClick={onClose}>Zrušit</Btn><Btn primary disabled={!picked.length} onClick={() => { onAdd(picked); setPicked([]); onClose(); toast.success(`Přidáno: ${plural(picked.length, 'příjemce', 'příjemci', 'příjemců')}.`); }}>{picked.length ? `Přidat ${plural(picked.length, 'příjemce', 'příjemce', 'příjemců')}` : 'Přidat příjemce'}</Btn></div>
    </Modal>
  );
}

function Content({ c, save, confirm, onPreview }: { c: Campaign; save: (p: Partial<Campaign>) => void; confirm: ReturnType<typeof useConfirm>[1]; onPreview: () => void }) {
  const { go, settings } = useHub();
  const brand = normalize(settings.name).split(/\W/)[0] || 'softema';
  const apply = (t: (typeof TEMPLATES)[number]) => confirm({ title: `Použít šablonu ${t.name}?`, desc: 'Současný obsah e-mailu se nahradí šablonou.', confirm: 'Použít šablonu', onConfirm: () => { save({ blocks: t.blocks(brand), design: undefined, html: undefined }); toast.success(`Šablona ${t.name} byla použita.`); } });
  return (
    <div className="split">
      <div className="stack">
        <div>
          <h2>Obsah e-mailu</h2>
          <p className="muted">Editor: <strong>{c.editor === 'unlayer' ? 'Unlayer (drag & drop)' : 'Vestavěný blokový editor'}</strong></p>
        </div>
        <div className="flex-row wrap">
          <Btn primary onClick={() => go(`kampane/${c.id}/editor`)}><Pencil aria-hidden />Otevřít editor</Btn>
          <Btn onClick={onPreview}><Eye aria-hidden />Náhled</Btn>
          <Btn onClick={() => confirm({ title: c.editor === 'unlayer' ? 'Přepnout na vestavěný editor?' : 'Přepnout na Unlayer?', desc: c.editor === 'unlayer' ? 'Obsah z Unlayeru zůstane uložený, ale vestavěný editor pracuje se svými bloky. Zpět můžete přepnout kdykoli.' : 'Unlayer začne z obsahu bloků. Bloky zůstanou uložené pro případné přepnutí zpět.', confirm: 'Přepnout', onConfirm: () => save({ editor: c.editor === 'unlayer' ? 'blocks' : 'unlayer' }) })}>Přepnout editor</Btn>
        </div>
        <h3>Šablony</h3>
        <div className="template-grid">
          {TEMPLATES.map(t => (
            <button key={t.id} type="button" className="template-card" onClick={() => apply(t)}>
              <div className="template-preview"><div className="template-paper"><span className="mini-brand">{brand}</span><b>{t.blocks(brand)[1].text.split('\n')[0]}</b><div className="template-lines"><i /><i /><i /></div><span className="mini-cta">{t.blocks(brand).find(b => b.type === 'button')?.text}</span></div></div>
              <footer>{t.name}<small className="block muted">{t.desc}</small></footer>
            </button>
          ))}
        </div>
      </div>
      <div className="review-preview"><CampaignPreview c={c} device="mobile" /></div>
    </div>
  );
}

function SendDialog({ c, eligible, open, onClose, onDone }: { c: Campaign; eligible: number; open: boolean; onClose: () => void; onDone: () => void }) {
  const { workspaceId, mutate } = useHub();
  const [mode, setMode] = useState<'now' | 'schedule'>('schedule');
  const [now] = useState(() => Date.now());
  const def = new Date(now + DAY).toISOString();
  const [date, setDate] = useState(toDateInput(def));
  const [time, setTime] = useState('09:00');
  const [error, setError] = useState('');
  const submit = () => {
    if (mode === 'now') {
      let sent: Campaign | undefined;
      mutate(d => { const r = simulateSend(d, workspaceId, c.id); sent = r.campaign; return { ...r.data, campaigns: r.data.campaigns.map(x => (x.workspaceId === workspaceId && x.id === c.id ? { ...x, links: x.links.length ? x.links : linksOf(x.blocks) } : x)) }; });
      toast.success('Kampaň byla odeslána (simulace).', { description: `${plural(sent?.results?.length ?? eligible, 'příjemce', 'příjemci', 'příjemců')} · výsledky jsou ukázkové, nic se reálně neodeslalo.` });
      onClose(); onDone(); return;
    }
    if (!date || !time) return setError('Vyberte datum a čas.');
    const at = fromPragueInput(date, time);
    if (+new Date(at) < Date.now() + 5 * 60_000) return setError(`Termín ${fmtDateTime(at)} je v minulosti nebo za méně než 5 minut. Zvolte pozdější datum nebo čas – obsah kampaně zůstává uložený.`);
    mutate(d => ({ ...d, campaigns: d.campaigns.map(x => (x.workspaceId === workspaceId && x.id === c.id ? { ...x, status: 'Naplánováno', scheduledAt: at, updatedAt: new Date().toISOString(), links: x.links.length ? x.links : linksOf(x.blocks) } : x)) }));
    toast.success(`Kampaň je naplánovaná na ${fmtDateTime(at)}.`, { description: 'Po tomto čase ji aplikace při dalším otevření „odešle“ (simulace).' });
    onClose(); onDone();
  };
  return (
    <Modal open={open} onClose={onClose} title="Odeslat kampaň" desc={`${plural(eligible, 'příjemce', 'příjemci', 'příjemců')} se souhlasem. Simulace – nic se reálně neodešle.`}>
      <div className="stack">
        <div className="segmented" role="group" aria-label="Způsob odeslání">
          <button type="button" aria-pressed={mode === 'schedule'} className={mode === 'schedule' ? 'active' : ''} onClick={() => setMode('schedule')}><CalendarClock size={16} aria-hidden />Naplánovat</button>
          <button type="button" aria-pressed={mode === 'now'} className={mode === 'now' ? 'active' : ''} onClick={() => setMode('now')}><Send size={16} aria-hidden />Odeslat hned</button>
        </div>
        {mode === 'schedule' ? (
          <div className="form-grid">
            <div className="field"><span>Datum</span><DateField label="Datum odeslání" value={date} min={toDateInput(new Date(now).toISOString())} invalid={!!error} onChange={x => { setDate(x); setError(''); }} /></div>
            <Field label="Čas (Europe/Prague)"><input type="time" step={300} value={time} onChange={e => { setTime(e.target.value); setError(''); }} aria-invalid={!!error || undefined} /></Field>
          </div>
        ) : <Notice tone="warn"><AlertTriangle size={14} aria-hidden className="sr-only" />Odeslání nelze vrátit. Vygenerujeme ukázkové výsledky doručení, otevření a prokliků.</Notice>}
        <FormError>{error}</FormError>
      </div>
      <div className="form-actions"><Btn onClick={onClose}>Zrušit</Btn><Btn primary onClick={submit}>{mode === 'now' ? <><Send aria-hidden />Odeslat (simulace)</> : <><CalendarClock aria-hidden />Naplánovat odeslání</>}</Btn></div>
    </Modal>
  );
}

/* ---------- full-screen editor ---------- */
export function CampaignEditor({ id }: { id: number }) {
  const { w, go, patch } = useHub();
  const { resolvedTheme } = useTheme();
  const c = w.campaigns.find(x => x.id === id);
  const [failed, setFailed] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [dialog, setDialog] = useState<null | 'preview' | 'test'>(null);
  const [saving, setSaving] = useState(false);
  if (!c) return <div className="page"><section className="panel empty"><h3>Kampaň nenalezena</h3><Btn primary onClick={() => go('kampane')}>Zpět na kampaně</Btn></section></div>;
  if (c.status !== 'Koncept') return <div className="page"><section className="panel empty"><h3>Obsah lze upravit jen u konceptu</h3><p>Kampaň je {c.status.toLowerCase()}.</p><Btn primary onClick={() => go('kampane/' + c.id)}>Zobrazit kampaň</Btn></section></div>;
  const save = (p: Partial<Campaign>) => { setSaving(true); patch('campaigns', c.id, x => ({ ...x, ...p, updatedAt: new Date().toISOString() })); setTimeout(() => setSaving(false), 400); };
  const useUnlayer = c.editor === 'unlayer' && !failed;
  return (
    <section className="email-editor">
      <header className="editor-top">
        <div className="editor-title">
          <IconBtn label="Zpět na obsah kampaně" onClick={() => go(`kampane/${c.id}/upravit?krok=3`)}><ArrowLeft /></IconBtn>
          <div><h2>{c.name}</h2><small aria-live="polite">{saving ? 'Ukládám…' : `Uloženo automaticky · ${useUnlayer ? 'Unlayer' : 'Vestavěný editor'}`}</small></div>
        </div>
        <div className="head-actions">
          <Btn onClick={() => setDialog('preview')}><Eye aria-hidden />Náhled</Btn>
          <Btn onClick={() => setDialog('test')}><Send aria-hidden />Test</Btn>
          <Btn primary onClick={() => go(`kampane/${c.id}/upravit?krok=4`)}><Check aria-hidden />Hotovo</Btn>
        </div>
      </header>
      {failed && c.editor === 'unlayer' && (
        <div className="editor-fallback" role="alert">
          <AlertTriangle size={16} aria-hidden /><span>{failed} Pracujete ve vestavěném editoru, obsah z Unlayeru zůstává uložený.</span>
          <Btn onClick={() => { setFailed(''); setLoaded(false); }}>Zkusit Unlayer znovu</Btn>
        </div>
      )}
      {useUnlayer ? (
        <div className="unlayer-wrap">
          {!loaded && <div className="editor-loading" role="status">Načítám editor Unlayer z editor.unlayer.com…</div>}
          <UnlayerEditor design={c.design} starter={c.blocks} dark={resolvedTheme === 'dark'} onReady={() => setLoaded(true)} onFail={setFailed} onChange={v => save({ design: v.design, html: v.html, links: [] })} />
        </div>
      ) : (
        <BlockEditor blocks={c.blocks} onChange={blocks => save({ blocks, links: linksOf(blocks) })} />
      )}
      <footer className="editor-bottom"><span>{useUnlayer ? 'Unlayer bez účtu: obsahuje branding Unlayer, prémiové funkce nejsou k dispozici.' : `${plural(c.blocks.length, 'blok', 'bloky', 'bloků')} · responzivní e-mail`}</span><span>Obrázky se ukládají jen v prohlížeči (max. 400 kB)</span></footer>
      <PreviewModal c={c} open={dialog === 'preview'} onClose={() => setDialog(null)} />
      <TestMailModal c={c} open={dialog === 'test'} onClose={() => setDialog(null)} />
    </section>
  );
}
