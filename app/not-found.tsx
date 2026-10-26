import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Stránka nenalezena · Softema Hub', robots: { index: false, follow: false } };

/** Czech 404 for unknown paths (Hub modules use hash routes and handle unknown records themselves). */
export default function NotFound() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f7f8fa', color: '#24282d', textAlign: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, maxWidth: 420 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#ad3f15', letterSpacing: '.08em' }}>404</p>
        <h1>Stránka nenalezena</h1>
        <p style={{ color: '#4f5661' }}>Adresa neexistuje nebo byla přesunuta.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link href="/aplikace" className="hub-btn primary" style={{ display: 'inline-flex', alignItems: 'center' }}>Otevřít aplikaci</Link>
          <Link href="/" className="hub-btn" style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid #d3d7dd' }}>Úvodní stránka</Link>
        </div>
      </div>
    </main>
  );
}
