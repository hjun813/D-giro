import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createAccountApi, openAccounts } from './accounts.js';
import { createBuildingLedgerApi, createMolitLedgerProvider } from './building-ledger.js';
import { sampleFilename, samples } from './web/fixtures.js';

const port = Number(process.env.PORT || 4173);
const dataDirectory = new URL('./.data/', import.meta.url);
mkdirSync(dataDirectory, { recursive: true });
const accounts = openAccounts(fileURLToPath(new URL('accounts.sqlite', dataDirectory)));
const accountApi = createAccountApi(accounts, { origin: process.env.APP_ORIGIN });
const ledgerApi = createBuildingLedgerApi(createMolitLedgerProvider({
  serviceKey: process.env.DATA_GO_KR_SERVICE_KEY,
}));
const files = new Map([
  ['/', ['web/index.html', 'text/html; charset=utf-8']],
  ['/login', ['web/index.html', 'text/html; charset=utf-8']],
  ['/register', ['web/index.html', 'text/html; charset=utf-8']],
  ['/guide', ['web/index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['web/app.js', 'text/javascript; charset=utf-8']],
  ['/model.js', ['web/model.js', 'text/javascript; charset=utf-8']],
  ['/fixtures.js', ['web/fixtures.js', 'text/javascript; charset=utf-8']],
  ['/map.js', ['web/map.js', 'text/javascript; charset=utf-8']],
  ['/uploads.js', ['web/uploads.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['web/styles.css', 'text/css; charset=utf-8']],
  ['/logo.png', ['logo.png', 'image/png']],
]);

const samplePaths = samples.map((sample) => {
  const route = `/samples/${sampleFilename(sample)}`;
  const path = `web${route}`;
  files.set(route, [path, sample.format === 'PDF' ? 'application/pdf' : 'image/png']);
  return [sample.id, path];
});

let cachedSampleIndex;
async function sampleIndex() {
  if (!cachedSampleIndex) {
    cachedSampleIndex = Object.fromEntries(await Promise.all(samplePaths.map(async ([id, path]) => {
      const data = await readFile(new URL(path, import.meta.url));
      return [createHash('sha256').update(data).digest('hex'), id];
    })));
  }
  return cachedSampleIndex;
}

const server = createServer(async (request, response) => {
  const path = request.url.split('?')[0];
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', 'no-store');

  if (path.startsWith('/api/building-ledger')) {
    try {
      await ledgerApi(request, response, path);
    } catch (error) {
      console.error('Building ledger request failed', error.code || error.name);
      if (!response.headersSent) response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ message: '건축물대장 요청을 처리하지 못했어요.' }));
    }
    return;
  }

  if (path.startsWith('/api/')) {
    try {
      await accountApi(request, response, path);
    } catch (error) {
      console.error('Account request failed', error.code || error.name);
      if (!response.headersSent) response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ message: '서버 요청을 처리하지 못했어요. 다시 시도해 주세요.' }));
    }
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }

  if (path === '/map-config.json') {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(request.method === 'HEAD' ? undefined : JSON.stringify({
      javascriptKey: process.env.KAKAO_MAP_JS_KEY?.trim() || '',
    }));
    return;
  }

  if (path === '/sample-index.json') {
    try {
      const index = await sampleIndex();
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(request.method === 'HEAD' ? undefined : JSON.stringify(index));
    } catch (error) {
      console.error(error);
      response.writeHead(500).end();
    }
    return;
  }

  const file = files.get(path);
  if (!file) {
    response.writeHead(404).end();
    return;
  }

  try {
    const body = await readFile(new URL(file[0], import.meta.url));
    response.writeHead(200, { 'Content-Type': file[1] });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    console.error(error);
    response.writeHead(500).end();
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`등기로 MVP: http://localhost:${server.address().port}/`);
});

let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  server.close(() => {
    accounts.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
