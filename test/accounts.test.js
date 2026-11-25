import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { createAccountApi, openAccounts } from '../accounts.js';

const password = 'registry-demo-password';
const targetId = 'sample-unit-101';
const origin = 'http://localhost:4173';

async function request(api, method, path, { data, cookie, from = origin } = {}) {
  const stream = Readable.from(data ? [Buffer.from(JSON.stringify(data))] : []);
  stream.method = method;
  stream.socket = { remoteAddress: '127.0.0.1' };
  stream.headers = { host: new URL(origin).host, ...(from === null ? {} : { origin: from }), cookie, 'content-type': 'application/json' };

  const result = {};
  await api(stream, {
    setHeader(name, value) { if (name === 'Set-Cookie') result.cookie = value; },
    writeHead(status) { result.status = status; },
    end(body) { result.body = JSON.parse(body); },
  }, path);
  return result;
}

test('회원 가입, 로그인, 계정별 관심 등록·해제, 로그아웃을 서버 세션으로 처리한다', async (t) => {
  const db = openAccounts(':memory:');
  t.after(() => db.close());
  const api = createAccountApi(db);
  const first = await request(api, 'POST', '/api/auth/register', { data: { email: ' First@example.test ', password } });
  assert.equal(first.status, 201);
  assert.equal(first.body.user.email, 'first@example.test');
  assert.match(first.cookie, /HttpOnly; SameSite=Lax/);
  assert.deepEqual(Object.keys(first.body.user).sort(), ['email', 'id']);
  const cookie = first.cookie.split(';')[0];
  const second = await request(api, 'POST', '/api/auth/register', { data: { email: 'second@example.test', password } });
  const otherCookie = second.cookie.split(';')[0];

  const add = { targetId, watched: true, accountId: first.body.user.id };
  assert.equal((await request(api, 'PUT', '/api/watchlist', { data: add })).status, 401);
  assert.equal((await request(api, 'PUT', '/api/watchlist', { cookie, data: add, from: 'https://other.example' })).status, 403);
  assert.equal((await request(api, 'PUT', '/api/watchlist', { cookie, data: add, from: null })).status, 403);
  assert.equal((await request(api, 'POST', '/api/auth/logout', { cookie, from: null })).status, 403);
  assert.equal((await request(api, 'PUT', '/api/watchlist', { cookie: otherCookie, data: add })).status, 409);
  assert.equal((await request(api, 'PUT', '/api/watchlist', { cookie, data: { targetId: 'unknown', watched: true } })).status, 400);
  for (let index = 0; index < 2; index += 1) {
    assert.deepEqual((await request(api, 'PUT', '/api/watchlist', { cookie, data: add })).body.watchlist, [targetId]);
  }
  assert.deepEqual((await request(api, 'GET', '/api/session', { cookie: otherCookie })).body.watchlist, []);

  const loggedOut = await request(api, 'POST', '/api/auth/logout', { cookie });
  assert.match(loggedOut.cookie, /Max-Age=0/);
  assert.equal((await request(api, 'GET', '/api/session', { cookie })).body.user, null);
  assert.equal((await request(api, 'POST', '/api/auth/login', { data: { email: first.body.user.email, password: 'another-wrong-password' } })).status, 401);
  const login = await request(api, 'POST', '/api/auth/login', { data: { email: first.body.user.email, password } });
  assert.equal(login.status, 200);
  assert.notEqual(login.cookie.split(';')[0], cookie);
  assert.deepEqual(login.body.watchlist, [targetId]);
  const removed = await request(api, 'PUT', '/api/watchlist', { cookie: login.cookie.split(';')[0], data: { ...add, watched: false } });
  assert.deepEqual(removed.body.watchlist, []);
});

test('SQLite를 다시 열어도 계정과 관심 목록을 보존하고 만료된 세션을 거부한다', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'deunggiro-test-'));
  const path = join(folder, 'accounts.sqlite');
  let db = openAccounts(path);
  try {
    const user = await db.register('saved@example.test', password);
    assert.equal(await db.register(user.email, password), null);
    db.changeWatch(user.id, targetId, true);
    const token = db.newSession(user, 1000);
    db.close();
    db = openAccounts(path);
    assert.equal((await db.verify(user.email, password)).id, user.id);
    assert.deepEqual(db.watchlist(user.id), [targetId]);
    assert.equal(db.sessionUser(token, 2000).id, user.id);
    assert.equal(db.sessionUser(token, 1000 + 7 * 24 * 60 * 60 * 1000), null);
  } finally {
    db.close();
    for (const name of [path, `${path}-wal`, `${path}-shm`]) rmSync(name, { force: true });
    rmdirSync(folder);
  }
});
