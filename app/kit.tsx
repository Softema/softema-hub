'use client';
/* Shared building blocks of the module screens: route helpers, sub-navigation, confirmations,
   pagination, toggles, image picking and file downloads. Visuals come from shell.css / modules.css. */
import React, { useCallback, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, ImagePlus, Info, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { fmt } from '@/lib/hub/format';
import type { StoredImage } from '@/lib/hub/types';
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
/** Small images are kept in the browser as data URLs (no upload). Larger files are refused with an explanation. */
export function ImagePicker({ value, onChange, label = 'Obrázek', ratio = '16 / 9' }: { value?: StoredImage; onChange: (v: StoredImage | undefined) => void; label?: string; ratio?: string }) {
  const [error, setError] = useState('');
  const id = React.useId();
  const pick = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Vyberte obrázek (JPG, PNG, WebP nebo SVG).'); return; }
    if (file.size > MAX_IMAGE) { setError(`Obrázek má ${fmt(Math.round(file.size / 1024))} kB. V ukázce ukládáme do prohlížeče obrázky do 400 kB.`); return; }
    const reader = new FileReader();
    reader.onload = () => { setError(''); onChange({ name: file.name, dataUrl: String(reader.result), size: file.size }); };
    reader.onerror = () => setError('Soubor se nepodařilo načíst.');
    reader.readAsDataURL(file);
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
