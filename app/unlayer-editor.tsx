'use client';
/*
 * Unlayer drag & drop editor (react-email-editor, MIT wrapper; the editor itself is loaded from
 * editor.unlayer.com). Runs without an account: no projectId, so Unlayer branding and free-plan
 * limits apply. An optional public NEXT_PUBLIC_UNLAYER_PROJECT_ID can be set later (it is not a secret).
 * Images are kept as small data URLs in the design (no upload to Unlayer or any server).
 */
import React, { useEffect, useRef } from 'react';
import EmailEditor, { type EditorRef } from 'react-email-editor';
import type { Block } from '@/lib/hub/types';
import { newId } from '@/lib/hub/format';

type Design = Parameters<NonNullable<EditorRef['editor']>['loadDesign']>[0];
export type UnlayerChange = { design: unknown; html: string };
const PROJECT_ID = Number(process.env.NEXT_PUBLIC_UNLAYER_PROJECT_ID) || undefined;
const MAX_IMAGE = 400 * 1024;

const html = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br />');
/** Starter design built from block content, so templates look the same in both editors. */
export function designFromBlocks(blocks: Block[]): unknown {
  const content = (b: Block) => {
    const id = newId('u');
    const align = b.align || 'left';
    switch (b.type) {
      case 'logo': return { id, type: 'heading', values: { containerPadding: '28px 32px 8px', headingType: 'h3', fontSize: '24px', color: '#ed6637', textAlign: align, lineHeight: '120%', text: html(b.text) } };
      case 'heading': return { id, type: 'heading', values: { containerPadding: '12px 32px', headingType: 'h1', fontSize: '30px', color: b.color || '#24282d', textAlign: align, lineHeight: '120%', text: html(b.text) } };
      case 'button': return { id, type: 'button', values: { containerPadding: '12px 32px 20px', href: { name: 'web', values: { href: b.url || 'https://', target: '_blank' } }, buttonColors: { color: '#ffffff', backgroundColor: b.color || '#ed6637' }, textAlign: align, padding: '12px 22px', borderRadius: '5px', text: `<span>${html(b.text)}</span>` } };
      case 'divider': return { id, type: 'divider', values: { containerPadding: '12px 32px', border: { borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: '#eceef0' }, width: '100%' } };
      case 'image': return b.url ? { id, type: 'image', values: { containerPadding: '12px 32px', src: { url: b.url }, altText: b.text, textAlign: 'center' } } : null;
      case 'callout': return { id, type: 'text', values: { containerPadding: '12px 32px', textAlign: align, lineHeight: '160%', text: `<div style="background:${b.color || '#fff2eb'};border-radius:8px;padding:22px;font-weight:600;font-size:16px;color:#8b5a45">${html(b.text)}</div>` } };
      case 'footer': return { id, type: 'text', values: { containerPadding: '20px 32px 28px', textAlign: align, lineHeight: '180%', text: `<p style="font-size:11px;color:#9aa0a8">${html(b.text)}</p>` } };
      default: return { id, type: 'text', values: { containerPadding: '12px 32px', textAlign: align, lineHeight: '170%', text: `<p style="font-size:15px;color:#4b525c">${html(b.text)}</p>` } };
    }
  };
  return {
    counters: {},
    body: {
      id: newId('body'),
      rows: [{ id: newId('row'), cells: [1], columns: [{ id: newId('col'), contents: blocks.map(content).filter(Boolean), values: {} }], values: {} }],
      values: { backgroundColor: '#f3f4f6', contentWidth: '600px', contentAlign: 'center', fontFamily: { label: 'Arial', value: 'arial,helvetica,sans-serif' }, preheaderText: '', linkStyle: { linkColor: '#c9481a', linkUnderline: true } },
    },
  };
}

export default function UnlayerEditor({ design, starter, dark, onChange, onReady, onFail }: {
  design?: unknown; starter: Block[]; dark: boolean;
  onChange: (v: UnlayerChange) => void; onReady: () => void; onFail: (reason: string) => void;
}) {
  const ref = useRef<EditorRef>(null);
  const ready = useRef(false);
  const latest = useRef({ onChange, onReady, onFail });
  useEffect(() => { latest.current = { onChange, onReady, onFail }; });

  useEffect(() => {
    // The script comes from a third-party CDN; without a response we fall back to the built-in editor.
    const t = setTimeout(() => { if (!ready.current) latest.current.onFail('Editor Unlayer se nepodařilo načíst do 20 sekund.'); }, 20_000);
    return () => clearTimeout(t);
  }, []);

  return (
    <EmailEditor
      ref={ref}
      minHeight="100%"
      style={{ flex: 1, minHeight: 560 }}
      options={{
        projectId: PROJECT_ID,
        locale: 'cs',
        displayMode: 'email',
        appearance: { theme: dark ? 'modern_dark' : 'modern_light' },
        mergeTags: { jmeno: { name: 'Jméno', value: '{{jmeno}}', sample: 'Jane' }, firma: { name: 'Firma', value: '{{firma}}', sample: 'Novák Studio' } },
        features: { stockImages: false, preheaderText: false },
      }}
      onReady={unlayer => {
        ready.current = true;
        try { unlayer.loadDesign((design ?? designFromBlocks(starter)) as Design); } catch { unlayer.loadBlank(); }
        unlayer.registerCallback('image', (file: { attachments: File[] }, done: (r: { progress?: number; url?: string; error?: boolean | string }) => void) => {
          const f = file.attachments?.[0];
          if (!f) return done({ error: true });
          if (f.size > MAX_IMAGE) return done({ error: 'V prototypu lze vložit obrázek do 400 kB (ukládá se jen v prohlížeči).' });
          const r = new FileReader();
          r.onload = () => done({ progress: 100, url: String(r.result) });
          r.onerror = () => done({ error: true });
          r.readAsDataURL(f);
        });
        const push = () => unlayer.exportHtml(d => latest.current.onChange({ design: d.design, html: d.html }));
        unlayer.addEventListener('design:updated', push);
        unlayer.addEventListener('design:loaded', push);
        latest.current.onReady();
      }}
    />
  );
}
