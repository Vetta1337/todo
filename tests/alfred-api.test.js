const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createApp } = require('../server');
const { migrate } = require('../migrations/001-alfred-events');
const { StoreRepository, ISSUE_KEY, INTERNAL, etag } = require('../lib/store-repository');

async function fixture(t, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alfred-test-'));
  const file = path.join(dir, 'store.json');
  migrate(file);
  const token = crypto.randomBytes(32).toString('hex');
  const repository = new StoreRepository(file);
  const appOptions = { repository, secret: 'test-session-secret', password: 'test-password', basePath: '/todo', cabin: false,
    apiToken: token, apiScopes: 'read,write,delete', now: () => new Date('2026-10-05T12:00:00.000Z'), ...options };
  const app = await createApp(appOptions);
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  t.after(() => { server.closeAllConnections(); server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}/todo`;
  async function request(route, { method = 'GET', body, auth = token, headers = {}, legacy = false, raw } = {}) {
    const response = await fetch(base + (legacy ? '' : '/api/v1') + route, { method, headers: {
      ...(auth ? { Authorization: 'Bearer ' + auth } : {}), ...((body !== undefined || raw !== undefined) ? { 'Content-Type': 'application/json' } : {}), ...headers
    }, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)), redirect: 'manual' });
    const text = await response.text();
    return { status: response.status, data: text ? JSON.parse(text) : null, headers: response.headers };
  }
  async function cookie() {
    return (await request('/api/login', { legacy: true, auth: null, method: 'POST', body: { password: 'test-password' } })).headers.get('set-cookie').split(';')[0];
  }
  async function create(body = {}) { return request('/todos', { method: 'POST', body: { title: 'Example TODO', ...body } }); }
  return { dir, file, repository, token, request, cookie, create, appOptions };
}

test('Every integration route rejects missing/invalid tokens, regardless of browser cookies', async t => {
  const f = await fixture(t), cookie = await f.cookie();
  for (const [method, route] of [['GET', '/todos'], ['GET', '/todos/x'], ['POST', '/todos'], ['PATCH', '/todos/x'], ['DELETE', '/todos/x'], ['GET', '/events'], ['GET', '/metadata']]) {
    for (const auth of [null, 'wrong-token']) {
      const response = await f.request(route, { method, auth, headers: { Cookie: cookie } });
      assert.equal(response.status, 401); assert.equal(response.data.error.code, 'unauthenticated');
    }
  }
  assert.equal((await f.request('/todos')).status, 200);
  assert.equal((await f.request('/api/storage', { legacy: true })).status, 401, 'service token cannot access browser storage');
  assert.equal((await f.request('/todos?user_id=another-user')).status, 400);
  assert.equal((await f.create({ userId: 'another-user' })).status, 400);
});

test('Disabled integration and least-privilege scopes fail closed', async t => {
  const disabled = await fixture(t, { apiToken: '' });
  assert.equal((await disabled.request('/todos')).status, 401);
  const readOnly = await fixture(t, { apiScopes: 'read' });
  assert.equal((await readOnly.create()).status, 403);
  assert.equal((await readOnly.request('/todos/x', { method: 'DELETE' })).status, 403);
  const defaults = await fixture(t, { apiScopes: 'read,write' });
  const item = await defaults.create(); assert.equal(item.status, 201);
  assert.equal((await defaults.request('/todos/' + item.data.data.id, { method: 'DELETE' })).status, 403);
});

test('CRUD, completion, uncompletion, metadata, conditional writes and durable tombstones', async t => {
  const f = await fixture(t);
  const start = (await f.request('/events?cursor=latest')).data.page.next_cursor;
  const created = await f.create({ projectId: 'maximo', dueDate: '2026-10-06', tags: ['bug'], links: [{ provider: 'URL', url: 'https://example.com/task' }] });
  assert.equal(created.status, 201);
  const id = created.data.data.id;
  assert.equal(created.data.data.customerId, 'banenor');
  assert.equal(created.data.data.createdAt, '2026-10-05T12:00:00.000Z');
  assert.equal(created.data.data.completed, false);
  const get = await f.request('/todos/' + id); assert.deepEqual(get.data.data, created.data.data);
  assert.equal(get.headers.get('etag'), created.headers.get('etag'));
  assert.equal((await f.request('/metadata')).data.data.timezone, 'UTC');
  let result = await f.request('/todos/' + id, { method: 'PATCH', headers: { 'If-Match': get.headers.get('etag') }, body: { title: 'Changed', notes: 'Private notes' } });
  assert.equal(result.status, 200);
  assert.equal((await f.request('/todos/' + id, { method: 'PATCH', headers: { 'If-Match': get.headers.get('etag') }, body: { title: 'Stale' } })).status, 409);
  result = await f.request('/todos/' + id, { method: 'PATCH', body: { status: 'done' } }); assert.equal(result.data.data.completed, true);
  await f.request('/todos/' + id, { method: 'PATCH', body: { status: 'done' } }); // no-op
  result = await f.request('/todos/' + id, { method: 'PATCH', body: { status: 'ready' } }); assert.equal(result.data.data.completed, false);
  assert.equal((await f.request('/todos/' + id, { method: 'DELETE', headers: { 'If-Match': get.headers.get('etag') } })).status, 409);
  assert.equal((await f.request('/todos/' + id, { method: 'DELETE' })).status, 204);
  assert.equal((await f.request('/todos/' + id)).status, 404);
  assert.equal((await f.request('/todos/' + id, { method: 'DELETE' })).status, 404);
  const events = (await f.request('/events?cursor=' + encodeURIComponent(start))).data;
  assert.deepEqual(events.data.map(event => event.type), ['todo.created', 'todo.updated', 'todo.completed', 'todo.uncompleted', 'todo.deleted']);
  assert.equal(new Set(events.data.map(event => event.id)).size, 5);
  assert.equal(events.data.every(event => event.todo_id === id && event.source === 'alfred'), true);
  assert.equal(JSON.stringify(events).includes('Private notes'), false);
  assert.equal((await f.request('/events?cursor=' + encodeURIComponent(events.page.next_cursor))).data.data.length, 0);
  assert.equal(new StoreRepository(f.file).read()[INTERNAL].events.length, 5);
});

test('Filters, stable pagination, cursor tampering and date semantics', async t => {
  const f = await fixture(t);
  await f.create({ title: 'Overdue', dueDate: '2026-10-04' });
  await f.create({ title: 'Today', dueDate: '2026-10-05', register: 'private', priority: 'high' });
  await f.create({ title: 'Done', dueDate: '2026-10-03', status: 'done' });
  await f.create({ title: 'Archived', dueDate: '2026-10-03', status: 'archived' });
  await f.create({ title: 'No deadline' });
  const list = async query => (await f.request('/todos?' + query)).data.data;
  assert.deepEqual((await list('overdue=true')).map(item => item.title), ['Overdue']);
  assert.deepEqual((await list('completed=true')).map(item => item.title), ['Done']);
  assert.equal((await list('completed=false')).length, 4); // archived isn't completed
  assert.deepEqual((await list('due_today=true')).map(item => item.title), ['Today']);
  assert.equal((await list('due_from=2026-10-04&due_to=2026-10-05')).length, 2);
  assert.equal((await list('register=private&priority=high')).length, 1);
  assert.equal((await list('status=inbox')).length, 3);
  assert.equal((await list('updated_since=2026-10-05T11%3A59%3A59Z')).length, 5);
  assert.equal((await list('updated_since=2026-10-05T12%3A00%3A00Z')).length, 0);
  let cursor = null; const ids = [];
  do {
    const result = await f.request('/todos?limit=2' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
    assert.equal(result.status, 200); ids.push(...result.data.data.map(item => item.id)); cursor = result.data.page.next_cursor;
  } while (cursor);
  assert.equal(ids.length, 5); assert.equal(new Set(ids).size, 5);
  assert.deepEqual(ids, [...ids].sort());
  const page = await f.request('/todos?limit=1&completed=false');
  assert.equal((await f.request('/todos?completed=true&cursor=' + page.data.page.next_cursor)).status, 400);
  assert.equal((await f.request('/events?cursor=' + page.data.page.next_cursor)).status, 400);
  assert.equal((await f.request('/todos?cursor=tampered')).status, 400);
});

test('Validation rejects unknown fields, malformed dates/JSON, oversized bodies, and invalid references', async t => {
  const f = await fixture(t);
  for (const patch of [{ title: '' }, { status: 'fake' }, { priority: null }, { register: 'other' }, { dueDate: '2026-02-30' }, { dueDate: 1 }, { projectId: 'maximo', register: 'private' }, { customerId: 'unknown' }, { tags: ['bug', 'bug'] }, { tags: ['unknown'] }, { createdAt: '2026-01-01' }, { attachments: [] }, { links: [{ provider: 'URL', url: 'javascript:alert(1)' }] }, { status: null }]) {
    assert.equal((await f.create(patch)).status, 400, JSON.stringify(patch));
  }
  for (const query of ['limit=0', 'limit=201', 'completed=1', 'due_from=2026-02-30', 'due_from=2026-10-06&due_to=2026-10-01', 'updated_since=2026-10-05', 'updated_since=2026-02-30T00:00:00Z', 'limit=1&limit=2', 'owner=x']) assert.equal((await f.request('/todos?' + query)).status, 400, query);
  assert.equal((await f.request('/todos', { method: 'POST', raw: '{broken' })).data.error.code, 'invalid_json');
  assert.equal((await f.request('/todos', { method: 'POST', body: [] })).status, 400);
  assert.equal((await f.request('/todos', { method: 'POST', body: { title: 'x', notes: 'a'.repeat(300000) } })).status, 413);
  assert.equal((await f.request('/unknown')).status, 404);
  const result = await f.create();
  const id = result.data.data.id;
  await f.request('/todos/' + id, { method: 'PATCH', body: { dueDate: null, customerId: null, projectId: null, tags: [] } });
  assert.equal((await f.request('/todos/' + id)).data.data.dueDate, null);
});

test('UI changes generate events; stale whole-array writes cannot erase ALFRED edits', async t => {
  const f = await fixture(t), cookie = await f.cookie();
  const headers = { Cookie: cookie };
  await f.create();
  const readUi = () => f.request('/api/storage/wt%3Aissues', { legacy: true, auth: null, headers });
  const saveUi = (items, version) => f.request('/api/storage/wt%3Aissues', { legacy: true, auth: null, method: 'PUT', headers: { ...headers, 'If-Match': version }, body: { value: JSON.stringify(items) } });
  const baseline = await readUi(), items = JSON.parse(baseline.data.value);
  await f.request('/todos/' + items[0].id, { method: 'PATCH', body: { title: 'ALFRED changed this' } });
  assert.equal((await saveUi(items, baseline.headers.get('etag'))).status, 409);
  const fresh = await readUi(), current = JSON.parse(fresh.data.value);
  current[0].status = 'done';
  let saved = await saveUi(current, fresh.headers.get('etag')); assert.equal(saved.status, 200);
  const seq = f.repository.read()[INTERNAL].sequence;
  saved = await saveUi(current, saved.headers.get('etag')); assert.equal(saved.status, 200);
  assert.equal(f.repository.read()[INTERNAL].sequence, seq, 'identical whole-array saves do not emit events');
  current[0].status = 'inbox';
  saved = await saveUi(current, saved.headers.get('etag'));
  const empty = await saveUi([], saved.headers.get('etag')); assert.equal(empty.status, 200);
  await saveUi(current, empty.headers.get('etag')); // UI undo deletion
  const events = f.repository.read()[INTERNAL].events.filter(event => event.source === 'ui');
  assert.deepEqual(events.map(event => event.type), ['todo.completed', 'todo.uncompleted', 'todo.deleted', 'todo.created']);
  assert.equal((await f.request('/api/storage/_alfred', { legacy: true, headers })).status, 403);
  assert.equal((await f.request('/api/storage', { legacy: true, headers })).data.keys.includes('_alfred'), false);
  assert.equal((await f.request('/api/storage/_alfred', { legacy: true, method: 'PUT', headers, body: { value: '{}' } })).status, 403);
  assert.equal((await f.request('/api/storage/wt%3Aissues', { legacy: true, method: 'PUT', headers, body: { value: '[]' } })).status, 409);
});

test('Concurrent commits, event page replay, high-water initialization and metadata changes', async t => {
  const f = await fixture(t);
  const checkpoint = (await f.request('/events?cursor=latest')).data.page.next_cursor;
  const created = await Promise.all(Array.from({ length: 12 }, (_, i) => f.create({ title: 'Task ' + i })));
  assert.equal(created.every(item => item.status === 201), true);
  const first = await f.request('/events?limit=3&cursor=' + checkpoint);
  assert.deepEqual(first.data, (await f.request('/events?limit=3&cursor=' + checkpoint)).data);
  let cursor = checkpoint; const all = [];
  do {
    const page = (await f.request('/events?limit=3&cursor=' + cursor)).data;
    all.push(...page.data); cursor = page.page.next_cursor;
    if (!page.page.has_more) break;
  } while (true);
  assert.equal(all.length, 12); assert.equal(new Set(all.map(item => item.id)).size, 12);
  await f.repository.set('wt:tags', JSON.stringify([{ id: 'new-tag', name: 'New tag' }]));
  const changes = (await f.request('/events?cursor=' + cursor)).data;
  assert.equal(changes.data[0].type, 'metadata.updated');
  assert.equal(changes.data[0].resource, 'tags');
  const reopened = new StoreRepository(f.file);
  assert.deepEqual(reopened.read()[INTERNAL].events, f.repository.read()[INTERNAL].events);
  const restartedApp = await createApp({ ...f.appOptions, repository: reopened });
  const restarted = await new Promise(resolve => { const server = restartedApp.listen(0, '127.0.0.1', () => resolve(server)); });
  try {
    const response = await fetch(`http://127.0.0.1:${restarted.address().port}/todo/api/v1/events?cursor=${cursor}`, { headers: { Authorization: 'Bearer ' + f.token } });
    assert.deepEqual(await response.json(), changes, 'saved cursor replays identically after application restart');
  } finally { restarted.closeAllConnections(); restarted.close(); }
  migrate(f.file, { resetSync: true });
  assert.equal((await f.request('/events?cursor=' + cursor)).data.error.code, 'sync_reset_required');
});

test('Failed commits leave both data and events unchanged; internal errors contain no secrets', async t => {
  const f = await fixture(t);
  const initial = fs.readFileSync(f.file, 'utf8');
  await assert.rejects(f.repository.transaction('test', store => { store[ISSUE_KEY] = '[]'; throw new Error('no commit'); }));
  assert.equal(fs.readFileSync(f.file, 'utf8'), initial);
  const rename = fs.renameSync;
  fs.renameSync = (source, destination) => {
    if (destination === f.file) throw new Error('Simulated filesystem commit failure');
    return rename(source, destination);
  };
  try {
    assert.equal((await f.create()).status, 500);
    assert.equal(fs.readFileSync(f.file, 'utf8'), initial, 'a failed atomic replacement must not commit data or events');
  } finally { fs.renameSync = rename; }
  const real = f.repository.transaction.bind(f.repository);
  f.repository.transaction = () => Promise.reject(new Error('internal path and database credentials: SECRET'));
  const result = await f.create();
  assert.equal(result.status, 500); assert.equal(result.data.error.message, 'Internal server error.');
  assert.equal(JSON.stringify(result.data).includes('SECRET'), false);
  f.repository.transaction = real;
  assert.equal((await f.create()).status, 201);
});

test('Migration preserves existing data, makes a backup, and is repeatable', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alfred-migration-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'store.json'), original = { 'wt:issues': '[]', 'wt:tags': '[]' };
  fs.writeFileSync(file, JSON.stringify(original));
  assert.throws(() => new StoreRepository(file), /migrate:alfred/);
  const first = migrate(file); assert.equal(first.changed, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(first.backup, 'utf8')), original);
  const migrated = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(migrated['wt:issues'], original['wt:issues']);
  assert.equal(migrate(file).changed, false);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8'))[INTERNAL].epoch, migrated[INTERNAL].epoch);
});
