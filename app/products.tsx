'use client';
/* Digital products: list, editing (files as metadata only) and buyers linked to CRM. */
import React, { useMemo, useState } from 'react';
import { ArrowLeft, Download, Package, Paperclip, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { fmt, fmtDate, money, newId, normalize, plural } from '@/lib/hub/format';
import { logActivity } from '@/lib/hub/ops';
import type { DigitalProduct, FileMeta } from '@/lib/hub/types';
import { useHub, useUnsavedGuard } from './state';
import { Avatar, Badge, Btn, Field, IconBtn, Metric, Modal, PageHead, Pick } from './ui';
import { FormError, ImagePicker, Notice, Section, useConfirm } from './kit';
import { Art, LearnNav } from './learn-shared';

const KINDS: DigitalProduct['kind'][] = ['E-book', 'Šablona', 'Audio', 'Video', 'Balíček'];

export default function Products({ id }: { id?: string }) {
  return id ? <ProductDetail key={id} id={id} /> : <ProductList />;
}

function ProductList() {
  const { w, go, workspaceId, mutate } = useHub();
  const stats = (p: DigitalProduct) => { const ps = w.purchases.filter(x => x.productId === p.id); return { buyers: ps.length, revenue: ps.length * p.price, downloads: ps.reduce((s, x) => s + x.downloads, 0) }; };
  const create = () => {
    const p: DigitalProduct = { id: newId('dp'), workspaceId, title: 'Nový produkt', description: '', kind: 'E-book', price: 0, status: 'Koncept', files: [], createdAt: new Date().toISOString() };
    mutate(d => ({ ...d, products: [p, ...d.products] })); toast.success('Produkt byl vytvořen jako koncept.'); go('kurzy/produkty/' + p.id);
  };
  const total = w.products.reduce((s, p) => s + stats(p).revenue, 0);
  return (
    <div className="page">
      <PageHead title="Kurzy a produkty" desc="Digitální produkty ke stažení po zaplacení. Kupující jsou kontakty z CRM.">
        <Btn primary onClick={create}><Plus aria-hidden />Nový produkt</Btn>
      </PageHead>
      <LearnNav active="kurzy/produkty" />
      <div className="metric-grid">
        <Metric label="Produkty" value={fmt(w.products.length)} desc={`${w.products.filter(p => p.status === 'Publikováno').length} publikované`} />
        <Metric label="Nákupy" value={fmt(w.purchases.length)} desc="celkem" />
        <Metric label="Tržby z produktů" value={money(total)} desc="cena × počet nákupů" />
        <Metric label="Stažení" value={fmt(w.purchases.reduce((s, x) => s + x.downloads, 0))} desc="zaznamenaná stažení" />
      </div>
      {w.products.length ? (
        <section className="panel">
          <div className="table-scroll">
            <table className="hub-table data-table">
              <thead><tr><th>Produkt</th><th className="col-opt">Typ</th><th className="num">Cena</th><th>Stav</th><th className="num col-opt">Kupující</th><th className="num col-opt">Tržby</th></tr></thead>
              <tbody>
                {w.products.map(p => { const s = stats(p); return (
                  <tr key={p.id} onClick={() => go('kurzy/produkty/' + p.id)}>
                    <td><div className="name-cell"><span className="mail-box"><Package size={15} aria-hidden /></span><button type="button">{p.title}<small>{plural(p.files.length, 'soubor', 'soubory', 'souborů')}</small></button></div></td>
                    <td className="col-opt muted">{p.kind}</td>
                    <td className="num">{p.price ? money(p.price) : 'Zdarma'}</td>
                    <td><Badge tone={p.status === 'Publikováno' ? 'green' : 'gray'}>{p.status}</Badge></td>
                    <td className="num col-opt">{fmt(s.buyers)}</td>
                    <td className="num col-opt">{money(s.revenue)}</td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
        </section>
      ) : <section className="panel empty"><Package size={28} aria-hidden /><h3>Zatím nemáte žádný produkt</h3><p>E-book, šablona nebo audio ke stažení po zaplacení.</p><Btn primary onClick={create}><Plus aria-hidden />Vytvořit produkt</Btn></section>}
    </div>
  );
}

function ProductDetail({ id }: { id: string }) {
  const { w, go, workspaceId, mutate, patch } = useHub();
  const p = w.products.find(x => x.id === id);
  const init = p && { title: p.title, description: p.description, kind: p.kind, price: String(p.price), image: p.image, files: p.files };
  const [v, setV] = useState(init);
  const [error, setError] = useState('');
  const [granting, setGranting] = useState(false);
  const [confirmEl, confirm] = useConfirm();
  const dirty = JSON.stringify(v) !== JSON.stringify(init);
  useUnsavedGuard(dirty, 'Produkt má neuložené změny.');
  const contacts = useMemo(() => new Map(w.contacts.map(x => [x.id, x])), [w.contacts]);
  if (!p || !v) return <div className="page"><section className="panel empty"><h3>Produkt nenalezen</h3><Btn primary onClick={() => go('kurzy/produkty')}>Zpět na produkty</Btn></section></div>;
  const buyers = w.purchases.filter(x => x.productId === p.id).sort((a, b) => b.date.localeCompare(a.date));
  const save = () => {
    const price = Number(v.price.replace(/\s/g, '').replace(',', '.'));
    if (!v.title.trim()) return setError('Vyplňte název produktu.');
    if (!Number.isFinite(price) || price < 0) return setError('Cena musí být 0 nebo kladné číslo v Kč.');
    patch('products', p.id, x => ({ ...x, ...v, title: v.title.trim(), price: Math.round(price) }));
    toast.success('Produkt byl uložen.');
  };
  const publish = () => {
    if (dirty) { toast.error('Nejdřív uložte změny.'); return; }
    if (p.status === 'Koncept' && !p.files.length) { toast.error('Publikovat lze produkt alespoň s jedním souborem.'); return; }
    patch('products', p.id, x => ({ ...x, status: x.status === 'Koncept' ? 'Publikováno' : 'Koncept' }));
    toast.success(p.status === 'Koncept' ? 'Produkt je publikovaný.' : 'Produkt je znovu koncept.');
  };
  const addFiles = (files: FileList | null) => { if (!files?.length) return; const meta: FileMeta[] = [...files].map(f => ({ id: newId('f'), name: f.name, size: f.size, type: f.type || 'application/octet-stream', addedAt: new Date().toISOString() })); setV({ ...v, files: [...v.files, ...meta] }); };
  return (
    <div className="page">
      <button type="button" className="back-link" onClick={() => go('kurzy/produkty')}><ArrowLeft size={15} aria-hidden />Digitální produkty</button>
      <PageHead title={p.title} desc={`${p.kind} · ${p.price ? money(p.price) : 'Zdarma'} · ${plural(buyers.length, 'kupující', 'kupující', 'kupujících')}`}>
        <Badge tone={p.status === 'Publikováno' ? 'green' : 'gray'}>{p.status}</Badge>
        <Btn onClick={publish}>{p.status === 'Koncept' ? 'Publikovat' : 'Vrátit do konceptu'}</Btn>
        <Btn primary onClick={save} disabled={!dirty}>Uložit změny</Btn>
      </PageHead>
      <div className="split">
        <div className="stack">
          <Section title="Produkt">
            <div className="sec-body stack">
              <Field label="Název"><input value={v.title} onChange={e => { setV({ ...v, title: e.target.value }); setError(''); }} maxLength={150} /></Field>
              <Field label="Popis"><textarea rows={4} value={v.description} onChange={e => setV({ ...v, description: e.target.value })} maxLength={2000} /></Field>
              <div className="form-grid">
                <Field label="Typ"><Pick value={v.kind} onChange={k => setV({ ...v, kind: k as DigitalProduct['kind'] })} options={KINDS} className="full" label="Typ produktu" /></Field>
                <Field label="Cena (Kč)"><input inputMode="decimal" value={v.price} onChange={e => { setV({ ...v, price: e.target.value }); setError(''); }} /></Field>
              </div>
              <div className="field">
                <span>Soubory ke stažení</span>
                <ul className="file-list">
                  {v.files.map(f => <li key={f.id}><Paperclip size={14} aria-hidden /><span>{f.name}<small>{fmt(Math.round(f.size / 1024))} kB · přidáno {fmtDate(f.addedAt)}</small></span><IconBtn label={`Odebrat ${f.name}`} onClick={() => setV({ ...v, files: v.files.filter(x => x.id !== f.id) })}><X /></IconBtn></li>)}
                  {!v.files.length && <li className="muted small">Zatím žádný soubor.</li>}
                </ul>
                <label className="hub-btn file-btn"><input type="file" multiple className="sr-only" onChange={e => { addFiles(e.target.files); e.target.value = ''; }} /><Plus size={16} aria-hidden />Přidat soubor</label>
                <small>Ukládá se jen název a velikost. Skutečné úložiště (S3/R2) a stahování přes podepsanou URL s expirací přijde s backendem.</small>
              </div>
              <FormError>{error}</FormError>
            </div>
          </Section>
          <Section title="Kupující" desc={plural(buyers.length, 'nákup', 'nákupy', 'nákupů')} actions={<Btn onClick={() => setGranting(true)}><Plus aria-hidden />Udělit přístup</Btn>}>
            <ul className="row-list sec-body">
              {buyers.map(b => { const c = contacts.get(b.contactId); return (
                <li key={b.id} className="row-item">
                  {c ? <Avatar name={c.name} color={c.color} size="sm" /> : null}
                  <button type="button" className="row-main" onClick={() => c && go('kontakty/' + c.id)}><strong>{c?.name ?? 'Smazaný kontakt'}</strong><small>Koupeno {fmtDate(b.date)} · staženo {b.downloads}×</small></button>
                  <IconBtn label="Zaznamenat stažení" onClick={() => { mutate(d => ({ ...d, purchases: d.purchases.map(x => (x.workspaceId === workspaceId && x.id === b.id ? { ...x, downloads: x.downloads + 1 } : x)) })); toast.success('Stažení bylo zaznamenáno (simulace).'); }}><Download /></IconBtn>
                  <IconBtn label="Odebrat přístup" onClick={() => confirm({ title: 'Odebrat přístup k produktu?', desc: 'Kontakt už produkt nebude moci stáhnout. Platba zůstane v přehledu plateb.', confirm: 'Odebrat přístup', danger: true, onConfirm: () => { mutate(d => ({ ...d, purchases: d.purchases.filter(x => !(x.workspaceId === workspaceId && x.id === b.id)) })); toast.success('Přístup byl odebrán.'); } })}><Trash2 /></IconBtn>
                </li>
              ); })}
              {!buyers.length && <li className="muted">Produkt zatím nikdo nekoupil.</li>}
            </ul>
          </Section>
        </div>
        <Section title="Obrázek" className="sticky-side">
          <div className="sec-body stack">
            <ImagePicker value={v.image} onChange={image => setV({ ...v, image })} label="Obrázek produktu" ratio="4 / 3" />
            {!v.image && <Art accent="purple" title={v.title} eyebrow={v.kind} small />}
            <Notice>Nákup proběhne přes Stripe Checkout po napojení plateb. Pak se přístup udělí automaticky.</Notice>
          </div>
        </Section>
      </div>
      <GrantDialog p={p} open={granting} onClose={() => setGranting(false)} />
      {confirmEl}
    </div>
  );
}

function GrantDialog({ p, open, onClose }: { p: DigitalProduct; open: boolean; onClose: () => void }) {
  const { w, workspaceId, mutate } = useHub();
  const [q, setQ] = useState('');
  const [id, setId] = useState<number | null>(null);
  const owned = new Set(w.purchases.filter(x => x.productId === p.id).map(x => x.contactId));
  const list = w.contacts.filter(x => !owned.has(x.id) && normalize(`${x.name} ${x.email}`).includes(normalize(q))).slice(0, 30);
  const grant = () => {
    if (id === null) return;
    mutate(d => logActivity({ ...d, purchases: [{ id: newId('pu'), workspaceId, productId: p.id, contactId: id, date: new Date().toISOString(), downloads: 0 }, ...d.purchases] }, workspaceId, id, 'product', 'Udělen přístup k digitálnímu produktu', p.title, 'kurzy/produkty/' + p.id));
    toast.success('Přístup byl udělen.'); setId(null); setQ(''); onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Udělit přístup" desc="Ruční přístup bez platby (např. bonus).">
      <div className="stack">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Hledat kontakt…" aria-label="Hledat kontakt" autoFocus />
        <ul className="pick-list">
          {list.map(x => <li key={x.id}><label className="check-row"><input type="radio" name="grant" checked={id === x.id} onChange={() => setId(x.id)} /><span>{x.name}<small>{x.email}</small></span></label></li>)}
          {!list.length && <li className="muted">Nic nenalezeno.</li>}
        </ul>
      </div>
      <div className="form-actions"><Btn onClick={onClose}>Zrušit</Btn><Btn primary disabled={id === null} onClick={grant}>Udělit přístup</Btn></div>
    </Modal>
  );
}
