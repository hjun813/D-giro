import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { sampleFilename, samples } from '../src/lib/fixtures.ts';
import { identifySampleFile, maxSampleBytes } from '../src/lib/uploads.ts';

test('제공하는 예시 PDF와 PNG를 읽고 파일 이름이 바뀌어도 같은 자료를 식별한다', async () => {
  for (const sample of samples) {
    const filename = sampleFilename(sample);
    const bytes = await readFile(new URL(`../public/samples/${filename}`, import.meta.url));
    const extension = filename.split('.').at(-1);
    if (extension === 'pdf') assert.equal(bytes.subarray(0, 4).toString(), '%PDF');
    else assert.deepEqual(bytes.subarray(0, 4), Buffer.from([137, 80, 78, 71]));
    const digest = createHash('sha256').update(bytes).digest('hex');
    const file = new File([bytes], `copy.${extension}`);
    const identified = await identifySampleFile(file, () => ({ [digest]: sample.id }));
    assert.deepEqual(identified, { sampleId: sample.id, hash: digest });
  }
});

test('등록되지 않은 문서와 빈 파일, 형식 및 크기 초과를 구분한다', async () => {
  const noSamples = () => ({});
  assert.deepEqual(await identifySampleFile(new File(['%PDF'], 'unknown.pdf'), noSamples), { error: 'unknown' });
  assert.deepEqual(await identifySampleFile(new File([], 'empty.png'), noSamples), { error: 'empty' });
  assert.deepEqual(await identifySampleFile(new File(['fixture'], 'note.txt'), noSamples), { error: 'invalid-type' });
  const tooLarge = { name: 'large.pdf', size: maxSampleBytes + 1, async arrayBuffer() { return new ArrayBuffer(0); } };
  assert.deepEqual(await identifySampleFile(tooLarge, noSamples), { error: 'too-large' });
});
