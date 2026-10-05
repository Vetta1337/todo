const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');

const INTERNAL = '_alfred';
const ISSUE_KEY = 'wt:issues';
const METADATA_KEYS = ['wt:statuses', 'wt:priorities', 'wt:customers', 'wt:projects', 'wt:tags'];
function problem(status, code, message) { return Object.assign(new Error(message), { status, code }); }
function atomicWrite(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.' + crypto.randomUUID() + '.tmp';
  try {
    const fd = fs.openSync(temporary, 'wx', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(data)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temporary, file);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
function parseArray(store, key) {
  const items = Object.hasOwn(store, key) ? JSON.parse(store[key]) : [];
  if (!Array.isArray(items)) throw problem(400, 'invalid_storage', key + ' must contain an array.');
  return items;
}
function validateIssues(issues) {
  const ids = new Set();
  for (const item of issues) {
    if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id)) throw problem(400, 'invalid_storage', 'TODO IDs must be present and unique.');
    ids.add(item.id);
  }
}
function etag(value) { return '"' + crypto.createHash('sha256').update(JSON.stringify(value) ?? 'missing').digest('hex') + '"'; }

class StoreRepository {
  constructor(file) {
    this.file = file;
    this.queue = Promise.resolve();
    this.read();
  }
  read() {
    const stat = fs.statSync(this.file, { bigint: true });
    const stamp = `${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
    if (this.cache && this.stamp === stamp) return this.cache;
    const store = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    if (store[INTERNAL]?.version !== 1) throw new Error('Run npm run migrate:alfred with the service stopped before starting this version.');
    this.cache = store;
    this.stamp = stamp;
    return store;
  }
  // One process owns this repository. Both HTTP APIs use this same queue and file.
  transaction(source, mutate) {
    const job = this.queue.then(() => {
      const store = structuredClone(this.read());
      const before = parseArray(store, ISSUE_KEY);
      const metadataBefore = Object.fromEntries(METADATA_KEYS.map(key => [key, store[key]]));
      const result = mutate(store);
      const after = parseArray(store, ISSUE_KEY);
      validateIssues(after);
      const journal = store[INTERNAL];
      const now = new Date().toISOString();
      const emit = event => {
        journal.sequence++;
        journal.events.push({ id: journal.epoch + ':' + journal.sequence, sequence: journal.sequence, occurred_at: now, source, ...event });
      };
      const oldById = new Map(before.map(item => [item.id, item]));
      const newById = new Map(after.map(item => [item.id, item]));
      for (const item of after) {
        const old = oldById.get(item.id);
        if (old && isDeepStrictEqual(old, item)) continue;
        let type = old ? 'todo.updated' : 'todo.created';
        if (old && old.status !== 'done' && item.status === 'done') type = 'todo.completed';
        if (old && old.status === 'done' && item.status !== 'done') type = 'todo.uncompleted';
        const changed = old ? [...new Set([...Object.keys(old), ...Object.keys(item)])].filter(key => !isDeepStrictEqual(old[key], item[key])) : Object.keys(item);
        emit({ type, todo_id: item.id, register: item.register || 'work', status: item.status,
          previous_status: old?.status || null, changed_fields: changed });
      }
      for (const old of before) {
        if (!newById.has(old.id)) emit({ type: 'todo.deleted', todo_id: old.id, register: old.register || 'work', status: null, previous_status: old.status, changed_fields: [] });
      }
      for (const key of METADATA_KEYS) {
        if (store[key] !== metadataBefore[key]) emit({ type: 'metadata.updated', resource: key.slice(3) });
      }
      // Data and events are replaced together: failed writes commit neither.
      atomicWrite(this.file, store);
      return result;
    });
    this.queue = job.catch(() => {});
    return job;
  }
  get(key) { return this.read()[key]; }
  keys() { return Object.keys(this.read()).filter(key => key !== INTERNAL); }
  set(key, value, expected) {
    return this.transaction('ui', store => {
      this.checkLegacyVersion(store, key, expected);
      if (key === ISSUE_KEY || METADATA_KEYS.includes(key)) {
        try { if (!Array.isArray(JSON.parse(value))) throw new Error(); }
        catch { throw problem(400, 'invalid_storage', 'Expected a JSON array.'); }
      }
      store[key] = value;
      return { key, value, etag: etag(value) };
    });
  }
  delete(key, expected) {
    return this.transaction('ui', store => {
      this.checkLegacyVersion(store, key, expected);
      const existed = Object.hasOwn(store, key);
      delete store[key];
      return existed;
    });
  }
  checkLegacyVersion(store, key, expected) {
    if (key === INTERNAL || ['__proto__', 'constructor', 'prototype'].includes(key)) throw problem(403, 'forbidden', 'Reserved storage key.');
    if (key === ISSUE_KEY && expected !== etag(store[key])) {
      throw problem(409, 'conflict', 'TODOs changed or this browser is out of date. Reload before saving to avoid overwriting changes.');
    }
  }
}
module.exports = { StoreRepository, atomicWrite, parseArray, validateIssues, etag, problem, INTERNAL, ISSUE_KEY, METADATA_KEYS };
