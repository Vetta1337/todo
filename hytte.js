const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_QUESTIONS = {
  arrival: [
    'Er hytta ren og ryddig ved ankomst?',
    'Har du sjekket at røykvarsler og slokkeutstyr er på plass?',
    'Har du sett etter skader eller mangler og meldt fra ved behov?',
    'Har du lest hyttereglene og funnet informasjon om nødutganger?'
  ],
  departure: [
    'Har du skrudd av lysene?',
    'Har du hengt opp eventuell kles- og sengevask?',
    'Har du vasket opp og tømt oppvaskmaskinen?',
    'Har du ryddet, støvsugd og rengjort kjøkken og bad?',
    'Har du tatt med matvarer og tømt søppel?',
    'Har du lukket vinduer og låst dørene?',
    'Har du satt varme og elektriske apparater som beskrevet i hyttereglene?',
    'Har du lagt nøkkelen tilbake på avtalt sted?'
  ]
};

module.exports = function createCabinRouter(options = {}) {
  const router = express.Router();
  const dataFile = options.dataFile || path.join(__dirname, 'data', 'hytte.json');
  const password = options.password || process.env.HYTTE_ADMIN_PASSWORD || 'Hytte2026!';
  const now = options.now || (() => new Date());
  const sessions = new Map();
  const attempts = new Map();
  const hash = value => crypto.createHash('sha256').update(value).digest('hex');
  const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' }).format(now());
  const fail = (code, message) => { const error = new Error(message); error.status = code; throw error; };
  function read() {
    if (fs.existsSync(dataFile)) return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    return { bookings: [], questions: Object.fromEntries(Object.entries(DEFAULT_QUESTIONS).map(([phase, questions]) => [phase, questions.map(text => ({ id: crypto.randomUUID(), text }))])) };
  }
  function write(data) {
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    fs.writeFileSync(dataFile + '.tmp', JSON.stringify(data, null, 2), { mode: 0o600 });
    fs.renameSync(dataFile + '.tmp', dataFile);
  }
  function newCode(data) {
    for (let attempt = 0; attempt < 1000; attempt++) {
      const code = String(crypto.randomInt(100000, 1000000));
      if (!data.bookings.some(item => item.codeHash === hash(code) || item.legacyCodeHash === hash(code))) return code;
    }
    fail(503, 'Kunne ikke lage en ledig besøkskode. Prøv igjen.');
  }
  // Give existing bookings a visible six-digit code while keeping issued codes valid.
  const initial = read();
  let migrated = !fs.existsSync(dataFile);
  for (const booking of initial.bookings) {
    if (!booking.code) {
      booking.code = newCode(initial);
      booking.legacyCodeHash = booking.codeHash;
      booking.codeHash = hash(booking.code);
      migrated = true;
    }
  }
  if (migrated) write(initial);
  function clean(value, max = 2000) {
    if (typeof value !== 'string' || value.length > max) fail(400, 'Et felt mangler eller er for langt.');
    return value.trim();
  }
  function date(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(400, 'Velg en gyldig dato.');
    const parsed = new Date(value + 'T12:00:00Z');
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail(400, 'Velg en gyldig dato.');
    return value;
  }
  function limit(req, kind, max) {
    const key = kind + ':' + req.ip;
    const time = Date.now();
    for (const [key, entry] of attempts) if (entry.until < time) attempts.delete(key);
    const entry = attempts.get(key) || { count: 0, until: time + 15 * 60 * 1000 };
    entry.count++;
    attempts.set(key, entry);
    if (entry.count > max) fail(429, 'For mange forsøk. Prøv igjen om 15 minutter.');
  }
  function admin(req) {
    const token = (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith('hytte_admin='))?.slice(12);
    for (const [key, expiry] of sessions) if (expiry < Date.now()) sessions.delete(key);
    return token && sessions.has(hash(token));
  }
  function requireAdmin(req, res, next) {
    if (!admin(req)) return res.status(401).json({ error: 'Logg inn som administrator.' });
    next();
  }
  function cookie(req, value, age) {
    return `hytte_admin=${value}; HttpOnly; SameSite=Strict; Path=/hytte; Max-Age=${age}${req.secure || req.get('x-forwarded-proto') === 'https' ? '; Secure' : ''}`;
  }
  function authorizedBooking(req, data) {
    const failures = attempts.get('visit:' + req.ip);
    if (failures && failures.until > Date.now() && failures.count >= 15) fail(429, 'For mange forsøk. Prøv igjen om 15 minutter.');
    const code = clean(req.body.code || '', 100).replace(/[\s-]/g, '').toUpperCase();
    const booking = data.bookings.find(item => !item.cancelledAt && (item.codeHash === hash(code) || item.legacyCodeHash === hash(code)));
    if (!booking) {
      limit(req, 'visit', 15);
      fail(404, 'Fant ikke besøket. Kontroller besøkskoden.');
    }
    return booking;
  }
  function publicBooking(item) {
    return { id: item.id, name: item.name, start: item.start, end: item.end,
      status: item.departure ? 'Avsluttet' : item.arrival ? 'På besøk' : 'Booket' };
  }
  const withoutCode = ({ code, codeHash, legacyCodeHash, ...booking }) => booking;
  router.use(express.json({ limit: '32kb' }));
  router.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store');
      if (!['GET', 'HEAD'].includes(req.method)) {
        if (!req.is('application/json') || req.get('X-Hytte-Request') !== '1') return res.status(403).json({ error: 'Ugyldig forespørsel. Last siden på nytt.' });
        const origin = req.get('origin');
        if (origin && new URL(origin).host !== req.get('host')) return res.status(403).json({ error: 'Ugyldig avsender.' });
      }
    }
    next();
  });
  router.get('/api/calendar', (req, res) => {
    res.json({ today: today(), bookings: read().bookings.filter(item => !item.cancelledAt).map(publicBooking) });
  });
  router.post('/api/bookings', (req, res) => {
    limit(req, 'booking', 30);
    const name = clean(req.body.name, 120).replace(/\s+/g, ' ');
    if (!/^[\p{L}\p{M}][\p{L}\p{M} .’'-]*\s+[\p{L}\p{M}][\p{L}\p{M} .’'-]*$/u.test(name)) fail(400, 'Skriv fullt navn, både fornavn og etternavn.');
    const start = date(req.body.start), end = date(req.body.end);
    if (start < today() || end <= start || (new Date(end) - new Date(start)) / 86400000 > 30) fail(400, 'Velg minst én og maksimalt 30 netter, fra i dag eller senere.');
    const data = read();
    if (data.bookings.some(item => !item.cancelledAt && start < item.end && end > item.start)) fail(409, 'Hytta er allerede booket i denne perioden. Velg andre datoer.');
    const code = newCode(data);
    const booking = { id: crypto.randomUUID(), name, start, end, code, codeHash: hash(code), createdAt: now().toISOString(), arrival: null, departure: null };
    data.bookings.push(booking);
    write(data);
    res.status(201).json({ booking: publicBooking(booking), code });
  });
  router.post('/api/visit', (req, res) => {
    const data = read(), booking = authorizedBooking(req, data);
    res.json({ booking: withoutCode(booking), questions: data.questions, today: today() });
  });
  router.post('/api/visit/:phase', (req, res) => {
    const phase = req.params.phase;
    if (!['arrival', 'departure'].includes(phase)) fail(404, 'Ukjent sjekkliste.');
    const data = read(), booking = authorizedBooking(req, data);
    if (booking[phase]) fail(409, 'Denne sjekklisten er allerede levert.');
    if (phase === 'arrival' && (today() < booking.start || today() > booking.end)) fail(400, 'Ankomst kan registreres i den bookede perioden.');
    if (phase === 'departure' && !booking.arrival) fail(400, 'Registrer ankomst før avreise.');
    const answers = req.body.answers;
    if (!Array.isArray(answers) || answers.length !== data.questions[phase].length) fail(409, 'Sjekklisten er endret. Åpne besøket på nytt og svar på alle spørsmål.');
    const snapshot = data.questions[phase].map(question => {
      const answer = answers.find(item => item && item.id === question.id);
      if (!answer || !['yes', 'no', 'na'].includes(answer.value)) fail(400, 'Svar på alle spørsmål i sjekklisten.');
      const note = clean(answer.note || '', 1000);
      if (answer.value === 'no' && !note) fail(400, 'Legg til en merknad når du svarer nei.');
      return { ...question, value: answer.value, note };
    });
    booking[phase] = { at: now().toISOString(), answers: snapshot, note: clean(req.body.note || '', 3000) };
    write(data);
    res.json({ booking: withoutCode(booking), questions: data.questions, today: today() });
  });
  router.post('/api/admin/login', (req, res) => {
    limit(req, 'login', 15);
    const supplied = hash(clean(req.body.password || '', 200));
    if (!crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(hash(password)))) fail(401, 'Feil passord.');
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(hash(token), Date.now() + 8 * 60 * 60 * 1000);
    res.setHeader('Set-Cookie', cookie(req, token, 8 * 60 * 60));
    res.json({ ok: true });
  });
  router.post('/api/admin/logout', (req, res) => {
    const token = (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith('hytte_admin='))?.slice(12);
    if (token) sessions.delete(hash(token));
    res.setHeader('Set-Cookie', cookie(req, '', 0));
    res.json({ ok: true });
  });
  router.get('/api/admin', requireAdmin, (req, res) => {
    const data = read();
    res.json({ bookings: data.bookings.map(item => ({ ...withoutCode(item), code: item.code })), questions: data.questions, today: today() });
  });
  router.delete('/api/admin/bookings/:id', requireAdmin, (req, res) => {
    const data = read(), booking = data.bookings.find(item => item.id === req.params.id);
    if (!booking) fail(404, 'Bookingen finnes ikke.');
    booking.cancelledAt ||= now().toISOString();
    write(data);
    res.json({ ok: true });
  });
  router.post('/api/admin/bookings/:id/code', requireAdmin, (req, res) => {
    const data = read(), booking = data.bookings.find(item => item.id === req.params.id && !item.cancelledAt);
    if (!booking) fail(404, 'Bookingen finnes ikke.');
    const code = newCode(data);
    booking.code = code;
    booking.codeHash = hash(code);
    delete booking.legacyCodeHash;
    write(data);
    res.json({ code });
  });
  router.put('/api/admin/questions', requireAdmin, (req, res) => {
    const questions = {};
    for (const phase of ['arrival', 'departure']) {
      if (!Array.isArray(req.body[phase]) || req.body[phase].length < 1 || req.body[phase].length > 30) fail(400, 'Bruk mellom 1 og 30 spørsmål per sjekkliste.');
      questions[phase] = req.body[phase].map(value => {
        const text = clean(value, 300);
        if (!text) fail(400, 'Spørsmål kan ikke være tomme.');
        return { id: crypto.randomUUID(), text };
      });
    }
    const data = read();
    data.questions = questions;
    write(data);
    res.json({ questions });
  });
  router.get(['/', '/admin', '/admin/'], (req, res) => res.sendFile(path.join(__dirname, 'hytte-public', 'index.html')));
  router.use(express.static(path.join(__dirname, 'hytte-public'), { index: false }));
  router.use((req, res) => res.status(404).json({ error: 'Siden finnes ikke.' }));
  router.use((error, req, res, next) => {
    if (!error.status || error.status >= 500) console.error('Hytte:', error);
    res.status(error.status || 500).json({ error: error.status && error.status < 500 ? error.message : 'Kunne ikke lagre eller hente data. Prøv igjen.' });
  });
  return router;
};
