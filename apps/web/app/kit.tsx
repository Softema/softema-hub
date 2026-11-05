'use client';
/* Shared building blocks of the module screens: route helpers, sub-navigation, confirmations,
   pagination, toggles, image picking and file downloads. Visuals come from shell.css / modules.css. */
import React, { useCallback, useState, useSyncExternalStore } from 'react';
import { AlertTriangle, CalendarDays, Check, ChevronLeft, ChevronRight, ChevronsUpDown, ImagePlus, Info, Plus, Trash2 } from 'lucide-react';
import { cs } from 'react-day-picker/locale';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Calendar } from '@/components/ui/calendar';
import { fmt, normalize } from '@/lib/hub/format';
import type { ConsentState, Contact, StoredImage } from '@/lib/hub/types';
import { useHub } from './state';
import { parseRoute, withQuery } from './hash-route';
import { Btn, Modal } from './ui';

/** Current hash route split into parts + query, with a setter that keeps the path and replaces history. */
export function useRoute() {
  const { route, go } = useHub();
  const { parts, query } = parseRoute(route);
  const path = route.split('?')[0];
  const setQuery = useCallback((patch: Record<string, string | undefined>) => {
    const next: Record<string, string | undefined> = Object.fromEntries(query.entries());
    Object.assign(next, patch);
    go(withQuery(path, next), { replace: true });
  }, [go, path, query]);
  return { parts, query, path, setQuery, go };
}

/** Section tabs that are real routes (direct links, back/forward). */
export function SubNav({ items, active }: { items: [route: string, label: string, count?: number][]; active: string }) {
  const { go } = useHub();
  return (
    <nav className="subnav" aria-label="Části modulu">
      {items.map(([r, label, count]) => (
        <button key={r} type="button" aria-current={active === r ? 'page' : undefined} onClick={() => go(r)}>
          {label}{count !== undefined && <span className="subnav-count">{fmt(count)}</span>}
        </button>
      ))}
    </nav>
  );
}

export type ConfirmOptions = { title: string; desc: string; confirm: string; danger?: boolean; onConfirm: () => void };
/** Confirmation dialog for destructive or irreversible actions. Returns [dialog element, ask]. */
export function useConfirm(): [React.ReactNode, (o: ConfirmOptions) => void] {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const el = (
    <Modal open={!!opts} onClose={() => setOpts(null)} title={opts?.title ?? ''} desc={opts?.desc}>
      <div className="form-actions">
        <Btn type="button" onClick={() => setOpts(null)}>Zrušit</Btn>
        <Btn type="button" primary className={opts?.danger ? 'danger' : ''} onClick={() => { const o = opts; setOpts(null); o?.onConfirm(); }}>
          {opts?.danger && <Trash2 aria-hidden />}{opts?.confirm}
        </Btn>
      </div>
    </Modal>
  );
  return [el, setOpts];
}

export function Pager({ page, pages, total, from, to, onPage, noun = 'záznamů' }: { page: number; pages: number; total: number; from: number; to: number; onPage: (p: number) => void; noun?: string }) {
  return (
    <div className="table-foot pager">
      <span>{total ? `${fmt(from)}–${fmt(to)} z ${fmt(total)} ${noun}` : `0 ${noun}`}</span>
      {pages > 1 && (
        <span className="pager-btns">
          <button type="button" className="icon-btn" aria-label="Předchozí strana" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft aria-hidden /></button>
          <span aria-live="polite">Strana {page} z {pages}</span>
          <button type="button" className="icon-btn" aria-label="Další strana" disabled={page >= pages} onClick={() => onPage(page + 1)}><ChevronRight aria-hidden /></button>
        </span>
      )}
    </div>
  );
}
export function paginate<T>(items: T[], page: number, size = 25) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(Math.max(1, page), pages);
  const slice = items.slice((p - 1) * size, p * size);
  return { page: p, pages, slice, from: items.length ? (p - 1) * size + 1 : 0, to: (p - 1) * size + slice.length };
}

export function ToggleRow({ label, desc, checked, onChange, disabled }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const id = React.useId();
  return (
    <div className="toggle-row">
      <label htmlFor={id}><span>{label}</span>{desc && <small>{desc}</small>}</label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

export function Notice({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'warn' }) {
  const Icon = tone === 'warn' ? AlertTriangle : Info;
  return <div className={`notice ${tone}`} role="note"><Icon size={16} aria-hidden /><div>{children}</div></div>;
}
export function FormError({ children }: { children?: React.ReactNode }) {
  return children ? <p className="form-error" role="alert">{children}</p> : null;
}

/** Panel with a header (title, description, actions). */
export function Section({ title, desc, actions, children, className = '', id }: { title: string; desc?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; id?: string }) {
  const hid = React.useId();
  return (
    <section className={`panel sec ${className}`} aria-labelledby={hid} id={id}>
      <header className="sec-head"><div><h2 id={hid}>{title}</h2>{desc && <p>{desc}</p>}</div>{actions && <div className="sec-actions">{actions}</div>}</header>
      {children}
    </section>
  );
}

const MAX_IMAGE = 400 * 1024;
/** Reads a small image into a data URL (kept only in the browser). Rejects with a user-facing message. */
export function readImage(file: File): Promise<StoredImage> {
  if (!file.type.startsWith('image/')) return Promise.reject(new Error('Vyberte obrázek (JPG, PNG, WebP nebo SVG).'));
  if (file.size > MAX_IMAGE) return Promise.reject(new Error(`Obrázek má ${fmt(Math.round(file.size / 1024))} kB. V ukázce ukládáme do prohlížeče obrázky do 400 kB.`));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, dataUrl: String(reader.result), size: file.size });
    reader.onerror = () => reject(new Error('Soubor se nepodařilo načíst.'));
    reader.readAsDataURL(file);
  });
}

/** Small images are kept in the browser as data URLs (no upload). Larger files are refused with an explanation. */
export function ImagePicker({ value, onChange, label = 'Obrázek', ratio = '16 / 9' }: { value?: StoredImage; onChange: (v: StoredImage | undefined) => void; label?: string; ratio?: string }) {
  const [error, setError] = useState('');
  const id = React.useId();
  const pick = (file?: File) => {
    if (file) readImage(file).then(img => { setError(''); onChange(img); }, (e: Error) => setError(e.message));
  };
  return (
    <div className="image-picker">
      <span className="image-picker-label" id={id + '-l'}>{label}</span>
      <div className="image-picker-box" style={{ aspectRatio: ratio }}>
        {value ? <img src={value.dataUrl} alt={`Náhled: ${value.name}`} /> : <span className="image-picker-empty"><ImagePlus aria-hidden />Bez obrázku</span>}
      </div>
      <div className="image-picker-actions">
        <label className="hub-btn file-btn">
          <input id={id} type="file" accept="image/*" className="sr-only" aria-labelledby={id + '-l'} onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }} />
          {value ? 'Změnit obrázek' : 'Nahrát obrázek'}
        </label>
        {value && <Btn type="button" onClick={() => onChange(undefined)}>Odebrat</Btn>}
      </div>
      <small className="muted">Obrázek se uloží jen v tomto prohlížeči (max. 400 kB), nejde o trvalé nahrání na server.</small>
      <FormError>{error}</FormError>
    </div>
  );
}

export function download(name: string, content: string, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([type.startsWith('text/csv') ? '﻿' + content : content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const cell = (v: unknown) => { const s = String(v ?? ''); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCsv = (rows: unknown[][]) => rows.map(r => r.map(cell).join(';')).join('\r\n');

/** CSV parser for imports: detects ; , or tab, supports quoted fields with newlines. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const first = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = [';', ',', '\t'].map(d => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = []; let row: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) { if (ch === '"') { if (src[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && src[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.map(r => r.map(c => c.trim())).filter(r => r.some(Boolean));
}

/** Simple "x of y" progress bar. */
export function Bar({ value, label }: { value: number; label?: string }) {
  return <div className="bar" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} aria-label={label}><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

/** Text tabs with an underlined active item for filters inside a page (same look as SubNav). */
export function FilterTabs({ value, onChange, items, label }: { value: string; onChange: (v: string) => void; items: [id: string, label: string, count?: number][]; label: string }) {
  return (
    <div className="subnav filter-tabs" role="group" aria-label={label}>
      {items.map(([id, l, n]) => (
        <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)}>
          {l}{n !== undefined && <span className="subnav-count">{fmt(n)}</span>}
        </button>
      ))}
    </div>
  );
}

/**
 * Searchable select (Popover + Command) for tags, plans and similar short lists. Works inside modals
 * (Radix layers), follows the theme tokens and can create a new value from the search text.
 */
export function OptionCombobox({ value, onChange, options, label, placeholder = 'Vyberte…', allowCreate = true, trigger, emptyText = 'Nic nenalezeno.' }: {
  value: string; onChange: (v: string) => void; options: string[]; label: string; placeholder?: string; allowCreate?: boolean;
  trigger?: React.ReactNode; emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const query = q.trim();
  const list = options.filter(o => normalize(o).includes(normalize(query)));
  const exists = options.some(o => normalize(o) === normalize(query));
  const pick = (v: string) => { onChange(v); setOpen(false); setQ(''); };
  return (
    <Popover modal open={open} onOpenChange={o => { setOpen(o); if (!o) setQ(''); }}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <button type="button" className="combo-trigger" aria-label={label}>
            <span className={value ? '' : 'muted'}>{value || placeholder}</span><ChevronsUpDown size={16} aria-hidden />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="combo-panel" style={{ width: trigger ? 280 : 'var(--radix-popover-trigger-width)' }}>
        <Command shouldFilter={false} label={label}>
          <CommandInput value={q} onValueChange={setQ} placeholder={allowCreate ? 'Hledat nebo napsat nový…' : 'Hledat…'} aria-label={`${label}: hledat`} />
          <CommandList>
            {list.map(o => (
              <CommandItem key={o} value={o} onSelect={() => pick(o)}>
                <Check aria-hidden className={value === o ? 'combo-check' : 'combo-check off'} />{o}
              </CommandItem>
            ))}
            {allowCreate && query && !exists && (
              <CommandItem value={`__new__${query}`} onSelect={() => pick(query)}><Plus aria-hidden />Vytvořit „{query}“</CommandItem>
            )}
            {!list.length && !(allowCreate && query) && <p className="combo-empty">{emptyText}</p>}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const CONSENT_LABEL: Record<ConsentState, string> = { 'Udělen': 'Souhlas udělen', 'Čeká na potvrzení': 'Čeká na potvrzení', 'Odvolán': 'Odhlášen', 'Bez souhlasu': 'Bez souhlasu' };
/**
 * Contact selection list for dialogs: search keeps the selection, long e-mails are truncated,
 * optional consent hint (contacts without consent "Udělen" will not receive marketing e-mails).
 */
export function ContactPicker({ candidates, picked, onChange, multiple = true, consent = false, emptyText = 'Všechny kontakty už jsou vybrané.' }: {
  candidates: Contact[]; picked: number[]; onChange: (ids: number[]) => void; multiple?: boolean; consent?: boolean; emptyText?: string;
}) {
  const [q, setQ] = useState('');
  const nq = normalize(q.trim());
  const list = candidates.filter(c => !nq || normalize(`${c.name} ${c.email} ${c.company}`).includes(nq)).slice(0, 80);
  const name = React.useId();
  const toggle = (cid: number, on: boolean) => onChange(multiple ? (on ? [...picked, cid] : picked.filter(x => x !== cid)) : [cid]);
  const noConsent = candidates.filter(c => picked.includes(c.id) && c.consent.state !== 'Udělen').length;
  return (
    <div className="picker">
      <div className="search-field picker-search"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Hledat jméno, e-mail nebo firmu…" aria-label="Hledat kontakty" autoFocus /></div>
      <div className="picker-list" role="group" aria-label="Kontakty">
        {list.map(c => {
          const on = picked.includes(c.id); const ok = c.consent.state === 'Udělen';
          return (
            <label key={c.id} className={`picker-row ${on ? 'on' : ''}`}>
              <input type={multiple ? 'checkbox' : 'radio'} name={name} checked={on} onChange={e => toggle(c.id, e.target.checked)} />
              <span className="picker-main"><strong>{c.name}</strong><small title={c.email}>{c.email}</small></span>
              {consent && <span className={`picker-consent ${ok ? 'ok' : 'no'}`} title={ok ? 'Dostane marketingový e-mail' : 'Bez platného souhlasu – e-mail nedostane'}>{CONSENT_LABEL[c.consent.state]}</span>}
            </label>
          );
        })}
        {!list.length && <p className="picker-empty">{nq ? `Žádný kontakt neodpovídá „${q.trim()}“.` : emptyText}</p>}
      </div>
      <div className="picker-foot" aria-live="polite">
        <span>{multiple ? `Vybráno: ${fmt(picked.length)}` : picked.length ? 'Vybrán 1 kontakt' : 'Nic nevybráno'}{consent && noConsent > 0 ? ` · ${fmt(noConsent)} bez souhlasu e-mail nedostane` : ''}</span>
        {picked.length > 0 && <button type="button" className="text-link" onClick={() => onChange([])}>Zrušit výběr</button>}
      </div>
    </div>
  );
}

/* ---------- date field ---------- */
const coarseQuery = '(pointer: coarse)';
const subscribeCoarse = (l: () => void) => { const m = window.matchMedia(coarseQuery); m.addEventListener('change', l); return () => m.removeEventListener('change', l); };
const pad2 = (n: number) => String(n).padStart(2, '0');
const toIso = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fromIso = (v: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined; };
const czText = (v: string) => { const d = fromIso(v); return d ? `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}` : ''; };
/** Parses "16. 10. 2026", "16.10.2026" or "2026-10-16" into "yyyy-mm-dd" (null when invalid). */
export function parseCzDate(s: string): string | null {
  const t = s.trim();
  const m = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/.exec(t);
  if (m) { const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])); return d.getDate() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 ? toIso(d) : null; }
  return /^\d{4}-\d{2}-\d{2}$/.test(t) && fromIso(t) ? t : null;
}

/**
 * Date input (value "yyyy-mm-dd"): typed Czech date plus a calendar popover in app styles (Czech, Monday first).
 * Touch devices get the native picker, which is more comfortable there.
 */
export function DateField({ value, onChange, min, label, invalid }: { value: string; onChange: (v: string) => void; min?: string; label: string; invalid?: boolean }) {
  const coarse = useSyncExternalStore(subscribeCoarse, () => window.matchMedia(coarseQuery).matches, () => false);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  if (coarse) return <input type="date" value={value} min={min} onChange={e => onChange(e.target.value)} aria-label={label} aria-invalid={invalid || undefined} />;
  const commit = () => { if (text === null) return; const v = parseCzDate(text); if (v) { onChange(v); setBad(false); setText(null); } else setBad(!!text.trim()); };
  const minDate = min ? fromIso(min) : undefined;
  return (
    <Popover modal open={open} onOpenChange={setOpen}>
      <div className={`date-field ${bad || invalid ? 'is-invalid' : ''}`}>
        <input value={text ?? czText(value)} onChange={e => { setText(e.target.value); setBad(false); }} onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'ArrowDown' && e.altKey) { e.preventDefault(); setOpen(true); } }}
          placeholder="d. m. rrrr" aria-label={label} aria-invalid={bad || invalid || undefined} />
        <PopoverTrigger asChild><button type="button" className="date-btn" aria-label={`${label}: otevřít kalendář`}><CalendarDays size={16} aria-hidden /></button></PopoverTrigger>
      </div>
      {bad && <small className="field-error" role="alert">Zadejte datum ve tvaru 16. 10. 2026.</small>}
      <PopoverContent align="end" className="date-panel" collisionPadding={12}>
        <Calendar mode="single" locale={cs} weekStartsOn={1} selected={fromIso(value)} defaultMonth={fromIso(value) ?? minDate}
          disabled={minDate ? { before: minDate } : undefined}
          onSelect={d => { if (d) { onChange(toIso(d)); setText(null); setBad(false); setOpen(false); } }} />
      </PopoverContent>
    </Popover>
  );
}
