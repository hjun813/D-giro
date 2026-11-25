export const maxSampleBytes = 5 * 1024 * 1024;

export async function identifySampleFile(file, getIndex) {
  if (!file || file.size === 0) return { error: 'empty' };
  if (!/\.(pdf|png)$/i.test(file.name)) return { error: 'invalid-type' };
  if (file.size > maxSampleBytes) return { error: 'too-large' };

  const bytes = await file.arrayBuffer();
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const hash = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const index = await getIndex();
  return Object.hasOwn(index, hash) ? { sampleId: index[hash] } : { error: 'unknown' };
}
