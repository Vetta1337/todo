// Offline, idempotent migration. Stop all writers before running.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { atomicWrite, validateIssues, parseArray, INTERNAL, ISSUE_KEY } = require('../lib/store-repository');

function migrate(file, { resetSync = false } = {}) {
  const exists = fs.existsSync(file);
  const store = exists ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  if (store[INTERNAL]?.version === 1 && !resetSync) return { changed: false };
  if (Object.hasOwn(store, INTERNAL) && store[INTERNAL]?.version !== 1) throw new Error('Reserved migration key already exists with an unsupported version.');
  validateIssues(parseArray(store, ISSUE_KEY));
  const backup = exists ? file + '.before-alfred-' + Date.now() + '-' + crypto.randomUUID() + '.bak' : null;
  if (backup) fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL);
  store[INTERNAL] = { version: 1, epoch: crypto.randomUUID(), sequence: 0, events: [], initialized_at: new Date().toISOString() };
  atomicWrite(file, store);
  return { changed: true, backup };
}
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    const file = path.resolve(args.find(arg => arg !== '--reset-sync') || path.join(__dirname, '..', 'data', 'store.json'));
    console.log(JSON.stringify(migrate(file, { resetSync: args.includes('--reset-sync') })));
  } catch (error) { console.error('Migration failed:', error.message); process.exitCode = 1; }
}
module.exports = { migrate };
