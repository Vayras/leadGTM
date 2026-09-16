import { NextResponse } from 'next/server';
import { AUTH_COOKIE, clearSessionCookie, destroySession } from '@/lib/auth/local';

export async function POST(request: Request) {
  const token = request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${AUTH_COOKIE}=`))
    ?.split('=')
    .slice(1)
    .join('=');

  await destroySession(token);
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
