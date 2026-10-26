'use client';
/* Rich text for community posts/comments and course lessons: Tiptap editor (bold, italic, strike, lists, quote,
   links, optional headings), a whitelist renderer for its JSON, attachments and an image lightbox.
   Stored content is never rendered as HTML; links are limited to http(s) and mailto. */
import React, { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { Bold, ChevronLeft, ChevronRight, FileText, Heading2, Heading3, Italic, Link2, List, ListOrdered, Paperclip, Quote, Strikethrough, Unlink, X } from 'lucide-react';
import { toast } from 'sonner';
import { fmt, newId } from '@/lib/hub/format';
import type { Attachment, RichNode } from '@/lib/hub/types';
import { readImage } from './kit';

/** Accepts http(s) and mailto; a bare domain gets https://. Returns '' for anything else. */
export function safeHref(raw: string) {
  const s = raw.trim();
  const url = /^[\w-]+(\.[\w-]+)+(\/|$)/.test(s) ? 'https://' + s : s;
  return /^(https?:\/\/[^\s]+|mailto:[^\s@]+@[^\s@]+)$/i.test(url) ? url : '';
}

export interface RichValue { doc: RichNode; text: string }
export const EMPTY_RICH: RichValue = { doc: { type: 'doc', content: [{ type: 'paragraph' }] }, text: '' };
/** Plain text (blank line = new paragraph, newline = line break) as an editor document. */
export function fromPlain(text: string): RichNode {
  const paras = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  return { type: 'doc', content: paras.length ? paras.map(p => ({ type: 'paragraph', content: p.split('\n').flatMap((line, i) => [...(i ? [{ type: 'hardBreak' }] : []), ...(line ? [{ type: 'text', text: line }] : [])]) })) : [{ type: 'paragraph' }] };
}

const Tool = ({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" className={`rich-tool ${active ? 'on' : ''}`} aria-label={label} title={label} aria-pressed={active} onMouseDown={e => e.preventDefault()} onClick={onClick}>{children}</button>
);

/** Editor with a toolbar. `initial` is read on mount only; remount it (key) to clear or load other content.
    Ctrl/Cmd+Enter calls onSubmit. `headings` adds H2/H3 (lessons). */
export function RichEditor({ label, placeholder, onChange, onSubmit, compact, headings, initial, tools, children }: { label: string; placeholder: string; onChange: (v: RichValue) => void; onSubmit?: () => void; compact?: boolean; headings?: boolean; initial?: RichNode; tools?: React.ReactNode; children?: React.ReactNode }) {
  const handlers = useRef({ onChange, onSubmit });
  useEffect(() => { handlers.current = { onChange, onSubmit }; });
  const [link, setLink] = useState<string | null>(null);
  const [linkError, setLinkError] = useState('');
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit.configure({
      heading: headings ? { levels: [2, 3] } : false, codeBlock: false, code: false, horizontalRule: false,
      link: { openOnClick: false, autolink: true, defaultProtocol: 'https', protocols: ['mailto'], isAllowedUri: url => !!safeHref(url), HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' } },
    })],
    content: initial as object | undefined,
    editorProps: {
      attributes: { class: 'rich-input', role: 'textbox', 'aria-multiline': 'true', 'aria-label': label },
      handleKeyDown: (_view, e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && handlers.current.onSubmit) { handlers.current.onSubmit(); return true; }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => handlers.current.onChange({ doc: ed.getJSON() as RichNode, text: ed.getText({ blockSeparator: '\n' }) }),
  });
  const s = useEditorState({
    editor,
    selector: ({ editor: ed }) => ed && { bold: ed.isActive('bold'), italic: ed.isActive('italic'), strike: ed.isActive('strike'), bullet: ed.isActive('bulletList'), ordered: ed.isActive('orderedList'), quote: ed.isActive('blockquote'), link: ed.isActive('link'), h2: ed.isActive('heading', { level: 2 }), h3: ed.isActive('heading', { level: 3 }), empty: ed.isEmpty },
  });
  const chain = () => editor!.chain().focus();
  const applyLink = () => {
    const href = safeHref(link ?? '');
    if (!href) { setLinkError('Zadejte odkaz začínající https:// nebo e-mail ve tvaru mailto:'); return; }
    const { selection, doc } = editor!.state;
    if (selection.empty && !editor!.isActive('link')) {
      const before = doc.textBetween(Math.max(0, selection.from - 1), selection.from);
      chain().insertContent(before && !/\s/.test(before) ? ' ' : '').insertContent({ type: 'text', text: href.replace(/^mailto:/, ''), marks: [{ type: 'link', attrs: { href } }] }).unsetMark('link').insertContent(' ').run();
    }
    else chain().extendMarkRange('link').setLink({ href }).run();
    setLink(null); setLinkError('');
  };
  return (
    <div className={`rich-editor ${compact ? 'compact' : ''}`}>
      <div className="rich-toolbar" role="toolbar" aria-label="Formátování textu">
        {editor && <>
          {headings && <>
            <Tool label="Nadpis" active={s?.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}><Heading2 aria-hidden /></Tool>
            <Tool label="Podnadpis" active={s?.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}><Heading3 aria-hidden /></Tool>
            <span className="rich-sep" aria-hidden />
          </>}
          <Tool label="Tučně (Ctrl+B)" active={s?.bold} onClick={() => chain().toggleBold().run()}><Bold aria-hidden /></Tool>
          <Tool label="Kurzíva (Ctrl+I)" active={s?.italic} onClick={() => chain().toggleItalic().run()}><Italic aria-hidden /></Tool>
          {!compact && <Tool label="Přeškrtnout" active={s?.strike} onClick={() => chain().toggleStrike().run()}><Strikethrough aria-hidden /></Tool>}
          <span className="rich-sep" aria-hidden />
          <Tool label="Odrážky" active={s?.bullet} onClick={() => chain().toggleBulletList().run()}><List aria-hidden /></Tool>
          {!compact && <Tool label="Číslovaný seznam" active={s?.ordered} onClick={() => chain().toggleOrderedList().run()}><ListOrdered aria-hidden /></Tool>}
          {!compact && <Tool label="Citace" active={s?.quote} onClick={() => chain().toggleBlockquote().run()}><Quote aria-hidden /></Tool>}
          <span className="rich-sep" aria-hidden />
          <Tool label={s?.link ? 'Upravit odkaz' : 'Vložit odkaz'} active={s?.link || link !== null} onClick={() => { setLink(link === null ? String(editor.getAttributes('link').href ?? '') : null); setLinkError(''); }}><Link2 aria-hidden /></Tool>
          {s?.link && <Tool label="Odebrat odkaz" onClick={() => chain().extendMarkRange('link').unsetLink().run()}><Unlink aria-hidden /></Tool>}
        </>}
        {tools}
      </div>
      {link !== null && (
        <div className="rich-link">
          <input autoFocus type="url" value={link} onChange={e => { setLink(e.target.value); setLinkError(''); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyLink(); } if (e.key === 'Escape') { setLink(null); editor?.commands.focus(); } }} placeholder="https://" aria-label="Adresa odkazu" aria-invalid={!!linkError} />
          <button type="button" className="hub-btn" onClick={applyLink}>Vložit</button>
          <button type="button" className="hub-btn" onClick={() => setLink(null)}>Zrušit</button>
          {linkError && <small className="rich-link-error" role="alert">{linkError}</small>}
        </div>
      )}
      <div className="rich-body">
        <EditorContent editor={editor} />
        {(!s || s.empty) && <span className="rich-placeholder" aria-hidden>{placeholder}</span>}
      </div>
      {children}
    </div>
  );
}

/* ---------- renderer ---------- */
type Mark = NonNullable<RichNode['marks']>[number];
function withMark(node: React.ReactNode, m: Mark, key: number): React.ReactNode {
  switch (m.type) {
    case 'bold': return <strong key={key}>{node}</strong>;
    case 'italic': return <em key={key}>{node}</em>;
    case 'strike': return <s key={key}>{node}</s>;
    case 'link': { const href = safeHref(String(m.attrs?.href ?? '')); return href ? <a key={key} href={href} target="_blank" rel="noopener noreferrer nofollow">{node}</a> : node; }
    default: return node;
  }
}
function renderNode(n: RichNode, key: React.Key): React.ReactNode {
  const kids = n.content?.map((c, i) => renderNode(c, i));
  switch (n.type) {
    case 'text': return <React.Fragment key={key}>{(n.marks ?? []).reduce<React.ReactNode>((acc, m, i) => withMark(acc, m, i), n.text ?? '')}</React.Fragment>;
    case 'paragraph': return <p key={key}>{kids?.length ? kids : <br />}</p>;
    case 'hardBreak': return <br key={key} />;
    case 'bulletList': return <ul key={key}>{kids}</ul>;
    case 'orderedList': return <ol key={key} start={typeof n.attrs?.start === 'number' ? n.attrs.start : undefined}>{kids}</ol>;
    case 'listItem': return <li key={key}>{kids}</li>;
    case 'blockquote': return <blockquote key={key}>{kids}</blockquote>;
    case 'heading': return n.attrs?.level === 2 ? <h2 key={key}>{kids}</h2> : <h3 key={key}>{kids}</h3>;
    default: return <React.Fragment key={key}>{kids}</React.Fragment>;
  }
}
/** Formatted content when present, otherwise the plain text (older posts). */
export function RichText({ doc, text, className = '' }: { doc?: RichNode; text: string; className?: string }) {
  if (!doc) return <p className={className}>{text}</p>;
  const blocks = [...(doc.content ?? [])];
  while (blocks.length && blocks[blocks.length - 1].type === 'paragraph' && !blocks[blocks.length - 1].content?.length) blocks.pop();
  return <div className={`rich-text ${className}`}>{blocks.map((n, i) => renderNode(n, i))}</div>;
}

/* ---------- attachments ---------- */
const MAX_FILES = 6;
const MAX_FILE = 25 * 1024 * 1024;
const kb = (size: number) => (size >= 1024 * 1024 ? `${fmt(Math.round(size / 104857.6) / 10)} MB` : `${fmt(Math.max(1, Math.round(size / 1024)))} kB`);

/** Adds files: small images keep a preview (data URL), everything else only its metadata. */
export function AttachButton({ count, onAdd, label = 'Přidat přílohu' }: { count: number; onAdd: (a: Attachment[]) => void; label?: string }) {
  const add = async (list: FileList | null) => {
    const files = [...(list ?? [])].slice(0, Math.max(0, MAX_FILES - count));
    if ((list?.length ?? 0) > files.length) toast.error(`Najednou lze připojit nejvýš ${MAX_FILES} příloh.`);
    const out: Attachment[] = [];
    for (const f of files) {
      if (f.size > MAX_FILE) { toast.error(`${f.name}: soubor je větší než 25 MB.`); continue; }
      const meta: Attachment = { id: newId('att'), name: f.name, size: f.size, type: f.type };
      if (f.type.startsWith('image/')) {
        try { out.push({ ...meta, dataUrl: (await readImage(f)).dataUrl }); continue; } catch { toast.info(`${f.name}: náhled se uloží jen u obrázků do 400 kB, připojí se bez náhledu.`); }
      }
      out.push(meta);
    }
    if (out.length) onAdd(out);
  };
  return (
    <label className={`rich-tool rich-attach ${count >= MAX_FILES ? 'is-disabled' : ''}`} title={label}>
      <input type="file" multiple className="sr-only" aria-label={label} disabled={count >= MAX_FILES} onChange={e => { void add(e.target.files); e.target.value = ''; }} />
      <Paperclip aria-hidden />
    </label>
  );
}

export function AttachmentList({ items, onRemove }: { items?: Attachment[]; onRemove?: (id: string) => void }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!items?.length) return null;
  const images = items.filter(a => a.dataUrl);
  const files = items.filter(a => !a.dataUrl);
  return (
    <div className="attachments">
      {images.length > 0 && (
        <div className="attach-images">
          {images.map(a => (
            <figure key={a.id}>
              {onRemove ? <img src={a.dataUrl} alt={a.name} /> : <button type="button" className="attach-open" aria-label={`Zvětšit obrázek ${a.name}`} onClick={() => setOpen(images.indexOf(a))}><img src={a.dataUrl} alt={a.name} /></button>}
              {onRemove && <button type="button" className="attach-remove" aria-label={`Odebrat ${a.name}`} onClick={() => onRemove(a.id)}><X aria-hidden /></button>}
            </figure>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <ul className="attach-files">
          {files.map(a => (
            <li key={a.id}>
              <FileText size={16} aria-hidden />
              {onRemove
                ? <span>{a.name}<small>{kb(a.size)}</small></span>
                : <button type="button" onClick={() => toast.info('Stažení přílohy přes podepsanou URL přijde s backendem. V ukázce je uložen jen název souboru.')}>{a.name}<small>{kb(a.size)}</small></button>}
              {onRemove && <button type="button" className="attach-remove" aria-label={`Odebrat ${a.name}`} onClick={() => onRemove(a.id)}><X aria-hidden /></button>}
            </li>
          ))}
        </ul>
      )}
      {open !== null && <Lightbox images={images} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** Full-screen image viewer: arrows / ← → switch images, Esc or click outside closes. */
function Lightbox({ images, index, onIndex, onClose }: { images: Attachment[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const a = images[index];
  const many = images.length > 1;
  const step = (d: number) => onIndex((index + d + images.length) % images.length);
  return (
    <DialogPrimitive.Root open onOpenChange={v => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="lightbox-overlay" />
        <DialogPrimitive.Content className="lightbox" aria-describedby={undefined} onKeyDown={e => { if (many && e.key === 'ArrowRight') step(1); if (many && e.key === 'ArrowLeft') step(-1); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
          <DialogPrimitive.Title className="sr-only">{a.name}</DialogPrimitive.Title>
          <img src={a.dataUrl} alt={a.name} />
          <div className="lightbox-bar">
            <span>{a.name}{many && <small>{index + 1} / {images.length}</small>}</span>
            <DialogPrimitive.Close className="lightbox-btn" aria-label="Zavřít"><X aria-hidden /></DialogPrimitive.Close>
          </div>
          {many && <>
            <button type="button" className="lightbox-btn lightbox-prev" aria-label="Předchozí obrázek" onClick={() => step(-1)}><ChevronLeft aria-hidden /></button>
            <button type="button" className="lightbox-btn lightbox-next" aria-label="Další obrázek" onClick={() => step(1)}><ChevronRight aria-hidden /></button>
          </>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
