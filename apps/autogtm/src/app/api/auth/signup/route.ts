import { NextResponse } from 'next/server';
import { createUser } from '@/lib/auth/local';

function isInviteValid(inviteCode: string): boolean {
  const allowedCodes = (process.env.INVITE_CODES || '')
    .split(',')
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);
  return allowedCodes.includes(inviteCode.trim().toUpperCase());
}

export async function POST(request: Request) {
  try {
    const { email, password, inviteCode } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }
    if (String(password).length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }
    if (!inviteCode || !isInviteValid(inviteCode)) {
      return NextResponse.json({ error: 'Invalid invite code' }, { status: 403 });
    }

    const user = await createUser(email, password);
    return NextResponse.json({ user: { id: user.id, email: user.email } });
  } catch (error: any) {
    if (error?.code === '23505') {
      return NextResponse.json({ error: 'You already have an account. Please log in instead.' }, { status: 409 });
    }
    console.error('Signup error:', error);
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
  }
}
