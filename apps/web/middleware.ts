import { NextRequest, NextResponse } from 'next/server';

/** UX guard only — authorization is enforced by the API on every request. */
export function middleware(req: NextRequest) {
  if (!req.cookies.get('zz_session')) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/dashboard/:path*', '/admin/:path*'] };
