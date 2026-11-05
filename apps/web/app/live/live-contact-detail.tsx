'use client';
/* Contact detail over the API: profile, tags, stage, owner, notes and timeline. */
import React, { useState } from 'react';
import { ArrowLeft, Building2, Mail, MapPin, Pencil, Phone, Plus, RefreshCw, StickyNote, Tag as TagIcon, Trash2, User, X } from 'lucide-react';
import { toast } from 'sonner';
import { CONTACT_STAGES, type ActivityDto, type ContactDetailDto, type ContactStage, STAGE_LABEL } from '@softema/shared';
import { daysSince, fmtDate, fmtDateTime, fmtTime, plural } from '@/lib/hub/format';
import { Avatar, Btn, Field, IconBtn, Metric, Modal, Pick, Tabbar } from '../ui';
import { FormError, Notice, OptionCombobox, useConfirm } from '../kit-core';
import { ApiFailure, message, useActivities, useContact, useContactMutations, useMembers, useTags } from './api';
import { LoadFailure, LoadingBlock } from './live-ui';
import { useLive, useLiveRoute } from './live-state';

const ICON: Record<ActivityDto['type'], [typeof User, string]> = { contact: [User, 'gray'], note: [StickyNote, 'orange'], tag: [TagIcon, 'gray'], stage: [User, 'blue'] };
const isConflict = (e: unknown) => e instanceof ApiFailure && e.code === 'VERSION_CONFLICT';

export function LiveContactDetail({ id }: { id: string }) {
  const { workspace } = useLive();
  const { go } = useLiveRoute();
  const q = useContact(workspace.id, id);
  const back = <button type="button" className="back-link" onClick={() => go('kontakty')}><ArrowLeft size={15} aria-hidden />Zpět na kontakty</button>;
  if (q.isPending) return <div className="page">{back}<LoadingBlock label="Načítám kontakt…" /></div>;
  if (q.isError) {
    if (q.error instanceof ApiFailure && q.error.status === 404) return <div className="page"><section className="panel empty"><h3>Kontakt nenalezen</h3><p>V tomto pracovním prostoru kontakt neexistuje nebo byl smazán.</p><Btn primary onClick={() => go('kontakty')}>Zpět na kontakty</Btn></section></div>;
    return <div className="page">{back}<LoadFailure error={q.error} onRetry={() => void q.refetch()} /></div>;
  }
  return <Detail c={q.data} back={back} />;
}

function Detail({ c, back }: { c: ContactDetailDto; back: React.ReactNode }) {
  const { workspace, allowed } = useLive();
  const { go } = useLiveRoute();
  const m = useContactMutations(workspace.id, c.id);
  const members = useMembers(workspace.id);
  const [tab, setTab] = useState('timeline');
  const [editing, setEditing] = useState(false);
  const [confirmEl, confirm] = useConfirm();
  const [now] = useState(() => Date.now());
  const quick = (patch: { stage?: ContactStage; ownerId?: string | null }, done: string) => {
    if (m.update.isPending) return;
    m.update.mutate({ version: c.version, ...patch }, {
      onSuccess: () => toast.success(done),
      onError: e => { toast.error(message(e)); if (isConflict(e)) void m.refresh(); },
    });
  };
  const owners: [string, string][] = [['none', 'Bez vlastníka'], ...(members.data ?? []).map(u => [u.id, u.name] as [string, string]), ...(c.owner && !members.data?.some(u => u.id === c.owner!.id) ? [[c.owner.id, c.owner.name] as [string, string]] : [])];
  const removeContact = () => m.remove.mutate(undefined, {
    onSuccess: async () => { toast.success('Kontakt byl smazán.'); await m.refresh(); go('kontakty'); },
    onError: e => toast.error(message(e)),
  });
  return (
    <div className="page">
      {back}
      <div className="contact-layout">
        <section className="panel">
          <div className="contact-profile">
            <Avatar name={c.name} size="lg" />
            <div><h2>{c.name}</h2><p>{c.company || 'Soukromá osoba'}</p></div>
            <div className="contact-actions"><Btn onClick={() => setEditing(true)} aria-label="Upravit kontakt"><Pencil aria-hidden /></Btn></div>
          </div>
          <div className="contact-info">
            <h3>Kontaktní údaje</h3>
            <div className="info-row"><Mail aria-hidden /><a href={`mailto:${c.email}`}>{c.email}</a></div>
            <div className="info-row"><Phone aria-hidden />{c.phone || 'Telefon neuveden'}</div>
            <div className="info-row"><Building2 aria-hidden />{c.company || 'Firma neuvedena'}</div>
            <div className="info-row"><MapPin aria-hidden />{c.city || 'Město neuvedeno'}</div>
          </div>
          <TagsBox c={c} />
          <div className="contact-info">
            <Field label="Fáze životního cyklu"><Pick value={c.stage} onChange={s => { if (s !== c.stage) quick({ stage: s as ContactStage }, 'Fáze byla změněna.'); }} options={CONTACT_STAGES.map(s => [s, STAGE_LABEL[s]] as [string, string])} className="full" label="Fáze" /></Field>
            <Field label="Vlastník"><Pick value={c.owner?.id ?? 'none'} onChange={o => { if (o !== (c.owner?.id ?? 'none')) quick({ ownerId: o === 'none' ? null : o }, 'Vlastník byl změněn.'); }} options={owners} className="full" label="Vlastník" /></Field>
            <p className="small muted" role="status">{m.update.isPending ? 'Ukládám…' : ''}</p>
            <div className="kv"><span>Zdroj</span><strong>{c.source}</strong></div>
            <div className="kv"><span>Vytvořeno</span><strong>{fmtDate(c.createdAt)}</strong></div>
            <div className="kv"><span>Naposledy upraveno</span><strong>{fmtDateTime(c.updatedAt)}</strong></div>
          </div>
          {allowed('contact:delete') && (
            <div className="contact-info">
              <Btn className="danger-ghost" disabled={m.remove.isPending} onClick={() => confirm({ title: `Smazat kontakt ${c.name}?`, desc: 'Kontakt zmizí ze seznamu pro všechny členy prostoru. Historie zůstane v auditním záznamu.', confirm: 'Smazat kontakt', danger: true, onConfirm: removeContact })}><Trash2 aria-hidden />{m.remove.isPending ? 'Mažu…' : 'Smazat kontakt'}</Btn>
            </div>
          )}
        </section>
        <div className="detail-main">
          <div className="detail-stats">
            <Metric label="V databázi" value={plural(Math.max(0, daysSince(c.createdAt, now)), 'den', 'dny', 'dní')} desc={`od ${fmtDate(c.createdAt)}`} />
            <Metric label="Poznámky" value={String(c.notes.length)} desc="interní, vidí je tým" />
            <Metric label="Štítky" value={String(c.tags.length)} desc="sdílené v prostoru" />
          </div>
          <div className="panel">
            <div className="px-5"><Tabbar value={tab} onChange={setTab} items={[['timeline', 'Časová osa'], ['notes', `Poznámky (${c.notes.length})`]]} /></div>
            {tab === 'timeline' ? <Timeline id={c.id} /> : <Notes c={c} />}
          </div>
        </div>
      </div>
      <EditContact c={c} open={editing} onClose={() => setEditing(false)} />
      {confirmEl}
    </div>
  );
}

function Timeline({ id }: { id: string }) {
  const { workspace } = useLive();
  const q = useActivities(workspace.id, id);
  if (q.isPending) return <div className="tab-pad"><LoadingBlock label="Načítám časovou osu…" /></div>;
  if (q.isError) return <div className="tab-pad"><LoadFailure error={q.error} onRetry={() => void q.refetch()} title="Časovou osu se nepodařilo načíst" /></div>;
  const items = q.data.items;
  if (!items.length) return <p className="tab-pad muted">Zatím žádné aktivity.</p>;
  return (
    <div className="timeline">
      {items.map((a, k) => {
        const [Icon, tone] = ICON[a.type] ?? [User, 'gray']; const day = fmtDate(a.createdAt); const head = k === 0 || fmtDate(items[k - 1].createdAt) !== day;
        return (
          <React.Fragment key={a.id}>
            {head && <p className="timeline-date">{day}</p>}
            <div className="timeline-item">
              <span className={'activity-icon ' + tone}><Icon aria-hidden /></span>
              <div className="timeline-body">
                <div className="flex-row spread"><h3>{a.title}</h3><small>{fmtTime(a.createdAt)}</small></div>
                <p>{[a.detail, a.actor?.name].filter(Boolean).join(' · ')}</p>
              </div>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function TagsBox({ c }: { c: ContactDetailDto }) {
  const { workspace } = useLive();
  const m = useContactMutations(workspace.id, c.id);
  const tags = useTags(workspace.id);
  const busy = m.addTag.isPending || m.removeTag.isPending;
  const add = (t: string) => {
    if (!t.trim() || busy) return;
    m.addTag.mutate(t.trim(), { onSuccess: () => toast.success('Štítek byl přidán.'), onError: e => toast.error(message(e)) });
  };
  return (
    <div className="contact-info" aria-busy={busy}>
      <h3>Štítky</h3>
      <div className="contact-tags">
        {c.tags.map(t => <span key={t.id} className="tag-chip">{t.name}<button type="button" disabled={busy} aria-label={`Odebrat štítek ${t.name}`} onClick={() => m.removeTag.mutate(t.id, { onError: e => toast.error(message(e)) })}><X size={12} aria-hidden /></button></span>)}
        <OptionCombobox value="" onChange={add} options={(tags.data ?? []).map(t => t.name).filter(n => !c.tags.some(x => x.name === n))} label="Přidat štítek" trigger={<button type="button" className="pill-tag" disabled={busy}>{busy ? 'Ukládám…' : '+ Přidat'}</button>} />
      </div>
    </div>
  );
}

function Notes({ c }: { c: ContactDetailDto }) {
  const { workspace } = useLive();
  const m = useContactMutations(workspace.id, c.id);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [confirmEl, confirm] = useConfirm();
  const add = () => m.addNote.mutate(text.trim(), { onSuccess: () => { setText(''); setError(''); toast.success('Poznámka byla přidána.'); }, onError: e => setError(message(e)) });
  return (
    <div className="tab-pad stack">
      <Field label="Nová interní poznámka"><textarea value={text} onChange={e => setText(e.target.value)} placeholder="Co by měl tým vědět o tomto kontaktu?" maxLength={2000} disabled={m.addNote.isPending} /></Field>
      <div><Btn primary onClick={add} disabled={!text.trim() || m.addNote.isPending}><Plus aria-hidden />{m.addNote.isPending ? 'Ukládám…' : 'Přidat poznámku'}</Btn></div>
      <FormError>{error}</FormError>
      {c.notes.map(n => (
        <div className="note-card" key={n.id}>
          {editing === n.id ? (
            <div className="stack-sm">
              <textarea value={draft} onChange={e => setDraft(e.target.value)} aria-label="Upravit poznámku" maxLength={2000} disabled={m.updateNote.isPending} />
              <div className="flex-row"><Btn primary disabled={!draft.trim() || m.updateNote.isPending} onClick={() => m.updateNote.mutate({ id: n.id, body: draft.trim() }, { onSuccess: () => { setEditing(null); setError(''); toast.success('Poznámka byla upravena.'); }, onError: e => setError(message(e)) })}>{m.updateNote.isPending ? 'Ukládám…' : 'Uložit'}</Btn><Btn onClick={() => setEditing(null)} disabled={m.updateNote.isPending}>Zrušit</Btn></div>
            </div>
          ) : (
            <>
              <p className="note-text">{n.body}</p>
              <div className="flex-row spread"><span className="small muted">{n.author.name} · {fmtDateTime(n.createdAt)}</span><span className="flex-row"><IconBtn label="Upravit poznámku" onClick={() => { setEditing(n.id); setDraft(n.body); }}><Pencil /></IconBtn><IconBtn label="Smazat poznámku" onClick={() => confirm({ title: 'Smazat poznámku?', desc: 'Poznámka zmizí všem členům prostoru.', confirm: 'Smazat', danger: true, onConfirm: () => m.removeNote.mutate(n.id, { onSuccess: () => toast.success('Poznámka byla smazána.'), onError: e => setError(message(e)) }) })}><Trash2 /></IconBtn></span></div>
            </>
          )}
        </div>
      ))}
      {!c.notes.length && <p className="muted">Zatím žádné poznámky.</p>}
      {confirmEl}
    </div>
  );
}

function EditContact({ c, open, onClose }: { c: ContactDetailDto; open: boolean; onClose: () => void }) {
  const { workspace } = useLive();
  const m = useContactMutations(workspace.id, c.id);
  const init = { name: c.name, email: c.email, phone: c.phone, company: c.company, city: c.city };
  const [v, setV] = useState(init);
  const [base, setBase] = useState(c.version);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) { setPrevOpen(open); if (open) { setV(init); setBase(c.version); setError(''); setFields({}); setConflict(false); } }
  const pending = m.update.isPending;
  const close = () => { if (!pending) onClose(); };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    m.update.mutate({ version: base, ...v }, {
      onSuccess: () => { toast.success('Kontakt byl uložen.'); onClose(); },
      onError: err => { if (isConflict(err)) { setConflict(true); setError(''); } else { setError(message(err)); setFields(err instanceof ApiFailure ? err.fields ?? {} : {}); } },
    });
  };
  // The form resets only once the newer version has actually arrived, never from stale props.
  if (reloading && c.version !== base) { setReloading(false); setConflict(false); setV(init); setBase(c.version); }
  const reload = () => { setReloading(true); void m.refresh(); };
  return (
    <Modal open={open} onClose={close} title="Upravit kontakt" desc="Kontaktní údaje a firma.">
      <form onSubmit={submit} noValidate>
        <fieldset disabled={pending} className="contents">
          <div className="stack">
            <Field label="Jméno a příjmení" hint={fields.name}><input value={v.name} onChange={e => setV({ ...v, name: e.target.value })} required /></Field>
            <Field label="E-mail" hint={fields.email}><input type="email" value={v.email} onChange={e => setV({ ...v, email: e.target.value })} required /></Field>
            <div className="form-grid">
              <Field label="Telefon"><input type="tel" value={v.phone} onChange={e => setV({ ...v, phone: e.target.value })} /></Field>
              <Field label="Firma"><input value={v.company} onChange={e => setV({ ...v, company: e.target.value })} /></Field>
              <Field label="Město"><input value={v.city} onChange={e => setV({ ...v, city: e.target.value })} /></Field>
            </div>
            {conflict && <Notice tone="warn">Kontakt mezitím upravil někdo jiný, vaše změny se neuložily.<div className="mt-2"><Btn type="button" disabled={reloading} onClick={reload}><RefreshCw aria-hidden />{reloading ? 'Načítám…' : 'Načíst aktuální data'}</Btn></div></Notice>}
            <FormError>{error}</FormError>
          </div>
          <div className="form-actions"><Btn type="button" onClick={close}>Zrušit</Btn><Btn primary type="submit" disabled={conflict} aria-busy={pending}>{pending ? 'Ukládám…' : 'Uložit změny'}</Btn></div>
        </fieldset>
      </form>
    </Modal>
  );
}
