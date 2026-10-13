import type { Metadata } from 'next';
import { AuthPage } from '../access';
export const metadata: Metadata = { title: 'Obnova hesla · Softema Hub', robots: { index: false, follow: false } };
export default function Page() { return <AuthPage mode="reset" />; }
