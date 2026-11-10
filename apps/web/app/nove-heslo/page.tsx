import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
// Resolved at build time in next.config.ts: the demo gets an empty stub and a 404.
import { ResetPasswordPage } from '@softema/account-pages';
export const metadata: Metadata = { title: 'Nové heslo · Softema Hub', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default function Page() {
  if (process.env.NEXT_PUBLIC_APP_MODE !== 'live') notFound();
  return <ResetPasswordPage />;
}
