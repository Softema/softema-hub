'use client';
/* Built-in block e-mail editor (fallback when Unlayer is not available) and HTML rendering of block content. */
import React, { useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight, ChevronDown, ChevronUp, Copy, Heading1, Image as ImageIcon, Minus, MousePointerClick, Plus, Redo2, Square, Trash2, Type, Undo2, Monitor, Smartphone, Sparkles, AlignJustify } from 'lucide-react';
import { toast } from 'sonner';
import { newId } from '@/lib/hub/format';
import type { Block, BlockAlign } from '@/lib/hub/types';
import { Badge, Btn, Field, IconBtn } from './ui';

export const BLOCK_TYPES = [
  { id: 'logo', label: 'Logo', icon: Sparkles },
  { id: 'heading', label: 'Nadpis', icon: Heading1 },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'image', label: 'Obrázek', icon: ImageIcon },
  { id: 'button', label: 'Tlačítko', icon: MousePointerClick },
  { id: 'callout', label: 'Zvýraznění', icon: Square },
  { id: 'divider', label: 'Oddělovač', icon: Minus },
  { id: 'footer', label: 'Patička', icon: AlignJustify },
] as const;
const LABEL: Record<string, string> = Object.fromEntries(BLOCK_TYPES.map(t => [t.id, t.label]));

export function makeBlock(type: string): Block {
  const id = newId('b');
  switch (type) {
    case 'heading': return { id, type, text: 'Nový nadpis', color: '#24282d', align: 'left' };
    case 'button': return { id, type, text: 'Zjistit více', color: '#ed6637', url: 'https://', align: 'left' };
    case 'callout': return { id, type, text: 'Zvýrazněná zpráva pro čtenáře.', color: '#fff2eb' };
    case 'image': return { id, type, text: '', url: '' };
    case 'divider': return { id, type, text: '' };
    case 'logo': return { id, type, text: 'softema', align: 'left' };
    case 'footer': return { id, type, text: 'Tento e-mail dostáváte, protože jste přihlášeni k odběru.\nOdhlásit odběr · Upravit předvolby' };
    default: return { id, type: 'text', text: 'Ahoj {{jmeno}},\n\nnapište sem svůj text.' };
  }
}

export const SAMPLE = { jmeno: 'Jane', firma: 'Novák Studio' };
export const personalize = (s: string, sample: Record<string, string> = SAMPLE) => s.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => sample[k] ?? m);

/** Renders blocks; with `onSelect` it becomes editable (selection, drag & drop, block controls). */
export function EmailContent({ blocks, selected, onSelect, onMove, onDelete, onDuplicate, dragging, setDragging, onDropAt, preview = false }: {
  blocks: Block[]; selected?: string; onSelect?: (id: string) => void; onMove?: (id: string, d: number) => void; onDelete?: (id: string) => void; onDuplicate?: (id: string) => void;
  dragging?: boolean; setDragging?: (d: boolean) => void; onDropAt?: (e: React.DragEvent, index: number) => void; preview?: boolean;
}) {
  const text = (s: string) => (preview ? personalize(s) : s);
  return (
    <>
      {blocks.map((b, i) => (
        <React.Fragment key={b.id}>
          {onDropAt && <div className={'drop-zone ' + (dragging ? 'dragging' : '')} onDragOver={e => e.preventDefault()} onDrop={e => onDropAt(e, i)} />}
          <div
            className={`email-block ${b.type} ${b.id === selected ? 'selected' : ''}`}
            role={onSelect ? 'button' : undefined} tabIndex={onSelect ? 0 : undefined} aria-label={onSelect ? `Blok ${LABEL[b.type] ?? b.type}` : undefined} aria-pressed={onSelect ? b.id === selected : undefined}
            onClick={() => onSelect?.(b.id)} onKeyDown={onSelect ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(b.id); } } : undefined}
            draggable={!!onSelect}
            onDragOver={onDropAt ? e => e.preventDefault() : undefined}
            onDrop={onDropAt ? e => { e.stopPropagation(); onDropAt(e, i); } : undefined}
            onDragStart={e => { e.dataTransfer.setData('text/plain', JSON.stringify({ id: b.id })); setDragging?.(true); }}
            onDragEnd={() => setDragging?.(false)}
            style={{ textAlign: b.align || 'left', color: b.type === 'heading' ? b.color : undefined, cursor: onSelect ? 'pointer' : 'default' }}
          >
            {selected === b.id && onMove && (
              <div className="block-controls" onClick={e => e.stopPropagation()}>
                <button type="button" aria-label="Posunout blok nahoru" disabled={i === 0} onClick={() => onMove(b.id, -1)}><ChevronUp /></button>
                <button type="button" aria-label="Posunout blok dolů" disabled={i === blocks.length - 1} onClick={() => onMove(b.id, 1)}><ChevronDown /></button>
                <button type="button" aria-label="Duplikovat blok" onClick={() => onDuplicate?.(b.id)}><Copy /></button>
                <button type="button" aria-label="Smazat blok" onClick={() => onDelete?.(b.id)}><Trash2 /></button>
              </div>
            )}
            {b.type === 'button' ? <span className="email-cta" style={{ background: b.color }}>{text(b.text)}</span>
              : b.type === 'divider' ? <hr />
              : b.type === 'callout' ? <div style={{ background: b.color }}>{text(b.text)}</div>
              : b.type === 'image' ? (b.url ? <img alt={b.text || 'Obrázek e-mailu'} src={b.url} style={{ width: '100%', height: 'auto', borderRadius: 5 }} /> : <div className="property-note flex-row justify-center py-8"><ImageIcon size={24} aria-hidden />Vyberte blok a nahrajte obrázek</div>)
              : text(b.text)}
          </div>
        </React.Fragment>
      ))}
      {onDropAt && <div className={'drop-zone ' + (dragging ? 'dragging' : '')} onDragOver={e => e.preventDefault()} onDrop={e => onDropAt(e, blocks.length)} />}
    </>
  );
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const br = (s: string) => esc(s).replace(/\n/g, '<br>');
/** Self-contained table-based HTML (inline styles) – what a provider would receive once sending exists. */
export function blocksToHtml(blocks: Block[], opts: { preheader?: string; sample?: Record<string, string> } = {}) {
  const p = (s: string) => (opts.sample ? personalize(s, opts.sample) : s);
  const rows = blocks.map(b => {
    const align = b.align || 'left'; const pad = 'padding:12px 32px;';
    switch (b.type) {
      case 'logo': return `<tr><td style="${pad}padding-top:28px;font:700 24px Arial,sans-serif;color:#ed6637;text-align:${align}">${br(p(b.text))}</td></tr>`;
      case 'heading': return `<tr><td style="${pad}font:700 30px/1.2 Arial,sans-serif;color:${b.color || '#24282d'};text-align:${align}">${br(p(b.text))}</td></tr>`;
      case 'button': return `<tr><td style="${pad}text-align:${align}"><a href="${esc(b.url || '#')}" style="display:inline-block;padding:12px 22px;background:${b.color || '#ed6637'};color:#fff;border-radius:5px;font:500 14px Arial,sans-serif;text-decoration:none">${esc(p(b.text))}</a></td></tr>`;
      case 'callout': return `<tr><td style="${pad}"><div style="background:${b.color || '#fff2eb'};border-radius:8px;padding:22px;font:600 16px/1.6 Arial,sans-serif;color:#8b5a45;text-align:${align}">${br(p(b.text))}</div></td></tr>`;
      case 'image': return b.url ? `<tr><td style="${pad}"><img src="${esc(b.url)}" alt="${esc(b.text)}" width="536" style="width:100%;height:auto;border-radius:5px;display:block"></td></tr>` : '';
      case 'divider': return `<tr><td style="${pad}"><hr style="border:0;border-top:1px solid #eceef0"></td></tr>`;
      case 'footer': return `<tr><td style="${pad}padding-bottom:28px;font:11px/1.8 Arial,sans-serif;color:#9aa0a8;text-align:${align}">${br(p(b.text))}</td></tr>`;
      default: return `<tr><td style="${pad}font:15px/1.7 Arial,sans-serif;color:#4b525c;text-align:${align}">${br(p(b.text))}</td></tr>`;
    }
  }).join('');
  const pre = opts.preheader ? `<div style="display:none;max-height:0;overflow:hidden">${esc(opts.preheader)}</div>` : '';
  return `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0;background:#f3f4f6">${pre}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6"><tr><td align="center" style="padding:24px 8px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff">${rows}</table></td></tr></table></body></html>`;
}
export const linksOf = (blocks: Block[]) => blocks.filter(b => b.type === 'button').map(b => b.text).filter(Boolean);

const MAX_IMAGE = 400 * 1024;
/** Three-pane block editor. Every change goes to `onChange` (the caller persists it); undo/redo is per session. */
export function BlockEditor({ blocks, onChange }: { blocks: Block[]; onChange: (b: Block[]) => void }) {
  const [selected, setSelected] = useState(blocks.find(b => b.type === 'heading')?.id ?? '');
  const [past, setPast] = useState<Block[][]>([]);
  const [future, setFuture] = useState<Block[][]>([]);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [dragging, setDragging] = useState(false);
  const b = blocks.find(x => x.id === selected);
  const change = (next: Block[]) => { setPast(p => [...p.slice(-49), blocks]); setFuture([]); onChange(next); };
  const update = (patch: Partial<Block>) => { if (b) change(blocks.map(x => (x.id === b.id ? { ...x, ...patch } : x))); };
  const add = (type: string, index = blocks.length) => { const n = makeBlock(type); const next = [...blocks]; next.splice(Math.max(0, index), 0, n); change(next); setSelected(n.id); };
  const drop = (e: React.DragEvent, index: number) => {
    e.preventDefault(); setDragging(false);
    try {
      const v = JSON.parse(e.dataTransfer.getData('text/plain')) as { type?: string; id?: string };
      if (v.type) add(v.type, index);
      else if (v.id) { const from = blocks.findIndex(x => x.id === v.id); if (from < 0) return; const next = blocks.filter(x => x.id !== v.id); next.splice(from < index ? index - 1 : index, 0, blocks[from]); change(next); setSelected(v.id); }
    } catch { /* foreign drag */ }
  };
  const move = (id: string, d: number) => { const from = blocks.findIndex(x => x.id === id); const to = from + d; if (to < 0 || to >= blocks.length) return; const next = [...blocks]; [next[from], next[to]] = [next[to], next[from]]; change(next); };
  const undo = () => { if (!past.length) return; setFuture(f => [blocks, ...f]); onChange(past[past.length - 1]); setPast(p => p.slice(0, -1)); };
  const redo = () => { if (!future.length) return; setPast(p => [...p, blocks]); onChange(future[0]); setFuture(f => f.slice(1)); };
  const image = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Vyberte obrázek.'); return; }
    if (file.size > MAX_IMAGE) { toast.error('Obrázek je větší než 400 kB.', { description: 'V prototypu se obrázky ukládají do prohlížeče. Trvalé nahrávání (S3/R2) přijde s backendem.' }); return; }
    const r = new FileReader(); r.onload = () => update({ url: String(r.result), text: b?.text || file.name }); r.readAsDataURL(file);
  };
  return (
    <div className="editor-layout">
      <aside className="editor-palette" aria-label="Bloky">
        <h3>Obsahové bloky</h3>
        <div className="block-grid">
          {BLOCK_TYPES.map(t => { const I = t.icon; return (
            <button key={t.id} type="button" className="block-tool" draggable onDragStart={e => { e.dataTransfer.setData('text/plain', JSON.stringify({ type: t.id })); setDragging(true); }} onDragEnd={() => setDragging(false)} onClick={() => add(t.id, b ? blocks.indexOf(b) + 1 : blocks.length)}><I aria-hidden />{t.label}</button>
          ); })}
        </div>
        <p>Přetáhněte blok do e-mailu, nebo ho kliknutím vložte za vybraný blok.</p>
        <h3>Personalizace</h3>
        <p>Vloží proměnnou do vybraného textového bloku.</p>
        <div className="stack-sm">
          {['{{jmeno}}', '{{firma}}'].map(t => <Btn key={t} onClick={() => { if (b && b.type !== 'divider' && b.type !== 'image') update({ text: b.text + t }); else toast.info('Nejprve vyberte textový blok.'); }}>{t}</Btn>)}
        </div>
      </aside>
      <div className="editor-canvas">
        <div className="canvas-tools">
          <IconBtn label="Zpět (undo)" onClick={undo} disabled={!past.length}><Undo2 /></IconBtn>
          <IconBtn label="Znovu (redo)" onClick={redo} disabled={!future.length}><Redo2 /></IconBtn>
          <div className="segmented" role="group" aria-label="Šířka náhledu">
            <button type="button" aria-label="Počítač" aria-pressed={device === 'desktop'} className={device === 'desktop' ? 'active' : ''} onClick={() => setDevice('desktop')}><Monitor size={16} aria-hidden /></button>
            <button type="button" aria-label="Mobil" aria-pressed={device === 'mobile'} className={device === 'mobile' ? 'active' : ''} onClick={() => setDevice('mobile')}><Smartphone size={16} aria-hidden /></button>
          </div>
          <span className="small muted">{device === 'desktop' ? '600 px' : '375 px'}</span>
        </div>
        <div className={'email-paper ' + (device === 'mobile' ? 'mobile' : '')}>
          <EmailContent blocks={blocks} selected={selected} onSelect={setSelected} onMove={move} dragging={dragging} setDragging={setDragging} onDropAt={drop}
            onDelete={id => { change(blocks.filter(x => x.id !== id)); setSelected(''); }}
            onDuplicate={id => { const i = blocks.findIndex(x => x.id === id); const next = [...blocks]; const n = { ...blocks[i], id: newId('b') }; next.splice(i + 1, 0, n); change(next); setSelected(n.id); }} />
          {!blocks.length && <button type="button" className="empty full" onClick={() => add('text', 0)}><Plus aria-hidden />Přidat první blok</button>}
        </div>
      </div>
      <aside className="editor-properties" aria-label="Nastavení bloku">
        <h3>Nastavení bloku</h3>
        {b ? (
          <>
            <Badge tone="gray">{LABEL[b.type] ?? b.type}</Badge>
            {b.type !== 'divider' && <Field label={b.type === 'image' ? 'Alternativní text' : 'Obsah'}><textarea value={b.text} onChange={e => update({ text: e.target.value })} /></Field>}
            {b.type === 'image' && <Field label="Obrázek (max. 400 kB)"><input type="file" accept="image/*" onChange={e => { image(e.target.files?.[0]); e.target.value = ''; }} /></Field>}
            {b.type === 'button' && <Field label="Odkaz tlačítka"><input type="url" value={b.url || ''} onChange={e => update({ url: e.target.value })} placeholder="https://" /></Field>}
            {['heading', 'button', 'callout'].includes(b.type) && <Field label={b.type === 'heading' ? 'Barva textu' : 'Barva pozadí'}><div className="flex-row"><input type="color" value={b.color || '#ed6637'} onChange={e => update({ color: e.target.value })} /><code className="small muted">{b.color}</code></div></Field>}
            {b.type !== 'divider' && b.type !== 'image' && (
              <Field label="Zarovnání">
                <div className="segmented" role="group" aria-label="Zarovnání">
                  {(['left', 'center', 'right'] as BlockAlign[]).map((a, i) => { const I = [AlignLeft, AlignCenter, AlignRight][i]; return <button key={a} type="button" aria-label={['Vlevo', 'Na střed', 'Vpravo'][i]} aria-pressed={(b.align || 'left') === a} className={(b.align || 'left') === a ? 'active' : ''} onClick={() => update({ align: a })}><I size={17} aria-hidden /></button>; })}
                </div>
              </Field>
            )}
            <div className="property-note mt">Změny se ukládají automaticky. Pořadí změníte přetažením nebo šipkami u vybraného bloku.</div>
          </>
        ) : <div className="property-note">Vyberte blok v e-mailu a upravte jeho obsah, barvy a zarovnání.</div>}
      </aside>
    </div>
  );
}
