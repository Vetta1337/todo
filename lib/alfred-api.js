const express = require('express');
const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { parseArray, etag, problem, INTERNAL, ISSUE_KEY } = require('./store-repository');

const FIELDS = ['title', 'description', 'notes', 'status', 'priority', 'register', 'customerId', 'projectId', 'tags', 'dueDate', 'links'];
const FILTERS = ['status', 'completed', 'register', 'priority', 'customer_id', 'project_id', 'due_from', 'due_to', 'due_today', 'overdue', 'updated_since'];
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const bad = message => { throw problem(400, 'invalid_request', message); };
function date(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) bad(label + ' must be a valid YYYY-MM-DD date.');
  return value;
}
function boolean(value, label) {
  if (!['true', 'false'].includes(value)) bad(label + ' must be true or false.');
  return value === 'true';
}
function keys(object, allowed) {
  for (const key of Object.keys(object)) if (!allowed.includes(key)) bad('Unsupported field: ' + key);
}
function query(req, allowed) {
  keys(req.query, allowed);
  for (const value of Object.values(req.query)) if (typeof value !== 'string') bad('Query parameters must occur once and be strings.');
}
function limit(value) {
  if (value === undefined) return 100;
  if (!/^[1-9]\d*$/.test(value) || Number(value) > 200) bad('limit must be between 1 and 200.');
  return Number(value);
}
function todoDto(issue) {
  const timestamp = value => new Date(value).toISOString();
  return {
    id: issue.id, title: issue.title, description: issue.description || '', notes: issue.notes || '',
    status: issue.status, completed: issue.status === 'done', priority: issue.priority,
    register: issue.register || 'work', customerId: issue.customerId || null, projectId: issue.projectId || null,
    tags: issue.tags || [], dueDate: issue.dueDate || null, createdAt: timestamp(issue.createdAt), updatedAt: timestamp(issue.updatedAt),
    links: (issue.links || []).map(link => ({ provider: link.provider, url: link.url })),
    attachments: (issue.attachments || []).map(item => ({ name: item.name, size: item.size, type: item.type }))
  };
}

function todoSummary(issue) {
  const { description, notes, links, attachments, ...summary } = todoDto(issue);
  return summary;
}

function createAlfredApi({ repository, domain, defaults, secret, token = '', scopes = 'read,write', now = () => new Date() }) {
  const router = express.Router();
  if (token && !/^[a-fA-F0-9]{64}$/.test(token)) throw new Error('ALFRED_API_TOKEN must be a random 32-byte token encoded as 64 hexadecimal characters.');
  const permissions = new Set(scopes.split(',').map(s => s.trim()).filter(Boolean));
  if ([...permissions].some(s => !['read', 'write', 'delete'].includes(s))) throw new Error('Invalid ALFRED_API_SCOPES; use read,write,delete.');
  const tokenDigest = crypto.createHash('sha256').update(token).digest();
  const mac = text => crypto.createHmac('sha256', secret).update('alfred-v1:' + text).digest();
  const encode = payload => { const data = Buffer.from(JSON.stringify(payload)).toString('base64url'); return data + '.' + mac(data).toString('base64url'); };
  function decode(cursor, kind, store) {
    try {
      if (cursor.length > 4096) bad('Invalid cursor.');
      const parts = cursor.split('.');
      const sig = Buffer.from(parts[1] || '', 'base64url');
      if (parts.length !== 2 || sig.length !== 32 || !crypto.timingSafeEqual(mac(parts[0]), sig)) bad('Invalid cursor.');
      const data = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
      if (data.kind !== kind) bad('Wrong cursor type.');
      if (data.epoch !== store[INTERNAL].epoch) throw problem(409, 'sync_reset_required', 'The sync generation changed. Perform a fresh initial sync.');
      return data;
    } catch (error) { if (error.status) throw error; bad('Invalid cursor.'); }
  }
  const checkpoint = (store, seq) => encode({ kind: 'events', epoch: store[INTERNAL].epoch, seq });
  const config = store => Object.fromEntries(['statuses', 'priorities', 'customers', 'projects', 'tags'].map(kind => [kind,
    Object.hasOwn(store, 'wt:' + kind) ? parseArray(store, 'wt:' + kind) : defaults[kind]
  ]));
  function validateBody(body, store, current) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) bad('Expected a JSON object.');
    keys(body, FIELDS);
    if (!Object.keys(body).length) bad('At least one field is required.');
    const patch = { ...body }, meta = config(store);
    const text = (field, max, nonempty = false) => {
      if (!(field in patch)) return;
      if (typeof patch[field] !== 'string' || patch[field].length > max || (nonempty && !patch[field].trim())) bad(field + ' is invalid.');
      if (nonempty) patch[field] = patch[field].trim();
    };
    if (!current && !('title' in patch)) bad('title is required.');
    text('title', 500, true); text('description', 100000); text('notes', 100000);
    text('status', 100, true); text('priority', 100, true);
    for (const [field, kind] of [['status', 'statuses'], ['priority', 'priorities']]) {
      const value = patch[field] ?? (!current ? (field === 'status' ? 'inbox' : 'medium') : undefined);
      if (value !== undefined && !meta[kind].some(item => item.key === value)) bad('Unknown ' + field + '; see /metadata.');
    }
    if ('register' in patch && !['work', 'private'].includes(patch.register)) bad('register must be work or private.');
    const register = patch.register || current?.register || 'work';
    for (const [field, kind] of [['customerId', 'customers'], ['projectId', 'projects']]) {
      if (field in patch && patch[field] !== null && (typeof patch[field] !== 'string' || !meta[kind].some(item => item.id === patch[field]))) bad('Unknown ' + field + '; use null to clear.');
    }
    const projectId = 'projectId' in patch ? patch.projectId : current?.projectId;
    const project = meta.projects.find(item => item.id === projectId);
    if (project && (project.register || 'work') !== register) {
      if ('projectId' in patch && patch.projectId) bad('projectId belongs to a different register.');
      patch.projectId = null;
    }
    // Match the UI project picker: selecting a project also sets its customer.
    if ('projectId' in patch && project?.customerId && !('customerId' in patch)) patch.customerId = project.customerId;
    if ('dueDate' in patch && patch.dueDate !== null) date(patch.dueDate, 'dueDate');
    if ('tags' in patch && (!Array.isArray(patch.tags) || patch.tags.length > 100 || new Set(patch.tags).size !== patch.tags.length || patch.tags.some(id => typeof id !== 'string' || !meta.tags.some(tag => tag.id === id)))) bad('tags must contain unique existing tag IDs.');
    if ('links' in patch) {
      if (!Array.isArray(patch.links) || patch.links.length > 100) bad('links must be an array of at most 100 links.');
      for (const link of patch.links) {
        if (!link || typeof link !== 'object' || Array.isArray(link)) bad('Invalid link.');
        keys(link, ['provider', 'url']);
        if (typeof link.provider !== 'string' || !link.provider.trim() || link.provider.length > 100 || typeof link.url !== 'string' || link.url.length > 4096) bad('Invalid link.');
        try { if (!['https:', 'http:'].includes(new URL(link.url).protocol)) bad('Links must use HTTP or HTTPS.'); }
        catch { bad('Links must use valid HTTP or HTTPS URLs.'); }
      }
    }
    return { patch, meta };
  }
  function conditional(req, issue) {
    if (req.get('If-Match') && req.get('If-Match') !== etag(issue)) throw problem(409, 'conflict', 'TODO changed. Fetch it again before retrying.');
  }
  // Authentication is independent of browser cookies, and runs before JSON parsing.
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const supplied = /^Bearer ([^\s]+)$/i.exec(req.get('Authorization') || '')?.[1] || '';
    const digest = crypto.createHash('sha256').update(supplied).digest();
    if (!token || !crypto.timingSafeEqual(digest, tokenDigest)) {
      res.set('WWW-Authenticate', 'Bearer realm="alfred-todos"');
      return next(problem(401, 'unauthenticated', 'A valid service bearer token is required.'));
    }
    // This principal is confined to this deployment's single personal store.
    req.alfred = { principal: 'personal-service', permissions };
    next();
  });
  router.use(express.json({ limit: '256kb', strict: true }));
  const permit = scope => (req, res, next) => req.alfred.permissions.has(scope) ? next() : next(problem(403, 'forbidden', 'This service token does not have ' + scope + ' permission.'));
  const asyncRoute = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);

  router.get('/metadata', permit('read'), (req, res) => {
    query(req, []);
    const meta = config(repository.read());
    res.json({ data: {
      statuses: meta.statuses.map(({ key, label }) => ({ key, label })), priorities: meta.priorities.map(({ key, label }) => ({ key, label })),
      customers: meta.customers.map(({ id, name }) => ({ id, name })), tags: meta.tags.map(({ id, name }) => ({ id, name })),
      projects: meta.projects.map(item => ({ id: item.id, name: item.name, customerId: item.customerId || null, register: item.register || 'work', archived: !!item.archived })),
      registers: ['work', 'private'], timezone: 'UTC', completion_status: 'done', archived_status: 'archived'
    } });
  });
  router.get('/todos', permit('read'), (req, res) => {
    query(req, [...FILTERS, 'cursor', 'limit']);
    const size = limit(req.query.limit), store = repository.read();
    let filters = Object.fromEntries(FILTERS.filter(key => key in req.query).map(key => [key, req.query[key]]));
    let after = '';
    if (req.query.cursor) {
      const decoded = decode(req.query.cursor, 'todos', store);
      if (Object.keys(filters).length && !isDeepStrictEqual(filters, decoded.filters)) bad('Do not change filters during pagination.');
      filters = decoded.filters; after = decoded.after;
    }
    for (const field of ['due_from', 'due_to']) if (field in filters) date(filters[field], field);
    if (filters.due_from && filters.due_to && filters.due_from > filters.due_to) bad('due_from must not be after due_to.');
    for (const field of ['completed', 'overdue', 'due_today']) if (field in filters) boolean(filters[field], field);
    if (filters.register && !['work', 'private'].includes(filters.register)) bad('register must be work or private.');
    if (filters.updated_since && (!ISO.test(filters.updated_since) || !Number.isFinite(Date.parse(filters.updated_since)))) bad('updated_since must be an ISO-8601 timestamp with timezone.');
    if (filters.updated_since) date(filters.updated_since.slice(0, 10), 'updated_since date');
    const today = now().toISOString().slice(0, 10);
    const items = parseArray(store, ISSUE_KEY).filter(issue => {
      if (issue.id <= after) return false;
      if ('status' in filters && issue.status !== filters.status) return false;
      if ('priority' in filters && issue.priority !== filters.priority) return false;
      if ('register' in filters && (issue.register || 'work') !== filters.register) return false;
      if ('customer_id' in filters && issue.customerId !== filters.customer_id) return false;
      if ('project_id' in filters && issue.projectId !== filters.project_id) return false;
      if ('completed' in filters && (issue.status === 'done') !== boolean(filters.completed, 'completed')) return false;
      if ('overdue' in filters && domain.issueIsOverdue(issue, today) !== boolean(filters.overdue, 'overdue')) return false;
      if ('due_today' in filters && (issue.dueDate === today) !== boolean(filters.due_today, 'due_today')) return false;
      if (filters.due_from && (!issue.dueDate || issue.dueDate < filters.due_from)) return false;
      if (filters.due_to && (!issue.dueDate || issue.dueDate > filters.due_to)) return false;
      if (filters.updated_since && Date.parse(issue.updatedAt) <= Date.parse(filters.updated_since)) return false;
      return true;
    }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const page = items.slice(0, size), more = items.length > size;
    res.json({ data: page.map(todoSummary), page: { has_more: more, next_cursor: more ? encode({ kind: 'todos', epoch: store[INTERNAL].epoch, after: page.at(-1).id, filters }) : null }, meta: { timezone: 'UTC' } });
  });
  router.get('/todos/:id', permit('read'), (req, res) => {
    query(req, []);
    const issue = parseArray(repository.read(), ISSUE_KEY).find(item => item.id === req.params.id);
    if (!issue) throw problem(404, 'not_found', 'TODO not found.');
    res.set('ETag', etag(issue)).json({ data: todoDto(issue) });
  });
  router.post('/todos', permit('write'), asyncRoute(async (req, res) => {
    query(req, []);
    const issue = await repository.transaction('alfred', store => {
      const { patch, meta } = validateBody(req.body, store);
      const timestamp = now().toISOString();
      const issue = domain.makeIssue(patch, { id: crypto.randomUUID(), now: timestamp, projects: meta.projects });
      Object.assign(issue, patch);
      const issues = parseArray(store, ISSUE_KEY);
      issues.unshift(issue); store[ISSUE_KEY] = JSON.stringify(issues);
      return issue;
    });
    res.status(201).set('ETag', etag(issue)).json({ data: todoDto(issue) });
  }));
  router.patch('/todos/:id', permit('write'), asyncRoute(async (req, res) => {
    query(req, []);
    const issue = await repository.transaction('alfred', store => {
      const issues = parseArray(store, ISSUE_KEY), issue = issues.find(item => item.id === req.params.id);
      if (!issue) throw problem(404, 'not_found', 'TODO not found.');
      conditional(req, issue);
      const { patch, meta } = validateBody(req.body, store, issue);
      if (Object.entries(patch).some(([key, value]) => !isDeepStrictEqual(issue[key], value))) {
        domain.patchIssue(issue, patch, { now: now().toISOString(), ...meta });
        store[ISSUE_KEY] = JSON.stringify(issues);
      }
      return issue;
    });
    res.set('ETag', etag(issue)).json({ data: todoDto(issue) });
  }));
  router.delete('/todos/:id', permit('delete'), asyncRoute(async (req, res) => {
    query(req, []);
    if (req.body && Object.keys(req.body).length) bad('DELETE does not accept a request body.');
    await repository.transaction('alfred', store => {
      const issues = parseArray(store, ISSUE_KEY), issue = issues.find(item => item.id === req.params.id);
      if (!issue) throw problem(404, 'not_found', 'TODO not found.');
      conditional(req, issue);
      store[ISSUE_KEY] = JSON.stringify(issues.filter(item => item.id !== issue.id));
    });
    res.status(204).end();
  }));
  router.get('/events', permit('read'), (req, res) => {
    query(req, ['cursor', 'limit']);
    const size = limit(req.query.limit), store = repository.read(), journal = store[INTERNAL];
    let sequence = 0;
    if (req.query.cursor === 'latest') sequence = journal.sequence;
    else if (req.query.cursor) sequence = decode(req.query.cursor, 'events', store).seq;
    if (!Number.isSafeInteger(sequence) || sequence < 0) bad('Invalid event cursor.');
    if (sequence > journal.sequence) throw problem(409, 'sync_reset_required', 'Cursor is ahead of this store. Perform a fresh initial sync.');
    // Sequence maps directly to array offset; timestamps are not used for ordering.
    const events = journal.events.slice(sequence, sequence + size);
    const last = events.at(-1)?.sequence ?? sequence;
    res.json({ data: events, page: { has_more: last < journal.sequence, next_cursor: checkpoint(store, last) } });
  });
  router.use((req, res, next) => next(problem(404, 'not_found', 'API endpoint not found.')));
  router.use((error, req, res, next) => {
    const status = error.type === 'entity.parse.failed' ? 400 : error.status || 500;
    const code = error.type === 'entity.parse.failed' ? 'invalid_json' : error.code || (status === 413 ? 'payload_too_large' : 'internal_error');
    if (status >= 500) console.error('ALFRED API request failed');
    res.status(status).json({ error: { code: status >= 500 ? 'internal_error' : code, message: status >= 500 ? 'Internal server error.' : (error.type === 'entity.parse.failed' ? 'Malformed JSON body.' : error.message) } });
  });
  return router;
}
module.exports = { createAlfredApi, todoDto };
