import type { Metadata } from 'next';
import Hub from '../hub';
export const metadata: Metadata = { title: 'Aplikace · Softema Hub', robots: { index: false, follow: false } };
export default function Page() { return <Hub />; }
