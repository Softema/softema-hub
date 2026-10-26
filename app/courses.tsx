'use client';
/* Courses (admin): list, structure course → modules → lessons, lesson editor, settings and students linked to CRM.
   Digital products live in products.tsx, the student preview in course-player.tsx. */
import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, BookOpen, Check, Copy, Download, Eye, GraduationCap, MoreHorizontal, Paperclip, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { fmt, fmtDate, newId, normalize, percent, plural, daysSince } from '@/lib/hub/format';
import { courseLessons, progressOf } from '@/lib/hub/logic';
import { enrollInCourse, logActivity } from '@/lib/hub/ops';
import type { Course, CourseModule, FileMeta, Lesson, LessonType, PriceType } from '@/lib/hub/types';
import { useHub, useUnsavedGuard } from './state';
import { Avatar, Badge, Btn, Empty, Field, IconBtn, Metric, Modal, PageHead, Pick } from './ui';
import { Bar, ContactPicker, FilterTabs, FormError, ImagePicker, Notice, Pager, Section, SubNav, ToggleRow, download, paginate, toCsv, useConfirm, useRoute } from './kit';
import CoursePlayer from './course-player';
import { RichEditor, fromPlain } from './rich-text';
import { ACCENTS, Art, LESSON_ICON, LearnNav, minutes, priceLabel } from './learn-shared';
import Products from './products';

export default function Courses() {
  const { parts } = useRoute();
  const [, a, b, c] = parts;
  if (a === 'produkty') return <Products id={b} />;
  if (!a) return <CourseList />;
  if (b === 'nahled') return <CoursePlayer id={a} />;
  if (b === 'lekce' && c) return <LessonEditor key={c} courseId={a} lessonId={c} />;
  return <CourseAdmin key={a} id={a} tab={b === 'nastaveni' ? 'settings' : b === 'studenti' ? 'students' : 'content'} />;
}

function CourseList() {
  const { w, go, workspaceId, mutate } = useHub();
  const { query, setQuery } = useRoute();
  const status = query.get('stav') ?? 'all';
  const [creating, setCreating] = useState(false);
  const list = w.courses.filter(c => status === 'all' || c.status === status).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const enrollments = w.enrollments;
  const stats = (c: Course) => { const es = enrollments.filter(e => e.courseId === c.id); return { students: es.length, progress: es.length ? es.reduce((s, e) => s + progressOf(e, c), 0) / es.length : 0, done: es.filter(e => progressOf(e, c) === 100).length }; };
  const total = enrollments.length;
  return (
    <div className="page">
      <PageHead title="Kurzy a produkty" desc="Online kurzy a digitální produkty. Studenti jsou kontakty z CRM.">
        <Btn primary onClick={() => setCreating(true)}><Plus aria-hidden />Nový kurz</Btn>
      </PageHead>
      <LearnNav active="kurzy" />
      <div className="metric-grid">
        <Metric label="Kurzy" value={fmt(w.courses.length)} desc={`${w.courses.filter(c => c.status === 'Publikováno').length} publikované`} />
        <Metric label="Studenti" value={fmt(new Set(enrollments.map(e => e.contactId)).size)} desc={plural(total, 'zápis', 'zápisy', 'zápisů')} />
        <Metric label="Dokončili kurz" value={fmt(enrollments.filter(e => { const c = w.courses.find(x => x.id === e.courseId); return c && progressOf(e, c) === 100; }).length)} desc="všechny lekce hotové" />
        <Metric label="Digitální produkty" value={fmt(w.products.length)} desc={plural(w.purchases.length, 'nákup', 'nákupy', 'nákupů')} />
      </div>
      <FilterTabs label="Stav kurzu" value={status} onChange={k => setQuery({ stav: k === 'all' ? undefined : k })} items={[['all', 'Všechny', w.courses.length], ['Publikováno', 'Publikované', w.courses.filter(c => c.status === 'Publikováno').length], ['Koncept', 'Koncepty', w.courses.filter(c => c.status === 'Koncept').length]]} />
      {w.courses.length === 0 ? (
        <section className="panel empty"><GraduationCap size={28} aria-hidden /><h3>Zatím nemáte žádný kurz</h3><p>Vytvořte kurz, rozdělte ho do modulů a lekcí a pozvěte první studenty.</p><Btn primary onClick={() => setCreating(true)}><Plus aria-hidden />Vytvořit kurz</Btn></section>
      ) : (
        <div className="card-grid">
          {list.map(c => { const s = stats(c); return (
            <article key={c.id} className="panel course-card">
              <button type="button" className="course-card-link" onClick={() => go('kurzy/' + c.id)} tabIndex={-1} aria-hidden><Art accent={c.accent} image={c.image} eyebrow={c.subtitle} title={c.title} /></button>
              <div className="course-card-body">
                <div className="flex-row spread"><Badge tone={c.status === 'Publikováno' ? 'green' : 'gray'}>{c.status}</Badge><span className="small muted">{priceLabel(c)}</span></div>
                <h3><button type="button" onClick={() => go('kurzy/' + c.id)}>{c.title}</button></h3>
                <p className="muted small">{plural(c.modules.length, 'modul', 'moduly', 'modulů')} · {plural(courseLessons(c).length, 'lekce', 'lekce', 'lekcí')} · {minutes(courseLessons(c).reduce((x, l) => x + l.duration, 0))}</p>
                <div className="course-stats"><span><strong>{fmt(s.students)}</strong> studentů</span><span><strong>{Math.round(s.progress)} %</strong> průměrný postup</span></div>
                <Bar value={s.progress} label={`Průměrný postup kurzu ${c.title}`} />
                <div className="flex-row mt-3"><Btn onClick={() => go(`kurzy/${c.id}`)}><Pencil aria-hidden />Upravit</Btn><Btn onClick={() => go(`kurzy/${c.id}/nahled`)}><Eye aria-hidden />Náhled studenta</Btn></div>
              </div>
            </article>
          ); })}
          {!list.length && <Empty text="Žádný kurz v tomto stavu." />}
        </div>
      )}
      <NewCourse open={creating} onClose={() => setCreating(false)} onCreate={(title, subtitle) => {
        const date = new Date().toISOString();
        const course: Course = { id: newId('c'), workspaceId, title, subtitle, description: '', accent: 'orange', price: 0, priceType: 'Zdarma', status: 'Koncept', drip: 'Vše hned', certificate: false, createdAt: date, updatedAt: date, modules: [{ id: newId('m'), title: 'Úvod', lessons: [] }] };
        mutate(d => ({ ...d, courses: [course, ...d.courses] }));
        toast.success('Kurz byl vytvořen jako koncept.');
        go('kurzy/' + course.id);
      }} />
    </div>
  );
}

function NewCourse({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (title: string, subtitle: string) => void }) {
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [error, setError] = useState('');
  return (
    <Modal open={open} onClose={onClose} title="Nový kurz" desc="Kurz vznikne jako koncept. Studenti ho uvidí až po publikování.">
      <form onSubmit={e => { e.preventDefault(); if (!title.trim()) { setError('Vyplňte název kurzu.'); return; } onCreate(title.trim(), subtitle.trim()); setTitle(''); setSubtitle(''); onClose(); }} noValidate>
        <div className="stack">
          <Field label="Název kurzu"><input value={title} onChange={e => { setTitle(e.target.value); setError(''); }} maxLength={120} autoFocus /></Field>
          <Field label="Podtitul (nepovinné)"><input value={subtitle} onChange={e => setSubtitle(e.target.value)} maxLength={80} /></Field>
          <FormError>{error}</FormError>
        </div>
        <div className="form-actions"><Btn type="button" onClick={onClose}>Zrušit</Btn><Btn primary type="submit">Vytvořit kurz</Btn></div>
      </form>
    </Modal>
  );
}

function CourseAdmin({ id, tab }: { id: string; tab: 'content' | 'settings' | 'students' }) {
  const { w, go, workspaceId, mutate, patch } = useHub();
  const c = w.courses.find(x => x.id === id);
  const [confirmEl, confirm] = useConfirm();
  if (!c) return <div className="page"><section className="panel empty"><h3>Kurz nenalezen</h3><p>V tomto pracovním prostoru kurz neexistuje.</p><Btn primary onClick={() => go('kurzy')}>Zpět na kurzy</Btn></section></div>;
  const lessons = courseLessons(c);
  const students = w.enrollments.filter(e => e.courseId === c.id).length;
  const togglePublish = () => {
    if (c.status === 'Koncept') {
      if (!lessons.length) { toast.error('Kurz bez lekcí nelze publikovat.'); return; }
      patch('courses', c.id, x => ({ ...x, status: 'Publikováno', updatedAt: new Date().toISOString() }));
      toast.success('Kurz je publikovaný.', { description: 'Studenti s přístupem ho uvidí v klientském portálu.' });
    } else confirm({ title: 'Stáhnout kurz z publikace?', desc: `${plural(students, 'student', 'studenti', 'studentů')} ztratí přístup, dokud kurz znovu nepublikujete. Postup se zachová.`, confirm: 'Vrátit do konceptu', onConfirm: () => { patch('courses', c.id, x => ({ ...x, status: 'Koncept', updatedAt: new Date().toISOString() })); toast.success('Kurz je znovu koncept.'); } });
  };
  const duplicate = () => {
    const date = new Date().toISOString();
    const copy: Course = { ...c, id: newId('c'), title: `${c.title} (kopie)`, status: 'Koncept', createdAt: date, updatedAt: date, modules: c.modules.map(m => ({ ...m, id: newId('m'), lessons: m.lessons.map(l => ({ ...l, id: newId('l') })) })) };
    mutate(d => ({ ...d, courses: [copy, ...d.courses] })); toast.success('Kopie kurzu byla vytvořena.'); go('kurzy/' + copy.id);
  };
  const remove = () => confirm({ title: `Smazat kurz ${c.title}?`, danger: true, confirm: 'Smazat kurz', desc: students ? `Kurz má ${plural(students, 'studenta', 'studenty', 'studentů')}. Jejich přístupy a postup se smažou. Akci nelze vrátit.` : 'Kurz a jeho obsah se nevratně smažou.', onConfirm: () => { mutate(d => ({ ...d, courses: d.courses.filter(x => !(x.workspaceId === workspaceId && x.id === c.id)), enrollments: d.enrollments.filter(e => !(e.workspaceId === workspaceId && e.courseId === c.id)) })); toast.success('Kurz byl smazán.'); go('kurzy'); } });
  return (
    <div className="page">
      <button type="button" className="back-link" onClick={() => go('kurzy')}><ArrowLeft size={15} aria-hidden />Všechny kurzy</button>
      <PageHead title={c.title} desc={`${c.status} · ${priceLabel(c)} · ${plural(lessons.length, 'lekce', 'lekce', 'lekcí')} · ${plural(students, 'student', 'studenti', 'studentů')}`}>
        <Badge tone={c.status === 'Publikováno' ? 'green' : 'gray'}>{c.status}</Badge>
        <Btn onClick={() => go(`kurzy/${c.id}/nahled`)}><Eye aria-hidden />Náhled studenta</Btn>
        <Btn primary onClick={togglePublish}>{c.status === 'Koncept' ? <><Check aria-hidden />Publikovat</> : 'Vrátit do konceptu'}</Btn>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><button type="button" className="icon-btn" aria-label="Další akce kurzu"><MoreHorizontal aria-hidden /></button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={duplicate}><Copy aria-hidden />Duplikovat</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={remove}><Trash2 aria-hidden />Smazat kurz</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </PageHead>
      <SubNav active={tab === 'content' ? `kurzy/${c.id}` : tab === 'settings' ? `kurzy/${c.id}/nastaveni` : `kurzy/${c.id}/studenti`} items={[[`kurzy/${c.id}`, 'Obsah', lessons.length], [`kurzy/${c.id}/nastaveni`, 'Nastavení'], [`kurzy/${c.id}/studenti`, 'Studenti', students]]} />
      {tab === 'content' && <Structure c={c} />}
      {tab === 'settings' && <CourseSettings key={c.updatedAt} c={c} />}
      {tab === 'students' && <Students c={c} />}
      {confirmEl}
    </div>
  );
}

/* ---------- structure ---------- */
function Structure({ c }: { c: Course }) {
  const { patch, go } = useHub();
  const [confirmEl, confirm] = useConfirm();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState('');
  const save = (modules: CourseModule[]) => patch('courses', c.id, x => ({ ...x, modules, updatedAt: new Date().toISOString() }));
  const move = <T,>(list: T[], i: number, d: number) => { const n = [...list]; const j = i + d; if (j < 0 || j >= n.length) return list; [n[i], n[j]] = [n[j], n[i]]; return n; };
  const addLesson = (mid: string) => {
    const lesson: Lesson = { id: newId('l'), title: 'Nová lekce', type: 'Video', duration: 10, videoUrl: '', text: '', attachments: [], dripDays: 0, preview: false };
    save(c.modules.map(m => (m.id === mid ? { ...m, lessons: [...m.lessons, lesson] } : m)));
    go(`kurzy/${c.id}/lekce/${lesson.id}`);
  };
  const addModule = () => { const m: CourseModule = { id: newId('m'), title: `Modul ${c.modules.length + 1}`, lessons: [] }; save([...c.modules, m]); setRenaming(m.id); setName(m.title); };
  return (
    <div className="split">
      <div className="stack">
        {c.drip === 'Postupně' && <Notice>Kurz zpřístupňuje lekce postupně. U každé lekce je počet dní od zápisu studenta.</Notice>}
        {c.modules.map((m, mi) => (
          <section key={m.id} className="panel course-module" aria-label={`Modul ${mi + 1}: ${m.title}`}>
            <header className="module-head">
              <span className="module-no">{mi + 1}</span>
              {renaming === m.id ? (
                <form className="module-rename" onSubmit={e => { e.preventDefault(); if (!name.trim()) return; save(c.modules.map(x => (x.id === m.id ? { ...x, title: name.trim() } : x))); setRenaming(null); }}>
                  <input value={name} onChange={e => setName(e.target.value)} aria-label="Název modulu" autoFocus maxLength={120} onKeyDown={e => e.key === 'Escape' && setRenaming(null)} />
                  <Btn type="submit" primary>Uložit</Btn><Btn type="button" onClick={() => setRenaming(null)}>Zrušit</Btn>
                </form>
              ) : <h2>{m.title}</h2>}
              <span className="small muted">{plural(m.lessons.length, 'lekce', 'lekce', 'lekcí')}</span>
              <span className="module-actions">
                <IconBtn label="Přejmenovat modul" onClick={() => { setRenaming(m.id); setName(m.title); }}><Pencil /></IconBtn>
                <IconBtn label="Posunout modul nahoru" disabled={mi === 0} onClick={() => save(move(c.modules, mi, -1))}><ArrowUp /></IconBtn>
                <IconBtn label="Posunout modul dolů" disabled={mi === c.modules.length - 1} onClick={() => save(move(c.modules, mi, 1))}><ArrowDown /></IconBtn>
                <IconBtn label="Smazat modul" onClick={() => confirm({ title: `Smazat modul ${m.title}?`, desc: m.lessons.length ? `Smaže se i ${plural(m.lessons.length, 'lekce', 'lekce', 'lekcí')}. Postup studentů v nich se ztratí.` : 'Prázdný modul se odstraní.', confirm: 'Smazat modul', danger: true, onConfirm: () => { save(c.modules.filter(x => x.id !== m.id)); toast.success('Modul byl smazán.'); } })}><Trash2 /></IconBtn>
              </span>
            </header>
            <ol className="lesson-list">
              {m.lessons.map((l, li) => { const Icon = LESSON_ICON[l.type]; return (
                <li key={l.id} className="lesson-row">
                  <span className="row-icon"><Icon size={16} aria-hidden /></span>
                  <button type="button" className="lesson-title" onClick={() => go(`kurzy/${c.id}/lekce/${l.id}`)}>{l.title}<small>{l.type} · {minutes(l.duration)}{c.drip === 'Postupně' ? ` · den ${l.dripDays}` : ''}{l.attachments.length ? ` · ${plural(l.attachments.length, 'příloha', 'přílohy', 'příloh')}` : ''}</small></button>
                  {l.preview && <Badge tone="blue">Ukázka zdarma</Badge>}
                  <span className="lesson-actions">
                    <IconBtn label={`Posunout lekci ${l.title} nahoru`} disabled={li === 0} onClick={() => save(c.modules.map(x => (x.id === m.id ? { ...x, lessons: move(x.lessons, li, -1) } : x)))}><ArrowUp /></IconBtn>
                    <IconBtn label={`Posunout lekci ${l.title} dolů`} disabled={li === m.lessons.length - 1} onClick={() => save(c.modules.map(x => (x.id === m.id ? { ...x, lessons: move(x.lessons, li, 1) } : x)))}><ArrowDown /></IconBtn>
                    {c.modules.length > 1 && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><button type="button" className="icon-btn" aria-label={`Přesunout lekci ${l.title} do modulu`}><MoreHorizontal aria-hidden /></button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {c.modules.filter(x => x.id !== m.id).map(x => <DropdownMenuItem key={x.id} onSelect={() => { save(c.modules.map(y => (y.id === m.id ? { ...y, lessons: y.lessons.filter(z => z.id !== l.id) } : y.id === x.id ? { ...y, lessons: [...y.lessons, l] } : y))); toast.success(`Lekce přesunuta do modulu ${x.title}.`); }}>Přesunout do: {x.title}</DropdownMenuItem>)}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    <IconBtn label={`Upravit lekci ${l.title}`} onClick={() => go(`kurzy/${c.id}/lekce/${l.id}`)}><Pencil /></IconBtn>
                    <IconBtn label={`Smazat lekci ${l.title}`} onClick={() => confirm({ title: `Smazat lekci ${l.title}?`, desc: 'Lekce se odstraní z kurzu i z postupu studentů.', confirm: 'Smazat lekci', danger: true, onConfirm: () => { save(c.modules.map(x => (x.id === m.id ? { ...x, lessons: x.lessons.filter(z => z.id !== l.id) } : x))); toast.success('Lekce byla smazána.'); } })}><Trash2 /></IconBtn>
                  </span>
                </li>
              ); })}
              {!m.lessons.length && <li className="muted small lesson-empty">Modul zatím nemá lekce.</li>}
            </ol>
            <div className="module-foot"><Btn onClick={() => addLesson(m.id)}><Plus aria-hidden />Přidat lekci</Btn></div>
          </section>
        ))}
        <div><Btn onClick={addModule}><Plus aria-hidden />Přidat modul</Btn></div>
      </div>
      <Section title="Přehled kurzu" className="sticky-side">
        <div className="sec-body">
          <Art accent={c.accent} image={c.image} eyebrow={c.subtitle} title={c.title} small />
          <div className="kv"><span>Moduly</span><strong>{c.modules.length}</strong></div>
          <div className="kv"><span>Lekce</span><strong>{courseLessons(c).length}</strong></div>
          <div className="kv"><span>Délka</span><strong>{minutes(courseLessons(c).reduce((s, l) => s + l.duration, 0))}</strong></div>
          <div className="kv"><span>Zpřístupnění</span><strong>{c.drip}</strong></div>
          <div className="kv"><span>Cena</span><strong>{priceLabel(c)}</strong></div>
          <Btn className="full mt-3" onClick={() => go(`kurzy/${c.id}/nastaveni`)}>Upravit nastavení</Btn>
        </div>
      </Section>
      {confirmEl}
    </div>
  );
}

/* ---------- lesson editor ---------- */
const QUIZ_HINT = '? Otázka\n* správná odpověď\n- špatná odpověď';
function LessonEditor({ courseId, lessonId }: { courseId: string; lessonId: string }) {
  const { w, go, patch } = useHub();
  const c = w.courses.find(x => x.id === courseId);
  const found = c?.modules.flatMap(m => m.lessons.map(l => ({ m, l }))).find(x => x.l.id === lessonId);
  const [draft, setDraft] = useState<Lesson | undefined>(found?.l);
  const [error, setError] = useState('');
  const dirty = !!found && JSON.stringify(draft) !== JSON.stringify(found.l);
  useUnsavedGuard(dirty, 'Lekce má neuložené změny.');
  if (!c || !found || !draft) return <div className="page"><section className="panel empty"><h3>Lekce nenalezena</h3><Btn primary onClick={() => go(c ? `kurzy/${c.id}` : 'kurzy')}>Zpět na kurz</Btn></section></div>;
  const set = (p: Partial<Lesson>) => { setDraft({ ...draft, ...p }); setError(''); };
  const save = () => {
    if (!draft.title.trim()) return setError('Vyplňte název lekce.');
    if (draft.type === 'Video' && draft.videoUrl && !/^https:\/\/\S+$/.test(draft.videoUrl)) return setError('Odkaz na video musí začínat https://');
    if (draft.duration < 0 || draft.dripDays < 0) return setError('Délka a den zpřístupnění nesmí být záporné.');
    const next = { ...draft, title: draft.title.trim() };
    patch('courses', c.id, x => ({ ...x, updatedAt: new Date().toISOString(), modules: x.modules.map(m => ({ ...m, lessons: m.lessons.map(l => (l.id === next.id ? next : l)) })) }));
    setDraft(next);
    toast.success('Lekce byla uložena.');
  };
  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const meta: FileMeta[] = [...files].map(f => ({ id: newId('f'), name: f.name, size: f.size, type: f.type || 'application/octet-stream', addedAt: new Date().toISOString() }));
    set({ attachments: [...draft.attachments, ...meta] });
  };
  return (
    <div className="page">
      <button type="button" className="back-link" onClick={() => go(`kurzy/${c.id}`)}><ArrowLeft size={15} aria-hidden />{c.title}</button>
      <PageHead title={draft.title || 'Lekce'} desc={`Modul: ${found.m.title}`}>
        <Btn onClick={() => go(`kurzy/${c.id}/nahled?lekce=${draft.id}`)} disabled={dirty} title={dirty ? 'Nejdřív uložte změny' : undefined}><Eye aria-hidden />Náhled</Btn>
        <Btn primary onClick={save} disabled={!dirty}><Check aria-hidden />Uložit lekci</Btn>
      </PageHead>
      <div className="split">
        <Section title="Obsah lekce">
          <div className="sec-body stack">
            <Field label="Název lekce"><input value={draft.title} onChange={e => set({ title: e.target.value })} maxLength={150} /></Field>
            <div className="form-grid">
              <Field label="Typ lekce"><Pick value={draft.type} onChange={v => set({ type: v as LessonType })} options={['Video', 'Text', 'Soubor', 'Kvíz']} className="full" label="Typ lekce" /></Field>
              <Field label="Délka (minuty)"><input type="number" min={0} max={600} value={draft.duration} onChange={e => set({ duration: Number(e.target.value) })} /></Field>
            </div>
            {draft.type === 'Video' && <Field label="Odkaz na video" hint="V ukázce se přehraje odkaz z YouTube, Vimeo nebo přímý soubor MP4. Nahrávání videí (Mux) přijde s backendem."><input type="url" value={draft.videoUrl} onChange={e => set({ videoUrl: e.target.value })} placeholder="https://" /></Field>}
            {draft.type === 'Kvíz' ? (
              <Field label="Otázky kvízu" hint="Formát: řádek začínající „?“ je otázka, „*“ správná a „-“ špatná odpověď.">
                <textarea rows={10} value={draft.text} onChange={e => set({ text: e.target.value, content: undefined })} placeholder={QUIZ_HINT} />
              </Field>
            ) : (
              <div className="field">
                <span id="lesson-text-label">Text lekce</span>
                <RichEditor key={draft.id} headings label="Text lekce" placeholder="Text, který student uvidí pod videem nebo místo něj." initial={draft.content ?? (draft.text ? fromPlain(draft.text) : undefined)} onChange={v => set({ content: v.doc, text: v.text })} />
                <small>Nadpisy, zvýraznění, seznamy, citace a odkazy. Student uvidí text naformátovaný.</small>
              </div>
            )}
            <div className="field">
              <span>Přílohy</span>
              <ul className="file-list">
                {draft.attachments.map(f => <li key={f.id}><Paperclip size={14} aria-hidden /><span>{f.name}<small>{fmt(Math.round(f.size / 1024))} kB</small></span><IconBtn label={`Odebrat přílohu ${f.name}`} onClick={() => set({ attachments: draft.attachments.filter(x => x.id !== f.id) })}><X /></IconBtn></li>)}
                {!draft.attachments.length && <li className="muted small">Bez příloh.</li>}
              </ul>
              <label className="hub-btn file-btn"><input type="file" multiple className="sr-only" onChange={e => { addFiles(e.target.files); e.target.value = ''; }} /><Plus size={16} aria-hidden />Přidat soubor</label>
              <small>Ukládá se jen název a velikost. Soubor se nikam nenahrává (pre-signed URL přijdou s backendem).</small>
            </div>
            <FormError>{error}</FormError>
          </div>
        </Section>
        <Section title="Zpřístupnění" className="sticky-side">
          <div className="sec-body stack">
            {c.drip === 'Postupně'
              ? <Field label="Zpřístupnit po (dnech od zápisu)"><input type="number" min={0} max={365} value={draft.dripDays} onChange={e => set({ dripDays: Number(e.target.value) })} /></Field>
              : <Notice>Kurz zpřístupňuje vše hned. Postupné zpřístupnění zapnete v nastavení kurzu.</Notice>}
            <ToggleRow label="Ukázka zdarma" desc="Lekci uvidí i zájemci bez přístupu." checked={draft.preview} onChange={v => set({ preview: v })} />
          </div>
        </Section>
      </div>
    </div>
  );
}

/* ---------- settings ---------- */
function CourseSettings({ c }: { c: Course }) {
  const { patch, w, go } = useHub();
  const init = { title: c.title, subtitle: c.subtitle, description: c.description, image: c.image, accent: c.accent, priceType: c.priceType, price: String(c.price), drip: c.drip, certificate: c.certificate };
  const [v, setV] = useState(init);
  const [error, setError] = useState('');
  const dirty = JSON.stringify(v) !== JSON.stringify(init);
  useUnsavedGuard(dirty, 'Nastavení kurzu má neuložené změny.');
  const group = w.groups.find(g => g.courseId === c.id);
  const save = () => {
    const price = Number(v.price.replace(/\s/g, '').replace(',', '.'));
    if (!v.title.trim()) return setError('Vyplňte název kurzu.');
    if (v.priceType !== 'Zdarma' && v.priceType !== 'Součást členství' && (!Number.isFinite(price) || price <= 0)) return setError('Zadejte cenu v Kč větší než 0.');
    patch('courses', c.id, x => ({ ...x, ...v, title: v.title.trim(), price: v.priceType === 'Zdarma' ? 0 : Math.round(price) || 0, updatedAt: new Date().toISOString() }));
    toast.success('Nastavení kurzu bylo uloženo.');
  };
  return (
    <div className="split">
      <Section title="Základní údaje">
        <div className="sec-body stack">
          <Field label="Název kurzu"><input value={v.title} onChange={e => { setV({ ...v, title: e.target.value }); setError(''); }} maxLength={120} /></Field>
          <Field label="Podtitul"><input value={v.subtitle} onChange={e => setV({ ...v, subtitle: e.target.value })} maxLength={80} /></Field>
          <Field label="Popis"><textarea rows={5} value={v.description} onChange={e => setV({ ...v, description: e.target.value })} maxLength={2000} /></Field>
          <div className="form-grid">
            <Field label="Cena"><Pick value={v.priceType} onChange={x => setV({ ...v, priceType: x as PriceType })} options={['Zdarma', 'Jednorázově', 'Předplatné', 'Součást členství']} className="full" label="Typ ceny" /></Field>
            {v.priceType !== 'Zdarma' && v.priceType !== 'Součást členství' && <Field label={v.priceType === 'Předplatné' ? 'Kč / měsíc' : 'Cena (Kč)'}><input inputMode="decimal" value={v.price} onChange={e => { setV({ ...v, price: e.target.value }); setError(''); }} /></Field>}
          </div>
          <Field label="Zpřístupnění obsahu"><Pick value={v.drip} onChange={x => setV({ ...v, drip: x as Course['drip'] })} options={[['Vše hned', 'Vše hned po zápisu'], ['Postupně', 'Postupně (drip) podle dnů u lekcí']]} className="full" label="Zpřístupnění" /></Field>
          <ToggleRow label="Certifikát po dokončení" desc="Student si ho stáhne, když dokončí všechny lekce." checked={v.certificate} onChange={x => setV({ ...v, certificate: x })} />
          <FormError>{error}</FormError>
          <div className="form-actions"><Btn onClick={() => setV(init)} disabled={!dirty}>Zahodit změny</Btn><Btn primary onClick={save} disabled={!dirty}>Uložit nastavení</Btn></div>
        </div>
      </Section>
      <div className="stack">
        <Section title="Obrázek a barva">
          <div className="sec-body stack">
            <ImagePicker value={v.image} onChange={image => setV({ ...v, image })} label="Obrázek kurzu" />
            <Field label="Barva karty (bez obrázku)"><Pick value={v.accent} onChange={x => setV({ ...v, accent: x })} options={ACCENTS} className="full" label="Barva" /></Field>
            <Art accent={v.accent} image={v.image} eyebrow={v.subtitle} title={v.title || 'Název kurzu'} small />
          </div>
        </Section>
        <Section title="Komunita kurzu">
          <div className="sec-body">
            {group ? <button type="button" className="side-link" onClick={() => go('komunita/' + group.id)}><strong>{group.name}</strong><small>Přístup mají studenti kurzu</small></button> : <p className="muted small">Kurz nemá vlastní skupinu. Skupinu s přístupem „Součást kurzu“ vytvoříte v Komunitě.</p>}
          </div>
        </Section>
      </div>
    </div>
  );
}

/* ---------- students ---------- */
function Students({ c }: { c: Course }) {
  const { w, workspaceId, mutate, go } = useHub();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [confirmEl, confirm] = useConfirm();
  const [now] = useState(() => Date.now());
  const contacts = useMemo(() => new Map(w.contacts.map(x => [x.id, x])), [w.contacts]);
  const rows = w.enrollments.filter(e => e.courseId === c.id).map(e => ({ e, contact: contacts.get(e.contactId), p: progressOf(e, c) }))
    .filter(r => normalize(`${r.contact?.name ?? ''} ${r.contact?.email ?? ''}`).includes(normalize(q))).sort((a, b) => b.e.lastActivityAt.localeCompare(a.e.lastActivityAt));
  const pg = paginate(rows, page, 20);
  const all = w.enrollments.filter(e => e.courseId === c.id);
  const setStatus = (id: string, status: 'Aktivní' | 'Pozastaveno') => { mutate(d => ({ ...d, enrollments: d.enrollments.map(e => (e.workspaceId === workspaceId && e.id === id ? { ...e, status } : e)) })); toast.success(status === 'Aktivní' ? 'Přístup byl obnoven.' : 'Přístup byl pozastaven.'); };
  return (
    <>
      <div className="metric-grid">
        <Metric label="Studenti" value={fmt(all.length)} desc={`${all.filter(e => e.status === 'Aktivní').length} s aktivním přístupem`} />
        <Metric label="Průměrný postup" value={all.length ? percent(all.reduce((s, e) => s + progressOf(e, c), 0) / all.length, 0) : '—'} desc="dokončené lekce" />
        <Metric label="Dokončili" value={fmt(all.filter(e => progressOf(e, c) === 100).length)} desc="všechny lekce" />
        <Metric label="Aktivní za 7 dní" value={fmt(all.filter(e => daysSince(e.lastActivityAt, now) < 7).length)} desc="poslední aktivita" />
      </div>
      <div className="toolbar">
        <input className="toolbar-search" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="Hledat studenta…" aria-label="Hledat studenta" />
        <div className="flex-row">
          <Btn onClick={() => download(`studenti-${c.id}.csv`, toCsv([['Student', 'E-mail', 'Zapsán', 'Postup %', 'Stav', 'Poslední aktivita'], ...all.map(e => { const x = contacts.get(e.contactId); return [x?.name ?? 'Smazaný kontakt', x?.email ?? '', fmtDate(e.enrolledAt), progressOf(e, c), e.status, fmtDate(e.lastActivityAt)]; })]))} disabled={!all.length}><Download aria-hidden />Export</Btn>
          <Btn primary onClick={() => setAdding(true)}><Plus aria-hidden />Přidat studenta</Btn>
        </div>
      </div>
      <section className="panel">
        <div className="table-scroll">
          <table className="hub-table data-table">
            <thead><tr><th>Student</th><th>Postup</th><th className="col-opt">Zapsán</th><th className="col-opt">Poslední aktivita</th><th>Stav</th><th aria-label="Akce" /></tr></thead>
            <tbody>
              {pg.slice.map(({ e, contact, p }) => (
                <tr key={e.id} onClick={() => contact && go('kontakty/' + contact.id)}>
                  <td><div className="name-cell">{contact ? <><Avatar name={contact.name} color={contact.color} /><button type="button">{contact.name}<small>{contact.email}</small></button></> : <span className="muted">Smazaný kontakt</span>}</div></td>
                  <td className="progress-cell"><Bar value={p} label={`Postup ${contact?.name ?? ''}`} /><small>{p} %</small></td>
                  <td className="col-opt muted">{fmtDate(e.enrolledAt)}</td>
                  <td className="col-opt muted">{fmtDate(e.lastActivityAt)}</td>
                  <td><Badge tone={e.status === 'Aktivní' ? 'green' : e.status === 'Dokončeno' ? 'blue' : 'orange'}>{p === 100 ? 'Dokončeno' : e.status}</Badge></td>
                  <td className="col-actions" onClick={ev => ev.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><button type="button" className="icon-btn" aria-label={`Akce studenta ${contact?.name ?? ''}`}><MoreHorizontal aria-hidden /></button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => go(`kurzy/${c.id}/nahled?student=${e.contactId}`)}><Eye aria-hidden />Náhled jako student</DropdownMenuItem>
                        {e.status === 'Pozastaveno' ? <DropdownMenuItem onSelect={() => setStatus(e.id, 'Aktivní')}>Obnovit přístup</DropdownMenuItem> : <DropdownMenuItem onSelect={() => setStatus(e.id, 'Pozastaveno')}>Pozastavit přístup</DropdownMenuItem>}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => confirm({ title: 'Odebrat studenta z kurzu?', desc: 'Přístup i postup studenta se smažou.', confirm: 'Odebrat', danger: true, onConfirm: () => { mutate(d => ({ ...d, enrollments: d.enrollments.filter(x => !(x.workspaceId === workspaceId && x.id === e.id)) })); toast.success('Student byl odebrán.'); } })}><Trash2 aria-hidden />Odebrat z kurzu</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <div className="empty"><BookOpen size={28} aria-hidden /><h3>{all.length ? 'Žádný student neodpovídá hledání' : 'Kurz zatím nemá studenty'}</h3><p>Studenti vznikají po zaplacení nebo je přidáte ručně z CRM.</p></div>}
        <Pager page={pg.page} pages={pg.pages} total={rows.length} from={pg.from} to={pg.to} onPage={setPage} noun="studentů" />
      </section>
      <AddStudent c={c} open={adding} onClose={() => setAdding(false)} />
      {confirmEl}
    </>
  );
}

function AddStudent({ c, open, onClose }: { c: Course; open: boolean; onClose: () => void }) {
  const { w, workspaceId, mutate } = useHub();
  const [picked, setPicked] = useState<number[]>([]);
  const enrolled = new Set(w.enrollments.filter(e => e.courseId === c.id).map(e => e.contactId));
  const candidates = w.contacts.filter(x => !enrolled.has(x.id));
  const add = () => {
    mutate(d => picked.reduce((acc, id) => logActivity(enrollInCourse(acc, workspaceId, c.id, id).data, workspaceId, id, 'course', 'Ručně udělen přístup ke kurzu', c.title, `kurzy/${c.id}/studenti`), d));
    toast.success(`Přístup ke kurzu udělen: ${plural(picked.length, 'kontakt', 'kontakty', 'kontaktů')}.`);
    setPicked([]); onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Přidat studenty" desc="Ruční přístup bez platby. Student se zapíše do časové osy kontaktu.">
      <div className="stack">
        <ContactPicker candidates={candidates} picked={picked} onChange={setPicked} emptyText="Všechny kontakty už jsou studenty kurzu." />
        {c.status === 'Koncept' && <Notice tone="warn">Kurz je koncept. Studenti ho uvidí až po publikování.</Notice>}
      </div>
      <div className="form-actions"><Btn onClick={onClose}>Zrušit</Btn><Btn primary disabled={!picked.length} onClick={add}>{picked.length ? `Přidat ${plural(picked.length, 'studenta', 'studenty', 'studentů')}` : 'Přidat studenty'}</Btn></div>
    </Modal>
  );
}
