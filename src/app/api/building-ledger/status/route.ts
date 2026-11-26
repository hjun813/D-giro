import { NextResponse } from 'next/server';
import { getSharedLedgerProvider } from '@/lib/building-ledger';

export async function GET() {
  const provider = getSharedLedgerProvider();
  return NextResponse.json(
    { configured: provider.configured, provider: provider.name },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
