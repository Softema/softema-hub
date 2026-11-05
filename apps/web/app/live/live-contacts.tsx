'use client';
/* Contact list and creation over the API. Filters stay in the URL; search and paging run on the server. */
import React, { useEffect, useState } from 'react';
import { ChevronRight, Plus, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { CONTACT_STAGES, type ContactDto, type ContactStage, STAGE_LABEL } from '@softema/shared';
import { fmt, fmtDate } from '@/lib/hub/format';
import { Avatar, Badge, Btn, Field, Modal, PageHead, Pick, SearchInput } from '../ui';
import { FormError, Pager } from '../kit-core';
import { ApiFailure, message, useContactMutations, useContacts, useTags } from './api';
import { LoadFailure, LoadingBlock } from './live-ui';
import { LiveContactDetail } from './live-contact-detail';
import { useLive, useLiveRoute } from './live-state';

export const stageTone = (s: ContactStage) => (s === 'client' ? 'green' : s === 'prospect' ? 'blue' : 'gray');
const SORTS: [string, string][] = [['newest', 'Nejnovější'], ['name', 'Podle jména'], ['company', 'Podle firmy']];
const LIMIT = 25;

export function LiveContacts() {
  const { parts } = useLiveRoute();
  return parts[1] ? <LiveContactDetail key={parts[1]} id={parts[1]} /> : <ContactList />;
}

function ContactList() {
  const { workspace } = useLive();
  const { query, setQuery, go } = useLiveRoute();
  const f = { q: query.get('q') ?? '', stage: query.get('faze') ?? '', tag: query.get('stitek') ?? '', source: query.get('zdroj') ?? '', sort: query.get('razeni') ?? 'newest' };
  const page = Number(query.get('strana') || 1);
  const [text, setText] = useState(f.q);
  const [creating, setCreating] = useState(false);
  useEffect(() => { const t = setTimeout(() => { if (text !== f.q) setQuery({ q: text || undefined, strana: undefined }); }, 250); return () => clearTimeout(t); });
  const list = useContacts(workspace.id, { q: f.q, stage: f.stage, tag: f.tag, source: f.source, sort: f.sort, page });
  const tags = useTags(workspace.id);
  const filter = (patch: Record<string, string | undefined>) => setQuery({ ...patch, strana: undefined });
  const filtered = !!(f.q || f.stage || f.tag || f.source);
  const clear = () => { setText(''); setQuery({ q: undefined, faze: undefined, stitek: undefined, zdroj: undefined, strana: undefined }); };
  const d = list.data;
  const pages = d ? Math.max(1, Math.ceil(d.total / LIMIT)) : 1;
  const from = d && d.total ? (d.page - 1) * LIMIT + 1 : 0;
  return (
    <div className="page">
      <PageHead title="Kontakty" desc={`Databáze pracovního prostoru ${workspace.name}. Změny vidí všichni členové prostoru.`}>
        <Btn primary onClick={() => setCreating(true)}><Plus aria-hidden />Nový kontakt</Btn>
      </PageHead>
      <div className="filter-bar">
        <SearchInput value={text} onChange={setText} placeholder="Hledat jméno, e-mail, firmu, město…" />
        <div className="filter-row">
          <Pick label="Fáze" value={f.stage || 'all'} onChange={v => filter({ faze: v === 'all' ? undefined : v })} options={[['all', 'Všechny fáze'], ...CONTACT_STAGES.map(s => [s, STAGE_LABEL[s]] as [string, string])]} />
          <Pick label="Štítek" value={f.tag || 'all'} onChange={v => filter({ stitek: v === 'all' ? undefined : v })} options={[['all', 'Všechny štítky'], ...(tags.data ?? []).map(t => [t.name, t.name] as [string, string])]} />
          <Pick label="Zdroj" value={f.source || 'all'} onChange={v => filter({ zdroj: v === 'all' ? undefined : v })} options={[['all', 'Všechny zdroje'], ...(d?.sources ?? []).map(s => [s, s] as [string, string])]} />
          <Pick label="Řazení" value={f.sort} onChange={v => setQuery({ razeni: v === 'newest' ? undefined : v, strana: undefined })} options={SORTS} />
        </div>
      </div>
      {filtered && <div className="chips" aria-label="Aktivní filtry"><button type="button" className="chip" onClick={clear}>Zrušit všechny filtry<X size={14} aria-hidden /></button></div>}
      {list.isPending ? <LoadingBlock label="Načítám kontakty…" />
        : !d ? <LoadFailure error={list.error} onRetry={() => void list.refetch()} />
        : (
          <section className="panel" aria-busy={list.isFetching}>
            {list.isError && <p className="form-error" role="alert">Seznam se nepodařilo obnovit, zobrazená data mohou být starší. {message(list.error)}</p>}
            {!d.total && !filtered ? (
              <div className="empty"><h3>V tomto prostoru zatím nejsou kontakty</h3><p>Přidejte první kontakt.</p><Btn primary onClick={() => setCreating(true)}><Plus aria-hidden />Nový kontakt</Btn></div>
            ) : !d.total ? (
              <div className="empty"><Search size={28} /><h3>Žádný kontakt neodpovídá hledání.</h3><p>Zkuste změnit hledání nebo filtr.</p><Btn onClick={clear}>Zrušit filtry</Btn></div>
            ) : (
              <>
                <div className="table-scroll">
                  <table className="hub-table data-table">
                    <thead><tr><th>Kontakt</th><th className="col-opt">Firma</th><th className="col-opt">Štítky</th><th className="col-mob">Fáze</th><th className="col-opt">Zdroj</th><th className="col-opt">Přidáno</th><th aria-hidden /></tr></thead>
                    <tbody>{d.items.map(c => <Row key={c.id} c={c} open={() => go('kontakty/' + c.id)} />)}</tbody>
                  </table>
                </div>
                <Pager page={d.page} pages={pages} total={d.total} from={from} to={from + d.items.length - 1} onPage={p => setQuery({ strana: p > 1 ? String(p) : undefined })} noun="kontaktů" />
              </>
            )}
          </section>
        )}
      <CreateContact open={creating} onClose={() => setCreating(false)} onCreated={id => go('kontakty/' + id)} />
    </div>
  );
}

function Row({ c, open }: { c: ContactDto; open: () => void }) {
  return (
    <tr onClick={open}>
      <td><div className="name-cell"><Avatar name={c.name} /><button type="button" onClick={e => { e.stopPropagation(); open(); }}>{c.name}<small>{c.email}</small><span className="mob-only tag-cell"><Badge tone={stageTone(c.stage)}>{STAGE_LABEL[c.stage]}</Badge></span></button></div></td>
      <td className="col-opt muted ellipsis" title={c.company || undefined}>{c.company || '—'}</td>
      <td className="col-opt"><div className="tag-cell">{c.tags.slice(0, 1).map(t => <Badge key={t.id} tone="gray">{t.name}</Badge>)}{c.tags.length > 1 && <span className="muted small" title={c.tags.slice(1).map(t => t.name).join(', ')}>+{fmt(c.tags.length - 1)}</span>}</div></td>
      <td className="col-mob"><Badge tone={stageTone(c.stage)}>{STAGE_LABEL[c.stage]}</Badge></td>
      <td className="col-opt muted">{c.source}</td>
      <td className="col-opt muted nowrap">{fmtDate(c.createdAt)}</td>
      <td className="col-go"><ChevronRight size={16} aria-hidden className="muted" /></td>
    </tr>
  );
}

function CreateContact({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { workspace } = useLive();
  const { create } = useContactMutations(workspace.id);
  const blank = { name: '', email: '', phone: '', company: '', city: '', stage: 'lead' as ContactStage, tags: '' };
  const [v, setV] = useState(blank);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const set = (p: Partial<typeof blank>) => { setV(x => ({ ...x, ...p })); setError(''); setFields({}); };
  const close = () => { if (create.isPending) return; setV(blank); setError(''); setFields({}); onClose(); };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate({ ...v, tags: v.tags.split(',').map(t => t.trim()).filter(Boolean) }, {
      onSuccess: c => { toast.success('Kontakt byl vytvořen.'); setV(blank); onClose(); onCreated(c.id); },
      onError: err => { setError(message(err)); setFields(err instanceof ApiFailure ? err.fields ?? {} : {}); },
    });
  };
  return (
    <Modal open={open} onClose={close} title="Nový kontakt" desc={`Kontakt uvidí všichni členové prostoru ${workspace.name}.`}>
      <form onSubmit={submit} noValidate>
        <fieldset disabled={create.isPending} className="contents">
          <div className="stack">
            <Field label="Jméno a příjmení" hint={fields.name}><input value={v.name} onChange={e => set({ name: e.target.value })} placeholder="Např. Jana Novotná" aria-invalid={!!fields.name || undefined} autoFocus required /></Field>
            <Field label="E-mail" hint={fields.email}><input type="email" value={v.email} onChange={e => set({ email: e.target.value })} placeholder="jana@firma.cz" aria-invalid={!!fields.email || undefined} required /></Field>
            <div className="form-grid">
              <Field label="Telefon"><input type="tel" value={v.phone} onChange={e => set({ phone: e.target.value })} placeholder="+420" /></Field>
              <Field label="Firma"><input value={v.company} onChange={e => set({ company: e.target.value })} /></Field>
              <Field label="Město"><input value={v.city} onChange={e => set({ city: e.target.value })} /></Field>
              <Field label="Fáze"><Pick value={v.stage} onChange={s => set({ stage: s as ContactStage })} options={CONTACT_STAGES.map(s => [s, STAGE_LABEL[s]] as [string, string])} className="full" label="Fáze" /></Field>
            </div>
            <Field label="Štítky" hint="Oddělte čárkou, např. Newsletter, VIP"><input value={v.tags} onChange={e => set({ tags: e.target.value })} /></Field>
            <FormError>{error}</FormError>
          </div>
          <div className="form-actions"><Btn type="button" onClick={close}>Zrušit</Btn><Btn primary type="submit" aria-busy={create.isPending}>{create.isPending ? 'Ukládám…' : 'Vytvořit kontakt'}</Btn></div>
        </fieldset>
      </form>
    </Modal>
  );
}
