const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { StoreRepository, etag, INTERNAL, problem } = require('./lib/store-repository');
const { createAlfredApi } = require('./lib/alfred-api');

function loadOrCreateSessionSecret() {
  const file = path.join(__dirname, 'data', 'session-secret.txt');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

async function createApp(options = {}) {
  const repository = options.repository || new StoreRepository(options.dataFile || path.join(__dirname, 'data', 'store.json'));
  const domain = await import('./public/js/issue-domain.mjs');
  const constants = await import('./public/js/issue-defaults.mjs');
  const defaults = Object.fromEntries(['statuses', 'priorities', 'customers', 'projects', 'tags'].map(kind => [kind, constants[{
    statuses: 'STATUS_DEFAULTS', priorities: 'PRIORITY_DEFAULTS', customers: 'CUSTOMER_DEFAULTS', projects: 'PROJECT_DEFAULTS', tags: 'TAG_DEFAULTS'
  }[kind]]]));
  const secret = options.secret || process.env.SESSION_SECRET || loadOrCreateSessionSecret();
  const password = options.password || process.env.WT_PASSWORD || 'EmilsListe1000';
  const base = (options.basePath ?? process.env.BASE_PATH ?? '').replace(/\/$/, '');
  const cookieName = 'wt_session';
  const maxAge = 30 * 24 * 60 * 60 * 1000;
  const sign = value => crypto.createHmac('sha256', secret).update(value).digest('hex');
  function validSession(token) {
    if (!token) return false;
    const [expires, sig] = token.split('.');
    if (!expires || !sig) return false;
    const expected = Buffer.from(sign(expires)), supplied = Buffer.from(sig);
    return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied) && Number(expires) > Date.now();
  }
  function getCookie(req) {
    for (const part of (req.headers.cookie || '').split(';')) {
      const index = part.indexOf('=');
      if (index >= 0 && part.slice(0, index).trim() === cookieName) {
        try { return decodeURIComponent(part.slice(index + 1).trim()); } catch { return null; }
      }
    }
    return null;
  }
  const app = express();
  app.disable('x-powered-by');
  if (options.cabin !== false) app.use('/hytte', require('./hytte')());
  app.use((req, res, next) => {
    if (base && (req.url === base || req.url.startsWith(base + '/') || req.url.startsWith(base + '?'))) req.url = req.url.slice(base.length) || '/';
    next();
  });
  app.use('/api/v1', createAlfredApi({ repository, domain, defaults, secret,
    token: options.apiToken ?? process.env.ALFRED_API_TOKEN ?? '',
    scopes: options.apiScopes ?? process.env.ALFRED_API_SCOPES ?? 'read,write', now: options.now
  }));
  app.use(express.json({ limit: '10mb' }));
  const publicPaths = new Set(['/login.html', '/css/login.css', '/js/login.js', '/favicon.ico']);
  app.use((req, res, next) => {
    if (req.method === 'POST' && ['/api/login', '/api/logout'].includes(req.path)) return next();
    if (req.method === 'GET' && publicPaths.has(req.path)) return next();
    if (validSession(getCookie(req))) return next();
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'unauthorized' });
    res.redirect(base + '/login.html');
  });
  app.post('/api/login', (req, res) => {
    if (req.body?.password !== password) return res.status(401).json({ error: 'invalid password' });
    const expires = String(Date.now() + maxAge), token = expires + '.' + sign(expires);
    res.set('Set-Cookie', `${cookieName}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${Math.floor(maxAge / 1000)}; SameSite=Lax`).json({ ok: true });
  });
  app.post('/api/logout', (req, res) => {
    res.set('Set-Cookie', `${cookieName}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`).json({ ok: true });
  });
  app.get('/api/storage/:key', (req, res, next) => {
    try {
      if (req.params.key === INTERNAL) throw problem(403, 'forbidden', 'Reserved storage key.');
      const store = repository.read(), key = req.params.key;
      res.set('Cache-Control', 'no-store').set('ETag', etag(store[key]));
      if (!Object.hasOwn(store, key)) return res.status(404).json({ error: 'not found' });
      res.json({ key, value: store[key] });
    } catch (error) { next(error); }
  });
  app.get('/api/storage', (req, res, next) => {
    try { res.set('Cache-Control', 'no-store').json({ keys: repository.keys().filter(key => key.startsWith(req.query.prefix || '')) }); }
    catch (error) { next(error); }
  });
  app.put('/api/storage/:key', (req, res, next) => {
    const { key } = req.params, value = req.body?.value;
    if (typeof value !== 'string') return res.status(400).json({ error: 'value must be a string' });
    repository.set(key, value, req.get('If-Match')).then(result => res.set('ETag', result.etag).json({ key, value }), next);
  });
  app.delete('/api/storage/:key', (req, res, next) => {
    repository.delete(req.params.key, req.get('If-Match')).then(deleted => res.json({ key: req.params.key, deleted }), next);
  });
  app.use(express.static(path.join(__dirname, 'public')));
  app.use((error, req, res, next) => {
    if (!error.status || error.status >= 500) console.error('Storage request failed');
    res.status(error.status || 500).json({ error: error.status && error.status < 500 ? error.message : 'Internal server error.' });
  });
  return app;
}

if (require.main === module) {
  createApp().then(app => {
    const port = process.env.PORT || 3000;
    app.listen(port, () => console.log(`WorkTracker running at http://localhost:${port}`));
  }).catch(error => { console.error('Startup failed:', error.message); process.exitCode = 1; });
}
module.exports = { createApp };
