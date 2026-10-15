'use client';
/* Community: groups, feed with posts and comments, members, moderation and an access preview per contact.
   User-generated text is rendered as plain text (React escapes it); images are small local data URLs. */
import React, { useMemo, useState } from 'react';
import { ArrowLeft, EyeOff, Flag, Heart, Lock, MessageCircle, MoreHorizontal, Pin, Plus, Send, ShieldAlert, Trash2, UserX, Users } from 'lucide-react';
import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { fmt, fmtDate, fmtDateTime, money, newId, normalize, plural, relTime } from '@/lib/hub/format';
import { logActivity } from '@/lib/hub/ops';
import type { CommunityGroup, Contact, GroupAccess, Membership, Post } from '@/lib/hub/types';
import { useHub, useUnsavedGuard } from './state';
import { Avatar, Badge, Btn, Field, Metric, Modal, PageHead, Pick } from './ui';
import { FormError, Notice, Section, SubNav, useConfirm, useRoute } from './kit';
import { ACCENTS, Art } from './learn-shared';

const ACCESS: GroupAccess[] = ['Veřejná', 'Placená', 'Součást kurzu', 'Na pozvání'];
const accessTone = (a: GroupAccess) => (a === 'Placená' ? 'orange' : a === 'Součást kurzu' ? 'purple' : a === 'Veřejná' ? 'green' : 'blue');

export default function Community() {
  const { parts } = useRoute();
  const [, a, b] = parts;
  if (a === 'moderace') return <Moderation />;
  if (!a) return <GroupList />;
  return <GroupPage key={a} id={a} tab={b ?? 'feed'} />;
}

function CommunityNav({ active }: { active: string }) {
  const { w } = useHub();
  const open = w.posts.reduce((s, p) => s + p.reports.filter(r => !r.resolved).length, 0);
  return <SubNav active={active} items={[['komunita', 'Skupiny', w.groups.length], ['komunita/moderace', 'Moderace', open || undefined]]} />;
}

function GroupList() {
  const { w, go, workspaceId, mutate } = useHub();
  const [creating, setCreating] = useState(false);
  const [now] = useState(() => Date.now());
  const stat = (g: CommunityGroup) => { const ps = w.posts.filter(p => p.groupId === g.id); return { members: w.memberships.filter(m => m.groupId === g.id && m.status === 'Aktivní').length, posts: ps.length, last: ps.map(p => p.date).sort().reverse()[0] }; };
  return (
    <div className="page">
      <PageHead title="Komunita" desc="Skupiny pro klienty a studenty. Členství vzniká z platby, kurzu nebo pozvánky.">
        <Btn primary onClick={() => setCreating(true)}><Plus aria-hidden />Nová skupina</Btn>
      </PageHead>
      <CommunityNav active="komunita" />
      <div className="metric-grid">
        <Metric label="Skupiny" value={fmt(w.groups.length)} desc={`${w.groups.filter(g => g.access === 'Placená').length} placené`} />
        <Metric label="Aktivní členové" value={fmt(new Set(w.memberships.filter(m => m.status === 'Aktivní').map(m => m.contactId)).size)} desc="unikátní kontakty" />
        <Metric label="Příspěvky" value={fmt(w.posts.length)} desc={`${w.posts.reduce((s, p) => s + p.comments.length, 0)} komentářů`} />
        <Metric label="K moderaci" value={fmt(w.posts.reduce((s, p) => s + p.reports.filter(r => !r.resolved).length, 0))} desc="nahlášení" />
      </div>
      <div className="card-grid">
        {w.groups.map(g => { const s = stat(g); return (
          <article key={g.id} className="panel course-card">
            <button type="button" className="course-card-link" onClick={() => go('komunita/' + g.id)} aria-label={`Otevřít skupinu ${g.name}`}><Art accent={g.accent} eyebrow={g.access} title={g.name} /></button>
            <div className="course-card-body">
              <div className="flex-row spread"><Badge tone={accessTone(g.access)}>{g.access}</Badge><span className="small muted">{g.access === 'Placená' ? `${money(g.price)} / měsíc` : g.access === 'Součást kurzu' ? w.courses.find(c => c.id === g.courseId)?.title ?? 'kurz' : ''}</span></div>
              <h3><button type="button" onClick={() => go('komunita/' + g.id)}>{g.name}</button></h3>
              <p className="muted small">{g.description}</p>
              <div className="course-stats"><span><strong>{fmt(s.members)}</strong> členů</span><span><strong>{fmt(s.posts)}</strong> příspěvků{s.last ? ` · ${relTime(s.last, now)}` : ''}</span></div>
            </div>
          </article>
        ); })}
      </div>
      {!w.groups.length && <section className="panel empty"><Users size={28} aria-hidden /><h3>Zatím žádná skupina</h3><p>Založte veřejnou, placenou nebo kurzovou skupinu.</p><Btn primary onClick={() => setCreating(true)}><Plus aria-hidden />Nová skupina</Btn></section>}
      {creating && <GroupDialog onClose={() => setCreating(false)} onSave={g => { const group: CommunityGroup = { ...g, id: newId('g'), workspaceId, createdAt: new Date().toISOString() }; mutate(d => ({ ...d, groups: [...d.groups, group] })); toast.success('Skupina byla založena.'); go('komunita/' + group.id); }} />}
    </div>
  );
}

type GroupDraft = Omit<CommunityGroup, 'id' | 'workspaceId' | 'createdAt'>;
function GroupForm({ v, set }: { v: GroupDraft; set: (p: Partial<GroupDraft>) => void }) {
  const { w } = useHub();
  return (
    <div className="stack">
      <Field label="Název skupiny"><input value={v.name} onChange={e => set({ name: e.target.value })} maxLength={80} /></Field>
      <Field label="Popis"><textarea rows={3} value={v.description} onChange={e => set({ description: e.target.value })} maxLength={500} /></Field>
      <div className="form-grid">
        <Field label="Přístup"><Pick value={v.access} onChange={a => set({ access: a as GroupAccess })} options={ACCESS} className="full" label="Přístup" /></Field>
        <Field label="Barva"><Pick value={v.accent} onChange={a => set({ accent: a })} options={ACCENTS} className="full" label="Barva" /></Field>
      </div>
      {v.access === 'Placená' && <Field label="Cena členství (Kč / měsíc)" hint="Předplatné přes Stripe po napojení backendu."><input type="number" min={1} value={v.price || ''} onChange={e => set({ price: Number(e.target.value) })} /></Field>}
      {v.access === 'Součást kurzu' && <Field label="Kurz"><Pick value={v.courseId ?? ''} onChange={c => set({ courseId: c })} options={w.courses.map(c => [c.id, c.title] as [string, string])} className="full" label="Kurz" /></Field>}
    </div>
  );
}
const groupError = (v: GroupDraft) => (!v.name.trim() ? 'Vyplňte název skupiny.' : v.access === 'Placená' && !(v.price > 0) ? 'Zadejte cenu členství.' : v.access === 'Součást kurzu' && !v.courseId ? 'Vyberte kurz.' : '');

function GroupDialog({ onClose, onSave }: { onClose: () => void; onSave: (g: GroupDraft) => void }) {
  const [v, setV] = useState<GroupDraft>({ name: '', description: '', access: 'Veřejná', price: 0, accent: 'green' });
  const [error, setError] = useState('');
  return (
    <Modal open onClose={onClose} title="Nová skupina" desc="Typ přístupu určuje, kdo se do skupiny dostane.">
      <GroupForm v={v} set={p => { setV({ ...v, ...p }); setError(''); }} />
      <FormError>{error}</FormError>
      <div className="form-actions"><Btn onClick={onClose}>Zrušit</Btn><Btn primary onClick={() => { const e = groupError(v); if (e) { setError(e); return; } onSave({ ...v, name: v.name.trim() }); onClose(); }}>Založit skupinu</Btn></div>
    </Modal>
  );
}

/** Whether a contact can enter a group and why (used by the access preview). */
function accessFor(g: CommunityGroup, c: Contact | undefined, memberships: Membership[], enrolled: boolean): { ok: boolean; reason: string } {
  if (!c) return { ok: g.access === 'Veřejná', reason: g.access === 'Veřejná' ? 'Veřejná skupina je přístupná všem přihlášeným.' : 'Nepřihlášený návštěvník' };
  const m = memberships.find(x => x.groupId === g.id && x.contactId === c.id);
  if (m?.status === 'Zablokován') return { ok: false, reason: 'Člen je zablokovaný moderátorem.' };
  if (g.access === 'Veřejná') return { ok: true, reason: 'Veřejná skupina.' };
  if (g.access === 'Součást kurzu') return enrolled || m?.status === 'Aktivní' ? { ok: true, reason: 'Student kurzu.' } : { ok: false, reason: 'Přístup mají jen studenti kurzu.' };
  if (m?.status === 'Vypršelo') return { ok: false, reason: 'Předplatné členství vypršelo.' };
  return m?.status === 'Aktivní' ? { ok: true, reason: g.access === 'Placená' ? 'Aktivní placené členství.' : 'Pozvaný člen.' } : { ok: false, reason: g.access === 'Placená' ? 'Vyžaduje placené členství.' : 'Jen na pozvání.' };
}

function GroupPage({ id, tab }: { id: string; tab: string }) {
  const { w, go } = useHub();
  const g = w.groups.find(x => x.id === id);
  if (!g) return <div className="page"><section className="panel empty"><h3>Skupina nenalezena</h3><Btn primary onClick={() => go('komunita')}>Zpět na komunitu</Btn></section></div>;
  const base = `komunita/${g.id}`;
  const members = w.memberships.filter(m => m.groupId === g.id);
  return (
    <div className="page">
      <button type="button" className="back-link" onClick={() => go('komunita')}><ArrowLeft size={15} aria-hidden />Všechny skupiny</button>
      <PageHead title={g.name} desc={`${g.access} · ${plural(members.filter(m => m.status === 'Aktivní').length, 'aktivní člen', 'aktivní členové', 'aktivních členů')}`}>
        <Badge tone={accessTone(g.access)}>{g.access}</Badge>
        <Btn onClick={() => go(`${base}/pristup`)}><Lock aria-hidden />Náhled přístupu</Btn>
      </PageHead>
      <SubNav active={tab === 'feed' ? base : `${base}/${tab}`} items={[[base, 'Příspěvky', w.posts.filter(p => p.groupId === g.id).length], [`${base}/clenove`, 'Členové', members.length], [`${base}/nastaveni`, 'Nastavení'], [`${base}/pristup`, 'Náhled přístupu']]} />
      {tab === 'feed' && <Feed g={g} />}
      {tab === 'clenove' && <Members g={g} />}
      {tab === 'nastaveni' && <GroupSettings g={g} />}
      {tab === 'pristup' && <AccessPreview g={g} />}
    </div>
  );
}

/* ---------- feed ---------- */
function PostCard({ p, admin, asContact }: { p: Post; admin: boolean; asContact?: Contact }) {
  const { workspaceId, mutate, profile, go } = useHub();
  const [comment, setComment] = useState('');
  const [confirmEl, confirm] = useConfirm();
  const [now] = useState(() => Date.now());
  const update = (fn: (x: Post) => Post) => mutate(d => ({ ...d, posts: d.posts.map(x => (x.workspaceId === workspaceId && x.id === p.id ? fn(x) : x)) }));
  const author = asContact?.name ?? profile.name;
  const open = p.reports.filter(r => !r.resolved).length;
  return (
    <article className={`panel post ${p.hidden ? 'is-hidden' : ''}`}>
      <header className="post-head">
        <Avatar name={p.author} size="sm" />
        <div><strong>{p.contactId ? <button type="button" className="text-link inline" onClick={() => admin && go('kontakty/' + p.contactId)}>{p.author}</button> : p.author}</strong><small>{relTime(p.date, now)}{p.pinned ? ' · připnuto' : ''}{p.hidden ? ' · skryto' : ''}</small></div>
        {p.pinned && <Pin size={14} aria-label="Připnutý příspěvek" className="muted" />}
        {admin && open > 0 && <Badge tone="red">{plural(open, 'nahlášení', 'nahlášení', 'nahlášení')}</Badge>}
        {admin && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><button type="button" className="icon-btn" aria-label="Akce příspěvku"><MoreHorizontal aria-hidden /></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => { update(x => ({ ...x, pinned: !x.pinned })); toast.success(p.pinned ? 'Příspěvek byl odepnut.' : 'Příspěvek je připnutý nahoře.'); }}><Pin aria-hidden />{p.pinned ? 'Odepnout' : 'Připnout'}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => { update(x => ({ ...x, hidden: !x.hidden })); toast.success(p.hidden ? 'Příspěvek je znovu viditelný.' : 'Příspěvek je skrytý pro členy.'); }}><EyeOff aria-hidden />{p.hidden ? 'Zobrazit členům' : 'Skrýt před členy'}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => confirm({ title: 'Smazat příspěvek?', desc: 'Příspěvek i komentáře se nevratně smažou.', confirm: 'Smazat', danger: true, onConfirm: () => { mutate(d => ({ ...d, posts: d.posts.filter(x => !(x.workspaceId === workspaceId && x.id === p.id)) })); toast.success('Příspěvek byl smazán.'); } })}><Trash2 aria-hidden />Smazat</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>
      <p className="post-text">{p.text}</p>
      <div className="post-actions">
        <button type="button" aria-pressed={p.likedByMe} className={p.likedByMe ? 'liked' : ''} onClick={() => update(x => ({ ...x, likedByMe: !x.likedByMe, likes: x.likes + (x.likedByMe ? -1 : 1) }))}><Heart size={16} aria-hidden />{fmt(p.likes)}</button>
        <span><MessageCircle size={16} aria-hidden />{p.comments.filter(c => admin || !c.hidden).length}</span>
        {!admin && <button type="button" onClick={() => { update(x => ({ ...x, reports: [...x.reports, { id: newId('rep'), reason: 'Nevhodný obsah', by: author, date: new Date().toISOString(), resolved: false }] })); toast.success('Příspěvek byl nahlášen moderátorům.'); }}><Flag size={16} aria-hidden />Nahlásit</button>}
      </div>
      {p.comments.length > 0 && (
        <ul className="comments">
          {p.comments.filter(c => admin || !c.hidden).map(c => (
            <li key={c.id} className={c.hidden ? 'is-hidden' : ''}>
              <Avatar name={c.author} size="sm" />
              <div><strong>{c.author}</strong> <small>{relTime(c.date, now)}{c.hidden ? ' · skryto' : ''}</small><p>{c.text}</p></div>
              {admin && <button type="button" className="text-link" onClick={() => update(x => ({ ...x, comments: x.comments.map(y => (y.id === c.id ? { ...y, hidden: !y.hidden } : y)) }))}>{c.hidden ? 'Zobrazit' : 'Skrýt'}</button>}
            </li>
          ))}
        </ul>
      )}
      <form className="comment-form" onSubmit={e => { e.preventDefault(); const t = comment.trim(); if (!t) return; update(x => ({ ...x, comments: [...x.comments, { id: newId('cm'), author, contactId: asContact?.id, text: t, date: new Date().toISOString(), hidden: false }] })); setComment(''); }}>
        <input value={comment} onChange={e => setComment(e.target.value)} placeholder={`Komentovat jako ${author}…`} aria-label="Nový komentář" maxLength={1000} />
        <Btn type="submit" disabled={!comment.trim()} aria-label="Odeslat komentář"><Send aria-hidden /></Btn>
      </form>
      {confirmEl}
    </article>
  );
}

function Composer({ g, asContact }: { g: CommunityGroup; asContact?: Contact }) {
  const { workspaceId, mutate, profile } = useHub();
  const [text, setText] = useState('');
  const post = () => {
    const t = text.trim(); if (!t) return;
    const p: Post = { id: newId('post'), workspaceId, groupId: g.id, author: asContact?.name ?? profile.name, contactId: asContact?.id, text: t, date: new Date().toISOString(), pinned: false, hidden: false, likes: 0, likedByMe: false, comments: [], reports: [] };
    mutate(d => { const next = { ...d, posts: [p, ...d.posts] }; return asContact ? logActivity(next, workspaceId, asContact.id, 'community', `Příspěvek ve skupině ${g.name}`, t.slice(0, 80), 'komunita/' + g.id) : next; });
    setText(''); toast.success('Příspěvek je zveřejněný.', { description: 'Upozornění členům e-mailem se v prototypu neodesílá.' });
  };
  return (
    <section className="panel composer">
      <textarea rows={3} value={text} onChange={e => setText(e.target.value)} placeholder={asContact ? `Napište příspěvek jako ${asContact.name}…` : 'Napište příspěvek pro členy…'} aria-label="Nový příspěvek" maxLength={5000} />
      <div className="flex-row spread"><span className="small muted">{text.length}/5000</span><Btn primary onClick={post} disabled={!text.trim()}><Send aria-hidden />Zveřejnit</Btn></div>
    </section>
  );
}

function Feed({ g }: { g: CommunityGroup }) {
  const { w } = useHub();
  const posts = w.posts.filter(p => p.groupId === g.id).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.date.localeCompare(a.date));
  return (
    <div className="split">
      <div className="stack">
        <Composer g={g} />
        {posts.map(p => <PostCard key={p.id} p={p} admin />)}
        {!posts.length && <section className="panel empty"><MessageCircle size={28} aria-hidden /><h3>Ve skupině zatím nic není</h3><p>Napište první příspěvek a přivítejte členy.</p></section>}
      </div>
      <Section title="O skupině" className="sticky-side">
        <div className="sec-body">
          <p className="small">{g.description || 'Bez popisu.'}</p>
          <div className="kv"><span>Přístup</span><strong>{g.access}</strong></div>
          {g.access === 'Placená' && <div className="kv"><span>Cena</span><strong>{money(g.price)} / měsíc</strong></div>}
          <div className="kv"><span>Založeno</span><strong>{fmtDate(g.createdAt)}</strong></div>
        </div>
      </Section>
    </div>
  );
}

/* ---------- members ---------- */
function Members({ g }: { g: CommunityGroup }) {
  const { w, workspaceId, mutate, go, settings } = useHub();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [confirmEl, confirm] = useConfirm();
  const contacts = useMemo(() => new Map(w.contacts.map(c => [c.id, c])), [w.contacts]);
  const members = w.memberships.filter(m => m.groupId === g.id && normalize(contacts.get(m.contactId)?.name ?? '').includes(normalize(q)));
  const set = (m: Membership, patch: Partial<Membership>, msg: string) => { mutate(d => ({ ...d, memberships: d.memberships.map(x => (x.workspaceId === workspaceId && x.id === m.id ? { ...x, ...patch } : x)) })); toast.success(msg); };
  const students = g.courseId ? w.enrollments.filter(e => e.courseId === g.courseId && e.status !== 'Pozastaveno').map(e => e.contactId) : [];
  const missing = students.filter(id => !w.memberships.some(m => m.groupId === g.id && m.contactId === id));
  return (
    <>
      {g.access === 'Součást kurzu' && <Notice>Členství vzniká zápisem do kurzu {w.courses.find(c => c.id === g.courseId)?.title}. {missing.length ? `${plural(missing.length, 'student zatím není', 'studenti zatím nejsou', 'studentů zatím není')} členem.` : 'Všichni studenti jsou členy.'}</Notice>}
      {g.access === 'Placená' && <Notice>Placené členství je navázané na předplatné. Po jeho konci přístup skončí po {plural(settings.community.gracePeriodDays, 'dni', 'dnech', 'dnech')} (nastavení prostoru).</Notice>}
      <div className="toolbar">
        <input className="toolbar-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Hledat člena…" aria-label="Hledat člena" />
        <div className="flex-row wrap">
          {missing.length > 0 && <Btn onClick={() => { mutate(d => ({ ...d, memberships: [...d.memberships, ...missing.map(contactId => ({ id: newId('mb'), workspaceId, groupId: g.id, contactId, role: 'Člen' as const, status: 'Aktivní' as const, joinedAt: new Date().toISOString() }))] })); toast.success(`Přidáno ${plural(missing.length, 'člen', 'členové', 'členů')} ze studentů kurzu.`); }}>Synchronizovat se studenty</Btn>}
          <Btn primary onClick={() => setAdding(true)}><Plus aria-hidden />Přidat členy</Btn>
        </div>
      </div>
      <section className="panel">
        <div className="table-scroll">
          <table className="hub-table data-table">
            <thead><tr><th>Člen</th><th>Role</th><th className="col-opt">Členem od</th><th>Stav</th><th aria-label="Akce" /></tr></thead>
            <tbody>
              {members.map(m => { const c = contacts.get(m.contactId); return (
                <tr key={m.id} onClick={() => c && go('kontakty/' + c.id)}>
                  <td><div className="name-cell">{c ? <><Avatar name={c.name} color={c.color} /><button type="button">{c.name}<small>{c.email}</small></button></> : <span className="muted">Smazaný kontakt</span>}</div></td>
                  <td>{m.role === 'Moderátor' ? <Badge tone="purple">Moderátor</Badge> : 'Člen'}</td>
                  <td className="col-opt muted">{fmtDate(m.joinedAt)}</td>
                  <td><Badge tone={m.status === 'Aktivní' ? 'green' : m.status === 'Zablokován' ? 'red' : 'orange'}>{m.status}</Badge></td>
                  <td className="col-actions" onClick={e => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><button type="button" className="icon-btn" aria-label={`Akce člena ${c?.name ?? ''}`}><MoreHorizontal aria-hidden /></button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => set(m, { role: m.role === 'Moderátor' ? 'Člen' : 'Moderátor' }, m.role === 'Moderátor' ? 'Role změněna na člen.' : 'Člen je moderátorem.')}>{m.role === 'Moderátor' ? 'Odebrat roli moderátora' : 'Udělat moderátorem'}</DropdownMenuItem>
                        {m.status === 'Zablokován' ? <DropdownMenuItem onSelect={() => set(m, { status: 'Aktivní' }, 'Člen byl odblokován.')}>Odblokovat</DropdownMenuItem> : <DropdownMenuItem onSelect={() => set(m, { status: 'Zablokován' }, 'Člen byl zablokován.')}><UserX aria-hidden />Zablokovat</DropdownMenuItem>}
                        {m.status === 'Vypršelo' && <DropdownMenuItem onSelect={() => set(m, { status: 'Aktivní' }, 'Členství bylo obnoveno.')}>Obnovit členství</DropdownMenuItem>}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => confirm({ title: 'Odebrat člena ze skupiny?', desc: 'Kontakt ztratí přístup. Jeho příspěvky zůstanou.', confirm: 'Odebrat', danger: true, onConfirm: () => { mutate(d => ({ ...d, memberships: d.memberships.filter(x => !(x.workspaceId === workspaceId && x.id === m.id)) })); toast.success('Člen byl odebrán.'); } })}><Trash2 aria-hidden />Odebrat</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ); })}
            </tbody>
          </table>
        </div>
        {!members.length && <div className="empty"><h3>Žádní členové</h3></div>}
      </section>
      {adding && <AddMembers g={g} onClose={() => setAdding(false)} />}
      {confirmEl}
    </>
  );
}

function AddMembers({ g, onClose }: { g: CommunityGroup; onClose: () => void }) {
  const { w, workspaceId, mutate } = useHub();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const inGroup = new Set(w.memberships.filter(m => m.groupId === g.id).map(m => m.contactId));
  const list = w.contacts.filter(c => !inGroup.has(c.id) && normalize(`${c.name} ${c.email}`).includes(normalize(q))).slice(0, 40);
  return (
    <Modal open onClose={onClose} title="Přidat členy" desc={g.access === 'Placená' ? 'Ruční členství bez platby (např. bonus).' : 'Pozvánka e-mailem se v prototypu neodesílá.'}>
      <div className="stack">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Hledat kontakt…" aria-label="Hledat kontakt" autoFocus />
        <ul className="pick-list">{list.map(c => <li key={c.id}><label className="check-row"><input type="checkbox" checked={picked.includes(c.id)} onChange={e => setPicked(p => (e.target.checked ? [...p, c.id] : p.filter(i => i !== c.id)))} /><span>{c.name}<small>{c.email}</small></span></label></li>)}{!list.length && <li className="muted">Nic nenalezeno.</li>}</ul>
      </div>
      <div className="form-actions"><Btn onClick={onClose}>Zrušit</Btn><Btn primary disabled={!picked.length} onClick={() => { const date = new Date().toISOString(); mutate(d => picked.reduce((acc, id) => logActivity(acc, workspaceId, id, 'community', `Vstup do skupiny ${g.name}`, 'Přidán ručně', 'komunita/' + g.id), { ...d, memberships: [...d.memberships, ...picked.map(contactId => ({ id: newId('mb'), workspaceId, groupId: g.id, contactId, role: 'Člen' as const, status: 'Aktivní' as const, joinedAt: date }))] })); toast.success(`Přidáno: ${plural(picked.length, 'člen', 'členové', 'členů')}.`); onClose(); }}>Přidat {picked.length || ''}</Btn></div>
    </Modal>
  );
}

function GroupSettings({ g }: { g: CommunityGroup }) {
  const { patch, mutate, workspaceId, go, w } = useHub();
  const init: GroupDraft = { name: g.name, description: g.description, access: g.access, price: g.price, courseId: g.courseId, accent: g.accent };
  const [v, setV] = useState(init);
  const [error, setError] = useState('');
  const [confirmEl, confirm] = useConfirm();
  const dirty = JSON.stringify(v) !== JSON.stringify(init);
  useUnsavedGuard(dirty, 'Nastavení skupiny má neuložené změny.');
  const posts = w.posts.filter(p => p.groupId === g.id).length;
  return (
    <div className="split">
      <Section title="Skupina">
        <div className="sec-body stack">
          <GroupForm v={v} set={p => { setV({ ...v, ...p }); setError(''); }} />
          <FormError>{error}</FormError>
          <div className="form-actions"><Btn onClick={() => setV(init)} disabled={!dirty}>Zahodit změny</Btn><Btn primary disabled={!dirty} onClick={() => { const e = groupError(v); if (e) { setError(e); return; } patch('groups', g.id, x => ({ ...x, ...v, name: v.name.trim() })); toast.success('Skupina byla uložena.'); }}>Uložit</Btn></div>
        </div>
      </Section>
      <Section title="Smazání skupiny" className="sticky-side">
        <div className="sec-body stack">
          <p className="small muted">Smaže se skupina, {plural(posts, 'příspěvek', 'příspěvky', 'příspěvků')} a členství. Kontakty v CRM zůstanou.</p>
          <Btn className="danger-ghost" onClick={() => confirm({ title: `Smazat skupinu ${g.name}?`, danger: true, confirm: 'Smazat skupinu', desc: 'Akci nelze vrátit.', onConfirm: () => { mutate(d => ({ ...d, groups: d.groups.filter(x => !(x.workspaceId === workspaceId && x.id === g.id)), posts: d.posts.filter(p => !(p.workspaceId === workspaceId && p.groupId === g.id)), memberships: d.memberships.filter(m => !(m.workspaceId === workspaceId && m.groupId === g.id)) })); toast.success('Skupina byla smazána.'); go('komunita'); } })}><Trash2 aria-hidden />Smazat skupinu</Btn>
        </div>
      </Section>
      {confirmEl}
    </div>
  );
}

/* ---------- access preview ---------- */
function AccessPreview({ g }: { g: CommunityGroup }) {
  const { w } = useHub();
  const { query, setQuery } = useRoute();
  const contacts = useMemo(() => new Map(w.contacts.map(c => [c.id, c])), [w.contacts]);
  const sample = [...new Set([...w.memberships.filter(m => m.groupId === g.id).map(m => m.contactId).slice(0, 25), ...w.contacts.slice(0, 15).map(c => c.id)])];
  const asId = query.get('kontakt') ?? 'host';
  const c = asId === 'host' ? undefined : contacts.get(Number(asId));
  const enrolled = !!(c && g.courseId && w.enrollments.some(e => e.courseId === g.courseId && e.contactId === c.id && e.status !== 'Pozastaveno'));
  const a = accessFor(g, c, w.memberships, enrolled);
  const posts = w.posts.filter(p => p.groupId === g.id && !p.hidden).sort((x, y) => Number(y.pinned) - Number(x.pinned) || y.date.localeCompare(x.date));
  return (
    <div className="stack">
      <div className="preview-banner" role="note">
        <span><strong>Náhled přístupu</strong> · co uvidí kontakt v klientském portálu</span>
        <Pick value={asId} onChange={v => setQuery({ kontakt: v === 'host' ? undefined : v })} options={[['host', 'Nepřihlášený návštěvník'], ...sample.map(id => [String(id), contacts.get(id)?.name ?? '?'] as [string, string])]} label="Zobrazit jako" />
      </div>
      <Notice tone={a.ok ? 'info' : 'warn'}>{a.ok ? `Má přístup: ${a.reason}` : `Nemá přístup: ${a.reason}`}</Notice>
      {a.ok ? (
        <div className="member-view">
          {c && <Composer g={g} asContact={c} />}
          {posts.map(p => <PostCard key={p.id} p={p} admin={false} asContact={c} />)}
          {!posts.length && <p className="muted">Ve skupině zatím nejsou příspěvky.</p>}
        </div>
      ) : (
        <section className="panel player-locked">
          <Lock size={28} aria-hidden /><h2>{g.name}</h2><p>{g.description}</p>
          {g.access === 'Placená' && <Btn primary onClick={() => toast.info('Členství se zaplatí přes Stripe Checkout po napojení plateb.')}>Koupit členství za {money(g.price)} / měsíc</Btn>}
          {g.access === 'Součást kurzu' && <Btn primary onClick={() => toast.info('Přístup získá po zápisu do kurzu.')}>Zobrazit kurz</Btn>}
          {g.access === 'Na pozvání' && <p className="small muted">O přístup je potřeba požádat moderátora.</p>}
        </section>
      )}
    </div>
  );
}

/* ---------- moderation ---------- */
function Moderation() {
  const { w, workspaceId, mutate, go } = useHub();
  const [confirmEl, confirm] = useConfirm();
  const [now] = useState(() => Date.now());
  const items = w.posts.flatMap(p => p.reports.map(r => ({ p, r }))).sort((a, b) => Number(a.r.resolved) - Number(b.r.resolved) || b.r.date.localeCompare(a.r.date));
  const open = items.filter(x => !x.r.resolved);
  const resolve = (pid: string, rid: string, patch: Partial<Post> = {}) => mutate(d => ({ ...d, posts: d.posts.map(x => (x.workspaceId === workspaceId && x.id === pid ? { ...x, ...patch, reports: x.reports.map(r => (r.id === rid ? { ...r, resolved: true } : r)) } : x)) }));
  return (
    <div className="page">
      <PageHead title="Komunita" desc="Moderace nahlášených příspěvků napříč skupinami." />
      <CommunityNav active="komunita/moderace" />
      {!open.length && <Notice>Žádné otevřené nahlášení. Vše je vyřešené.</Notice>}
      <div className="stack mt-4">
        {items.map(({ p, r }) => { const g = w.groups.find(x => x.id === p.groupId); return (
          <section key={r.id} className={`panel report ${r.resolved ? 'is-resolved' : ''}`}>
            <header className="post-head"><ShieldAlert size={18} aria-hidden className={r.resolved ? 'muted' : 'negative'} /><div><strong>{r.reason}</strong><small>nahlásil(a) {r.by} · {relTime(r.date, now)} · {g?.name}</small></div><Badge tone={r.resolved ? 'gray' : 'red'}>{r.resolved ? 'Vyřešeno' : 'Čeká'}</Badge></header>
            <blockquote className="post-text">„{p.text}“ <small>— {p.author}, {fmtDateTime(p.date)}{p.hidden ? ' · skryto' : ''}</small></blockquote>
            {!r.resolved && (
              <div className="flex-row wrap">
                <Btn onClick={() => { resolve(p.id, r.id); toast.success('Příspěvek zůstává, nahlášení je vyřešené.'); }}>Ponechat</Btn>
                <Btn onClick={() => { resolve(p.id, r.id, { hidden: true }); toast.success('Příspěvek je skrytý.'); }}><EyeOff aria-hidden />Skrýt příspěvek</Btn>
                {p.contactId && <Btn onClick={() => { resolve(p.id, r.id, { hidden: true }); mutate(d => ({ ...d, memberships: d.memberships.map(m => (m.workspaceId === workspaceId && m.groupId === p.groupId && m.contactId === p.contactId ? { ...m, status: 'Zablokován' } : m)) })); toast.success('Příspěvek je skrytý a autor zablokovaný ve skupině.'); }}><UserX aria-hidden />Skrýt a zablokovat autora</Btn>}
                <Btn className="danger-ghost" onClick={() => confirm({ title: 'Smazat příspěvek?', desc: 'Příspěvek i komentáře se nevratně smažou.', confirm: 'Smazat', danger: true, onConfirm: () => { mutate(d => ({ ...d, posts: d.posts.filter(x => !(x.workspaceId === workspaceId && x.id === p.id)) })); toast.success('Příspěvek byl smazán.'); } })}><Trash2 aria-hidden />Smazat</Btn>
                {g && <Btn onClick={() => go('komunita/' + g.id)}>Otevřít skupinu</Btn>}
              </div>
            )}
          </section>
        ); })}
      </div>
      {confirmEl}
    </div>
  );
}
