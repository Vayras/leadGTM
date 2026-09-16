import { type NextRequest, NextResponse } from 'next/server';

const AUTH_COOKIE = 'leadgtm_session';

export async function updateSession(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const hasSession = Boolean(token);
  const isProtectedPath = request.nextUrl.pathname.startsWith('/app');

  if (isProtectedPath && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (hasSession && (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/')) {
    const url = request.nextUrl.clone();
    url.pathname = '/app';
    return NextResponse.redirect(url);
  }

  return NextResponse.next({
    request: {
      headers: request.headers,
    },
  });
}
