'use client';
/* Neutral UI building blocks without any data dependency, shared by the demo and the live app. */
import React, { useState } from 'react';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, ChevronsUpDown, Info, Plus, Trash2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { fmt, normalize } from '@/lib/hub/format';
import { Btn, Modal } from './ui';

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
