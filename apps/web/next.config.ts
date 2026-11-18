import { resolve } from 'node:path';
import type { NextConfig } from 'next';

const LIVE = process.env.NEXT_PUBLIC_APP_MODE === 'live';
const api = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4100';
// Over HTTPS Better-Auth adds the __Secure- prefix; the redirect applies only when neither cookie is present.
const noSession = [{ type: 'cookie' as const, key: 'better-auth.session_token' }, { type: 'cookie' as const, key: '__Secure-better-auth.session_token' }];

/**
 * Security headers of the database version. All pages are prerendered statically, and Next.js applies nonces only
 * to dynamically rendered pages, so inline scripts need 'unsafe-inline' (the "Without Nonces" setup from the Next.js
 * CSP guide). Everything else is locked to this origin: no third-party scripts, styles, frames, fonts or connections.
 * The demo is not affected (it loads the Unlayer editor from its CDN).
 */
const DEV = process.env.NODE_ENV === 'development';
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${DEV ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${DEV ? ' ws:' : ''}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
].join('; ');
const securityHeaders = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];

const nextConfig: NextConfig = {
  // Separate output, so a live build can never be served as the demo or the other way round.
  // On Vercel each project builds only one of them, and Vercel expects the default `.next`.
  distDir: LIVE && !process.env.VERCEL ? '.next-live' : '.next',
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
    async headers() { return [{ source: '/:path*', headers: securityHeaders }]; },
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
