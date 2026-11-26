import { NextResponse } from 'next/server';

export async function GET() {
  const javascriptKey = (
    process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY ||
    process.env.KAKAO_MAP_JS_KEY ||
    ''
  ).trim();
  return NextResponse.json({ javascriptKey }, { headers: { 'Cache-Control': 'no-store' } });
}
