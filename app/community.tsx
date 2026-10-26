'use client';
/* Community: groups with forum categories, feed with posts, reactions and comments, members, moderation and an access preview per contact.
   Posts and comments use the Tiptap editor (rich-text.tsx); its JSON is rendered through a whitelist, never as HTML.
   Image attachments are small local data URLs, other files only metadata. */
import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, EyeOff, Flag, Lock, MessageCircle, MoreHorizontal, Pencil, Pin, Plus, Send, ShieldAlert, SmilePlus, Trash2, UserX, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { fmt, fmtDate, fmtDateTime, money, newId, normalize, plural, relTime } from '@/lib/hub/format';
import { logActivity } from '@/lib/hub/ops';
import { newInvoice, payInvoice } from '@/lib/hub/payments';
import { defaultCategories } from '@/lib/hub/seed';
import type { Attachment, CommunityGroup, Contact, ForumCategory, GroupAccess, Membership, Post, Reaction } from '@/lib/hub/types';
import { useHub, useUnsavedGuard } from './state';
import { Avatar, Badge, Btn, Field, IconBtn, Metric, Modal, PageHead, Pick } from './ui';
import { ContactPicker, FilterTabs, FormError, Notice, Section, SubNav, useConfirm, useRoute } from './kit';
import { ACCENTS, Art } from './learn-shared';
import { AttachButton, AttachmentList, EMPTY_RICH, RichEditor, RichText, type RichValue } from './rich-text';

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
      {creating && <GroupDialog onClose={() => setCreating(false)} onSave={g => { const id = newId('g'); const group: CommunityGroup = { ...g, id, workspaceId, categories: defaultCategories(id), createdAt: new Date().toISOString() }; mutate(d => ({ ...d, groups: [...d.groups, group] })); toast.success('Skupina byla založena.'); go('komunita/' + group.id); }} />}
    </div>
  );
}

type GroupDraft = Omit<CommunityGroup, 'id' | 'workspaceId' | 'createdAt' | 'categories'>;
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
const MAX_TEXT = 5000;
/** Rich editor + attachments shared by the post composer and the comment form. */
function useDraft() {
  const [v, setV] = useState<RichValue>(EMPTY_RICH);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [round, setRound] = useState(0);
  const text = v.text.trim();
  return {
    v, setV, files, round, text,
    ready: (!!text || files.length > 0) && v.text.length <= MAX_TEXT,
    add: (a: Attachment[]) => setFiles(f => [...f, ...a]),
    remove: (id: string) => setFiles(f => f.filter(x => x.id !== id)),
    /** Fields stored on the post/comment; `text` falls back to file names for moderation and activity. */
    out: () => ({ text: text || files.map(f => f.name).join(', '), content: text ? v.doc : undefined, attachments: files.length ? files : undefined }),
    reset: () => { setV(EMPTY_RICH); setFiles([]); setRound(r => r + 1); },
  };
}

const REACTIONS: [Reaction, string, string][] = [['like', '👍', 'Líbí se mi'], ['love', '❤️', 'Srdce'], ['haha', '😂', 'Haha'], ['wow', '😮', 'Wow'], ['sad', '😢', 'Smutné'], ['angry', '😡', 'Naštvané']];
/** Sets the user's reaction; the same one again removes it. */
function react(p: Post, r: Reaction): Post {
  const counts = { ...p.reactions };
  if (p.myReaction) counts[p.myReaction] = Math.max(0, (counts[p.myReaction] ?? 0) - 1);
  const next = p.myReaction === r ? undefined : r;
  if (next) counts[next] = (counts[next] ?? 0) + 1;
  return { ...p, reactions: counts, myReaction: next };
}

/** Main button toggles "Líbí se mi" (or removes the own reaction); the smiley opens all reactions. */
function Reactions({ p, onReact }: { p: Post; onReact: (r: Reaction) => void }) {
  const [open, setOpen] = useState(false);
  const used = REACTIONS.filter(([k]) => (p.reactions[k] ?? 0) > 0).sort((a, b) => (p.reactions[b[0]] ?? 0) - (p.reactions[a[0]] ?? 0));
  const total = used.reduce((s, [k]) => s + (p.reactions[k] ?? 0), 0);
  const mine = REACTIONS.find(([k]) => k === p.myReaction);
  return (
    <div className="reactions">
      <button type="button" className={`reaction-main ${mine ? 'on' : ''}`} aria-pressed={!!mine} onClick={() => onReact(mine ? mine[0] : 'like')} title={mine ? 'Zrušit reakci' : 'Líbí se mi'}>
        <span aria-hidden>{mine ? mine[1] : '👍'}</span>{mine ? mine[2] : 'Líbí se mi'}
      </button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild><button type="button" className="reaction-more" aria-label="Vybrat reakci" title="Vybrat reakci"><SmilePlus size={16} aria-hidden /></button></PopoverTrigger>
        <PopoverContent className="reaction-picker" side="top" align="start" aria-label="Reakce">
          {REACTIONS.map(([k, e, l]) => <button key={k} type="button" aria-label={l} title={l} aria-pressed={p.myReaction === k} className={p.myReaction === k ? 'on' : ''} onClick={() => { onReact(k); setOpen(false); }}><span aria-hidden>{e}</span></button>)}
        </PopoverContent>
      </Popover>
      {total > 0 && <span className="reaction-sum" title={used.map(([k, , l]) => `${l}: ${p.reactions[k]}`).join(' · ')}><span aria-hidden>{used.slice(0, 3).map(([, e]) => e).join('')}</span><span className="sr-only">Reakce: {used.map(([k, , l]) => `${l} ${p.reactions[k]}`).join(', ')}.</span><span aria-hidden>{fmt(total)}</span></span>}
    </div>
  );
}

/** Category filter of a group (?kategorie=), shared by the feed and the access preview. */
function useCategory(g: CommunityGroup, posts: Post[]) {
  const { query, setQuery } = useRoute();
  const sel = g.categories.find(c => c.id === query.get('kategorie'));
  const set = (id: string) => setQuery({ kategorie: id || undefined });
  const tabs = (
    <div className="forum-cats">
      <FilterTabs label="Kategorie fóra" value={sel?.id ?? ''} onChange={set} items={[['', 'Vše', posts.length], ...g.categories.map(c => [c.id, c.name, posts.filter(p => p.categoryId === c.id).length] as [string, string, number])]} />
      {sel?.description && <p className="small muted">{sel.description}</p>}
    </div>
  );
  return { sel, set, tabs, shown: sel ? posts.filter(p => p.categoryId === sel.id) : posts };
}

function PostCard({ p, admin, asContact, category, onCategory }: { p: Post; admin: boolean; asContact?: Contact; category?: ForumCategory; onCategory?: (id: string) => void }) {
  const { workspaceId, mutate, profile, go } = useHub();
  const draft = useDraft();
  const [confirmEl, confirm] = useConfirm();
  const [now] = useState(() => Date.now());
  const update = (fn: (x: Post) => Post) => mutate(d => ({ ...d, posts: d.posts.map(x => (x.workspaceId === workspaceId && x.id === p.id ? fn(x) : x)) }));
  const author = asContact?.name ?? profile.name;
  const open = p.reports.filter(r => !r.resolved).length;
  /** The workspace user's own posts/comments show their profile photo. */
  const photo = (x: { author: string; contactId?: number }) => (!x.contactId && x.author === profile.name ? profile.photo?.dataUrl : undefined);
  const addComment = () => {
    if (!draft.ready) return;
    update(x => ({ ...x, comments: [...x.comments, { id: newId('cm'), author, contactId: asContact?.id, ...draft.out(), date: new Date().toISOString(), hidden: false }] }));
    draft.reset();
  };
  return (
    <article className={`panel post ${p.hidden ? 'is-hidden' : ''}`}>
      <header className="post-head">
        <Avatar name={p.author} size="sm" src={photo(p)} />
        <div><strong>{p.contactId ? <button type="button" className="text-link inline" onClick={() => admin && go('kontakty/' + p.contactId)}>{p.author}</button> : p.author}</strong><small>{relTime(p.date, now)}{p.pinned ? ' · připnuto' : ''}{p.hidden ? ' · skryto' : ''}</small></div>
        {category && (onCategory ? <button type="button" className="post-cat" onClick={() => onCategory(category.id)} title="Zobrazit kategorii">{category.name}</button> : <span className="post-cat">{category.name}</span>)}
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
      <RichText doc={p.content} text={p.text} className="post-text" />
      <AttachmentList items={p.attachments} />
      <div className="post-actions">
        <Reactions p={p} onReact={r => update(x => react(x, r))} />
        <span><MessageCircle size={16} aria-hidden />{p.comments.filter(c => admin || !c.hidden).length}</span>
        {!admin && <button type="button" onClick={() => { update(x => ({ ...x, reports: [...x.reports, { id: newId('rep'), reason: 'Nevhodný obsah', by: author, date: new Date().toISOString(), resolved: false }] })); toast.success('Příspěvek byl nahlášen moderátorům.'); }}><Flag size={16} aria-hidden />Nahlásit</button>}
      </div>
      {p.comments.length > 0 && (
        <ul className="comments">
          {p.comments.filter(c => admin || !c.hidden).map(c => (
            <li key={c.id} className={c.hidden ? 'is-hidden' : ''}>
              <Avatar name={c.author} size="sm" src={photo(c)} />
              <div><strong>{c.author}</strong> <small>{relTime(c.date, now)}{c.hidden ? ' · skryto' : ''}</small><RichText doc={c.content} text={c.text} /><AttachmentList items={c.attachments} /></div>
              {admin && <button type="button" className="text-link" onClick={() => update(x => ({ ...x, comments: x.comments.map(y => (y.id === c.id ? { ...y, hidden: !y.hidden } : y)) }))}>{c.hidden ? 'Zobrazit' : 'Skrýt'}</button>}
            </li>
          ))}
        </ul>
      )}
      <div className="comment-form">
        <RichEditor key={draft.round} compact label="Nový komentář" placeholder={`Komentovat jako ${author}…`} onChange={draft.setV} onSubmit={addComment} tools={<AttachButton count={draft.files.length} onAdd={draft.add} />}>
          <AttachmentList items={draft.files} onRemove={draft.remove} />
        </RichEditor>
        <Btn disabled={!draft.ready} onClick={addComment} aria-label="Odeslat komentář" title="Odeslat (Ctrl+Enter)"><Send aria-hidden /></Btn>
      </div>
      {confirmEl}
    </article>
  );
}

function Composer({ g, asContact, category }: { g: CommunityGroup; asContact?: Contact; category?: ForumCategory }) {
  const { workspaceId, mutate, profile } = useHub();
  const draft = useDraft();
  const [picked, setPicked] = useState<string>();
  // explicit choice wins, otherwise the category being viewed, otherwise the first (general) one
  const catId = (g.categories.some(c => c.id === picked) ? picked : undefined) ?? category?.id ?? g.categories[0]?.id ?? '';
  const post = () => {
    if (!draft.ready) return;
    const p: Post = { id: newId('post'), workspaceId, groupId: g.id, author: asContact?.name ?? profile.name, contactId: asContact?.id, ...draft.out(), categoryId: catId, date: new Date().toISOString(), pinned: false, hidden: false, reactions: {}, comments: [], reports: [] };
    mutate(d => { const next = { ...d, posts: [p, ...d.posts] }; return asContact ? logActivity(next, workspaceId, asContact.id, 'community', `Příspěvek ve skupině ${g.name}`, p.text.slice(0, 80), 'komunita/' + g.id) : next; });
    draft.reset(); setPicked(undefined); toast.success('Příspěvek je zveřejněný.', { description: 'Upozornění členům e-mailem se v prototypu neodesílá.' });
  };
  const len = draft.v.text.length;
  return (
    <section className="panel composer">
      <RichEditor key={draft.round} label="Nový příspěvek" placeholder={asContact ? `Napište příspěvek jako ${asContact.name}…` : 'Napište příspěvek pro členy…'} onChange={draft.setV} onSubmit={post} tools={<AttachButton count={draft.files.length} onAdd={draft.add} />}>
        <AttachmentList items={draft.files} onRemove={draft.remove} />
      </RichEditor>
      <div className="composer-foot">
        <span className={`small ${len > MAX_TEXT ? 'negative' : 'muted'}`}>{fmt(len)}/{fmt(MAX_TEXT)} · Ctrl+Enter zveřejní</span>
        <div className="flex-row">
          {g.categories.length > 1 && <Pick value={catId} onChange={setPicked} options={g.categories.map(c => [c.id, c.name] as [string, string])} label="Kategorie příspěvku" />}
          <Btn primary onClick={post} disabled={!draft.ready}><Send aria-hidden />Zveřejnit</Btn>
        </div>
      </div>
    </section>
  );
}

function Feed({ g }: { g: CommunityGroup }) {
  const { w } = useHub();
  const all = w.posts.filter(p => p.groupId === g.id).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.date.localeCompare(a.date));
  const { sel, set, tabs, shown } = useCategory(g, all);
  const cats = new Map(g.categories.map(c => [c.id, c]));
  return (
    <div className="split">
      <div className="stack">
        {tabs}
        <Composer g={g} category={sel} />
        {shown.map(p => <PostCard key={p.id} p={p} admin category={sel ? undefined : cats.get(p.categoryId)} onCategory={set} />)}
        {!shown.length && <section className="panel empty"><MessageCircle size={28} aria-hidden /><h3>{sel ? `V kategorii ${sel.name} zatím nic není` : 'Ve skupině zatím nic není'}</h3><p>Napište první příspěvek a přivítejte členy.</p></section>}
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
  const [picked, setPicked] = useState<number[]>([]);
  const inGroup = new Set(w.memberships.filter(m => m.groupId === g.id).map(m => m.contactId));
  const candidates = w.contacts.filter(c => !inGroup.has(c.id));
  return (
    <Modal open onClose={onClose} title="Přidat členy" desc={g.access === 'Placená' ? 'Ruční členství bez platby (např. bonus).' : 'Pozvánka e-mailem se v prototypu neodesílá.'}>
      <div className="stack">
        <ContactPicker candidates={candidates} picked={picked} onChange={setPicked} emptyText="Všechny kontakty už jsou členy." />
      </div>
      <div className="form-actions"><Btn onClick={onClose}>Zrušit</Btn><Btn primary disabled={!picked.length} onClick={() => { const date = new Date().toISOString(); mutate(d => picked.reduce((acc, id) => logActivity(acc, workspaceId, id, 'community', `Vstup do skupiny ${g.name}`, 'Přidán ručně', 'komunita/' + g.id), { ...d, memberships: [...d.memberships, ...picked.map(contactId => ({ id: newId('mb'), workspaceId, groupId: g.id, contactId, role: 'Člen' as const, status: 'Aktivní' as const, joinedAt: date }))] })); toast.success(`Přidáno: ${plural(picked.length, 'člen', 'členové', 'členů')}.`); onClose(); }}>{picked.length ? `Přidat ${plural(picked.length, 'člena', 'členy', 'členů')}` : 'Přidat členy'}</Btn></div>
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
      <div className="stack">
        <Section title="Skupina">
          <div className="sec-body stack">
            <GroupForm v={v} set={p => { setV({ ...v, ...p }); setError(''); }} />
            <FormError>{error}</FormError>
            <div className="form-actions"><Btn onClick={() => setV(init)} disabled={!dirty}>Zahodit změny</Btn><Btn primary disabled={!dirty} onClick={() => { const e = groupError(v); if (e) { setError(e); return; } patch('groups', g.id, x => ({ ...x, ...v, name: v.name.trim() })); toast.success('Skupina byla uložena.'); }}>Uložit</Btn></div>
          </div>
        </Section>
        <Categories g={g} />
      </div>
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

/** Forum categories: add, rename, reorder, delete (its posts move to another category). */
function Categories({ g }: { g: CommunityGroup }) {
  const { w, patch, mutate, workspaceId } = useHub();
  const [edit, setEdit] = useState<ForumCategory | null>(null);
  const [confirmEl, confirm] = useConfirm();
  const count = (id: string) => w.posts.filter(p => p.groupId === g.id && p.categoryId === id).length;
  const setCats = (fn: (c: ForumCategory[]) => ForumCategory[]) => patch('groups', g.id, x => ({ ...x, categories: fn(x.categories) }));
  const move = (i: number, d: number) => setCats(c => { const n = [...c]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });
  const remove = (c: ForumCategory) => {
    const target = g.categories.find(x => x.id !== c.id)!;
    const n = count(c.id);
    confirm({ title: `Smazat kategorii ${c.name}?`, desc: n ? `${plural(n, 'příspěvek se přesune', 'příspěvky se přesunou', 'příspěvků se přesune')} do kategorie ${target.name}.` : 'Kategorie je prázdná.', confirm: 'Smazat', danger: true, onConfirm: () => {
      mutate(d => ({ ...d, groups: d.groups.map(x => (x.workspaceId === workspaceId && x.id === g.id ? { ...x, categories: x.categories.filter(k => k.id !== c.id) } : x)), posts: d.posts.map(p => (p.workspaceId === workspaceId && p.groupId === g.id && p.categoryId === c.id ? { ...p, categoryId: target.id } : p)) }));
      toast.success('Kategorie byla smazána.');
    } });
  };
  return (
    <Section title="Kategorie fóra" desc="Členové vybírají kategorii u každého příspěvku. Pořadí určuje pořadí záložek." actions={<Btn onClick={() => setEdit({ id: '', name: '', description: '' })}><Plus aria-hidden />Nová kategorie</Btn>}>
      <ul className="sec-body cat-list">
        {g.categories.map((c, i) => (
          <li key={c.id}>
            <div><strong>{c.name}</strong><small>{c.description || 'Bez popisu'} · {plural(count(c.id), 'příspěvek', 'příspěvky', 'příspěvků')}</small></div>
            <IconBtn label={`Posunout ${c.name} výš`} onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp /></IconBtn>
            <IconBtn label={`Posunout ${c.name} níž`} onClick={() => move(i, 1)} disabled={i === g.categories.length - 1}><ArrowDown /></IconBtn>
            <IconBtn label={`Upravit ${c.name}`} onClick={() => setEdit(c)}><Pencil /></IconBtn>
            <IconBtn label={g.categories.length < 2 ? 'Skupina musí mít aspoň jednu kategorii' : `Smazat ${c.name}`} onClick={() => remove(c)} disabled={g.categories.length < 2}><Trash2 /></IconBtn>
          </li>
        ))}
      </ul>
      {edit && <CategoryDialog c={edit} taken={g.categories.filter(x => x.id !== edit.id).map(x => normalize(x.name))} onClose={() => setEdit(null)} onSave={v => { setCats(cs => (v.id ? cs.map(x => (x.id === v.id ? v : x)) : [...cs, { ...v, id: newId('cat') }])); toast.success(v.id ? 'Kategorie byla upravena.' : 'Kategorie byla přidána.'); }} />}
      {confirmEl}
    </Section>
  );
}

function CategoryDialog({ c, taken, onClose, onSave }: { c: ForumCategory; taken: string[]; onClose: () => void; onSave: (c: ForumCategory) => void }) {
  const [v, setV] = useState(c);
  const [error, setError] = useState('');
  const save = () => {
    const name = v.name.trim();
    if (!name) return setError('Vyplňte název kategorie.');
    if (taken.includes(normalize(name))) return setError('Kategorie s tímto názvem už existuje.');
    onSave({ ...v, name, description: v.description.trim() }); onClose();
  };
  return (
    <Modal open onClose={onClose} title={c.id ? 'Upravit kategorii' : 'Nová kategorie'} desc="Kategorie rozdělí diskusi ve skupině do témat.">
      <div className="stack">
        <Field label="Název"><input autoFocus value={v.name} onChange={e => { setV({ ...v, name: e.target.value }); setError(''); }} maxLength={40} onKeyDown={e => { if (e.key === 'Enter') save(); }} /></Field>
        <Field label="Popis" hint="Zobrazí se pod záložkou kategorie."><input value={v.description} onChange={e => setV({ ...v, description: e.target.value })} maxLength={140} /></Field>
      </div>
      <FormError>{error}</FormError>
      <div className="form-actions"><Btn onClick={onClose}>Zrušit</Btn><Btn primary onClick={save}>{c.id ? 'Uložit' : 'Přidat kategorii'}</Btn></div>
    </Modal>
  );
}

/* ---------- access preview ---------- */
function AccessPreview({ g }: { g: CommunityGroup }) {
  const { w, workspaceId, mutate, go } = useHub();
  /** Simulated Stripe checkout: paid invoice + subscription + active membership. */
  const buy = (c: Contact) => {
    mutate(d => {
      const inv = { ...newInvoice(d, workspaceId, c.id, [{ id: newId('it'), name: `Členství ${g.name} (měsíčně)`, qty: 1, price: g.price }]), status: 'Odeslaná' as const };
      let next = payInvoice({ ...d, invoices: [inv, ...d.invoices] }, workspaceId, inv.id, 'Karta');
      next = { ...next, subscriptions: [{ id: newId('sub'), workspaceId, contactId: c.id, plan: g.name, price: g.price, interval: 'měsíčně', status: 'Aktivní', startedAt: new Date().toISOString(), nextPaymentAt: new Date(Date.now() + 30 * 86_400_000).toISOString() }, ...next.subscriptions] };
      const existing = next.memberships.find(m => m.workspaceId === workspaceId && m.groupId === g.id && m.contactId === c.id);
      next = existing ? { ...next, memberships: next.memberships.map(m => (m === existing ? { ...m, status: 'Aktivní' } : m)) } : { ...next, memberships: [...next.memberships, { id: newId('mb'), workspaceId, groupId: g.id, contactId: c.id, role: 'Člen', status: 'Aktivní', joinedAt: new Date().toISOString() }] };
      return logActivity(next, workspaceId, c.id, 'community', `Vstup do skupiny ${g.name}`, 'Zaplacené členství (simulace)', 'komunita/' + g.id);
    });
    toast.success('Členství je zaplacené (simulace).', { description: 'Vznikla faktura, platba, předplatné a členství.' });
  };
  const { query, setQuery } = useRoute();
  const contacts = useMemo(() => new Map(w.contacts.map(c => [c.id, c])), [w.contacts]);
  const sample = [...new Set([...w.memberships.filter(m => m.groupId === g.id).map(m => m.contactId).slice(0, 25), ...w.contacts.slice(0, 15).map(c => c.id)])];
  const asId = query.get('kontakt') ?? 'host';
  const c = asId === 'host' ? undefined : contacts.get(Number(asId));
  const enrolled = !!(c && g.courseId && w.enrollments.some(e => e.courseId === g.courseId && e.contactId === c.id && e.status !== 'Pozastaveno'));
  const a = accessFor(g, c, w.memberships, enrolled);
  const posts = w.posts.filter(p => p.groupId === g.id && !p.hidden).sort((x, y) => Number(y.pinned) - Number(x.pinned) || y.date.localeCompare(x.date));
  const cat = useCategory(g, posts);
  const cats = new Map(g.categories.map(x => [x.id, x]));
  return (
    <div className="stack">
      <div className="preview-banner" role="note">
        <span><strong>Náhled přístupu</strong> · co uvidí kontakt v klientském portálu</span>
        <Pick value={asId} onChange={v => setQuery({ kontakt: v === 'host' ? undefined : v })} options={[['host', 'Nepřihlášený návštěvník'], ...sample.map(id => [String(id), contacts.get(id)?.name ?? '?'] as [string, string])]} label="Zobrazit jako" />
      </div>
      <Notice tone={a.ok ? 'info' : 'warn'}>{a.ok ? `Má přístup: ${a.reason}` : `Nemá přístup: ${a.reason}`}</Notice>
      {a.ok ? (
        <div className="member-view">
          {cat.tabs}
          {c && <Composer g={g} asContact={c} category={cat.sel} />}
          {cat.shown.map(p => <PostCard key={p.id} p={p} admin={false} asContact={c} category={cat.sel ? undefined : cats.get(p.categoryId)} onCategory={cat.set} />)}
          {!cat.shown.length && <p className="muted">{cat.sel ? 'V této kategorii zatím nejsou příspěvky.' : 'Ve skupině zatím nejsou příspěvky.'}</p>}
        </div>
      ) : (
        <section className="panel player-locked">
          <Lock size={28} aria-hidden /><h2>{g.name}</h2><p>{g.description}</p>
          {g.access === 'Placená' && (c
            ? <Btn primary onClick={() => buy(c)}>Koupit členství za {money(g.price)} / měsíc (simulace)</Btn>
            : <p className="small muted">Členství si koupí přihlášený klient. Vyberte nahoře kontakt.</p>)}
          {g.access === 'Součást kurzu' && g.courseId && <Btn primary onClick={() => go(`kurzy/${g.courseId}/nahled${c ? `?student=${c.id}` : ''}`)}>Zobrazit kurz</Btn>}
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
        {items.map(({ p, r }) => { const g = w.groups.find(x => x.id === p.groupId); const cat = g?.categories.find(x => x.id === p.categoryId); return (
          <section key={r.id} className={`panel report ${r.resolved ? 'is-resolved' : ''}`}>
            <header className="post-head"><ShieldAlert size={18} aria-hidden className={r.resolved ? 'muted' : 'negative'} /><div><strong>{r.reason}</strong><small>nahlásil(a) {r.by} · {relTime(r.date, now)} · {g?.name}{cat ? ` › ${cat.name}` : ''}</small></div><Badge tone={r.resolved ? 'gray' : 'red'}>{r.resolved ? 'Vyřešeno' : 'Čeká'}</Badge></header>
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
