'use client';
/* CRM: contact list with filters and bulk actions; routes to detail, segments, pipeline, consents and import. */
import React, { useMemo, useState } from 'react';
import { ChevronRight, Download, ListChecks, Mail, Plus, Tag, Trash2, Upload, Workflow, X } from 'lucide-react';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { fmt, fmtDate, isEmail, normalize, periodStart, plural } from '@/lib/hub/format';
import { afterContactCreated, deleteContacts, makeCampaign, makeContact, enrollInWorkflow, findByEmail } from '@/lib/hub/ops';
import { fireTrigger } from '@/lib/hub/flow';
import type { ConsentState, Contact, Lifecycle } from '@/lib/hub/types';
import { useHub } from './state';
import { CONSENTS, CrmHead, STAGES, consentTone, stageTone } from './crm-shared';
import { Avatar, Badge, Btn, Empty, Field, Modal, Pick, SearchInput } from './ui';
import { FormError, Notice, OptionCombobox, Pager, download, paginate, toCsv, useConfirm, useRoute } from './kit';
import ContactDetail from './contact-detail';
import { Consents, ImportWizard, Pipeline, Segments } from './crm';

export default function Contacts() {
  const { parts } = useRoute();
  const sub = parts[1];
  if (!sub) return <ContactList />;
  if (sub === 'segmenty') return <Segments />;
  if (sub === 'pipeline') return <Pipeline />;
  if (sub === 'souhlasy') return <Consents />;
  if (sub === 'import') return <ImportWizard />;
  return <ContactDetail id={Number(sub)} />;
}

const SORTS: [string, string][] = [['nove', 'Nejnovější'], ['jmeno', 'Podle jména'], ['firma', 'Podle firmy']];
const PERIOD_LABEL: Record<string, string> = { '7': 'posledních 7 dní', '30': 'posledních 30 dní', '90': 'posledních 90 dní' };
type BulkDialog = null | 'create' | 'tag' | 'untag' | 'stage' | 'campaign' | 'workflow';

export const contactRows = (list: Contact[]) => toCsv([
  ['Jméno', 'E-mail', 'Telefon', 'Firma', 'Město', 'Fáze', 'Štítky', 'Zdroj', 'Souhlas', 'Souhlas – zdroj', 'Souhlas – datum', 'Vytvořeno'],
  ...list.map(c => [c.name, c.email, c.phone, c.company, c.city, c.stage, c.tags.join(', '), c.source, c.consent.state, c.consent.source, fmtDate(c.consent.date), fmtDate(c.createdAt)]),
]);

function ContactList() {
  const { w, workspaceId, mutate, go, settings } = useHub();
  const { query, setQuery } = useRoute();
  const f = { q: query.get('q') ?? '', faze: query.get('faze') ?? '', stitek: query.get('stitek') ?? '', zdroj: query.get('zdroj') ?? '', souhlas: query.get('souhlas') ?? '', novi: query.get('novi') ?? '', razeni: query.get('razeni') ?? 'nove' };
  const [now] = useState(() => Date.now());
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [dialog, setDialog] = useState<BulkDialog>(null);
  const [confirmEl, confirm] = useConfirm();

  const tags = useMemo(() => [...new Set(w.contacts.flatMap(c => c.tags))].sort((a, b) => a.localeCompare(b, 'cs')), [w.contacts]);
  const sources = useMemo(() => [...new Set(w.contacts.map(c => c.source))].sort((a, b) => a.localeCompare(b, 'cs')), [w.contacts]);
  const filtered = useMemo(() => {
    const nq = normalize(f.q.trim());
    const since = f.novi ? periodStart(Number(f.novi), now) : 0;
    const list = w.contacts.filter(c =>
      (!nq || normalize(`${c.name} ${c.email} ${c.company} ${c.city} ${c.phone} ${c.tags.join(' ')}`).includes(nq)) &&
      (!f.faze || c.stage === f.faze) && (!f.stitek || c.tags.includes(f.stitek)) && (!f.zdroj || c.source === f.zdroj) &&
      (!f.souhlas || c.consent.state === f.souhlas) && (!since || +new Date(c.createdAt) >= since));
    const by = f.razeni === 'jmeno' ? (a: Contact, b: Contact) => a.name.localeCompare(b.name, 'cs') : f.razeni === 'firma' ? (a: Contact, b: Contact) => (a.company || '￿').localeCompare(b.company || '￿', 'cs') || a.name.localeCompare(b.name, 'cs') : (a: Contact, b: Contact) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id;
    return list.sort(by);
  }, [w.contacts, f.q, f.faze, f.stitek, f.zdroj, f.souhlas, f.novi, f.razeni, now]);
  const { page, pages, slice, from, to } = paginate(filtered, Number(query.get('strana') || 1));
  const sel = w.contacts.filter(c => selected.has(c.id));
  const allOnPage = slice.length > 0 && slice.every(c => selected.has(c.id));
  const chips: [string, string][] = ([['faze', 'Fáze'], ['stitek', 'Štítek'], ['zdroj', 'Zdroj'], ['souhlas', 'Souhlas'], ['novi', 'Přidáno']] as [keyof typeof f, string][])
    .filter(([k]) => f[k]).map(([k, l]) => [k, `${l}: ${k === 'novi' ? PERIOD_LABEL[f.novi] ?? `${f.novi} dní` : f[k]}`]);
  const filter = (patch: Record<string, string | undefined>) => setQuery({ ...patch, strana: undefined });
  const toggle = (id: number, on: boolean) => setSelected(s => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });

  const removeSelected = () => confirm({
    title: `Smazat ${plural(sel.length, 'kontakt', 'kontakty', 'kontaktů')}?`, danger: true, confirm: 'Smazat kontakty',
    desc: 'Smažou se i jejich obchody, poznámky, registrace a přístupy. Faktury a platby zůstanou kvůli účetnictví. Akci nelze vrátit.',
    onConfirm: () => { const ids = sel.map(c => c.id); mutate(d => deleteContacts(d, workspaceId, ids)); setSelected(new Set()); toast.success(`Smazáno: ${plural(ids.length, 'kontakt', 'kontakty', 'kontaktů')}.`); },
  });

  return (
    <div className="page">
      <CrmHead active="kontakty" title="Kontakty" desc={`Databáze pracovního prostoru ${settings.name}. Vyhledávání funguje s diakritikou i bez ní.`}>
        <Btn onClick={() => download(`kontakty-${normalize(settings.name).replace(/\W+/g, '-')}.csv`, contactRows(filtered))} disabled={!filtered.length}><Download aria-hidden />Export</Btn>
        <Btn onClick={() => go('kontakty/import')}><Upload aria-hidden />Importovat</Btn>
        <Btn primary onClick={() => setDialog('create')}><Plus aria-hidden />Nový kontakt</Btn>
      </CrmHead>

      <div className="filter-bar">
        <SearchInput value={f.q} onChange={v => filter({ q: v || undefined })} placeholder="Hledat jméno, e-mail, firmu, město…" />
        <div className="filter-row">
          <Pick label="Fáze" value={f.faze || 'all'} onChange={v => filter({ faze: v === 'all' ? undefined : v })} options={[['all', 'Všechny fáze'], ...STAGES.map(s => [s, s] as [string, string])]} />
          <Pick label="Štítek" value={f.stitek || 'all'} onChange={v => filter({ stitek: v === 'all' ? undefined : v })} options={[['all', 'Všechny štítky'], ...tags.map(t => [t, t] as [string, string])]} />
          <Pick label="Zdroj" value={f.zdroj || 'all'} onChange={v => filter({ zdroj: v === 'all' ? undefined : v })} options={[['all', 'Všechny zdroje'], ...sources.map(t => [t, t] as [string, string])]} />
          <Pick label="Souhlas" value={f.souhlas || 'all'} onChange={v => filter({ souhlas: v === 'all' ? undefined : v })} options={[['all', 'Jakýkoli souhlas'], ...CONSENTS.map(t => [t, t] as [string, string])]} />
          <Pick label="Řazení" value={f.razeni} onChange={v => setQuery({ razeni: v === 'nove' ? undefined : v })} options={SORTS} />
        </div>
      </div>
      {chips.length > 0 && (
        <div className="chips" aria-label="Aktivní filtry">
          {chips.map(([k, label]) => <button key={k} type="button" className="chip" onClick={() => filter({ [k]: undefined })} aria-label={`Zrušit filtr ${label}`}>{label}<X size={14} aria-hidden /></button>)}
          <button type="button" className="text-link" onClick={() => filter({ faze: undefined, stitek: undefined, zdroj: undefined, souhlas: undefined, novi: undefined, q: undefined })}>Zrušit všechny filtry</button>
        </div>
      )}

      {sel.length > 0 && (
        <div className="bulk-bar" role="region" aria-label="Hromadné akce">
          <strong>Vybráno {plural(sel.length, 'kontakt', 'kontakty', 'kontaktů')}</strong>
          {sel.length < filtered.length && <button type="button" className="text-link" onClick={() => setSelected(new Set(filtered.map(c => c.id)))}>Vybrat všech {fmt(filtered.length)} podle filtru</button>}
          <div className="bulk-actions">
            <Btn onClick={() => setDialog('tag')}><Tag aria-hidden />Přidat štítek</Btn>
            <Btn onClick={() => setDialog('untag')}>Odebrat štítek</Btn>
            <Btn onClick={() => setDialog('stage')}><ListChecks aria-hidden />Změnit fázi</Btn>
            <Btn onClick={() => setDialog('campaign')}><Mail aria-hidden />Do kampaně</Btn>
            <Btn onClick={() => setDialog('workflow')}><Workflow aria-hidden />Do automatizace</Btn>
            <Btn onClick={() => download('vybrane-kontakty.csv', contactRows(sel))}><Download aria-hidden />Export</Btn>
            <Btn className="danger-ghost" onClick={removeSelected}><Trash2 aria-hidden />Smazat</Btn>
            <button type="button" className="text-link" onClick={() => setSelected(new Set())}>Zrušit výběr</button>
          </div>
        </div>
      )}

      <section className="panel">
        {w.contacts.length === 0 ? (
          <div className="empty"><h3>V tomto prostoru zatím nejsou kontakty</h3><p>Přidejte první kontakt ručně nebo je naimportujte z CSV.</p><div className="flex-row"><Btn onClick={() => go('kontakty/import')}><Upload aria-hidden />Importovat CSV</Btn><Btn primary onClick={() => setDialog('create')}><Plus aria-hidden />Nový kontakt</Btn></div></div>
        ) : (
          <>
            <div className="table-scroll">
              <table className="hub-table data-table">
                <thead>
                  <tr>
                    <th className="col-check"><Checkbox aria-label="Vybrat kontakty na této straně" checked={allOnPage} onCheckedChange={v => setSelected(s => { const n = new Set(s); slice.forEach(c => (v ? n.add(c.id) : n.delete(c.id))); return n; })} /></th>
                    <th>Kontakt</th><th className="col-opt">Firma</th><th className="col-opt">Štítky</th><th className="col-mob">Fáze</th><th className="col-mob">Souhlas</th><th className="col-opt">Zdroj</th><th className="col-opt">Přidáno</th><th aria-hidden />
                  </tr>
                </thead>
                <tbody>
                  {slice.map(c => (
                    <tr key={c.id} onClick={() => go('kontakty/' + c.id)} className={selected.has(c.id) ? 'is-selected' : ''}>
                      <td className="col-check" onClick={e => e.stopPropagation()}><Checkbox aria-label={'Vybrat ' + c.name} checked={selected.has(c.id)} onCheckedChange={v => toggle(c.id, !!v)} /></td>
                      <td><div className="name-cell"><Avatar name={c.name} color={c.color} /><button type="button" onClick={e => { e.stopPropagation(); go('kontakty/' + c.id); }}>{c.name}<small>{c.email}</small><span className="mob-only tag-cell"><Badge tone={stageTone(c.stage)}>{c.stage}</Badge><Badge tone={consentTone(c.consent.state)}>{c.consent.state}</Badge></span></button></div></td>
                      <td className="col-opt muted ellipsis" title={c.company || undefined}>{c.company || '—'}</td>
                      <td className="col-opt"><div className="tag-cell">{c.tags.slice(0, 1).map(t => <Badge key={t} tone="gray">{t}</Badge>)}{c.tags.length > 1 && <span className="muted small" title={c.tags.slice(1).join(', ')}>+{c.tags.length - 1}</span>}</div></td>
                      <td className="col-mob"><Badge tone={stageTone(c.stage)}>{c.stage}</Badge></td>
                      <td className="col-mob"><Badge tone={consentTone(c.consent.state)}>{c.consent.state}</Badge></td>
                      <td className="col-opt muted">{c.source}</td>
                      <td className="col-opt muted nowrap">{fmtDate(c.createdAt)}</td>
                      <td className="col-go"><ChevronRight size={16} aria-hidden className="muted" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!filtered.length && <Empty text="Žádný kontakt neodpovídá hledání."><Btn onClick={() => filter({ faze: undefined, stitek: undefined, zdroj: undefined, souhlas: undefined, novi: undefined, q: undefined })}>Zrušit filtry</Btn></Empty>}
            <Pager page={page} pages={pages} total={filtered.length} from={from} to={to} onPage={p => setQuery({ strana: p > 1 ? String(p) : undefined })} noun="kontaktů" />
          </>
        )}
      </section>

      <CreateContact open={dialog === 'create'} onClose={() => setDialog(null)} />
      <TagDialog mode={dialog === 'untag' ? 'remove' : 'add'} open={dialog === 'tag' || dialog === 'untag'} onClose={() => setDialog(null)} contacts={sel} tags={tags} />
      <StageDialog open={dialog === 'stage'} onClose={() => setDialog(null)} contacts={sel} />
      <CampaignDialog open={dialog === 'campaign'} onClose={() => setDialog(null)} contacts={sel} />
      <WorkflowDialog open={dialog === 'workflow'} onClose={() => setDialog(null)} contacts={sel} />
      {confirmEl}
    </div>
  );
}

/* ---------- dialogs ---------- */
export function CreateContact({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: (c: Contact) => void }) {
  const { data, workspaceId, mutate, go, settings } = useHub();
  const blank = { name: '', email: '', phone: '', company: '', city: '', stage: 'Lead' as Lifecycle, tags: '', consent: 'Bez souhlasu' as ConsentState };
  const [v, setV] = useState(blank);
  const [error, setError] = useState('');
  const set = (patch: Partial<typeof blank>) => { setV(x => ({ ...x, ...patch })); setError(''); };
  const close = () => { setV(blank); setError(''); onClose(); };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!v.name.trim()) return setError('Vyplňte jméno a příjmení.');
    if (!isEmail(v.email)) return setError('Zadejte platný e-mail, např. jana@firma.cz.');
    const dup = findByEmail(data, workspaceId, v.email);
    if (dup) return setError(`Kontakt s tímto e-mailem už existuje: ${dup.name}.`);
    const c = makeContact(data, workspaceId, { ...v, source: 'Ruční zadání', tags: v.tags.split(',').map(t => t.trim()).filter(Boolean), consentSource: v.consent === 'Udělen' ? 'Ručně zaznamenaný souhlas' : 'Ruční zadání', owner: settings.team[0]?.name });
    mutate(d => afterContactCreated({ ...d, contacts: [c, ...d.contacts] }, workspaceId, c));
    toast.success('Kontakt byl vytvořen.');
    close();
    if (onCreated) onCreated(c); else go('kontakty/' + c.id);
  };
  return (
    <Modal open={open} onClose={close} title="Nový kontakt" desc={`Kontakt se přidá do prostoru ${settings.name}.`}>
      <form onSubmit={submit} noValidate>
        <div className="stack">
          <Field label="Jméno a příjmení"><input value={v.name} onChange={e => set({ name: e.target.value })} placeholder="Např. Jana Novotná" autoFocus required /></Field>
          <Field label="E-mail"><input type="email" value={v.email} onChange={e => set({ email: e.target.value })} placeholder="jana@firma.cz" required /></Field>
          <div className="form-grid">
            <Field label="Telefon"><input type="tel" value={v.phone} onChange={e => set({ phone: e.target.value })} placeholder="+420" /></Field>
            <Field label="Firma"><input value={v.company} onChange={e => set({ company: e.target.value })} /></Field>
            <Field label="Město"><input value={v.city} onChange={e => set({ city: e.target.value })} /></Field>
            <Field label="Fáze"><Pick value={v.stage} onChange={s => set({ stage: s as Lifecycle })} options={STAGES} className="full" label="Fáze" /></Field>
          </div>
          <Field label="Štítky" hint="Oddělte čárkou, např. Newsletter, VIP"><input value={v.tags} onChange={e => set({ tags: e.target.value })} /></Field>
          <Field label="Souhlas s e-mailingem" hint="„Udělen“ zvolte jen s doložitelným souhlasem. Fáze kontaktu na souhlasu nezávisí.">
            <Pick value={v.consent} onChange={s => set({ consent: s as ConsentState })} options={[['Bez souhlasu', 'Bez souhlasu'], ['Čeká na potvrzení', 'Odeslat žádost o potvrzení (simulace)'], ['Udělen', 'Udělen – mám doklad']]} className="full" label="Souhlas" />
          </Field>
          <FormError>{error}</FormError>
        </div>
        <div className="form-actions"><Btn type="button" onClick={close}>Zrušit</Btn><Btn primary type="submit">Vytvořit kontakt</Btn></div>
      </form>
    </Modal>
  );
}

function TagDialog({ open, onClose, contacts, tags, mode }: { open: boolean; onClose: () => void; contacts: Contact[]; tags: string[]; mode: 'add' | 'remove' }) {
  const { mutate, workspaceId } = useHub();
  const [tag, setTag] = useState('');
  const [error, setError] = useState('');
  const present = [...new Set(contacts.flatMap(c => c.tags))].sort((a, b) => a.localeCompare(b, 'cs'));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = tag.trim(); if (!t) return setError('Zadejte nebo vyberte štítek.');
    const ids = new Set(contacts.map(c => c.id));
    const existing = tags.find(x => normalize(x) === normalize(t)) ?? t;
    const changed = contacts.filter(c => (mode === 'add' ? !c.tags.includes(existing) : c.tags.some(x => normalize(x) === normalize(t)))).map(c => c.id);
    mutate(d => fireTrigger({ ...d, contacts: d.contacts.map(c => (c.workspaceId === workspaceId && ids.has(c.id) ? { ...c, tags: mode === 'add' ? [...new Set([...c.tags, existing])] : c.tags.filter(x => normalize(x) !== normalize(t)) } : c)) }, workspaceId, mode === 'add' ? 'tag_added' : 'tag_removed', changed, mode === 'add' ? existing : t));
    toast.success(mode === 'add' ? `Štítek „${existing}“ přidán k ${plural(ids.size, 'kontaktu', 'kontaktům', 'kontaktům')}.` : `Štítek „${t}“ odebrán.`);
    setTag(''); setError(''); onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title={mode === 'add' ? 'Přidat štítek' : 'Odebrat štítek'} desc={`Vybráno ${plural(contacts.length, 'kontakt', 'kontakty', 'kontaktů')}.`}>
      <form onSubmit={submit} noValidate>
        <div className="stack">
          {mode === 'add' ? (
            <div className="field"><span>Štítek</span><OptionCombobox value={tag} onChange={v => { setTag(v); setError(''); }} options={tags} label="Štítek" placeholder="Vyberte nebo vytvořte štítek" /><small>Vyberte existující štítek, nebo napište nový a zvolte „Vytvořit“.</small></div>
          ) : present.length ? (
            <div className="field"><span>Štítek</span><OptionCombobox value={tag} onChange={v => { setTag(v); setError(''); }} options={present} allowCreate={false} label="Štítek k odebrání" placeholder="Vyberte štítek" /></div>
          ) : <p className="muted">Vybrané kontakty nemají žádné štítky.</p>}
          <FormError>{error}</FormError>
        </div>
        <div className="form-actions"><Btn type="button" onClick={onClose}>Zrušit</Btn><Btn primary type="submit" disabled={mode === 'remove' && !present.length}>{mode === 'add' ? 'Přidat štítek' : 'Odebrat štítek'}</Btn></div>
      </form>
    </Modal>
  );
}

function StageDialog({ open, onClose, contacts }: { open: boolean; onClose: () => void; contacts: Contact[] }) {
  const { mutate, workspaceId } = useHub();
  const [stage, setStage] = useState<Lifecycle>('Zájemce');
  const apply = () => {
    const ids = new Set(contacts.map(c => c.id));
    mutate(d => ({ ...d, contacts: d.contacts.map(c => (c.workspaceId === workspaceId && ids.has(c.id) ? { ...c, stage } : c)) }));
    toast.success(`Fáze „${stage}“ nastavena u ${plural(ids.size, 'kontaktu', 'kontaktů', 'kontaktů')}.`); onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Změnit fázi" desc="Fáze životního cyklu nemění souhlas s e-mailingem.">
      <Field label="Nová fáze"><Pick value={stage} onChange={s => setStage(s as Lifecycle)} options={STAGES} className="full" label="Fáze" /></Field>
      <div className="form-actions"><Btn onClick={onClose}>Zrušit</Btn><Btn primary onClick={apply}>Změnit u {plural(contacts.length, 'kontaktu', 'kontaktů', 'kontaktů')}</Btn></div>
    </Modal>
  );
}

function CampaignDialog({ open, onClose, contacts }: { open: boolean; onClose: () => void; contacts: Contact[] }) {
  const { w, data, workspaceId, mutate, go } = useHub();
  const drafts = w.campaigns.filter(c => c.status === 'Koncept');
  const [target, setTarget] = useState('new');
  const withConsent = contacts.filter(c => c.consent.state === 'Udělen').length;
  const apply = () => {
    const ids = contacts.map(c => c.id);
    if (target === 'new') {
      const c = makeCampaign(data, workspaceId, { name: `Kampaň pro ${plural(ids.length, 'vybraný kontakt', 'vybrané kontakty', 'vybraných kontaktů')}`, audience: { type: 'manual' }, extraContactIds: ids });
      mutate(d => ({ ...d, campaigns: [c, ...d.campaigns] }));
      toast.success('Koncept kampaně byl vytvořen.'); onClose(); go(`kampane/${c.id}/upravit`); return;
    }
    const id = Number(target);
    mutate(d => ({ ...d, campaigns: d.campaigns.map(c => (c.workspaceId === workspaceId && c.id === id ? { ...c, extraContactIds: [...new Set([...c.extraContactIds, ...ids])], updatedAt: new Date().toISOString() } : c)) }));
    toast.success('Kontakty byly přidány mezi příjemce.', { action: { label: 'Otevřít kampaň', onClick: () => go(`kampane/${id}/upravit`) } }); onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Přidat do kampaně" desc={`E-mail dostanou jen kontakty se souhlasem: ${withConsent} z ${contacts.length}.`}>
      <Field label="Kampaň"><Pick value={target} onChange={setTarget} options={[['new', 'Nová kampaň jen pro vybrané kontakty'], ...drafts.map(c => [String(c.id), `${c.name} (koncept)`] as [string, string])]} className="full" label="Kampaň" /></Field>
      <div className="form-actions"><Btn onClick={onClose}>Zrušit</Btn><Btn primary onClick={apply}>{target === 'new' ? 'Vytvořit kampaň' : 'Přidat příjemce'}</Btn></div>
    </Modal>
  );
}

function WorkflowDialog({ open, onClose, contacts }: { open: boolean; onClose: () => void; contacts: Contact[] }) {
  const { w, workspaceId, mutate, go } = useHub();
  const flows = w.workflows.filter(f => f.status !== 'Koncept');
  const [id, setId] = useState('');
  const target = flows.find(f => f.id === id) ?? flows[0];
  const apply = () => {
    if (!target) return;
    let added = 0;
    mutate(d => { const r = enrollInWorkflow(d, workspaceId, target.id, contacts.map(c => c.id)); added = r.added; return r.data; });
    toast.success(added ? `Do scénáře „${target.name}“ přidáno: ${plural(added, 'kontakt', 'kontakty', 'kontaktů')}.` : 'Všechny vybrané kontakty už ve scénáři jsou.', { action: { label: 'Otevřít', onClick: () => go('automatizace/' + target.id) } });
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Přidat do automatizace" desc="Kontakty vstoupí do prvního kroku scénáře. Běh je simulovaný.">
      {flows.length ? <Field label="Scénář"><Pick value={target?.id ?? ''} onChange={setId} options={flows.map(f => [f.id, `${f.name} · ${f.status}`] as [string, string])} className="full" label="Scénář" /></Field> : <Notice>Nemáte žádný aktivní ani pozastavený scénář.</Notice>}
      {target?.status === 'Pozastaveno' && <Notice tone="warn">Scénář je pozastavený, kontakty budou čekat na jeho aktivaci.</Notice>}
      <div className="form-actions"><Btn onClick={onClose}>Zrušit</Btn><Btn primary onClick={apply} disabled={!target}>Přidat do scénáře</Btn></div>
    </Modal>
  );
}
