import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';
import { targets } from './web/fixtures.js';

const deriveKey = promisify(scrypt);
const sessionDays = 7;
const sessionSeconds = sessionDays * 24 * 60 * 60;
const sessionCookie = 'deunggiro_session';
const kdfOptions = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const placeholderSalt = randomBytes(16).toString('hex');
const targetIds = new Set(targets.map((target) => target.id));
const hashToken = (token) => createHash('sha256').update(token).digest('hex');

export function openAccounts(path) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 3000;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      salt TEXT NOT NULL,
      password_hash TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS sessions_expires_at ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS watchlist (
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      target_id TEXT NOT NULL,
      added_at INTEGER NOT NULL,
      PRIMARY KEY (account_id, target_id)
    ) STRICT;
  `);

  const queries = {
    register: db.prepare('INSERT INTO accounts VALUES (?, ?, ?, ?) ON CONFLICT(email) DO NOTHING'),
    account: db.prepare('SELECT id, email, salt, password_hash FROM accounts WHERE email = ?'),
    session: db.prepare(`SELECT accounts.id, accounts.email FROM sessions JOIN accounts ON accounts.id = sessions.account_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?`),
    addSession: db.prepare('INSERT INTO sessions VALUES (?, ?, ?)'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    cleanupSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
    watchlist: db.prepare('SELECT target_id FROM watchlist WHERE account_id = ? ORDER BY added_at, target_id'),
    watch: db.prepare('INSERT INTO watchlist VALUES (?, ?, ?) ON CONFLICT(account_id, target_id) DO NOTHING'),
    unwatch: db.prepare('DELETE FROM watchlist WHERE account_id = ? AND target_id = ?'),
  };

  return {
    close() { db.close(); },
    async register(email, password) {
      const user = { id: randomUUID(), email };
      const salt = randomBytes(16).toString('hex');
      const hash = await deriveKey(password, salt, 64, kdfOptions);
      return queries.register.run(user.id, email, salt, hash.toString('hex')).changes ? user : null;
    },
    async verify(email, password) {
      const entry = queries.account.get(email);
      const hash = await deriveKey(password, entry?.salt || placeholderSalt, 64, kdfOptions);
      if (!entry || !timingSafeEqual(hash, Buffer.from(entry.password_hash, 'hex'))) return null;
      return { id: entry.id, email: entry.email };
    },
    newSession(user, now = Date.now()) {
      const token = randomBytes(32).toString('base64url');
      queries.cleanupSessions.run(now);
      queries.addSession.run(hashToken(token), user.id, now + sessionSeconds * 1000);
      return token;
    },
    sessionUser(token, now = Date.now()) {
      return token ? queries.session.get(hashToken(token), now) || null : null;
    },
    endSession(token) {
      if (token) queries.deleteSession.run(hashToken(token));
    },
    watchlist(userId) {
      return queries.watchlist.all(userId).map((item) => item.target_id);
    },
    changeWatch(userId, targetId, watched) {
      if (watched) queries.watch.run(userId, targetId, Date.now());
      else queries.unwatch.run(userId, targetId);
    },
  };
}

function readSessionCookie(request) {
  return request.headers.cookie?.match(/(?:^|;\s*)deunggiro_session=([A-Za-z0-9_-]{43})(?=;|$)/)?.[1];
}

function setSessionCookie(response, token, secure) {
  response.setHeader('Set-Cookie', `${sessionCookie}=${token || ''}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? sessionSeconds : 0}${secure ? '; Secure' : ''}`);
}

function sendJson(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

async function readJson(request) {
  if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') return null;
  const chunks = [];
  let size = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > 4096) {
      request.resume();
      return null;
    }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { return null; }
}

export function createAccountApi(accounts, { origin } = {}) {
  let attemptWindow = 0;
  const attempts = new Map();

  return async function accountApi(request, response, path) {
    const secure = origin ? origin.startsWith('https://') : Boolean(request.socket.encrypted);
    const expectedOrigin = origin || `${secure ? 'https' : 'http'}://${request.headers.host}`;
    const token = readSessionCookie(request);
    const user = accounts.sessionUser(token);
    const view = (account) => ({ user: account, watchlist: account ? accounts.watchlist(account.id) : [] });
    const route = `${request.method} ${path}`;

    if (route === 'GET /api/session') return sendJson(response, 200, view(user));
    if (request.headers.origin !== expectedOrigin) {
      return sendJson(response, 403, { message: '요청 주소가 일치하지 않아요.' });
    }
    if (route === 'POST /api/auth/logout') {
      accounts.endSession(token);
      setSessionCookie(response, null, secure);
      return sendJson(response, 200, view(null));
    }
    if (route === 'PUT /api/watchlist') {
      if (!user) return sendJson(response, 401, { message: '관심 목록을 저장하려면 로그인해 주세요.' });
      const data = await readJson(request);
      if (!targetIds.has(data?.targetId) || typeof data.watched !== 'boolean') {
        return sendJson(response, 400, { message: '저장할 등기 대상을 확인해 주세요.' });
      }
      if (!accounts.sessionUser(token)) return sendJson(response, 401, { message: '로그인 상태가 만료됐어요.' });
      if (data.accountId !== user.id) return sendJson(response, 409, { message: '로그인한 계정이 바뀌었어요. 현재 목록을 다시 확인해 주세요.' });
      accounts.changeWatch(user.id, data.targetId, data.watched);
      return sendJson(response, 200, view(user));
    }
    const registration = route === 'POST /api/auth/register';
    if (!registration && route !== 'POST /api/auth/login') {
      return sendJson(response, 404, { message: '요청한 기능을 찾을 수 없어요.' });
    }

    const now = Date.now();
    if (now >= attemptWindow) {
      attempts.clear();
      attemptWindow = now + 15 * 60 * 1000;
    }
    const address = request.socket.remoteAddress;
    const count = attempts.get(address) || 0;
    if (count >= 30) return sendJson(response, 429, { message: '요청이 많아요. 잠시 뒤 다시 시도해 주세요.' });
    attempts.set(address, count + 1);

    const data = await readJson(request);
    const email = typeof data?.email === 'string' ? data.email.trim().toLowerCase() : '';
    const password = data?.password;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
        typeof password !== 'string' || password.length < 12 || password.length > 128) {
      return sendJson(response, 400, { message: '이메일 주소와 비밀번호(12~128자)를 확인해 주세요.' });
    }
    const account = registration ? await accounts.register(email, password) : await accounts.verify(email, password);
    if (!account) return sendJson(response, registration ? 409 : 401, {
      message: registration ? '이 주소로 가입할 수 없어요. 이미 가입했다면 로그인해 주세요.' : '이메일 또는 비밀번호가 일치하지 않아요.',
    });
    accounts.endSession(token);
    setSessionCookie(response, accounts.newSession(account), secure);
    return sendJson(response, registration ? 201 : 200, view(account));
  };
}
