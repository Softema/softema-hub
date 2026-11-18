import { type NextRequest, NextResponse } from 'next/server';

/**
 * Database version deployed on Vercel: forwards /api/* to the API server and adds the shared secret that the API
 * requires (HUB_PROXY_SECRET), so the API answers only requests that came through this web. Both values are server
 * environment variables and never reach the browser.
 *
 * It also passes the visitor's IP in x-hub-client-ip. Behind this proxy the API would otherwise see Vercel's own
 * address in x-forwarded-for, and the sign-in limits would count every visitor as one. Vercel sets
 * x-vercel-forwarded-for / x-real-ip itself, a visitor cannot forge them, and the header is overwritten here,
 * so the API trusts it only together with the secret.
 *
 * Without the secret (local development, demo) it does nothing and the rewrites in next.config.ts apply.
 * A static demo export ignores this file altogether.
 */
export function proxy(request: NextRequest) {
  const secret = process.env.HUB_PROXY_SECRET, api = process.env.API_INTERNAL_URL;
  if (process.env.NEXT_PUBLIC_APP_MODE !== 'live' || !secret || !api) return NextResponse.next();
  const headers = new Headers(request.headers);
  headers.set('x-hub-proxy', secret);
  const ip = [request.headers.get('x-vercel-forwarded-for'), request.headers.get('x-real-ip'), request.headers.get('x-forwarded-for')]
    .map(v => v?.split(',')[0]?.trim()).find(Boolean);
  if (ip) headers.set('x-hub-client-ip', ip); else headers.delete('x-hub-client-ip');
  return NextResponse.rewrite(new URL(request.nextUrl.pathname + request.nextUrl.search, api), { request: { headers } });
}

export const config = { matcher: '/api/:path*' };
