import { NextResponse, type NextRequest } from 'next/server';

// ponytail: single shared-token gate for a local one-user tool. Real auth deferred until hosted.
// Token accepted via ?token= (sets a cookie) or an existing admin_token cookie.
// Next 16: the middleware.ts convention was renamed to proxy.ts (export `proxy`); same behavior.
// Must live in src/ (not the app root) because this app keeps its code under src/.
export function proxy(req: NextRequest) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return NextResponse.next(); // unset → open (pure-local convenience)
  const url = req.nextUrl;
  const qToken = url.searchParams.get('token');
  const cToken = req.cookies.get('admin_token')?.value;
  if (qToken === expected) {
    const res = NextResponse.redirect(new URL(url.pathname, url));
    res.cookies.set('admin_token', expected, { httpOnly: true, sameSite: 'lax' });
    return res;
  }
  if (cToken === expected) return NextResponse.next();
  return new NextResponse('Unauthorized — append ?token=YOUR_ADMIN_TOKEN', { status: 401 });
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
