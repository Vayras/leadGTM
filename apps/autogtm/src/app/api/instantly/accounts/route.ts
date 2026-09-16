import { NextResponse } from 'next/server';
import { listAccounts } from '@autogtm/core/clients/instantly';

export async function GET() {
  try {
    const result = await listAccounts();
    return NextResponse.json({ accounts: result.items || [] });
  } catch (error) {
    console.error('Error fetching Resend sender accounts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Resend sender accounts' },
      { status: 500 }
    );
  }
}
