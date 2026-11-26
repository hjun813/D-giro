import { extractText, getDocumentProxy } from 'unpdf';

export async function extractPdfText(buffer: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(buffer);
  try {
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join('\n') : String(text || '');
  } finally {
    const disposable = pdf as unknown as { destroy?: () => Promise<void> };
    if (typeof disposable.destroy === 'function') {
      await disposable.destroy();
    }
  }
}
