import { createHash } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { extractPdfText } from '@/lib/pdf-extract';
import { parseKoreanRegistryText } from '@/lib/registry-parser';
import { maxSampleBytes } from '@/lib/uploads';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ message: '파싱할 PDF 파일을 선택해 주세요.' }, { status: 400 });
    }
    if (!/\.pdf$/i.test(file.name)) {
      return NextResponse.json({ message: '실제 등기부등본 자동 파싱은 PDF 파일만 지원해요.' }, { status: 400 });
    }
    if (file.size > maxSampleBytes) {
      return NextResponse.json({ message: '5 MB 이하의 PDF 파일을 선택해 주세요.' }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length < 4 || Buffer.from(bytes.subarray(0, 4)).toString() !== '%PDF') {
      return NextResponse.json({ message: '올바른 PDF 파일이 아니에요.' }, { status: 400 });
    }

    const fileSha256 = createHash('sha256').update(bytes).digest('hex');
    const rawText = await extractPdfText(bytes);
    if (!rawText.trim()) {
      return NextResponse.json(
        { message: 'PDF에서 텍스트를 추출하지 못했어요. 스캔 이미지 PDF 대신 인터넷등기소 전자발급 PDF를 올려 주세요.' },
        { status: 422 },
      );
    }

    const parsed = parseKoreanRegistryText(rawText);
    return NextResponse.json({
      ok: true,
      fileSha256,
      parsed,
    });
  } catch (error: any) {
    console.error('PDF parse failed:', error?.message || error);
    return NextResponse.json(
      { message: 'PDF 문서를 분석하지 못했어요. 파일이 손상되었거나 암호가 걸려 있을 수 있어요.' },
      { status: 422 },
    );
  }
}
