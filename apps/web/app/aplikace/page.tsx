import type { Metadata } from 'next';
// Resolved at build time in next.config.ts: a build contains exactly one of the two apps.
import App from '@softema/app-entry';
export const metadata: Metadata = { title: 'Aplikace · Softema Hub', robots: { index: false, follow: false } };
export default function Page() { return <App />; }
