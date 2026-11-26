import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import { sampleFilename, samples } from '@/lib/fixtures';

let cachedIndex: Record<string, string> | null = null;

async function getIndex() {
  if (!cachedIndex) {
    const entries = await Promise.all(
      samples.map(async (sample) => {
        const filePath = join(process.cwd(), 'public', 'samples', sampleFilename(sample));
        const data = await readFile(filePath);
        return [createHash('sha256').update(data).digest('hex'), sample.id] as const;
      }),
    );
    cachedIndex = Object.fromEntries(entries);
  }
  return cachedIndex;
}

export async function GET() {
  try {
    const index = await getIndex();
    return NextResponse.json(index, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Failed to build sample index:', error);
    return NextResponse.json({ message: '예시 파일 목록을 불러오지 못했어요.' }, { status: 500 });
  }
}
