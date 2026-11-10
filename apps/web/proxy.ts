import { type NextRequest, NextResponse } from 'next/server';

/**
 * Database version deployed on Vercel: forwards /api/* to the API server and adds the shared secret that the API
 * requires (HUB_PROXY_SECRET), so the API answers only requests that came through this web. Both values are server
 * environment variables and never reach the browser.
 *
 * Without the secret (local development, demo) it does nothing and the rewrites in next.config.ts apply.
 * A static demo export ignores this file altogether.
 */
export function proxy(request: NextRequest) {
  const secret = process.env.HUB_PROXY_SECRET, api = process.env.API_INTERNAL_URL;
  if (process.env.NEXT_PUBLIC_APP_MODE !== 'live' || !secret || !api) return NextResponse.next();
  const headers = new Headers(request.headers);
  headers.set('x-hub-proxy', secret);
  return NextResponse.rewrite(new URL(request.nextUrl.pathname + request.nextUrl.search, api), { request: { headers } });
}

export const config = { matcher: '/api/:path*' };
