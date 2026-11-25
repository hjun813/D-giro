import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const port = Number(process.env.PORT || 4173);
const files = new Map([
  ['/', ['web/index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['web/app.js', 'text/javascript; charset=utf-8']],
  ['/model.js', ['web/model.js', 'text/javascript; charset=utf-8']],
  ['/fixtures.js', ['web/fixtures.js', 'text/javascript; charset=utf-8']],
  ['/map.js', ['web/map.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['web/styles.css', 'text/css; charset=utf-8']],
  ['/logo.png', ['logo.png', 'image/png']],
]);

const server = createServer(async (request, response) => {
  const path = request.url.split('?')[0];
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', 'no-store');

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
