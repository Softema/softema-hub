'use client';
/* Student preview: how a student sees the course in the client portal (player, progress, drip, quiz).
   Visually separated from admin; progress changes are saved for the selected student. */
import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Award, Check, CheckCircle2, Circle, Download, Lock, Paperclip, PlayCircle } from 'lucide-react';
import { toast } from 'sonner';
import { DAY, fmt, fmtDate, daysSince, plural } from '@/lib/hub/format';
import { courseLessons, progressOf } from '@/lib/hub/logic';
import { logActivity } from '@/lib/hub/ops';
import { fireTrigger } from '@/lib/hub/flow';
import type { Course, Enrollment, Lesson } from '@/lib/hub/types';
import { useHub } from './state';
import { Btn, Pick } from './ui';
import { Bar, Notice, download, useRoute } from './kit';
import { minutes } from './learn-shared';

type Access = { open: boolean; reason?: string };
function accessOf(c: Course, l: Lesson, e: Enrollment | undefined, now: number): Access {
  if (!e) return l.preview ? { open: true } : { open: false, reason: 'Jen pro studenty kurzu' };
  if (e.status === 'Pozastaveno') return { open: false, reason: 'Přístup je pozastavený' };
  if (c.drip === 'Postupně' && l.dripDays > 0) {
    const left = l.dripDays - daysSince(e.enrolledAt, now);
    if (left > 0) return { open: false, reason: `Zpřístupní se ${fmtDate(new Date(+new Date(e.enrolledAt) + l.dripDays * DAY).toISOString())} (za ${plural(left, 'den', 'dny', 'dní')})` };
  }
  return { open: true };
}

export default function CoursePlayer({ id }: { id: string }) {
  const { w, go } = useHub();
  const c = w.courses.find(x => x.id === id);
  if (!c) return <div className="page"><section className="panel empty"><h3>Kurz nenalezen</h3><Btn primary onClick={() => go('kurzy')}>Zpět na kurzy</Btn></section></div>;
  return <Player key={c.id} c={c} />;
}

function Player({ c }: { c: Course }) {
  const { w, workspaceId, mutate, go } = useHub();
  const { query, setQuery } = useRoute();
  const [now] = useState(() => Date.now());
  const enrollments = w.enrollments.filter(e => e.courseId === c.id);
  const contacts = new Map(w.contacts.map(x => [x.id, x]));
  const studentParam = query.get('student');
  const e = studentParam === 'host' ? undefined : enrollments.find(x => String(x.contactId) === studentParam) ?? enrollments[0];
  const student = e ? contacts.get(e.contactId) : undefined;
  const lessons = courseLessons(c);
  const current = lessons.find(l => l.id === query.get('lekce')) ?? lessons.find(l => accessOf(c, l, e, now).open && !e?.completedLessonIds.includes(l.id)) ?? lessons[0];
  const idx = current ? lessons.indexOf(current) : -1;
  const access = current ? accessOf(c, current, e, now) : { open: false };
  const done = !!(e && current && e.completedLessonIds.includes(current.id));
  const progress = e ? progressOf(e, c) : 0;

  const toggleDone = () => {
    if (!e || !current) return;
    const ids = done ? e.completedLessonIds.filter(x => x !== current.id) : [...e.completedLessonIds, current.id];
    const finished = lessons.every(l => ids.includes(l.id));
    mutate(d => {
      const next = { ...d, enrollments: d.enrollments.map(x => (x.workspaceId === workspaceId && x.id === e.id ? { ...x, completedLessonIds: ids, lastActivityAt: new Date().toISOString(), status: finished ? 'Dokončeno' as const : x.status === 'Dokončeno' ? 'Aktivní' as const : x.status } : x)) };
      if (done) return next;
      const withLesson = logActivity(next, workspaceId, e.contactId, 'lesson', `Dokončena lekce ${current.title}`, c.title, `kurzy/${c.id}/studenti`);
      return finished ? fireTrigger(logActivity(withLesson, workspaceId, e.contactId, 'course', `Dokončen kurz ${c.title}`, 'Všechny lekce hotové', `kurzy/${c.id}/studenti`), workspaceId, 'course_completed', [e.contactId], c.title) : withLesson;
    });
    if (!done) toast.success(finished ? 'Kurz je dokončený. Gratulujeme!' : 'Lekce je označená jako dokončená.');
  };
  const certificate = () => download(`certifikat-${c.id}.html`, `<!doctype html><html lang="cs"><meta charset="utf-8"><title>Certifikát</title><body style="font-family:Arial,sans-serif;text-align:center;padding:80px;border:12px solid #ed6637"><p style="letter-spacing:4px;color:#888">CERTIFIKÁT O ABSOLVOVÁNÍ</p><h1 style="font-size:40px">${student?.name ?? ''}</h1><p>úspěšně dokončil(a) kurz</p><h2>${c.title}</h2><p style="color:#888">${fmtDate(new Date().toISOString())} · Ukázkový certifikát z prototypu Softema Hub</p></body></html>`, 'text/html;charset=utf-8');

  return (
    <div className="player-page">
      <div className="preview-banner" role="note">
        <span><strong>Náhled studenta</strong> · takto kurz uvidí student v klientském portálu</span>
        <Pick value={e ? String(e.contactId) : 'host'} onChange={v => setQuery({ student: v, lekce: undefined })} options={[['host', 'Návštěvník bez přístupu'], ...enrollments.map(x => [String(x.contactId), contacts.get(x.contactId)?.name ?? 'Smazaný kontakt'] as [string, string])]} label="Zobrazit jako" />
        <Btn onClick={() => go(`kurzy/${c.id}`)}><ArrowLeft aria-hidden />Zpět do správy</Btn>
      </div>
      {c.status === 'Koncept' && <Notice tone="warn">Kurz není publikovaný. Studenti ho v portálu zatím nevidí.</Notice>}
      <div className="player">
        <aside className="player-nav" aria-label="Obsah kurzu">
          <div className="player-course">
            <strong>{c.title}</strong>
            {e ? <><Bar value={progress} label="Postup v kurzu" /><small>{progress} % · {e.completedLessonIds.length} z {lessons.length} lekcí</small></> : <small>{plural(lessons.filter(l => l.preview).length, 'ukázková lekce', 'ukázkové lekce', 'ukázkových lekcí')} zdarma</small>}
          </div>
          {c.modules.map((m, mi) => (
            <div key={m.id} className="player-module">
              <h3>{mi + 1}. {m.title}</h3>
              <ol>
                {m.lessons.map(l => { const a = accessOf(c, l, e, now); const isDone = !!e?.completedLessonIds.includes(l.id); return (
                  <li key={l.id}>
                    <button type="button" aria-current={current?.id === l.id ? 'true' : undefined} className={a.open ? '' : 'locked'} onClick={() => setQuery({ lekce: l.id })}>
                      {isDone ? <CheckCircle2 size={16} aria-label="Dokončeno" className="positive" /> : a.open ? <Circle size={16} aria-hidden /> : <Lock size={16} aria-label="Zamčeno" />}
                      <span>{l.title}<small>{l.type} · {minutes(l.duration)}</small></span>
                    </button>
                  </li>
                ); })}
              </ol>
            </div>
          ))}
        </aside>
        <main className="player-main">
          {current ? (
            <>
              <p className="small muted">Lekce {idx + 1} z {lessons.length}</p>
              <h1>{current.title}</h1>
              {!access.open ? (
                <div className="player-locked"><Lock size={28} aria-hidden /><h2>Lekce je zamčená</h2><p>{access.reason}</p>{!e && <Btn primary onClick={() => toast.info('Nákup kurzu proběhne přes Stripe Checkout po napojení plateb. V prototypu přidáte studenta ručně v záložce Studenti.')}>Koupit kurz</Btn>}</div>
              ) : (
                <>
                  {current.type === 'Video' && (
                    <div className="player-video" role="img" aria-label={`Video lekce ${current.title}`}>
                      <PlayCircle size={56} aria-hidden />
                      <span>Ukázkové video · {minutes(current.duration)}</span>
                      <small>{current.videoUrl ? `Zdroj: ${current.videoUrl}` : 'Video zatím není nastavené.'} Přehrávání přes Mux (podepsaná URL) se zapojí s backendem.</small>
                    </div>
                  )}
                  {current.type === 'Kvíz' ? <Quiz key={current.id} text={current.text} /> : current.text && <div className="player-text">{current.text.split(/\n{2,}/).map((p, k) => <p key={k}>{p}</p>)}</div>}
                  {current.attachments.length > 0 && (
                    <div className="player-files"><h2>Materiály ke stažení</h2>
                      <ul>{current.attachments.map(f => <li key={f.id}><Paperclip size={14} aria-hidden /><span>{f.name}<small>{fmt(Math.round(f.size / 1024))} kB</small></span><Btn onClick={() => toast.info('Stahování přes podepsanou URL s expirací přijde s backendem. V prototypu je uložen jen název souboru.')}><Download aria-hidden />Stáhnout</Btn></li>)}</ul>
                    </div>
                  )}
                </>
              )}
              <div className="player-actions">
                <Btn disabled={idx <= 0} onClick={() => setQuery({ lekce: lessons[idx - 1].id })}><ArrowLeft aria-hidden />Předchozí</Btn>
                {e && access.open && <Btn primary={!done} onClick={toggleDone}>{done ? <><Check aria-hidden />Dokončeno · vrátit</> : 'Označit jako dokončené'}</Btn>}
                <Btn disabled={idx >= lessons.length - 1} onClick={() => setQuery({ lekce: lessons[idx + 1].id })}>Další<ArrowRight aria-hidden /></Btn>
              </div>
              {e && progress === 100 && c.certificate && <div className="player-cert"><Award size={22} aria-hidden /><span>Kurz je dokončený. Certifikát je připravený ke stažení.</span><Btn primary onClick={certificate}><Download aria-hidden />Stáhnout certifikát</Btn></div>}
              {!e && <p className="small muted mt-4">Návštěvník bez přístupu vidí jen ukázkové lekce. Studenta vyberete nahoře.</p>}
              {e && student && <p className="small muted mt-4">Postup se ukládá studentovi {student.name} a objeví se na jeho časové ose.</p>}
            </>
          ) : <div className="player-locked"><h2>Kurz zatím nemá žádné lekce</h2><Btn onClick={() => go(`kurzy/${c.id}`)}>Přidat lekce</Btn></div>}
        </main>
      </div>
    </div>
  );
}

/** Quiz from plain text: "? question", "* correct", "- wrong". */
function Quiz({ text }: { text: string }) {
  const questions = text.split('\n').reduce<{ q: string; options: { t: string; ok: boolean }[] }[]>((acc, line) => {
    const s = line.trim();
    if (s.startsWith('?')) acc.push({ q: s.slice(1).trim(), options: [] });
    else if ((s.startsWith('*') || s.startsWith('-')) && acc.length) acc[acc.length - 1].options.push({ t: s.slice(1).trim(), ok: s.startsWith('*') });
    return acc;
  }, []).filter(q => q.options.length);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [checked, setChecked] = useState(false);
  if (!questions.length) return <p className="muted">Kvíz zatím nemá otázky.</p>;
  const score = questions.filter((q, i) => q.options[answers[i]]?.ok).length;
  return (
    <div className="quiz">
      {questions.map((q, i) => (
        <fieldset key={i}>
          <legend>{i + 1}. {q.q}</legend>
          {q.options.map((o, k) => (
            <label key={k} className={`check-row ${checked ? (o.ok ? 'ok' : answers[i] === k ? 'bad' : '') : ''}`}>
              <input type="radio" name={`q${i}`} checked={answers[i] === k} onChange={() => { setAnswers({ ...answers, [i]: k }); setChecked(false); }} />{o.t}
            </label>
          ))}
        </fieldset>
      ))}
      <div className="flex-row"><Btn primary disabled={Object.keys(answers).length < questions.length} onClick={() => setChecked(true)}>Vyhodnotit</Btn>{checked && <strong role="status">{score} z {questions.length} správně</strong>}</div>
    </div>
  );
}
