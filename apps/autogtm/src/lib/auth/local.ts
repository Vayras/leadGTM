import crypto from 'crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { queryOne, queryRows } from '@autogtm/core/db/postgres';

export const AUTH_COOKIE = 'leadgtm_session';
const SESSION_DAYS = 30;
const KEYLEN = 64;

export interface AppUser {
  id: string;
  email: string;
  created_at: string;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function hashPassword(password: string, salt = crypto.randomBytes(16).toString('hex')): string {
  const hash = crypto.scryptSync(password, salt, KEYLEN).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [scheme, salt, hash] = storedHash.split(':');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, KEYLEN);
  const stored = Buffer.from(hash, 'hex');
  return stored.length === candidate.length && crypto.timingSafeEqual(stored, candidate);
}

export async function createUser(email: string, password: string): Promise<AppUser> {
  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = hashPassword(password);
  const user = await queryOne<AppUser>(
    `insert into app_users (email, password_hash)
     values ($1, $2)
     returning id, email, created_at`,
    [normalizedEmail, passwordHash]
  );
  if (!user) throw new Error('Failed to create user');
  return user;
}

export async function authenticateUser(email: string, password: string): Promise<AppUser | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const row = await queryOne<AppUser & { password_hash: string }>(
    'select id, email, password_hash, created_at from app_users where email = $1',
    [normalizedEmail]
  );
  if (!row || !verifyPassword(password, row.password_hash)) return null;
  return { id: row.id, email: row.email, created_at: row.created_at };
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await queryRows(
    `insert into app_sessions (user_id, token_hash, expires_at)
     values ($1, $2, $3)`,
    [userId, hashToken(token), expiresAt.toISOString()]
  );
  return { token, expiresAt };
}

export async function getUserFromToken(token?: string): Promise<AppUser | null> {
  if (!token) return null;
  return queryOne<AppUser>(
    `select u.id, u.email, u.created_at
     from app_sessions s
     join app_users u on u.id = s.user_id
     where s.token_hash = $1
       and s.expires_at > now()
     limit 1`,
    [hashToken(token)]
  );
}

export async function getCurrentUser(): Promise<AppUser | null> {
  const cookieStore = await cookies();
  return getUserFromToken(cookieStore.get(AUTH_COOKIE)?.value);
}

export async function destroySession(token?: string): Promise<void> {
  if (!token) return;
  await queryRows('delete from app_sessions where token_hash = $1', [hashToken(token)]);
}

export function setSessionCookie(response: NextResponse, token: string, expiresAt: Date): void {
  response.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(AUTH_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}
