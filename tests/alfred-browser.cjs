const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { createApp } = require('../server');
const { migrate } = require('../migrations/001-alfred-events');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.join(process.env.TEMP, 'wishlist-multiuser-v1/node_modules/playwright'));
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alfred-browser-'));
  const dataFile = path.join(dir, 'store.json'); migrate(dataFile);
  const token = crypto.randomBytes(32).toString('hex');
  const app = await createApp({ dataFile, apiToken: token, secret: 'test-secret', password: 'test-password', basePath: '/todo', cabin: false });
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
    const page = await browser.newPage();
    const errors = [], dialogs = [];
    page.on('pageerror', error => { errors.push(error.message); console.error('Browser error:', error.message); });
    page.on('requestfailed', request => console.error('Request failed:', request.url(), request.failure()?.errorText));
    page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });
    const base = `http://127.0.0.1:${server.address().port}/todo`;
    await page.goto(base + '/login.html');
    await page.locator('#password').fill('test-password');
    await page.locator('#submitBtn').click();
    await page.getByRole('heading', { name: /Work card overview/ }).waitFor();
    await page.getByRole('button', { name: '+ New issue' }).click();
    await page.getByPlaceholder('Title (use | to add multiple)').fill('Browser regression task');
    await page.getByPlaceholder('Title (use | to add multiple)').press('Enter');
    await page.getByRole('button', { name: 'Close', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    const id = await page.evaluate(async () => {
      const store = await import('/todo/js/store.js');
      return store.db.issues.find(item => item.title === 'Browser regression task').id;
    });
    assert.ok(id);
    await page.evaluate(async id => {
      const store = await import('/todo/js/store.js');
      await Promise.all([store.updateIssue(id, { priority: 'high' }), store.updateIssue(id, { dueDate: '2026-12-01' })]);
    }, id);
    const auth = { Authorization: 'Bearer ' + token };
    let response = await page.request.get(base + '/api/v1/todos/' + id, { headers: auth });
    let todo = (await response.json()).data;
    assert.equal(todo.priority, 'high'); assert.equal(todo.dueDate, '2026-12-01');
    const card = page.locator('.board-card').filter({ hasText: 'Browser regression task' });
    await card.dragTo(page.locator('.board-column[aria-label="Done"]'));
    await page.waitForFunction(async id => {
      const store = await import('/todo/js/store.js'); return store.db.issues.find(item => item.id === id).status === 'done';
    }, id);
    await page.waitForFunction(async () => {
      const response = await fetch('/todo/api/storage/wt%3Aissues');
      const data = await response.json(); return JSON.parse(data.value).some(item => item.title === 'Browser regression task' && item.status === 'done');
    });
    assert.deepEqual(dialogs, []);
    await page.request.patch(base + '/api/v1/todos/' + id, { headers: auth, data: { title: 'Changed by ALFRED' } });
    const saved = await page.evaluate(async id => (await import('/todo/js/store.js')).updateIssue(id, { title: 'Stale browser change' }), id);
    assert.equal(saved, false);
    assert.equal(dialogs.length, 1); assert.match(dialogs[0], /Reload/);
    response = await page.request.get(base + '/api/v1/todos/' + id, { headers: auth });
    assert.equal((await response.json()).data.title, 'Changed by ALFRED');
    await page.reload();
    await page.getByRole('button', { name: 'Changed by ALFRED', exact: true }).waitFor();
    await page.getByRole('tab', { name: 'private', exact: true }).click();
    await page.getByRole('heading', { name: /Private card overview/ }).waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS: browser login, creation, serialized updates, drag-and-drop completion, ALFRED visibility, stale-write protection, reload and register switching.');
  } finally { if (browser) await browser.close(); server.closeAllConnections(); server.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
