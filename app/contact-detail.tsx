'use client';
/* Contact detail: profile, tags, custom fields, consent, timeline from all modules, notes, deals and GDPR actions. */
import React, { useMemo, useState } from 'react';
import { ArrowLeft, Building2, ChevronRight, CreditCard, Download, FileText, GraduationCap, Mail, MapPin, MessageSquare, MousePointer2, Pencil, Phone, Plus, ShieldCheck, ShieldOff, StickyNote, Trash2, User, UserX, Users, Video, Wallet, Workflow, X, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { fmtDate, fmtDateTime, fmtTime, isEmail, money, newId, normalize, percent, plural, daysSince } from '@/lib/hub/format';
import { contactTimeline, contactValue, courseLessons, invoiceTotal, invoiceView, matchesRule, progressOf, segmentContext, webinarState, type TimelineItem } from '@/lib/hub/logic';
import { anonymizeContact, contactExport, deleteContacts, enrollInCourse, enrollInWorkflow, findByEmail, logActivity, setConsent } from '@/lib/hub/ops';
import { fireTrigger } from '@/lib/hub/flow';
import { DEAL_STAGES, type ActivityType, type Contact, type CustomField, type Deal, type DealStage, type Lifecycle } from '@/lib/hub/types';
import { useHub } from './state';
import { Avatar, Badge, Btn, Field, IconBtn, Metric, Modal, Pick, Tabbar } from './ui';
import { FormError, Notice, download, useConfirm } from './kit';
import { STAGES, consentTone } from './crm-shared';

const ICON: Partial<Record<ActivityType, [LucideIcon, string]>> = {
  contact: [User, 'gray'], note: [StickyNote, 'orange'], tag: [User, 'gray'], stage: [User, 'blue'], deal: [Wallet, 'orange'], consent: [ShieldCheck, 'green'],
  email_sent: [Mail, 'blue'], email_open: [Mail, 'blue'], email_click: [MousePointer2, 'orange'], email_bounce: [Mail, 'gray'],
  invoice: [FileText, 'gray'], payment: [CreditCard, 'green'], refund: [CreditCard, 'orange'], subscription: [CreditCard, 'purple'],
  course: [GraduationCap, 'purple'], lesson: [GraduationCap, 'purple'], product: [Download, 'purple'], community: [Users, 'green'],
  webinar: [Video, 'blue'], chatbot: [MessageSquare, 'pink'], automation: [Workflow, 'orange'], form: [FileText, 'gray'],
};
const GROUPS: [string, string, ActivityType[]][] = [
  ['all', 'Všechny aktivity', []],
  ['email', 'E-maily', ['email_sent', 'email_open', 'email_click', 'email_bounce']],
  ['pay', 'Platby', ['invoice', 'payment', 'refund', 'subscription']],
  ['learn', 'Kurzy a produkty', ['course', 'lesson', 'product']],
  ['web', 'Webináře', ['webinar']],
  ['crm', 'CRM a souhlasy', ['contact', 'note', 'tag', 'stage', 'deal', 'consent', 'automation', 'chatbot', 'form', 'community']],
];
const DEAL_PROB: Record<DealStage, number> = { 'Nový lead': 10, 'Kvalifikace': 25, 'Nabídka odeslána': 65, 'Vyjednávání': 80, 'Vyhráno': 100, 'Prohráno': 0 };

export default function ContactDetail({ id }: { id: number }) {
  const { w, go } = useHub();
  const c = w.contacts.find(x => x.id === id);
  if (!c) return (
    <div className="page"><section className="panel empty"><h3>Kontakt nenalezen</h3><p>V tomto pracovním prostoru kontakt neexistuje nebo byl smazán.</p><Btn primary onClick={() => go('kontakty')}>Zpět na kontakty</Btn></section></div>
  );
  return <Detail key={c.id} c={c} />;
}

function Detail({ c }: { c: Contact }) {
  const { data, w, workspaceId, go, patch, mutate, log, settings, profile } = useHub();
  const [tab, setTab] = useState('timeline');
  const [group, setGroup] = useState('all');
  const [dialog, setDialog] = useState<null | 'edit' | 'mail' | 'deal' | 'course' | 'flow'>(null);
  const [fieldDialog, setFieldDialog] = useState<null | { id?: string }>(null);
  const [confirmEl, confirm] = useConfirm();
  const [now] = useState(() => Date.now());

  const timeline = useMemo(() => contactTimeline(data, workspaceId, c.id), [data, workspaceId, c.id]);
  const shown = timeline.filter(t => group === 'all' || GROUPS.find(g => g[0] === group)![2].includes(t.type));
  const emails = w.campaigns.filter(x => x.results?.some(r => r.contactId === c.id)).sort((a, b) => (b.sentAt ?? '').localeCompare(a.sentAt ?? ''));
  const delivered = emails.filter(x => x.results!.find(r => r.contactId === c.id)!.delivered);
  const opened = delivered.filter(x => x.results!.find(r => r.contactId === c.id)!.opened).length;
  const deals = w.deals.filter(d => d.contactId === c.id);
  const enrollments = w.enrollments.filter(e => e.contactId === c.id);
  const purchases = w.purchases.filter(p => p.contactId === c.id);
  const regs = w.registrations.filter(r => r.contactId === c.id);
  const memberships = w.memberships.filter(m => m.contactId === c.id);
  const flows = w.workflows.filter(f => f.enrolled.some(e => e.contactId === c.id));
  const invoices = w.invoices.filter(i => i.contactId === c.id).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  const txs = w.transactions.filter(t => t.contactId === c.id).sort((a, b) => b.date.localeCompare(a.date));
  const subs = w.subscriptions.filter(s => s.contactId === c.id);
  const tags = useMemo(() => [...new Set(w.contacts.flatMap(x => x.tags))].sort((a, b) => a.localeCompare(b, 'cs')), [w.contacts]);
  const segments = useMemo(() => { const ctx = segmentContext(data, workspaceId); return w.segments.filter(s => !s.rules.length || (s.match === 'all' ? s.rules.every(r => matchesRule(c, r, ctx)) : s.rules.some(r => matchesRule(c, r, ctx)))); }, [data, workspaceId, w.segments, c]);

  const update = (fn: (x: Contact) => Contact) => patch('contacts', c.id, fn);
  const setStage = (stage: Lifecycle) => { if (stage === c.stage) return; update(x => ({ ...x, stage })); log(c.id, 'stage', `Fáze změněna na ${stage}`, `Předtím: ${c.stage}`); toast.success('Fáze kontaktu byla změněna.'); };
  const consent = (state: Contact['consent']['state'], source: string, doubleOptIn?: boolean, message?: string) => { mutate(d => setConsent(d, workspaceId, [c.id], state, source, doubleOptIn)); toast.success(message ?? 'Souhlas byl aktualizován.'); };

  return (
    <div className="page">
      <button type="button" className="back-link" onClick={() => go('kontakty')}><ArrowLeft size={15} aria-hidden />Zpět na kontakty</button>
      <div className="contact-layout">
        <section className="panel">
          <div className="contact-profile">
            <Avatar name={c.name} color={c.color} size="lg" />
            <div><h2>{c.name}</h2><p>{c.company || 'Soukromá osoba'}</p></div>
            <div className="contact-actions">
              <Btn onClick={() => setDialog('mail')}><Mail aria-hidden />E-mail</Btn>
              <Btn onClick={() => setDialog('edit')} aria-label="Upravit kontakt"><Pencil aria-hidden /></Btn>
            </div>
          </div>
          <div className="contact-info">
            <h3>Kontaktní údaje</h3>
            <div className="info-row"><Mail aria-hidden /><a href={`mailto:${c.email}`}>{c.email}</a></div>
            <div className="info-row"><Phone aria-hidden />{c.phone || 'Telefon neuveden'}</div>
            <div className="info-row"><Building2 aria-hidden />{c.company || 'Firma neuvedena'}</div>
            <div className="info-row"><MapPin aria-hidden />{c.city || 'Město neuvedeno'}</div>
          </div>
          <TagsBox c={c} all={tags} />
          <section className="contact-info" aria-labelledby="custom-fields-title">
            <div className="cf-head"><h3 id="custom-fields-title">Vlastní pole</h3><IconBtn label="Přidat vlastní pole" onClick={() => setFieldDialog({})}><Plus /></IconBtn></div>
            {c.customFields.length ? <div className="cf-list">{c.customFields.map(f => <button key={f.id} type="button" className="custom-field-row" onClick={() => setFieldDialog({ id: f.id })} aria-label={`Upravit pole ${f.name}`}><span>{f.name}</span><strong>{f.value || '—'}</strong></button>)}</div>
              : <><p className="cf-empty">Zatím tu nejsou žádná vlastní pole. Doplňte třeba obor nebo preferovaný kanál.</p><button type="button" className="pill-tag" onClick={() => setFieldDialog({})}>+ Přidat pole</button></>}
          </section>
          <div className="contact-info">
            <Field label="Fáze životního cyklu"><Pick value={c.stage} onChange={s => setStage(s as Lifecycle)} options={STAGES} className="full" label="Fáze" /></Field>
            <Field label="Vlastník"><Pick value={c.owner} onChange={o => { update(x => ({ ...x, owner: o })); toast.success('Vlastník byl změněn.'); }} options={[...new Set([c.owner, ...settings.team.map(t => t.name)])]} className="full" label="Vlastník" /></Field>
            <div className="kv"><span>Zdroj</span><strong>{c.source}</strong></div>
            <div className="kv"><span>Vytvořeno</span><strong>{fmtDate(c.createdAt)}</strong></div>
          </div>
          <ConsentBox c={c} onChange={consent} />
        </section>

        <div className="detail-main">
          <div className="detail-stats">
            <Metric label="Celková hodnota" value={money(contactValue(data, workspaceId, c.id))} desc="zaplaceno po odečtení vratek" />
            <Metric label="Míra otevření" value={delivered.length ? percent((opened / delivered.length) * 100) : '—'} desc={delivered.length ? plural(delivered.length, 'doručený e-mail', 'doručené e-maily', 'doručených e-mailů') : 'zatím bez e-mailů'} />
            <Metric label="V databázi" value={plural(Math.max(0, daysSince(c.createdAt, now)), 'den', 'dny', 'dní')} desc={`od ${fmtDate(c.createdAt)}`} />
          </div>
          <div className="panel">
            <div className="px-5"><Tabbar value={tab} onChange={setTab} items={[['timeline', 'Časová osa'], ['emails', `E-maily (${emails.length})`], ['payments', `Platby (${invoices.length + txs.length})`], ['notes', `Poznámky (${c.notes.length})`]]} /></div>
            {tab === 'timeline' && (
              <>
                <div className="timeline-filter"><Pick value={group} onChange={setGroup} options={GROUPS.map(g => [g[0], g[1]] as [string, string])} label="Filtrovat aktivity" /><span className="muted small">{plural(shown.length, 'záznam', 'záznamy', 'záznamů')}</span></div>
                <Timeline items={shown} />
              </>
            )}
            {tab === 'emails' && (
              <div className="tab-pad">
                {emails.length ? (
                  <ul className="row-list">
                    {emails.map(x => { const r = x.results!.find(y => y.contactId === c.id)!; const st = !r.delivered ? 'Nedoručeno' : r.unsubscribed ? 'Odhlásil(a) se' : r.clicked ? 'Kliknul(a)' : r.opened ? 'Otevřeno' : 'Doručeno'; return (
                      <li key={x.id}><button type="button" className="row-item" onClick={() => go('kampane/' + x.id)}>
                        <span className="row-icon"><Mail size={16} aria-hidden /></span>
                        <span className="row-main"><strong>{x.name}</strong><small>{x.subject} · {x.sentAt ? fmtDateTime(x.sentAt) : ''}</small></span>
                        <Badge tone={st === 'Kliknul(a)' ? 'orange' : st === 'Otevřeno' ? 'blue' : st === 'Nedoručeno' || st === 'Odhlásil(a) se' ? 'red' : 'gray'}>{st}</Badge>
                        <ChevronRight size={16} aria-hidden className="muted" />
                      </button></li>
                    ); })}
                  </ul>
                ) : <p className="muted">Kontakt zatím nedostal žádnou kampaň.</p>}
                <Btn className="mt-4" onClick={() => setDialog('mail')}><Mail aria-hidden />Napsat individuální e-mail</Btn>
              </div>
            )}
            {tab === 'payments' && (
              <div className="tab-pad stack">
                <div className="flex-row spread"><h3>Faktury</h3><Btn onClick={() => go(`platby/faktury/nova?kontakt=${c.id}`)}><Plus aria-hidden />Nová faktura</Btn></div>
                {invoices.length ? <ul className="row-list">{invoices.map(i => { const v = invoiceView(i, now); return (
                  <li key={i.id}><button type="button" className="row-item" onClick={() => go('platby/faktury/' + i.id)}>
                    <span className="row-icon"><FileText size={16} aria-hidden /></span>
                    <span className="row-main"><strong>Faktura {i.number}</strong><small>{i.items.map(x => x.name).join(', ')} · vystaveno {fmtDate(i.issuedAt)}</small></span>
                    <span className="num">{money(invoiceTotal(i))}</span><Badge tone={v === 'Zaplacená' ? 'green' : v === 'Po splatnosti' ? 'red' : v === 'Odeslaná' ? 'blue' : 'gray'}>{v}</Badge>
                  </button></li>
                ); })}</ul> : <p className="muted">Žádné faktury.</p>}
                <h3>Platby</h3>
                {txs.length ? <ul className="row-list">{txs.map(t => (
                  <li key={t.id}><button type="button" className="row-item" onClick={() => go('platby/transakce')}>
                    <span className="row-icon"><CreditCard size={16} aria-hidden /></span>
                    <span className="row-main"><strong>{t.description}</strong><small>{t.method} · {fmtDateTime(t.date)}</small></span>
                    <span className="num">{money(t.amount)}</span><Badge tone={t.status === 'Úspěšná' ? 'green' : t.status === 'Vrácená' ? 'orange' : 'red'}>{t.status}</Badge>
                  </button></li>
                ))}</ul> : <p className="muted">Žádné platby.</p>}
                {subs.length > 0 && <><h3>Předplatné</h3><ul className="row-list">{subs.map(s => (
                  <li key={s.id}><button type="button" className="row-item" onClick={() => go('platby/predplatne')}>
                    <span className="row-icon"><CreditCard size={16} aria-hidden /></span>
                    <span className="row-main"><strong>{s.plan}</strong><small>{money(s.price)} {s.interval} · další platba {fmtDate(s.nextPaymentAt)}</small></span>
                    <Badge tone={s.status === 'Aktivní' ? 'green' : 'gray'}>{s.status}</Badge>
                  </button></li>
                ))}</ul></>}
              </div>
            )}
            {tab === 'notes' && <Notes c={c} author={profile.name} />}
          </div>
        </div>

        <aside className="contact-right stack">
          <section className="panel side-box">
            <div className="side-head"><h3>Obchody</h3><IconBtn label="Nový obchod" onClick={() => setDialog('deal')}><Plus /></IconBtn></div>
            {deals.length ? deals.map(d => <DealRow key={d.id} d={d} contactId={c.id} />) : <p>Žádný obchod. <button type="button" className="text-link inline" onClick={() => setDialog('deal')}>Založit obchod</button></p>}
            <button type="button" className="text-link" onClick={() => go('kontakty/pipeline')}>Otevřít pipeline<ChevronRight size={13} aria-hidden /></button>
          </section>
          <section className="panel side-box">
            <h3>Segmenty</h3>
            {segments.length ? <div className="contact-tags">{segments.map(s => <button key={s.id} type="button" className="pill-tag solid" onClick={() => go('kontakty/segmenty/' + s.id)}>{s.name}</button>)}</div> : <p>Kontakt nepatří do žádného segmentu.</p>}
          </section>
          <section className="panel side-box">
            <div className="side-head"><h3>Kurzy a produkty</h3><IconBtn label="Přidat do kurzu" onClick={() => setDialog('course')}><Plus /></IconBtn></div>
            {enrollments.map(e => { const course = w.courses.find(x => x.id === e.courseId); if (!course) return null; const p = progressOf(e, course); return (
              <button key={e.id} type="button" className="side-link" onClick={() => go(`kurzy/${course.id}/studenti`)}>
                <strong>{course.title}</strong><span className="bar"><i style={{ width: `${p}%` }} /></span>
                <small>{e.completedLessonIds.length} z {courseLessons(course).length} lekcí · {p} %</small>
              </button>
            ); })}
            {purchases.map(p => { const prod = w.products.find(x => x.id === p.productId); return prod ? <button key={p.id} type="button" className="side-link" onClick={() => go('kurzy/produkty/' + prod.id)}><strong>{prod.title}</strong><small>Koupeno {fmtDate(p.date)} · staženo {p.downloads}×</small></button> : null; })}
            {!enrollments.length && !purchases.length && <p>Bez kurzů a produktů.</p>}
          </section>
          {(regs.length > 0 || memberships.length > 0) && (
            <section className="panel side-box">
              <h3>Webináře a komunita</h3>
              {regs.map(r => { const wb = w.webinars.find(x => x.id === r.webinarId); return wb ? <button key={r.id} type="button" className="side-link" onClick={() => go('webinare/' + wb.id)}><strong>{wb.title}</strong><small>{webinarState(wb, now)} · {r.attended === null ? 'registrace' : r.attended ? `účast ${r.watchMinutes} min` : 'nezúčastnil(a) se'}</small></button> : null; })}
              {memberships.map(m => { const g = w.groups.find(x => x.id === m.groupId); return g ? <button key={m.id} type="button" className="side-link" onClick={() => go('komunita/' + g.id)}><strong>{g.name}</strong><small>{m.role} · {m.status}</small></button> : null; })}
            </section>
          )}
          <section className="panel side-box">
            <div className="side-head"><h3>Automatizace</h3><IconBtn label="Přidat do automatizace" onClick={() => setDialog('flow')}><Plus /></IconBtn></div>
            {flows.length ? flows.map(f => { const step = f.nodes.find(n => n.id === f.enrolled.find(e => e.contactId === c.id)?.nodeId); return (
              <button key={f.id} type="button" className="side-link" onClick={() => go('automatizace/' + f.id)}><strong>{f.name}</strong><small>{f.status} · krok: {step?.data.title ?? '—'}</small></button>
            ); }) : <p>Kontakt není v žádném scénáři.</p>}
          </section>
          <section className="panel side-box">
            <h3>Ochrana osobních údajů</h3>
            <div className="stack-sm">
              <Btn onClick={() => { download(`kontakt-${c.id}-export.json`, JSON.stringify(contactExport(data, workspaceId, c.id), null, 2), 'application/json'); log(c.id, 'contact', 'Export osobních údajů (GDPR)', 'Stažen soubor JSON'); }}><Download aria-hidden />Exportovat data</Btn>
              <Btn onClick={() => confirm({ title: 'Anonymizovat kontakt?', confirm: 'Anonymizovat', danger: true, desc: 'Jméno, e-mail, telefon, poznámky a vlastní pole se nevratně odstraní. Statistiky kampaní a účetní záznamy zůstanou bez osobních údajů.', onConfirm: () => { mutate(d => anonymizeContact(d, workspaceId, c.id)); toast.success('Kontakt byl anonymizován.'); } })}><UserX aria-hidden />Anonymizovat</Btn>
              <Btn className="danger-ghost" onClick={() => confirm({ title: `Smazat kontakt ${c.name}?`, confirm: 'Smazat kontakt', danger: true, desc: 'Smaže se kontakt, jeho obchody, poznámky, registrace a přístupy. Faktury a platby zůstanou. Akci nelze vrátit.', onConfirm: () => { mutate(d => deleteContacts(d, workspaceId, [c.id])); toast.success('Kontakt byl smazán.'); go('kontakty'); } })}><Trash2 aria-hidden />Smazat kontakt</Btn>
            </div>
          </section>
        </aside>
      </div>

      <EditContact c={c} open={dialog === 'edit'} onClose={() => setDialog(null)} />
      <ComposeMail c={c} open={dialog === 'mail'} onClose={() => setDialog(null)} />
      <NewDeal contactId={c.id} open={dialog === 'deal'} onClose={() => setDialog(null)} />
      <AddCourse c={c} open={dialog === 'course'} onClose={() => setDialog(null)} />
      <AddFlow c={c} open={dialog === 'flow'} onClose={() => setDialog(null)} />
      {fieldDialog && <FieldDialog c={c} fieldId={fieldDialog.id} onClose={() => setFieldDialog(null)} />}
      {confirmEl}
    </div>
  );
}

export function Timeline({ items }: { items: TimelineItem[] }) {
  const { go } = useHub();
  if (!items.length) return <p className="tab-pad muted">Žádné aktivity v tomto filtru.</p>;
  return (
    <div className="timeline">
      {items.map((a, k) => {
        const [Icon, tone] = ICON[a.type] ?? [User, 'gray']; const day = fmtDate(a.date); const head = k === 0 || fmtDate(items[k - 1].date) !== day;
        return (
          <React.Fragment key={a.id}>
            {head && <p className="timeline-date">{day}</p>}
            <div className="timeline-item">
              <span className={'activity-icon ' + tone}><Icon aria-hidden /></span>
              <div className="timeline-body">
                <div className="flex-row spread"><h3>{a.title}</h3><small>{fmtTime(a.date)}</small></div>
                {a.type === 'note' ? <div className="note-card">{a.detail}</div> : a.route ? <button type="button" className="timeline-link" onClick={() => go(a.route!)}>{a.detail}<ChevronRight size={12} aria-hidden /></button> : <p>{a.detail}</p>}
              </div>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function TagsBox({ c, all }: { c: Contact; all: string[] }) {
  const { patch, log, mutate, workspaceId } = useHub();
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState('');
  const listId = React.useId();
  const add = (e: React.FormEvent) => {
    e.preventDefault(); const t = value.trim(); if (!t) return;
    const tag = all.find(x => normalize(x) === normalize(t)) ?? t;
    if (c.tags.some(x => normalize(x) === normalize(tag))) { toast.info('Kontakt už tento štítek má.'); return; }
    patch('contacts', c.id, x => ({ ...x, tags: [...x.tags, tag] })); log(c.id, 'tag', `Přidán štítek ${tag}`, 'Ručně v detailu kontaktu');
    mutate(d => fireTrigger(d, workspaceId, 'tag_added', [c.id], tag));
    setValue(''); setAdding(false); toast.success('Štítek byl přidán.');
  };
  return (
    <div className="contact-info">
      <h3>Štítky</h3>
      <div className="contact-tags">
        {c.tags.map(t => <span key={t} className="tag-chip">{t}<button type="button" aria-label={`Odebrat štítek ${t}`} onClick={() => { patch('contacts', c.id, x => ({ ...x, tags: x.tags.filter(y => y !== t) })); log(c.id, 'tag', `Odebrán štítek ${t}`, 'Ručně v detailu kontaktu'); mutate(d => fireTrigger(d, workspaceId, 'tag_removed', [c.id], t)); }}><X size={12} aria-hidden /></button></span>)}
        {adding ? (
          <form onSubmit={add} className="tag-add"><input list={listId} value={value} onChange={e => setValue(e.target.value)} aria-label="Nový štítek" autoFocus onBlur={() => !value && setAdding(false)} onKeyDown={e => e.key === 'Escape' && setAdding(false)} /><datalist id={listId}>{all.filter(t => !c.tags.includes(t)).map(t => <option key={t} value={t} />)}</datalist><Btn type="submit" primary>Přidat</Btn></form>
        ) : <button type="button" className="pill-tag" onClick={() => setAdding(true)}>+ Přidat</button>}
      </div>
    </div>
  );
}

function ConsentBox({ c, onChange }: { c: Contact; onChange: (state: Contact['consent']['state'], source: string, doubleOptIn?: boolean, message?: string) => void }) {
  const [history, setHistory] = useState(false);
  const s = c.consent.state;
  return (
    <div className="contact-info consent-box">
      <h3>Souhlas s e-mailingem</h3>
      <div className="flex-row">{s === 'Udělen' ? <ShieldCheck size={16} aria-hidden className="positive" /> : <ShieldOff size={16} aria-hidden className="muted" />}<Badge tone={consentTone(s)}>{s}</Badge></div>
      <p className="small muted">{c.consent.source} · {fmtDate(c.consent.date)}{c.consent.doubleOptIn ? ' · double opt-in' : ''}{c.consent.ip ? ` · IP ${c.consent.ip}` : ''}</p>
      <p className="small muted">{s === 'Udělen' ? 'Kontakt může dostávat marketingové kampaně.' : 'Kontakt nebude zařazen mezi příjemce kampaní.'}</p>
      <div className="stack-sm">
        {s === 'Udělen' && <Btn onClick={() => onChange('Odvolán', 'Ručně odvoláno na žádost kontaktu', false, 'Souhlas byl odvolán.')}>Odvolat souhlas</Btn>}
        {s === 'Čeká na potvrzení' && <>
          <Btn onClick={() => onChange('Udělen', 'Potvrzení double opt-in (simulace)', true, 'Souhlas byl potvrzen (simulace kliknutí v e-mailu).')}>Simulovat potvrzení</Btn>
        </>}
        {(s === 'Odvolán' || s === 'Bez souhlasu') && <>
          <Btn onClick={() => onChange('Čeká na potvrzení', 'Žádost o souhlas (simulace, nic se neodeslalo)', false, 'Žádost o potvrzení je připravená. V prototypu se e-mail neodesílá.')}>Požádat o souhlas</Btn>
          <Btn onClick={() => onChange('Udělen', 'Ručně zaznamenaný doložený souhlas', false, 'Souhlas byl zaznamenán.')}>Zaznamenat doložený souhlas</Btn>
        </>}
      </div>
      <button type="button" className="text-link" aria-expanded={history} onClick={() => setHistory(h => !h)}>{history ? 'Skrýt historii' : `Historie souhlasu (${c.consent.history.length})`}</button>
      {history && <ol className="consent-history">{[...c.consent.history].reverse().map((h, k) => <li key={k}><Badge tone={consentTone(h.state)}>{h.state}</Badge><span>{fmtDateTime(h.date)}<br />{h.source}</span></li>)}</ol>}
    </div>
  );
}

function DealRow({ d, contactId }: { d: Deal; contactId: number }) {
  const { patch, log } = useHub();
  return (
    <div className="deal-row">
      <strong>{d.title}</strong>
      <div className="flex-row spread"><span className="highlight-sm">{money(d.value)}</span><span className="muted small">{d.probability} %</span></div>
      <Pick value={d.stage} onChange={s => { const stage = s as DealStage; patch('deals', d.id, x => ({ ...x, stage, probability: DEAL_PROB[stage], updatedAt: new Date().toISOString() })); log(contactId, 'deal', `Obchod přesunut do fáze ${stage}`, d.title, 'kontakty/pipeline'); toast.success('Fáze obchodu byla změněna.'); }} options={[...DEAL_STAGES]} className="full" label={`Fáze obchodu ${d.title}`} />
    </div>
  );
}

function Notes({ c, author }: { c: Contact; author: string }) {
  const { patch } = useHub();
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirmEl, confirm] = useConfirm();
  const add = () => { const t = text.trim(); if (!t) return; patch('contacts', c.id, x => ({ ...x, notes: [{ id: newId('note'), text: t, author, date: new Date().toISOString() }, ...x.notes] })); setText(''); toast.success('Poznámka byla přidána.'); };
  return (
    <div className="tab-pad stack">
      <Field label="Nová interní poznámka"><textarea value={text} onChange={e => setText(e.target.value)} placeholder="Co by měl tým vědět o tomto kontaktu?" maxLength={2000} /></Field>
      <div><Btn primary onClick={add} disabled={!text.trim()}><Plus aria-hidden />Přidat poznámku</Btn></div>
      {c.notes.map(n => (
        <div className="note-card" key={n.id}>
          {editing === n.id ? (
            <div className="stack-sm">
              <textarea value={draft} onChange={e => setDraft(e.target.value)} aria-label="Upravit poznámku" maxLength={2000} />
              <div className="flex-row"><Btn primary disabled={!draft.trim()} onClick={() => { patch('contacts', c.id, x => ({ ...x, notes: x.notes.map(y => (y.id === n.id ? { ...y, text: draft.trim() } : y)) })); setEditing(null); toast.success('Poznámka byla upravena.'); }}>Uložit</Btn><Btn onClick={() => setEditing(null)}>Zrušit</Btn></div>
            </div>
          ) : (
            <>
              <p className="note-text">{n.text}</p>
              <div className="flex-row spread"><span className="small muted">{n.author} · {fmtDateTime(n.date)}</span><span className="flex-row"><IconBtn label="Upravit poznámku" onClick={() => { setEditing(n.id); setDraft(n.text); }}><Pencil /></IconBtn><IconBtn label="Smazat poznámku" onClick={() => confirm({ title: 'Smazat poznámku?', desc: 'Poznámka se nevratně odstraní.', confirm: 'Smazat', danger: true, onConfirm: () => { patch('contacts', c.id, x => ({ ...x, notes: x.notes.filter(y => y.id !== n.id) })); toast.success('Poznámka byla smazána.'); } })}><Trash2 /></IconBtn></span></div>
            </>
          )}
        </div>
      ))}
      {!c.notes.length && <p className="muted">Zatím žádné poznámky.</p>}
      {confirmEl}
    </div>
  );
}

/* ---------- dialogs ---------- */
function EditContact({ c, open, onClose }: { c: Contact; open: boolean; onClose: () => void }) {
  const { data, workspaceId, patch } = useHub();
  const init = { name: c.name, email: c.email, phone: c.phone, company: c.company, city: c.city };
  const [v, setV] = useState(init);
  const [error, setError] = useState('');
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) { setPrevOpen(open); if (open) { setV(init); setError(''); } }
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!v.name.trim()) return setError('Vyplňte jméno.');
    if (!isEmail(v.email)) return setError('Zadejte platný e-mail.');
    const dup = findByEmail(data, workspaceId, v.email);
    if (dup && dup.id !== c.id) return setError(`Tento e-mail už má kontakt ${dup.name}.`);
    patch('contacts', c.id, x => ({ ...x, ...Object.fromEntries(Object.entries(v).map(([k, s]) => [k, s.trim()])) }));
    toast.success('Kontakt byl uložen.'); onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Upravit kontakt" desc="Kontaktní údaje a firma.">
      <form onSubmit={submit} noValidate>
        <div className="stack">
          <Field label="Jméno a příjmení"><input value={v.name} onChange={e => setV({ ...v, name: e.target.value })} required /></Field>
          <Field label="E-mail"><input type="email" value={v.email} onChange={e => setV({ ...v, email: e.target.value })} required /></Field>
          <div className="form-grid">
            <Field label="Telefon"><input type="tel" value={v.phone} onChange={e => setV({ ...v, phone: e.target.value })} /></Field>
            <Field label="Firma"><input value={v.company} onChange={e => setV({ ...v, company: e.target.value })} /></Field>
            <Field label="Město"><input value={v.city} onChange={e => setV({ ...v, city: e.target.value })} /></Field>
          </div>
          <FormError>{error}</FormError>
        </div>
        <div className="form-actions"><Btn type="button" onClick={onClose}>Zrušit</Btn><Btn primary type="submit">Uložit změny</Btn></div>
      </form>
    </Modal>
  );
}

function ComposeMail({ c, open, onClose }: { c: Contact; open: boolean; onClose: () => void }) {
  const { log } = useHub();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const send = (e: React.FormEvent) => {
    e.preventDefault(); if (!subject.trim() || !body.trim()) return;
    log(c.id, 'email_sent', 'Individuální e-mail (simulace)', subject.trim());
    toast.success('E-mail je zapsaný v časové ose. V prototypu se nic neodesílá.');
    setSubject(''); setBody(''); onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title={`E-mail pro ${c.name}`} desc={`Komu: ${c.email}. Simulace – zpráva se jen zapíše do časové osy.`}>
      <form onSubmit={send}>
        <div className="stack">
          <Field label="Předmět"><input value={subject} onChange={e => setSubject(e.target.value)} required autoFocus /></Field>
          <Field label="Zpráva"><textarea value={body} onChange={e => setBody(e.target.value)} rows={6} required /></Field>
        </div>
        <div className="form-actions"><Btn type="button" onClick={onClose}>Zrušit</Btn><Btn primary type="submit" disabled={!subject.trim() || !body.trim()}><Mail aria-hidden />Zapsat odeslání</Btn></div>
      </form>
    </Modal>
  );
}

export function NewDeal({ contactId, open, onClose }: { contactId?: number; open: boolean; onClose: () => void }) {
  const { w, workspaceId, mutate } = useHub();
  const [v, setV] = useState({ title: '', value: '', stage: 'Nový lead' as DealStage, contact: contactId ? String(contactId) : '' });
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const options = w.contacts.filter(c => normalize(c.name + ' ' + c.email).includes(normalize(q))).slice(0, 50);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const cid = Number(contactId ?? v.contact); const value = Number(v.value.replace(/\s/g, '').replace(',', '.'));
    if (!cid) return setError('Vyberte kontakt.');
    if (!v.title.trim()) return setError('Vyplňte název obchodu.');
    if (!Number.isFinite(value) || value < 0) return setError('Hodnota musí být kladné číslo v Kč.');
    const date = new Date().toISOString();
    const deal: Deal = { id: newId('deal'), workspaceId, contactId: cid, title: v.title.trim(), value: Math.round(value), stage: v.stage, probability: DEAL_PROB[v.stage], createdAt: date, updatedAt: date };
    mutate(d => logActivity({ ...d, deals: [deal, ...d.deals] }, workspaceId, cid, 'deal', `Nový obchod: ${deal.title}`, `${deal.stage} · ${money(deal.value)}`, 'kontakty/pipeline'));
    toast.success('Obchod byl založen.'); setV({ title: '', value: '', stage: 'Nový lead', contact: contactId ? String(contactId) : '' }); setError(''); onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Nový obchod" desc="Obchodní příležitost v pipeline.">
      <form onSubmit={submit} noValidate>
        <div className="stack">
          {!contactId && <Field label="Kontakt"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Hledat kontakt…" aria-label="Hledat kontakt" /><Pick value={v.contact} onChange={s => setV({ ...v, contact: s })} options={options.map(c => [String(c.id), `${c.name} · ${c.email}`] as [string, string])} className="full" label="Kontakt" /></Field>}
          <Field label="Název obchodu"><input value={v.title} onChange={e => setV({ ...v, title: e.target.value })} placeholder="Např. Správa kampaní" /></Field>
          <div className="form-grid">
            <Field label="Hodnota (Kč)"><input inputMode="decimal" value={v.value} onChange={e => setV({ ...v, value: e.target.value })} placeholder="0" /></Field>
            <Field label="Fáze"><Pick value={v.stage} onChange={s => setV({ ...v, stage: s as DealStage })} options={[...DEAL_STAGES]} className="full" label="Fáze" /></Field>
          </div>
          <FormError>{error}</FormError>
        </div>
        <div className="form-actions"><Btn type="button" onClick={onClose}>Zrušit</Btn><Btn primary type="submit">Založit obchod</Btn></div>
      </form>
    </Modal>
  );
}

function AddCourse({ c, open, onClose }: { c: Contact; open: boolean; onClose: () => void }) {
  const { w, workspaceId, mutate } = useHub();
  const courses = w.courses.filter(x => !w.enrollments.some(e => e.courseId === x.id && e.contactId === c.id));
  const [id, setId] = useState('');
  const course = courses.find(x => x.id === id) ?? courses[0];
  const apply = () => { if (!course) return; mutate(d => logActivity(enrollInCourse(d, workspaceId, course.id, c.id).data, workspaceId, c.id, 'course', `Ručně udělen přístup ke kurzu`, course.title, `kurzy/${course.id}/studenti`)); toast.success(`Přístup ke kurzu „${course.title}“ byl udělen.`); onClose(); };
  return (
    <Modal open={open} onClose={onClose} title="Udělit přístup ke kurzu" desc="Ruční přístup bez platby (např. bonus nebo reklamace).">
      {courses.length ? <Field label="Kurz"><Pick value={course?.id ?? ''} onChange={setId} options={courses.map(x => [x.id, `${x.title}${x.status === 'Koncept' ? ' (koncept)' : ''}`] as [string, string])} className="full" label="Kurz" /></Field> : <Notice>Kontakt už má přístup ke všem kurzům.</Notice>}
      <div className="form-actions"><Btn onClick={onClose}>Zrušit</Btn><Btn primary disabled={!course} onClick={apply}>Udělit přístup</Btn></div>
    </Modal>
  );
}

function AddFlow({ c, open, onClose }: { c: Contact; open: boolean; onClose: () => void }) {
  const { w, workspaceId, mutate } = useHub();
  const flows = w.workflows.filter(f => f.status !== 'Koncept' && !f.enrolled.some(e => e.contactId === c.id));
  const [id, setId] = useState('');
  const flow = flows.find(f => f.id === id) ?? flows[0];
  const apply = () => { if (!flow) return; mutate(d => logActivity(enrollInWorkflow(d, workspaceId, flow.id, [c.id]).data, workspaceId, c.id, 'automation', `Ručně přidán do scénáře`, flow.name, `automatizace/${flow.id}`)); toast.success(`Kontakt byl přidán do scénáře „${flow.name}“.`); onClose(); };
  return (
    <Modal open={open} onClose={onClose} title="Přidat do automatizace" desc="Kontakt vstoupí do prvního kroku scénáře. Běh je simulovaný.">
      {flows.length ? <Field label="Scénář"><Pick value={flow?.id ?? ''} onChange={setId} options={flows.map(f => [f.id, `${f.name} · ${f.status}`] as [string, string])} className="full" label="Scénář" /></Field> : <Notice>Žádný další aktivní nebo pozastavený scénář není k dispozici.</Notice>}
      <div className="form-actions"><Btn onClick={onClose}>Zrušit</Btn><Btn primary disabled={!flow} onClick={apply}>Přidat</Btn></div>
    </Modal>
  );
}

function FieldDialog({ c, fieldId, onClose }: { c: Contact; fieldId?: string; onClose: () => void }) {
  const { patch } = useHub();
  const current = c.customFields.find(f => f.id === fieldId);
  const [name, setName] = useState(current?.name ?? '');
  const [value, setValue] = useState(current?.value ?? '');
  const [error, setError] = useState('');
  const setFields = (fn: (fs: CustomField[]) => CustomField[]) => patch('contacts', c.id, x => ({ ...x, customFields: fn(x.customFields) }));
  const save = (e: React.FormEvent) => {
    e.preventDefault(); const n = name.trim(); const v = value.trim();
    if (!n) return setError('Doplňte název pole.');
    if (c.customFields.some(f => f.id !== fieldId && normalize(f.name) === normalize(n))) return setError(`Pole „${n}“ už u tohoto kontaktu existuje.`);
    if (fieldId) setFields(fs => fs.map(f => (f.id === fieldId ? { ...f, name: n, value: v } : f))); else setFields(fs => [...fs, { id: newId('cf'), name: n, value: v }]);
    toast.success(fieldId ? 'Vlastní pole bylo upraveno.' : 'Vlastní pole bylo přidáno.'); onClose();
  };
  return (
    <Modal open onClose={onClose} title={fieldId ? 'Upravit vlastní pole' : 'Nové vlastní pole'} desc={`${c.name} · pole lze použít i v pravidlech segmentů.`}>
      <form onSubmit={save} noValidate>
        <div className="stack">
          <Field label="Název pole" hint="Např. Obor, Město nebo Preferovaný kanál."><input value={name} onChange={e => { setName(e.target.value); setError(''); }} maxLength={60} autoFocus aria-invalid={!!error} /></Field>
          <Field label="Hodnota"><input value={value} onChange={e => setValue(e.target.value)} maxLength={500} placeholder="Zadejte hodnotu" /></Field>
          <FormError>{error}</FormError>
        </div>
        <div className="form-actions">
          {fieldId && <Btn type="button" className="mr-auto" onClick={() => { setFields(fs => fs.filter(f => f.id !== fieldId)); toast.success('Vlastní pole bylo odebráno.'); onClose(); }}><Trash2 aria-hidden />Odebrat pole</Btn>}
          <Btn type="button" onClick={onClose}>Zrušit</Btn><Btn primary type="submit">{fieldId ? 'Uložit změny' : 'Přidat pole'}</Btn>
        </div>
      </form>
    </Modal>
  );
}

