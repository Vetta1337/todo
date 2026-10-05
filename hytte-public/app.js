'use strict';
const main = document.querySelector('#main');
const isAdmin = /^\/hytte\/admin\/?$/.test(location.pathname);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const e = escapeHtml;
let calendar, visit, adminData, selectedDay = '', month, noticeTimer;
let visitCode = '';
try { visitCode = sessionStorage.getItem('hytte-visit-code') || ''; } catch {}
const dateLabel = value => new Date(value + 'T12:00:00').toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' });
const timeLabel = value => new Date(value).toLocaleString('nb-NO', { timeZone: 'Europe/Oslo', dateStyle: 'medium', timeStyle: 'short' });
const dayKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const nextDay = value => { const date = new Date(value + 'T12:00:00'); date.setDate(date.getDate() + 1); return dayKey(date); };
function notify(message) {
  const notice = document.querySelector('#notice');
  notice.textContent = message; notice.hidden = false;
  clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { notice.hidden = true; }, 6500);
}
async function api(url, method = 'GET', body) {
  const response = await fetch('/hytte/api/' + url, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Hytte-Request': '1' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json().catch(() => ({ error: 'Serveren svarte ikke som forventet.' }));
  if (!response.ok) { const error = new Error(data.error || 'Noe gikk galt. Prøv igjen.'); error.status = response.status; throw error; }
  return data;
}
function bindForm(id, handler) {
  const form = document.getElementById(id);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const error = form.querySelector('.error');
    error.textContent = '';
    const buttons = [...form.querySelectorAll('button')]; buttons.forEach(button => { button.disabled = true; });
    try { await handler(new FormData(form), form); }
    catch (problem) { error.textContent = problem.message; error.focus(); }
    finally { buttons.forEach(button => { button.disabled = false; }); }
  });
}
const errorSlot = '<p class="error" role="alert" tabindex="-1"></p>';
function bookingRow(booking) {
  return `<div class="booking-row"><div><strong>${e(booking.name)}</strong><small>${dateLabel(booking.start)} – ${dateLabel(booking.end)}</small></div><span class="pill">${e(booking.status)}</span></div>`;
}
async function showCalendar() {
  calendar = await api('calendar');
  month ||= new Date(calendar.today.slice(0, 7) + '-01T12:00:00');
  main.innerHTML = `<section class="hero"><div><span class="eyebrow">En liten pause fra hverdagen</span><h1>Finn roen.<br>Book en tur på hytta.</h1><p>Se når hytta er ledig, planlegg oppholdet og sjekk inn når du kommer. Vi gjør det enkelt å ta godt vare på vårt felles fristed.</p></div><div class="hero-aside"><span class="eyebrow">God tur, fra start til slutt</span><strong>Book. Nyt. Rydd.</strong><span>Én hytte, mange gode minner.</span></div></section>
    <div id="receipt-area"></div><div class="layout"><div><section class="panel calendar-panel"><div class="row wrap"><div><span class="eyebrow muted">Bookingkalender</span><h2 id="month-title"></h2></div><div class="calendar-controls"><button class="secondary" id="prev-month" aria-label="Forrige måned">←</button><button class="secondary" id="this-month">I dag</button><button class="secondary" id="next-month" aria-label="Neste måned">→</button></div></div><div class="calendar-head">${['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'].map(day => `<span>${day}</span>`).join('')}</div><div id="calendar-grid" class="calendar-grid"></div><div class="legend"><span>Booket / ankomst fra kl. 15</span><span class="leave">Avreise innen kl. 12</span></div><p class="hint">Velg en dag for å se alle navn og detaljer. Tomme dager er ledige.</p><div id="day-detail" aria-live="polite"></div></section>
    <section class="panel"><div class="row"><h2>Kommende opphold</h2><span class="eyebrow muted">Hvem skal på tur?</span></div><div id="upcoming"></div></section></div>
    <aside><section class="panel"><span class="eyebrow muted">Sett av litt hyttetid</span><h2>Book et opphold</h2><p class="muted">Du må bruke fullt navn. Alle kan se navnet ditt og datoene i kalenderen.</p><form id="booking-form"><label class="form-field">Fullt navn<input name="name" placeholder="Fornavn Etternavn" autocomplete="name" maxlength="120" required></label><div class="dates"><label class="form-field">Ankomst · kl. 15<input name="start" type="date" min="${calendar.today}" required></label><label class="form-field">Avreise · kl. 12<input name="end" type="date" min="${nextDay(calendar.today)}" required></label></div>${errorSlot}<button class="full" type="submit">Bekreft booking <span aria-hidden="true">↗</span></button><p class="hint">1–30 netter. Ta vare på besøkskoden du får etter booking. Du bruker den ved ankomst og avreise.</p></form></section><section class="panel"><h3>Allerede booket?</h3><p class="muted">Åpne besøket ditt med besøkskoden for å fylle ut sjekklistene.</p><a class="button secondary full" href="#besok">Gå til mitt besøk →</a></section></aside></div>
    <section class="steps" aria-label="Slik fungerer det"><div class="step"><span>01</span><h3>Finn en ledig periode</h3><p>Book med fullt navn, og ta vare på besøkskoden.</p></div><div class="step"><span>02</span><h3>Sjekk inn og senk skuldrene</h3><p>Fyll ut ankomstlisten. Meld fra om noe ikke er som det skal.</p></div><div class="step"><span>03</span><h3>Gjør klart for nestemann</h3><p>Følg avreiselisten og registrer at besøket er avsluttet.</p></div></section>`;
  document.querySelector('#prev-month').onclick = () => { month.setMonth(month.getMonth() - 1); renderCalendar(); };
  document.querySelector('#next-month').onclick = () => { month.setMonth(month.getMonth() + 1); renderCalendar(); };
  document.querySelector('#this-month').onclick = () => { month = new Date(calendar.today.slice(0, 7) + '-01T12:00:00'); selectedDay = calendar.today; renderCalendar(); };
  const form = document.querySelector('#booking-form');
  form.elements.start.onchange = () => {
    if (!form.elements.start.value) return;
    form.elements.end.min = nextDay(form.elements.start.value);
    if (form.elements.end.value <= form.elements.start.value) form.elements.end.value = nextDay(form.elements.start.value);
  };
  bindForm('booking-form', async fields => {
    const result = await api('bookings', 'POST', { name: fields.get('name'), start: fields.get('start'), end: fields.get('end') });
    visitCode = result.code;
    try { sessionStorage.setItem('hytte-visit-code', visitCode); } catch {}
    calendar.bookings.push(result.booking);
    month = new Date(result.booking.start.slice(0, 7) + '-01T12:00:00');
    selectedDay = result.booking.start;
    renderCalendar(); form.reset();
    const area = document.querySelector('#receipt-area');
    area.innerHTML = `<section class="receipt" tabindex="-1"><span class="eyebrow">Bookingen er bekreftet</span><h2>God tur, ${e(result.booking.name)}!</h2><p>${dateLabel(result.booking.start)} – ${dateLabel(result.booking.end)}</p><p><strong>Ta vare på besøkskoden.</strong> Den gir tilgang til ditt besøk og sjekklistene. Koden vises ikke i den offentlige kalenderen.</p><code>${e(result.code)}</code><div class="actions"><button id="copy-code" class="secondary">Kopier kode</button><a href="#besok" class="button">Åpne mitt besøk</a></div><p class="hint">Mistet koden? Administrator kan finne koden din. Kontakt administrator hvis bookingen må fjernes.</p></section>`;
    document.querySelector('#copy-code').onclick = async () => { try { await navigator.clipboard.writeText(result.code); notify('Besøkskoden er kopiert.'); } catch { notify('Marker besøkskoden og kopier den manuelt.'); } };
    area.firstElementChild.focus(); area.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  renderCalendar();
}
function renderCalendar() {
  document.querySelector('#month-title').textContent = month.toLocaleDateString('nb-NO', { month: 'long', year: 'numeric' });
  const offset = (month.getDay() + 6) % 7;
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  let html = '<div class="day blank" aria-hidden="true"></div>'.repeat(offset);
  for (let day = 1; day <= count; day++) {
    const date = dayKey(new Date(month.getFullYear(), month.getMonth(), day));
    const bookings = calendar.bookings.filter(booking => booking.start <= date && booking.end >= date);
    const names = bookings.map(booking => booking.name + (booking.end === date ? ' (avreise)' : '')).join(', ');
    html += `<button class="day${date === calendar.today ? ' today' : ''}${date === selectedDay ? ' selected' : ''}" data-day="${date}" aria-label="${e(dateLabel(date) + ': ' + (names || 'Ledig'))}" aria-pressed="${date === selectedDay}" title="${e(names || 'Ledig')}"><span class="day-number">${day}</span>${bookings.map(booking => `<span class="stay${booking.end === date ? ' checkout' : ''}">${booking.end === date ? '↗ ' : ''}${e(booking.name)}</span>`).join('')}</button>`;
  }
  const trailing = (7 - ((offset + count) % 7)) % 7;
  html += '<div class="day blank" aria-hidden="true"></div>'.repeat(trailing);
  document.querySelector('#calendar-grid').innerHTML = html;
  document.querySelectorAll('[data-day]').forEach(button => { button.onclick = () => {
    selectedDay = button.dataset.day;
    if (selectedDay >= calendar.today && !calendar.bookings.some(booking => booking.start <= selectedDay && booking.end > selectedDay)) {
      const form = document.querySelector('#booking-form');
      form.elements.start.value = selectedDay; form.elements.end.value = nextDay(selectedDay); form.elements.end.min = nextDay(selectedDay);
    }
    renderCalendar();
    document.querySelector(`[data-day="${selectedDay}"]`)?.focus();
  }; });
  document.querySelector('#day-detail').innerHTML = selectedDay ? `<h3>${dateLabel(selectedDay)}</h3>${calendar.bookings.filter(booking => booking.start <= selectedDay && booking.end >= selectedDay).map(bookingRow).join('') || '<p class="muted">Ingen bookinger denne dagen.</p>'}` : '';
  document.querySelector('#upcoming').innerHTML = calendar.bookings.filter(booking => booking.end >= calendar.today).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 8).map(bookingRow).join('') || '<p class="empty">Ingen kommende opphold. Kanskje det er tid for en tur?</p>';
}
function showVisit() {
  main.innerHTML = `<div class="narrow"><section class="hero"><div><span class="eyebrow">Fra ankomst til avreise</span><h1>Mitt besøk</h1><p>Bruk besøkskoden fra bookingen for å registrere ankomst og avreise. Svarene og merknadene dine er tilgjengelige for deg og administrator.</p></div></section><section class="panel"><h2>Åpne besøket ditt</h2><form id="visit-form"><label class="form-field">Besøkskode<input name="code" value="${e(visitCode)}" placeholder="6-sifret besøkskode" maxlength="16" inputmode="numeric" autocomplete="one-time-code" spellcheck="false" required></label>${errorSlot}<button type="submit">Hent besøk →</button><p class="hint">Mistet koden? Kontakt administrator for å få koden din.</p></form></section><div id="visit-content"></div></div>`;
  bindForm('visit-form', async fields => {
    const code = fields.get('code').trim();
    visit = await api('visit', 'POST', { code }); visitCode = code;
    try { sessionStorage.setItem('hytte-visit-code', code); } catch {}
    renderVisit();
  });
}
const phaseLabel = phase => phase === 'arrival' ? 'Ankomst' : 'Avreise';
const answerLabel = value => ({ yes: 'Ja', no: 'Nei', na: 'Ikke aktuelt' }[value]);
function history(entry, phase) {
  if (!entry) return `<p class="muted">${phaseLabel(phase)} er ikke registrert.</p>`;
  return `<h3>${phaseLabel(phase)} · ${e(timeLabel(entry.at))}</h3><ul class="answer-history">${entry.answers.map(answer => `<li><strong>${e(answer.text)}</strong> — ${answerLabel(answer.value)}${answer.note ? `<p>${e(answer.note)}</p>` : ''}</li>`).join('')}</ul>${entry.note ? `<p class="muted note">${e(entry.note)}</p>` : ''}`;
}
function renderVisit() {
  const { booking, questions, today } = visit;
  const phase = booking.arrival ? 'departure' : 'arrival';
  const complete = !!booking.departure;
  const tooEarly = !booking.arrival && (today < booking.start || today > booking.end);
  document.querySelector('#visit-content').innerHTML = `<section class="panel visit-summary"><span class="eyebrow muted">${complete ? 'Takk for besøket' : 'Ditt opphold'}</span><h2>${e(booking.name)}</h2><p class="muted">${dateLabel(booking.start)} – ${dateLabel(booking.end)}</p><span class="pill">${complete ? 'Besøket er avsluttet' : booking.arrival ? 'Ankomst registrert' : 'Bookingen er bekreftet'}</span></section>${complete ? '<section class="receipt"><h2>Takk for at du tok vare på hytta!</h2><p>Avreisen er registrert. Vi håper du har hatt et fint opphold.</p></section>' : tooEarly ? '<section class="panel"><p class="muted">Du kan registrere ankomst fra ankomstdatoen og frem til avreisedatoen. Ta vare på besøkskoden til da.</p></section>' : `<section class="panel"><span class="eyebrow muted">${phase === 'arrival' ? 'Velkommen til hytta' : 'Før du reiser hjem'}</span><h2>Sjekkliste ved ${phaseLabel(phase).toLowerCase()}</h2><p class="muted">Svar på alle spørsmål. Hvis noe ikke er i orden, velg «Nei» og legg til en merknad.</p><form id="checklist-form">${questions[phase].map((question, index) => `<fieldset class="checklist-item"><legend>${index + 1}. ${e(question.text)}</legend><div class="answers">${['yes', 'no', 'na'].map(value => `<label><input type="radio" name="answer-${question.id}" value="${value}" required>${answerLabel(value)}</label>`).join('')}</div><label class="form-field">Merknad <span class="hint">(påkrevd ved nei)</span><input name="note-${question.id}" maxlength="1000" placeholder="Eventuelle mangler eller det du vil melde fra om"></label></fieldset>`).join('')}<label class="form-field">Andre beskjeder til administrator <span class="hint">(valgfritt)</span><textarea name="note" rows="3" maxlength="3000"></textarea></label>${errorSlot}<button type="submit">${phase === 'arrival' ? 'Registrer ankomst' : 'Registrer avreise og avslutt besøket'} →</button></form></section>`}${booking.arrival ? `<section class="panel"><h2>Besøkslogg</h2>${history(booking.arrival, 'arrival')}${booking.departure ? history(booking.departure, 'departure') : ''}</section>` : ''}`;
  if (!complete && !tooEarly) {
    const form = document.querySelector('#checklist-form');
    form.addEventListener('change', () => questions[phase].forEach(question => { form.elements['note-' + question.id].required = form.elements['answer-' + question.id].value === 'no'; }));
    bindForm('checklist-form', async fields => {
      visit = await api('visit/' + phase, 'POST', { code: visitCode, answers: questions[phase].map(question => ({ id: question.id, value: fields.get('answer-' + question.id), note: fields.get('note-' + question.id) })), note: fields.get('note') });
      renderVisit(); notify(phaseLabel(phase) + ' er registrert.');
      document.querySelector('#visit-content').scrollIntoView({ behavior: 'smooth' });
    });
  }
}
async function showAdmin() {
  try { adminData = await api('admin'); renderAdmin(); }
  catch (error) {
    if (error.status !== 401) throw error;
    main.innerHTML = `<div class="narrow"><section class="hero"><div><span class="eyebrow">For hytteansvarlig</span><h1>Administrasjon</h1><p>Se bookinger og besøkslogger, og tilpass sjekklistene for hytta.</p></div></section><section class="panel"><h2>Logg inn</h2><form id="login-form"><label class="form-field">Administratorpassord<input name="password" type="password" autocomplete="current-password" maxlength="200" required></label>${errorSlot}<button type="submit">Logg inn →</button></form></section></div>`;
    bindForm('login-form', async fields => { await api('admin/login', 'POST', { password: fields.get('password') }); await showAdmin(); });
  }
}
function renderAdmin() {
  const bookings = adminData.bookings;
  main.innerHTML = `<section class="hero"><div><span class="eyebrow">For hytteansvarlig</span><h1>Oversikt over hyttelivet.</h1><p>Alle bookinger, besøk og sjekklister på ett sted.</p></div><button id="logout" class="secondary">Logg ut</button></section><div class="admin-stats"><div class="stat"><strong>${bookings.filter(item => !item.cancelledAt && item.end >= adminData.today).length}</strong><span>Aktive og kommende bookinger</span></div><div class="stat"><strong>${bookings.filter(item => !item.cancelledAt && item.arrival && !item.departure).length}</strong><span>Pågående besøk</span></div><div class="stat"><strong>${bookings.filter(item => item.departure).length}</strong><span>Avsluttede besøk</span></div></div>
    <section class="panel"><div class="row wrap"><div><h2>Bookinger og alle besøk</h2><p class="muted">Åpne et opphold for å se sjekklister og merknader. Fjernede bookinger beholdes i historikken.</p></div><label class="form-field">Vis<select id="admin-filter"><option value="all">Alle opphold</option><option value="upcoming">Aktive / kommende</option><option value="visits">Registrerte besøk</option><option value="cancelled">Fjernede bookinger</option></select></label></div><label class="form-field">Søk etter navn<input id="admin-search" type="search" placeholder="Søk i alle opphold"></label><div id="admin-bookings"></div></section>
    <section class="panel"><h2>Spørsmål i sjekklistene</h2><p class="muted">Skriv ett spørsmål per linje, mellom 1 og 30 spørsmål per liste. Endringene gjelder sjekklister som leveres etter lagring. Tidligere svar beholder den opprinnelige spørsmålsteksten.</p><form id="questions-form"><div class="admin-editor">${['arrival', 'departure'].map(phase => `<label class="form-field">Ved ${phaseLabel(phase).toLowerCase()}<textarea name="${phase}" rows="12" required>${e(adminData.questions[phase].map(question => question.text).join('\n'))}</textarea></label>`).join('')}</div>${errorSlot}<button type="submit">Lagre spørsmål</button></form></section>`;
  document.querySelector('#logout').onclick = async () => { try { await api('admin/logout', 'POST', {}); await showAdmin(); } catch (error) { notify(error.message); } };
  document.querySelector('#admin-filter').onchange = renderAdminBookings;
  document.querySelector('#admin-search').oninput = renderAdminBookings;
  bindForm('questions-form', async fields => {
    const body = Object.fromEntries(['arrival', 'departure'].map(phase => [phase, fields.get(phase).split('\n').map(text => text.trim()).filter(Boolean)]));
    const result = await api('admin/questions', 'PUT', body); adminData.questions = result.questions; notify('Spørsmålene er lagret.');
  });
  renderAdminBookings();
}
function renderAdminBookings() {
  const filter = document.querySelector('#admin-filter').value;
  const query = document.querySelector('#admin-search').value.trim().toLocaleLowerCase('nb-NO');
  const bookings = adminData.bookings.filter(item => item.name.toLocaleLowerCase('nb-NO').includes(query) && (filter === 'all' || filter === 'upcoming' && !item.cancelledAt && item.end >= adminData.today || filter === 'visits' && item.arrival || filter === 'cancelled' && item.cancelledAt)).sort((a, b) => b.start.localeCompare(a.start));
  document.querySelector('#admin-bookings').innerHTML = bookings.map(item => `<details class="admin-booking"><summary><strong>${e(item.name)}</strong> · ${dateLabel(item.start)} – ${dateLabel(item.end)} <span class="pill${item.cancelledAt ? ' cancelled' : ''}">${item.cancelledAt ? 'Fjernet' : item.departure ? 'Avsluttet' : item.arrival ? 'På besøk' : 'Booket'}</span></summary><p class="muted">Booket ${e(timeLabel(item.createdAt))}</p><p>Besøkskode: <code class="admin-visit-code" data-visit-code="${item.id}">${e(item.code)}</code></p>${history(item.arrival, 'arrival')}${history(item.departure, 'departure')}${item.cancelledAt ? `<p class="muted">Fjernet ${e(timeLabel(item.cancelledAt))}</p>` : `<div class="actions"><button class="secondary small" data-code="${item.id}">Lag ny besøkskode</button><button class="danger small" data-delete="${item.id}">Fjern booking</button></div>`}<div id="code-${item.id}"></div></details>`).join('') || '<p class="empty">Ingen opphold å vise.</p>';
  document.querySelectorAll('[data-delete]').forEach(button => { button.onclick = async () => {
    const booking = adminData.bookings.find(item => item.id === button.dataset.delete);
    if (!confirm(`Fjerne bookingen til ${booking.name}, ${dateLabel(booking.start)} – ${dateLabel(booking.end)}? Perioden blir ledig. Besøkshistorikken beholdes.`)) return;
    button.disabled = true;
    try { await api('admin/bookings/' + booking.id, 'DELETE', {}); adminData = await api('admin'); renderAdmin(); notify('Bookingen er fjernet fra kalenderen.'); }
    catch (error) { notify(error.message); button.disabled = false; }
  }; });
  document.querySelectorAll('[data-code]').forEach(button => { button.onclick = async () => {
    if (!confirm('Lage en ny besøkskode? Den gamle koden slutter å virke.')) return;
    button.disabled = true;
    try {
      const result = await api('admin/bookings/' + button.dataset.code + '/code', 'POST', {});
      adminData.bookings.find(item => item.id === button.dataset.code).code = result.code;
      document.querySelector('[data-visit-code="' + button.dataset.code + '"]').textContent = result.code;
      document.getElementById('code-' + button.dataset.code).innerHTML = `<div class="receipt"><p>Gi denne koden til den som har booket. Ta vare på den før du forlater siden.</p><code>${e(result.code)}</code></div>`;
    } catch (error) { notify(error.message); }
    finally { button.disabled = false; }
  }; });
}
async function route() {
  document.querySelector('#calendar-nav').classList.toggle('active', !isAdmin && location.hash !== '#besok');
  document.querySelector('#admin-nav').classList.toggle('active', isAdmin);
  try {
    if (isAdmin) await showAdmin();
    else if (location.hash === '#besok') showVisit();
    else await showCalendar();
  } catch (error) { main.innerHTML = `<section class="panel narrow"><h1>Kunne ikke hente siden</h1><p class="error">${e(error.message)}</p><button id="retry">Prøv igjen</button></section>`; document.querySelector('#retry').onclick = route; }
}
window.addEventListener('hashchange', route);
route();

