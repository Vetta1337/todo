const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const createRouter = require('../hytte');

test('Cabin booking, visits, privacy and administration', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hytte-test-'));
  const app = express();
  app.use('/hytte', createRouter({ dataFile: path.join(dir, 'data.json'), password: 'test-password', now: () => new Date('2026-10-10T14:00:00Z') }));
  const server = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
  t.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}/hytte`;
  let cookie = '';
  async function request(route, method = 'GET', body, admin = false) {
    const response = await fetch(base + '/api/' + route, { method, headers: { 'Content-Type': 'application/json', 'X-Hytte-Request': '1', ...(admin ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie') };
  }
  const booking = { name: 'Ola Nordmann', start: '2026-10-10', end: '2026-10-12' };
  let id, code, visit;
  await t.test('Public pages load and admin data requires authentication', async () => {
    assert.equal((await fetch(base + '/')).status, 200);
    assert.equal((await fetch(base + '/admin')).status, 200);
    assert.equal((await request('admin')).status, 401);
    assert.equal((await fetch(base + '/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(booking) })).status, 403);
  });
  await t.test('Booking requires only full name and valid dates', async () => {
    for (const patch of [{ name: 'Ola' }, { start: '2026-10-09' }, { end: '2026-10-10' }, { start: '2026-02-30' }]) {
      assert.equal((await request('bookings', 'POST', { ...booking, ...patch })).status, 400);
    }
    const result = await request('bookings', 'POST', booking);
    assert.equal(result.status, 201); id = result.data.booking.id; code = result.data.code;
    assert.match(code, /^[0-9]{6}$/);
    assert.equal(JSON.stringify(result.data).includes('codeHash'), false);
  });
  await t.test('Overlapping bookings fail; checkout and arrival on the same day work', async () => {
    assert.equal((await request('bookings', 'POST', { ...booking, start: '2026-10-11', end: '2026-10-13' })).status, 409);
    assert.equal((await request('bookings', 'POST', { ...booking, start: '2026-10-12', end: '2026-10-13' })).status, 201);
    const concurrent = await Promise.all([request('bookings', 'POST', { ...booking, start: '2026-10-15', end: '2026-10-17' }), request('bookings', 'POST', { ...booking, start: '2026-10-15', end: '2026-10-17' })]);
    assert.deepEqual(concurrent.map(item => item.status).sort(), [201, 409]);
  });
  await t.test('Visit requires code and all checklist answers', async () => {
    assert.equal((await request('visit', 'POST', { code: 'wrong' })).status, 404);
    visit = (await request('visit', 'POST', { code })).data;
    assert.equal('code' in visit.booking, false);
    assert.equal('legacyCodeHash' in visit.booking, false);
    assert.equal((await request('visit/departure', 'POST', { code, answers: [] })).status, 400);
    assert.equal((await request('visit/arrival', 'POST', { code, answers: [] })).status, 409);
    const answers = visit.questions.arrival.map(question => ({ id: question.id, value: 'yes' }));
    answers[0].value = 'no';
    assert.equal((await request('visit/arrival', 'POST', { code, answers })).status, 400);
    answers[0].note = 'En lampe er ødelagt.';
    const result = await request('visit/arrival', 'POST', { code, answers, note: 'Privat merknad til admin' });
    assert.equal(result.status, 200); visit = result.data;
    assert.equal((await request('visit/arrival', 'POST', { code, answers })).status, 409);
  });
  await t.test('Calendar exposes names and dates, never codes or visit notes', async () => {
    const result = await request('calendar');
    const text = JSON.stringify(result.data);
    assert.equal(result.data.bookings.find(item => item.id === id).name, 'Ola Nordmann');
    for (const secret of [code, 'codeHash', 'Privat merknad', 'ødelagt', 'answers']) assert.equal(text.includes(secret), false);
  });
  await t.test('Admin login, checklist edits and immutable historical questions', async () => {
    assert.equal((await request('admin/login', 'POST', { password: 'wrong' })).status, 401);
    const login = await request('admin/login', 'POST', { password: 'test-password' });
    assert.equal(login.status, 200); cookie = login.cookie.split(';')[0];
    assert.match(login.cookie, /HttpOnly/); assert.match(login.cookie, /SameSite=Strict/);
    assert.equal((await request('admin/bookings/' + id, 'DELETE', {})).status, 401);
    assert.equal((await request('admin/questions', 'PUT', { arrival: [], departure: [] }, true)).status, 400);
    assert.equal((await request('admin/questions', 'PUT', { arrival: ['Nytt ankomstspørsmål?'], departure: ['Har du låst?'] }, true)).status, 200);
    const admin = (await request('admin', 'GET', null, true)).data;
    assert.equal(admin.bookings.find(item => item.id === id).code, code);
    assert.equal(new Set(admin.bookings.map(item => item.code)).size, admin.bookings.length);
    assert.equal(admin.bookings.find(item => item.id === id).arrival.answers[0].text, visit.booking.arrival.answers[0].text);
    assert.equal(JSON.stringify(admin).includes('codeHash'), false);
    assert.equal((await request('visit/departure', 'POST', { code, answers: visit.questions.departure.map(question => ({ id: question.id, value: 'yes' })) })).status, 409);
    visit = (await request('visit', 'POST', { code })).data;
  });
  await t.test('Departure is logged, cancellation frees dates and keeps visit history', async () => {
    assert.equal((await request('visit/departure', 'POST', { code, answers: visit.questions.departure.map(question => ({ id: question.id, value: 'yes' })) })).status, 200);
    assert.equal((await request('admin/bookings/' + id, 'DELETE', {}, true)).status, 200);
    assert.equal((await request('calendar')).data.bookings.some(item => item.id === id), false);
    const admin = (await request('admin', 'GET', null, true)).data;
    assert.ok(admin.bookings.find(item => item.id === id).departure);
    assert.equal((await request('bookings', 'POST', booking)).status, 201);
  });
  await t.test('Admin can replace a lost visit code and logout invalidates session', async () => {
    const result = await request('bookings', 'POST', { ...booking, start: '2026-10-20', end: '2026-10-21' });
    const replacement = await request('admin/bookings/' + result.data.booking.id + '/code', 'POST', {}, true);
    assert.equal(replacement.status, 200);
    assert.match(replacement.data.code, /^[0-9]{6}$/);
    assert.notEqual(replacement.data.code, result.data.code);
    assert.equal((await request('visit', 'POST', { code: result.data.code })).status, 404);
    const future = (await request('visit', 'POST', { code: replacement.data.code })).data;
    assert.equal((await request('visit/arrival', 'POST', { code: replacement.data.code, answers: future.questions.arrival.map(question => ({ id: question.id, value: 'yes' })) })).status, 400);
    await request('admin/logout', 'POST', {}, true);
    assert.equal((await request('admin', 'GET', null, true)).status, 401);
  });
});

test('Legacy booking codes migrate without losing access and persist across restart', async t => {
  const crypto = require('node:crypto');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hytte-migration-'));
  const dataFile = path.join(dir, 'data.json');
  const legacy = 'ABCDEF1234567890';
  fs.writeFileSync(dataFile, JSON.stringify({ questions: { arrival: [], departure: [] }, bookings: [{ id: 'legacy', name: 'Kari Nordmann', start: '2026-10-10', end: '2026-10-12', codeHash: crypto.createHash('sha256').update(legacy).digest('hex') }] }));
  const app = express();
  app.use('/hytte', createRouter({ dataFile, password: 'test-password' }));
  const migrated = JSON.parse(fs.readFileSync(dataFile, 'utf8')).bookings[0];
  assert.match(migrated.code, /^[0-9]{6}$/);
  createRouter({ dataFile, password: 'test-password' });
  assert.equal(JSON.parse(fs.readFileSync(dataFile, 'utf8')).bookings[0].code, migrated.code);
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  t.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const url = `http://127.0.0.1:${server.address().port}/hytte/api/visit`;
  for (const code of [legacy, migrated.code]) {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hytte-Request': '1' }, body: JSON.stringify({ code }) });
    assert.equal(response.status, 200);
    const { booking } = await response.json();
    assert.equal(booking.id, 'legacy');
    for (const field of ['code', 'codeHash', 'legacyCodeHash']) assert.equal(field in booking, false);
  }
  for (let attempt = 0; attempt < 15; attempt++) {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hytte-Request': '1' }, body: JSON.stringify({ code: 'invalid' }) });
  }
  const blocked = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hytte-Request': '1' }, body: JSON.stringify({ code: migrated.code }) });
  assert.equal(blocked.status, 429);
});
