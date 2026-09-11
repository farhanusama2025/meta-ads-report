import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request) {
  const providedKey = request.headers.get('x-admin-key');
  if (!process.env.ADMIN_API_KEY || providedKey !== process.env.ADMIN_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    metaTokenConfigured: Boolean(process.env.META_ACCESS_TOKEN),
    adAccountConfigured: Boolean(process.env.META_AD_ACCOUNT_ID),
    cacheTtlSeconds: Number(process.env.REPORT_CACHE_TTL_SECONDS || 300),
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV
  }, { headers: { 'Cache-Control': 'no-store' } });
}
