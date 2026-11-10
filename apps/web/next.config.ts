import { resolve } from 'node:path';
import type { NextConfig } from 'next';

const LIVE = process.env.NEXT_PUBLIC_APP_MODE === 'live';
const api = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4100';
const noSession = [{ type: 'cookie' as const, key: 'better-auth.session_token' }];

const nextConfig: NextConfig = {
  // Separate output, so a live build can never be served as the demo or the other way round.
  distDir: LIVE ? '.next-live' : '.next',
  turbopack: {
    root: resolve(import.meta.dirname, '../..'),
    resolveAlias: {
      '@softema/app-entry': LIVE ? './app/live/live-hub.tsx' : './app/hub.tsx',
      '@softema/sign-in': LIVE ? './app/live/sign-in.ts' : './app/live/sign-in.demo.ts',
      '@softema/account-pages': LIVE ? './app/live/account-pages.tsx' : './app/live/account-pages.demo.ts',
    },
  },
  transpilePackages: ['@softema/shared'],
  // Vercel project rooted at the repository (vercel.json there): the demo is fully static, so it is exported to
  // apps/web/out and served as plain files. Local `pnpm build` + `pnpm start` are unaffected.
  ...(!LIVE && process.env.NEXT_OUTPUT === 'export' ? { output: 'export' as const } : {}),
  // Live mode only. A demo build has neither rewrites nor redirects and never talks to the API.
  // The cookie check is just a fast redirect; the API verifies every session.
  ...(LIVE ? {
    async rewrites() { return [{ source: '/api/:path*', destination: `${api}/api/:path*` }]; },
    async redirects() {
      return [
        { source: '/aplikace', missing: noSession, destination: '/prihlaseni', permanent: false },
        { source: '/registrace', destination: '/prihlaseni', permanent: false },
      ];
    },
  } : {}),
};

export default nextConfig;
