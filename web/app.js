// Lunar Horizon controller: application state, API calls, time controls and panels.
import { Universe } from './scene.js';
import {
  h, fmt, iso, utcLong, utcShort, coords, checkKey,
  siteList, siteCard, focusCard, stationsView, candidateResults, lanes, sourcesContent,
} from './panels.js';
import { createTour } from './lessons.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const MAX_SITES = 4;
const DEFAULT_SITES = ['im1', 'im2', 'blue-ghost'];
const DAY = 86400000;
const VIEWS = ['moon', 'earth', 'system', 'solar'];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isMobile = () => matchMedia('(max-width: 900px)').matches;

const app = {
  catalog: null,
  coverage: null,
  state: null,
  universe: null,
  tour: null,
  selected: [...DEFAULT_SITES],
  now: 0,
  anchor: 0,
  end: 0,
  view: 'moon',
  tab: 'sites',
  playing: false,
  timeline: null,
  timelineKey: '',
  timelinePending: new Set(),
  focus: null, // { kind: 'point' | 'candidate', item, latitude?, longitude? }
  screen: null, // { result, at, spacing }
  horizonChecks: new Map(),
  focusedStation: null,
};

// ---------------------------------------------------------------- errors & messages
class ServiceError extends Error {}
class InputError extends Error {}

let toastTimer = 0;
function toast(message, kind = 'error') {
  const node = $('#toast');
  node.textContent = message;
  node.className = `toast ${kind}`;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; }, kind === 'error' ? 7000 : 4500);
}

function showServiceBanner() {
  const banner = $('#service-banner');
  banner.replaceChildren(
    h('strong', { text: 'The science service is not responding.' }),
    h('span', null, ' Start it with the VS Code “Preview” task or ', h('code', { text: 'node scripts/dev.mjs' }),
      '. A fresh checkout needs setup first (see README). No fallback data is shown.'),
    h('button', { type: 'button', class: 'ghost small', onClick: () => location.reload() }, 'Retry'));
  banner.hidden = false;
}

function report(error, prefix = '') {
  if (!error || error.name === 'AbortError') return;
  if (error instanceof ServiceError) {
    showServiceBanner();
    setStatus('Science service unavailable · showing the last verified result', 'error');
  } else {
    toast(prefix + error.message);
  }
}

function setStatus(text, kind = '') {
  const node = $('#status');
  node.textContent = text;
  node.className = `status ${kind}`;
}

// ---------------------------------------------------------------- API
const controllers = new Map();
async function api(path, params = {}, channel = path) {
  controllers.get(channel)?.abort();
  const controller = new AbortController();
  controllers.set(channel, controller);
  try {
    let response;
    try {
      response = await fetch(`./api/${path}?${new URLSearchParams(params)}`, { signal: controller.signal });
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new ServiceError('The science service is not responding.');
    }
    const data = await response.json().catch((error) => { if (error.name === 'AbortError') throw error; return null; });
    if (response.ok && data) {
      $('#service-banner').hidden = true;
      return data;
    }
    if (data?.error) throw new Error(data.error);
    throw new ServiceError(`The science service is not responding (HTTP ${response.status}).`);
  } finally {
    if (controllers.get(channel) === controller) controllers.delete(channel);
  }
}

// ---------------------------------------------------------------- inputs
const LABELS = {
  area: 'Panel area', efficiency: 'Efficiency', margin: 'Earth clearance', latitude: 'Latitude', longitude: 'Longitude',
  'max-slope': 'Maximum slope', 'min-sun': 'Minimum Sun clearance', roughness: 'Roughness',
  'ellipse-major': 'Ellipse length', 'ellipse-minor': 'Ellipse width', 'ellipse-heading': 'Heading', 'lander-diameter': 'Lander width',
};

/** Read a numeric field, enforcing its min/max (any precision is allowed). */
function numberField(id) {
  const input = document.getElementById(id);
  const value = Number(input.value);
  const ok = input.value.trim() !== '' && Number.isFinite(value) && value >= Number(input.min) && value <= Number(input.max);
  input.setAttribute('aria-invalid', String(!ok));
  if (!ok) throw new InputError(`${LABELS[id]} must be between ${input.min} and ${input.max}.`);
  return String(value);
}

function settings() {
  return {
    horizon: $('#horizon').value,
    panel: $('#panel').value,
    area: numberField('area'),
    efficiency: String(Number(numberField('efficiency')) / 100),
    margin: numberField('margin'),
  };
}

function safeSettings() {
  try { return settings(); } catch { return null; }
}

const stateParams = () => ({ utc: iso(app.now), sites: app.selected.join(','), ...settings() });

function discoverParams() {
  const params = {
    latitude: numberField('latitude'), longitude: numberField('longitude'), spacing: $('#spacing').value,
    profile: $('#landing-profile').value, maxSlope: numberField('max-slope'), minSun: numberField('min-sun'),
    requireRadio: String($('#require-radio').checked), maxRoughness: numberField('roughness'),
    ellipseMajorM: numberField('ellipse-major'), ellipseMinorM: numberField('ellipse-minor'),
    ellipseHeadingDeg: numberField('ellipse-heading'), landerDiameterM: numberField('lander-diameter'),
  };
  if (Number(params.ellipseMinorM) > Number(params.ellipseMajorM)) throw new InputError('Ellipse width cannot exceed its length.');
  return params;
}

// ---------------------------------------------------------------- state (latest wins, one request in flight)
const sync = { busy: false, again: false, waiters: [] };

/** Resolves (true/false) once a state at or after the current time has been applied. */
function refreshState() {
  return new Promise((resolve) => {
    sync.waiters.push(resolve);
    if (sync.busy) sync.again = true;
    else runState();
  });
}

async function runState() {
  sync.busy = true;
  sync.again = false;
  const waiters = sync.waiters.splice(0);
  let ok = false;
  const slow = setTimeout(() => setStatus('Calculating NASA geometry…', 'busy'), 300);
  try {
    applyState(await api('state', stateParams(), 'state'));
    ok = true;
  } catch (error) {
    if (error.name !== 'AbortError') {
      stop();
      report(error);
      if (!(error instanceof ServiceError)) updateStatus();
    }
  } finally {
    clearTimeout(slow);
    sync.busy = false;
    waiters.forEach((resolve) => resolve(ok));
    if (sync.again) runState();
  }
}

function applyState(result) {
  const first = !app.state;
  app.state = result;
  app.universe.update(result);
  updateStatus();
  scheduleDetails();
  scheduleUrl();
  if (first) $('#loading').hidden = true;
}

function moonPhase(state) {
  const s = state.sun.positionKm, e = state.earth.positionKm;
  const cos = (s[0] * e[0] + s[1] * e[1] + s[2] * e[2]) / (Math.hypot(...s) * Math.hypot(...e));
  const lit = (1 + Math.max(-1, Math.min(1, cos))) / 2;
  // Waxing while the Moon is east of the Sun as seen from Earth.
  const moonRa = Math.atan2(-e[1], -e[0]), sunRa = Math.atan2(s[1] - e[1], s[0] - e[0]);
  const waxing = (((moonRa - sunRa) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) < Math.PI;
  const name = lit < .015 ? 'New Moon' : lit > .985 ? 'Full Moon'
    : Math.abs(lit - .5) < .04 ? (waxing ? 'First quarter' : 'Last quarter')
      : `${waxing ? 'Waxing' : 'Waning'} ${lit < .5 ? 'crescent' : 'gibbous'}`;
  return `${name}, ${Math.round(lit * 100)}% lit from Earth`;
}

function updateStatus() {
  const s = app.state;
  if (!s) return;
  const parts = [`SPICE geometry for ${utcLong(Date.parse(s.utc))}`, moonPhase(s)];
  if (s.earthOrientation === 'Predicted') parts.push('Earth rotation predicted');
  setStatus(parts.join(' · '));
}

// ---------------------------------------------------------------- right panel
let detailsTimer = 0;
let detailsAt = 0;
function scheduleDetails() {
  if (detailsTimer) return;
  detailsTimer = setTimeout(() => {
    detailsTimer = 0;
    detailsAt = performance.now();
    renderDetails();
  }, Math.max(0, 110 - (performance.now() - detailsAt)));
}

const siteById = (id) => app.catalog.sites.find((s) => s.id === id);
const shortName = (s) => siteById(s.id)?.shortName || s.name;
// Camera altitude (Moon radii) that frames a 5 × 5 grid without zooming past the texture detail.
const gridAltitude = (spacing = Number(app.screen?.spacing || $('#spacing').value)) => Math.max(.06, spacing * .14);

function cardContext() {
  return {
    coverage: app.coverage,
    timeline: app.timeline,
    focus: (site) => { clearFocus(false); setView('moon', site); },
    jump: (ms) => setTime(ms),
    jumpToLanding: (site) => jumpToLanding(site.id),
    horizonCheck: runHorizonCheck,
    horizonCheckResults: app.horizonChecks,
  };
}

function renderDetails() {
  const state = app.state;
  if (!state) return;
  const box = $('#details');
  const remembered = new Map([...box.querySelectorAll('details[data-key]')].map((d) => [d.dataset.key, d.open]));
  const ctx = cardContext();
  let title;
  let nodes;
  if (app.focus) {
    const { kind, item } = app.focus;
    title = kind === 'candidate' ? 'Candidate under study' : 'Picked location';
    nodes = item
      ? [focusCard(item, {
        ...ctx,
        focus: (p) => setView('moon', kind === 'candidate' ? { ...p, altitude: gridAltitude() } : p),
        screenHere: kind === 'point' ? (p) => screenAround(p.latitude, p.longitude) : null,
      })]
      : [h('p', { class: 'lede' }, h('span', { class: 'spinner small', 'aria-hidden': 'true' }), ` Tracing the terrain horizon at ${coords(app.focus)}…`)];
  } else if (app.view === 'earth') {
    title = 'A line home · Deep Space Network';
    nodes = stationsView(state, { shortName, focused: app.focusedStation, focus: (station) => focusStation(station.id) });
  } else {
    title = state.sites.length > 1 ? `Comparing ${state.sites.length} sites` : 'Site conditions';
    nodes = state.sites.map((site) => siteCard(site, {
      ...ctx,
      catalogSite: siteById(site.id),
      series: app.timeline?.series?.[site.id],
      timelineLoading: app.timelinePending.has(site.id),
      remove: (s) => toggleSite(s.id, false),
      canRemove: app.selected.length > 1,
    }));
  }
  $('#details-title').textContent = title;
  $('#back-to-comparison').hidden = !app.focus;
  box.replaceChildren(...nodes);
  for (const d of box.querySelectorAll('details[data-key]')) {
    if (remembered.has(d.dataset.key)) d.open = remembered.get(d.dataset.key);
  }
}

async function runHorizonCheck(site) {
  try {
    const r = await api('horizon', { latitude: site.latitude, longitude: site.longitude }, `horizon-${checkKey(site)}`);
    const text = `Denser rays and a longer search change this horizon by at most ${fmt(r.angularAndRangeDifferenceDeg, 2)}° (RMS ${fmt(r.rmsDifferenceDeg, 2)}°). Swapping the local tiles for regional terrain changes it by at most ${fmt(r.terrainResolutionDifferenceDeg, 2)}°. ${r.interpretation}`;
    app.horizonChecks.set(checkKey(site), text);
    return text;
  } catch (error) {
    if (error.name === 'AbortError') return '';
    if (error instanceof ServiceError) showServiceBanner();
    return error.message;
  }
}

// ---------------------------------------------------------------- sites
function renderSiteList() {
  $('#site-list').replaceChildren(...siteList(app.catalog, app.selected, {
    maxSites: MAX_SITES,
    toggle: (id, input) => toggleSite(id, input.checked),
    focus: (id) => {
      clearFocus(false);
      if (!app.selected.includes(id)) toggleSite(id, true);
      setView('moon', siteById(id));
    },
  }));
  $('#site-hint').textContent = app.selected.length >= MAX_SITES
    ? `Comparing the maximum of ${MAX_SITES} sites. Remove one to add another.`
    : 'Past landings do not certify a site for future landers.';
}

function toggleSite(id, on) {
  if (on && !app.selected.includes(id)) {
    if (app.selected.length >= MAX_SITES) {
      toast(`Compare up to ${MAX_SITES} sites at once. Remove one first.`, 'info');
      renderSiteList();
      return;
    }
    setSelection([...app.selected, id]);
  } else if (!on && app.selected.includes(id)) {
    if (app.selected.length === 1) {
      toast('Keep at least one site in the comparison.', 'info');
      renderSiteList();
      return;
    }
    setSelection(app.selected.filter((x) => x !== id));
  }
}

function setSelection(ids) {
  app.selected = [...ids];
  renderSiteList();
  app.universe.setSelection(app.selected);
  ensureTimeline();
  renderLanes();
  refreshState();
  scheduleUrl();
}

// ---------------------------------------------------------------- exploration window
function timelineKey() {
  return JSON.stringify([app.anchor, app.end, safeSettings()]);
}

/** Reload the window summary when its key changes; otherwise fetch only newly added sites. */
function ensureTimeline() {
  if (app.timelineKey !== timelineKey()) return loadTimeline();
  const missing = app.selected.filter((id) => !app.timeline?.summary?.[id] && !app.timelinePending.has(id));
  if (missing.length) loadTimeline(missing);
}

let timelineSeq = 0;
async function loadTimeline(ids = null) {
  const key = timelineKey();
  if (!ids) {
    timelineSeq++;
    app.timeline = null;
    app.timelineKey = key;
    app.timelinePending = new Set(app.selected);
  }
  const request = ids || [...app.selected];
  request.forEach((id) => app.timelinePending.add(id));
  const seq = timelineSeq;
  renderLanes();
  scheduleDetails();
  const days = (app.end - app.anchor) / DAY;
  try {
    if (days < .25) throw new InputError('The window is too short to summarize.');
    const params = { ...stateParams(), sites: request.join(','), utc: iso(app.anchor), days: days.toFixed(5), stepMinutes: days > 7 ? 60 : 30 };
    const result = await api('timeline', params, ids ? `timeline-${request.join(',')}` : 'timeline');
    if (seq !== timelineSeq || app.timelineKey !== key) return;
    if (!app.timeline) app.timeline = result;
    else for (const part of ['series', 'summary', 'events', 'windows']) Object.assign(app.timeline[part], result[part]);
  } catch (error) {
    if (error.name !== 'AbortError' && !(error instanceof InputError)) report(error, 'Window summary: ');
  } finally {
    if (seq === timelineSeq) {
      request.forEach((id) => app.timelinePending.delete(id));
      renderLanes();
      scheduleDetails();
    }
  }
}

function renderLanes() {
  if (!app.catalog) return;
  $('#lanes').replaceChildren(...lanes(app.timeline, app.selected.map(siteById), {
    anchor: app.anchor,
    end: app.end,
    loading: (site) => app.timelinePending.has(site.id),
    jump: (ms) => setTime(ms),
    shortName: (site) => site.shortName,
  }));
  updateCursor();
}

function updateCursor() {
  const span = app.end - app.anchor;
  const pct = span > 0 ? ((app.now - app.anchor) / span) * 100 : 0;
  for (const cursor of $$('.lane-track .cursor')) cursor.style.left = `${pct}%`;
}

function placeWindow(ms, lead = 0) {
  const span = Number($('#window').value) * DAY;
  let anchor = Math.floor((ms - lead * span) / 60000) * 60000;
  anchor = Math.max(app.coverage.start, Math.min(anchor, app.coverage.end - span));
  app.anchor = anchor;
  app.end = Math.min(app.coverage.end, anchor + span);
  $('#time-slider').max = String((app.end - app.anchor) / 1000);
  $('#range-start').textContent = utcShort(app.anchor);
  $('#range-end').textContent = utcShort(app.end);
}

function windowChanged() {
  const span = Number($('#window').value) * DAY;
  const keep = app.now >= app.anchor && app.now <= app.anchor + span && app.anchor + span <= app.coverage.end;
  placeWindow(keep ? app.anchor : app.now);
  syncTimeInputs();
  ensureTimeline();
  renderLanes();
}

// ---------------------------------------------------------------- time
const stepMs = () => Number($('#increment').value) * 1000;

/** Accept 24-hour "H:MM", "HH:MM", "HHMM" or "HH:MM:SS"; returns "HH:MM:SS" or null. */
function parseClock(text) {
  const match = /^\s*([01]?\d|2[0-3]):?([0-5]\d)(?::([0-5]\d))?\s*$/.exec(text);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}:${match[3] || '00'}` : null;
}

function syncTimeInputs() {
  const text = iso(app.now);
  const date = $('#date'), clock = $('#clock'), slider = $('#time-slider');
  if (document.activeElement !== date) date.value = text.slice(0, 10);
  if (document.activeElement !== clock) clock.value = text.slice(11, 16);
  slider.value = String((app.now - app.anchor) / 1000);
  slider.setAttribute('aria-valuetext', utcLong(app.now));
  updateCursor();
}

function setTime(ms, { reanchor = false, lead = 0, keepPlaying = false } = {}) {
  if (!app.coverage || !Number.isFinite(ms)) { if (app.coverage) syncTimeInputs(); return Promise.resolve(false); }
  if (ms < app.coverage.start || ms > app.coverage.end) {
    toast(`Supported times run from ${utcLong(app.coverage.start)} to ${utcLong(app.coverage.end)}. Later dates need a newer NASA Earth orientation kernel.`);
    syncTimeInputs();
    return Promise.resolve(false);
  }
  if (!keepPlaying) stop();
  app.now = Math.round(ms / 1000) * 1000;
  if (reanchor || app.now < app.anchor || app.now > app.end) {
    placeWindow(app.now, lead);
    ensureTimeline();
    renderLanes();
  }
  syncTimeInputs();
  timeChanged();
  scheduleUrl();
  return refreshState();
}

let pointTimer = 0;
let screenTimer = 0;
function timeChanged() {
  if (app.focus?.kind === 'point') {
    clearTimeout(pointTimer);
    pointTimer = setTimeout(refreshPoint, 120);
  }
  if (app.screen) {
    clearTimeout(screenTimer);
    updateScanStatus();
    if (!app.playing && app.screen.at !== app.now) screenTimer = setTimeout(() => scan({ quiet: true }), 650);
  }
}

function step(direction) {
  if (!app.state) return;
  setTime(app.now + direction * stepMs());
}

async function togglePlay() {
  if (!app.state) return;
  if (app.playing) return stop();
  if (app.now + stepMs() > app.end) await setTime(app.anchor);
  app.playing = true;
  updatePlayButton();
  while (app.playing) {
    const next = app.now + stepMs();
    if (next > app.end) {
      stop();
      toast('Reached the end of the window. Press Play to replay it, or choose a longer window.', 'info');
      break;
    }
    const started = performance.now();
    const ok = await setTime(next, { keepPlaying: true });
    if (!ok) { stop(); break; }
    await sleep(Math.max(0, 140 - (performance.now() - started)));
  }
}

function stop() {
  if (!app.playing) return;
  app.playing = false;
  updatePlayButton();
  timeChanged();
}

function updatePlayButton() {
  const button = $('#play');
  button.setAttribute('aria-pressed', String(app.playing));
  button.classList.toggle('playing', app.playing);
  button.querySelector('span').textContent = app.playing ? 'Pause' : 'Play';
}

function jumpToLanding(id) {
  const site = siteById(id);
  const ms = Date.parse(site.touchdownUtc);
  if (!(ms >= app.coverage.start && ms <= app.coverage.end)) {
    toast(`${site.name} landed on ${site.landed}, outside the ${app.catalog.coverage.start.slice(0, 4)}–${app.catalog.coverage.end.slice(0, 4)} range of the pinned kernels.`, 'info');
    return;
  }
  clearFocus(false);
  if (!app.selected.includes(id)) {
    if (app.selected.length >= MAX_SITES) setSelection([...app.selected.slice(1), id]);
    else toggleSite(id, true);
  }
  setView('moon', site);
  setTime(ms, { reanchor: true, lead: .1 });
  toast(`${site.name} touchdown: ${utcLong(ms)} (${site.touchdownPrecision}).`, 'info');
}

// ---------------------------------------------------------------- views & focus
function setView(view, item = null, { instant = false } = {}) {
  if (!VIEWS.includes(view) || !app.universe) return;
  app.view = view;
  for (const button of $$('[data-view]')) button.setAttribute('aria-pressed', String(button.dataset.view === view));
  if (view !== 'earth') app.focusedStation = null;
  app.universe.focus(view, item, { instant });
  scheduleDetails();
  scheduleUrl();
}

function focusStation(id) {
  const station = app.state?.stations.find((s) => s.id === id);
  if (!station) return;
  app.focusedStation = id;
  if (app.view !== 'earth') setView('earth', station);
  else app.universe.focus('earth', station);
  scheduleDetails();
}

function onPick(item) {
  if (item.type === 'site') {
    clearFocus(false);
    if (!app.selected.includes(item.id)) toggleSite(item.id, true);
    setView('moon', siteById(item.id));
  } else if (item.type === 'station') {
    focusStation(item.id);
  } else if (item.type === 'candidate') {
    selectCandidate(item.item.data);
  } else if (item.type === 'point') {
    pickPoint(item.latitude, item.longitude);
  }
}

function pickPoint(latitude, longitude) {
  $('#latitude').value = Math.max(-89.5, Math.min(89.5, latitude)).toFixed(2);
  $('#longitude').value = longitude.toFixed(2);
  clearScreen();
  app.focus = { kind: 'point', latitude, longitude, item: null };
  syncExtras();
  renderDetails();
  if (isMobile()) $('.right-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  refreshPoint();
}

async function refreshPoint() {
  const focus = app.focus;
  if (focus?.kind !== 'point') return;
  try {
    const result = await api('point', { ...stateParams(), latitude: focus.latitude.toFixed(5), longitude: focus.longitude.toFixed(5) }, 'point');
    if (app.focus !== focus) return;
    focus.item = result;
    syncExtras();
    scheduleDetails();
  } catch (error) {
    report(error);
  }
}

function selectCandidate(candidate) {
  app.focus = { kind: 'candidate', item: candidate };
  setView('moon', { ...candidate, altitude: gridAltitude() });
  renderCandidates();
  syncExtras();
  scheduleDetails();
  if (isMobile()) $('.right-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function clearFocus(render = true) {
  if (!app.focus) return;
  app.focus = null;
  controllers.get('point')?.abort();
  syncExtras();
  if (app.screen) renderCandidates();
  if (render) renderDetails();
}

function syncExtras() {
  if (!app.universe) return;
  const items = [];
  if (app.screen) {
    let rank = 0;
    for (const c of app.screen.result.candidates) {
      if (c.passesDateScreen) rank++;
      const focused = app.focus?.kind === 'candidate' && app.focus.item.id === c.id;
      items.push({ key: `extra:${c.id}`, kind: 'candidate', latitude: c.latitude, longitude: c.longitude, passes: c.passesDateScreen, label: focused ? 'Selected candidate' : c.passesDateScreen ? `#${rank}` : '', data: c });
    }
    app.screen.result.rejections.forEach((r, i) => {
      items.push({ key: `extra:rejected-${i}`, kind: 'rejected', latitude: r.latitude, longitude: r.longitude, label: '', data: r });
    });
  }
  if (app.focus?.kind === 'point') {
    items.push({ key: 'extra:picked', kind: 'picked', latitude: app.focus.latitude, longitude: app.focus.longitude, label: 'Picked point', data: app.focus.item });
  }
  app.universe.setExtras(items);
}

// ---------------------------------------------------------------- discover
function setupProfiles() {
  const select = $('#landing-profile');
  select.replaceChildren(...app.catalog.landingProfiles.map((p) => h('option', { value: p.id, text: p.name })));
  select.addEventListener('change', applyProfile);
  applyProfile();
}

function applyProfile() {
  const profile = app.catalog.landingProfiles.find((p) => p.id === $('#landing-profile').value);
  $('#max-slope').value = profile.maxSlopeDeg;
  $('#max-slope').disabled = profile.id === 'apollo-early';
  $('#roughness').disabled = profile.id !== 'study';
  $('#profile-note').textContent = profile.note;
  clearScreen();
}

function clearScreen() {
  clearTimeout(screenTimer);
  controllers.get('candidates')?.abort();
  if (!app.screen) return;
  app.screen = null;
  if (app.focus?.kind === 'candidate') app.focus = null;
  $('#candidate-results').replaceChildren();
  $('#scan-status').textContent = 'Inputs changed. Run the screen again; a shortlist is never a landing approval.';
  syncExtras();
  scheduleDetails();
}

function screenAround(latitude, longitude) {
  $('#latitude').value = Math.max(-89.5, Math.min(89.5, latitude)).toFixed(2);
  $('#longitude').value = longitude.toFixed(2);
  setTab('discover');
  if (isMobile()) $('.left-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  scan();
}

async function scan({ quiet = false } = {}) {
  if (!app.state) return;
  let params;
  try {
    params = { ...stateParams(), ...discoverParams() };
  } catch (error) {
    if (!quiet) toast(error.message);
    return;
  }
  const at = app.now;
  const button = $('#scan');
  button.disabled = true;
  $('#scan-status').textContent = quiet
    ? `Updating the screen for ${utcShort(at)} UTC…`
    : 'Screening terrain and landing-ellipse evidence, then sunlight and DSN geometry…';
  try {
    const result = await api('candidates', params, 'candidates');
    app.screen = { result, at, spacing: params.spacing };
    if (app.focus?.kind === 'candidate') {
      const same = result.candidates.find((c) => c.id === app.focus.item.id);
      app.focus = same ? { kind: 'candidate', item: same } : null;
    } else if (!quiet) {
      app.focus = null;
      setView('moon', { latitude: Number(params.latitude), longitude: Number(params.longitude), altitude: gridAltitude() });
    }
    renderCandidates();
    syncExtras();
    scheduleDetails();
    if (at !== app.now) timeChanged();
  } catch (error) {
    if (error.name === 'AbortError') return;
    $('#scan-status').textContent = 'Screen failed. No candidate results were substituted.';
    report(error);
  } finally {
    button.disabled = false;
  }
}

function renderCandidates() {
  const box = $('#candidate-results');
  if (!app.screen) { box.replaceChildren(); return; }
  box.replaceChildren(...candidateResults(app.screen.result, {
    focusedId: app.focus?.kind === 'candidate' ? app.focus.item.id : null,
    select: selectCandidate,
  }));
  updateScanStatus();
}

function updateScanStatus() {
  if (!app.screen) return;
  const { result, at } = app.screen;
  const radio = result.candidates.some((c) => c.constraints.radio !== 'not-required');
  let text = `${result.tested} tested → ${result.tested - result.terrainRejected} pass terrain → ${result.datePassed} pass sunlight${radio ? ' & DSN' : ''} at ${utcShort(at)} UTC. None certified: fine hazards stay unknown.`;
  if (at !== app.now) text += app.playing ? ' Paused during playback.' : ' Updating for the new time…';
  $('#scan-status').textContent = text;
}

// ---------------------------------------------------------------- settings, tabs, URL, export
function settingsChanged() {
  try {
    settings();
  } catch (error) {
    toast(error.message);
    return;
  }
  stop();
  if (app.focus?.kind === 'point') refreshPoint();
  if (app.screen) scan({ quiet: true });
  loadTimeline();
  refreshState();
}

function setTab(tab) {
  app.tab = tab;
  for (const name of ['sites', 'discover', 'learn']) {
    const on = name === tab;
    const button = $(`#tab-${name}`);
    button.setAttribute('aria-selected', String(on));
    button.tabIndex = on ? 0 : -1;
    $(`#pane-${name}`).hidden = !on;
  }
}

let urlTimer = 0;
function scheduleUrl() {
  clearTimeout(urlTimer);
  urlTimer = setTimeout(() => {
    if (!app.state) return;
    const query = new URLSearchParams({ utc: iso(app.now), sites: app.selected.join(','), view: app.view });
    history.replaceState(null, '', `?${query}`);
  }, 400);
}

function readUrl() {
  const query = new URLSearchParams(location.search);
  const utc = query.get('utc');
  const ms = utc && utc.endsWith('Z') ? Date.parse(utc) : NaN;
  const sites = query.get('sites')?.split(',').filter(Boolean) || [];
  const validSites = sites.length >= 1 && sites.length <= MAX_SITES && new Set(sites).size === sites.length && sites.every((id) => siteById(id));
  const view = query.get('view');
  return {
    ms: ms >= app.coverage.start && ms <= app.coverage.end ? ms : null,
    sites: validSites ? sites : null,
    view: VIEWS.includes(view) ? view : null,
  };
}

function defaultTime() {
  const hour = Math.floor(Date.now() / 3600000) * 3600000;
  if (hour >= app.coverage.start && hour <= app.coverage.end) return hour;
  return hour > app.coverage.end ? app.coverage.end - 3 * DAY : app.coverage.start;
}

function exportJson() {
  if (!app.state) return;
  const payload = {
    exportedUtc: iso(Date.now()),
    modelVersion: app.catalog.modelVersion,
    note: 'Educational geometry and terrain screening; not flight certified. No candidate is a landing approval.',
    settings: safeSettings(),
    state: app.state,
    window: app.timeline ? { startUtc: iso(app.anchor), endUtc: iso(app.end), summary: app.timeline.summary, events: app.timeline.events, windows: app.timeline.windows, method: app.timeline.method } : null,
    focus: app.focus?.item || null,
    screen: app.screen?.result || null,
    inputs: app.catalog.inputs,
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const anchor = h('a', { href: url, download: `lunar-horizon-${app.state.utc.slice(0, 16).replace(':', '')}.json` });
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------------------------------------------------------------- layout
function syncLayout() {
  const timebar = $('#timebar');
  document.documentElement.style.setProperty('--timebar-h', `${Math.ceil(timebar.getBoundingClientRect().height)}px`);
  if (!app.universe) return;
  const stage = $('#stage').getBoundingClientRect();
  const tools = $('.scene-tools').getBoundingClientRect();
  if (isMobile()) {
    app.universe.setFreeArea({ left: 0, top: 0, right: stage.width, bottom: tools.top - stage.top - 4 });
  } else {
    const left = $('.left-panel').getBoundingClientRect();
    const right = $('.right-panel').getBoundingClientRect();
    const top = $('.topbar').getBoundingClientRect();
    app.universe.setFreeArea({ left: left.right - stage.left + 8, right: right.left - stage.left - 8, top: top.bottom - stage.top + 4, bottom: tools.top - stage.top - 6 });
  }
}

// ---------------------------------------------------------------- tour hooks
const tourActions = {
  snapshot: () => ({
    selected: [...app.selected], view: app.view, now: app.now, anchor: app.anchor, tab: app.tab,
    windowDays: $('#window').value, horizon: $('#horizon').value, increment: $('#increment').value,
  }),
  restore(saved) {
    stop();
    clearFocus(false);
    $('#increment').value = saved.increment;
    const horizonChanged = $('#horizon').value !== saved.horizon;
    $('#horizon').value = saved.horizon;
    $('#window').value = saved.windowDays;
    placeWindow(saved.anchor);
    setSelection(saved.selected);
    if (horizonChanged) loadTimeline();
    setTime(saved.now);
    setTab(saved.tab);
    setView(saved.view);
  },
  apply(setup) {
    stop();
    clearFocus(false);
    if (setup.windowDays && $('#window').value !== String(setup.windowDays)) {
      $('#window').value = String(setup.windowDays);
      windowChanged();
    }
    if ($('#horizon').value !== 'terrain') { $('#horizon').value = 'terrain'; settingsChanged(); }
    if (setup.sites && setup.sites.join() !== app.selected.join()) setSelection(setup.sites);
    if (setup.discover) {
      $('#latitude').value = setup.discover.latitude;
      $('#longitude').value = setup.discover.longitude;
      $('#spacing').value = setup.discover.spacing;
      clearScreen();
    }
    setTab(setup.tab || 'sites');
    setView(setup.view || 'moon', setup.focusSite ? siteById(setup.focusSite) : null);
  },
  play(increment) {
    $('#increment').value = String(increment);
    if (!app.playing) togglePlay();
  },
  toggleHorizon() {
    $('#horizon').value = $('#horizon').value === 'terrain' ? 'sphere' : 'terrain';
    settingsChanged();
    toast($('#horizon').value === 'terrain' ? 'Horizon model: LOLA terrain' : 'Horizon model: flat horizon (no terrain)', 'info');
  },
  advance: (ms) => setTime(app.now + ms),
  openEvents(id) {
    const details = document.querySelector(`details[data-key="events:${id}"]`);
    if (details) {
      details.open = true;
      details.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      toast('The window summary is still calculating. Try again in a moment.', 'info');
    }
  },
  jumpToLanding,
  scan: () => scan(),
};

// ---------------------------------------------------------------- events
function bindEvents() {
  for (const button of $$('[data-view]')) button.addEventListener('click', () => { clearFocus(false); setView(button.dataset.view); });
  const tabs = ['sites', 'discover', 'learn'];
  for (const name of tabs) $(`#tab-${name}`).addEventListener('click', () => setTab(name));
  $('.tabs').addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const next = tabs[(tabs.indexOf(app.tab) + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    setTab(next);
    $(`#tab-${next}`).focus();
    event.preventDefault();
  });
  $('#tour-button').addEventListener('click', () => {
    if (!app.tour) return;
    setTab('learn');
    if (isMobile()) $('.left-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (!app.tour.active) app.tour.start(0);
  });

  const dialog = $('#sources-dialog');
  $('#sources-button').addEventListener('click', () => dialog.showModal());
  $('#close-sources').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });

  $('#recenter').addEventListener('click', () => app.universe?.recenter());
  $('#show-labels').addEventListener('change', (event) => app.universe?.setLabelsVisible(event.target.checked));
  $('#true-scale').addEventListener('change', (event) => {
    app.universe?.setTrueScale(event.target.checked);
    $('#scale-note').textContent = event.target.checked ? 'Real sizes and distances · markers enlarged' : 'Illustrative: distances compressed, Sun shrunk';
  });

  const dateChanged = () => {
    const date = $('#date').value;
    const clock = parseClock($('#clock').value);
    if (!date) return;
    if (!clock) {
      toast('Enter the UTC time as HH:MM on a 24-hour clock, for example 17:30.');
      syncTimeInputs();
      return;
    }
    setTime(Date.parse(`${date}T${clock}Z`), { reanchor: true });
  };
  $('#date').addEventListener('change', dateChanged);
  $('#clock').addEventListener('change', dateChanged);
  $('#now').addEventListener('click', () => setTime(Math.floor(Date.now() / 60000) * 60000, { reanchor: true }));
  $('#back').addEventListener('click', () => step(-1));
  $('#forward').addEventListener('click', () => step(1));
  $('#play').addEventListener('click', togglePlay);
  $('#window').addEventListener('change', windowChanged);
  const slider = $('#time-slider');
  slider.addEventListener('input', () => setTime(app.anchor + Number(slider.value) * 1000));
  slider.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      step(event.key === 'ArrowRight' ? 1 : -1);
    }
  });

  for (const id of ['horizon', 'panel', 'area', 'efficiency', 'margin']) $(`#${id}`).addEventListener('change', settingsChanged);
  for (const id of ['latitude', 'longitude', 'spacing', 'max-slope', 'min-sun', 'require-radio', 'roughness', 'ellipse-major', 'ellipse-minor', 'ellipse-heading', 'lander-diameter']) {
    $(`#${id}`).addEventListener('change', clearScreen);
  }
  $('#scan').addEventListener('click', () => scan());
  $('#back-to-comparison').addEventListener('click', () => clearFocus());
  $('#export').addEventListener('click', exportJson);
  $('#toast').addEventListener('click', () => { $('#toast').hidden = true; });

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || $('#sources-dialog').open) return;
    const t = event.target;
    const typing = (t instanceof HTMLInputElement && !['checkbox', 'radio', 'range', 'button'].includes(t.type))
      || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement || t.isContentEditable;
    if (typing) return;
    const key = event.key.toLowerCase();
    if (key === ' ' && !(t instanceof HTMLButtonElement) && !(t instanceof HTMLInputElement)) { event.preventDefault(); togglePlay(); }
    else if ((key === 'arrowright' || key === 'arrowleft') && !(t instanceof HTMLInputElement) && !t.closest?.('.tabs')) { event.preventDefault(); step(key === 'arrowright' ? 1 : -1); }
    else if (['1', '2', '3', '4'].includes(key)) { clearFocus(false); setView(VIEWS[Number(key) - 1]); }
    else if (key === 'l') { const box = $('#show-labels'); box.checked = !box.checked; box.dispatchEvent(new Event('change')); }
    else if (key === 'r') app.universe?.recenter();
    else if (key === 'escape' && app.focus) clearFocus();
  });

  const observer = new ResizeObserver(() => syncLayout());
  for (const selector of ['#timebar', '#stage', '.left-panel', '.right-panel', '.topbar']) observer.observe($(selector));
  window.addEventListener('resize', syncLayout);
}

// ---------------------------------------------------------------- startup
async function start() {
  bindEvents();
  syncLayout();
  try {
    app.catalog = await api('catalog');
  } catch (error) {
    showServiceBanner();
    $('#loading-text').textContent = 'Science service unavailable';
    setStatus('Setup required · no synthetic fallback', 'error');
    if (!(error instanceof ServiceError)) toast(`Startup failed: ${error.message}`);
    return;
  }
  app.coverage = { start: Date.parse(app.catalog.coverage.start), end: Date.parse(app.catalog.coverage.end) };
  for (const id of ['#date']) {
    $(id).min = app.catalog.coverage.start.slice(0, 10);
    $(id).max = app.catalog.coverage.end.slice(0, 10);
  }
  const url = readUrl();
  if (url.sites) app.selected = url.sites;
  app.now = url.ms ?? defaultTime();
  setupProfiles();
  renderSiteList();
  $('#sources-content').replaceChildren(...sourcesContent(app.catalog));
  app.tour = createTour($('#lessons'), $('#tour-card'), tourActions);

  try {
    app.universe = new Universe($('#stage'), { onPick });
    app.universe.setCatalog(app.catalog);
    app.universe.setSelection(app.selected);
    syncLayout();
    await app.universe.load();
  } catch (error) {
    $('#loading-text').textContent = 'The 3D view could not start';
    toast(`3D view: ${error.message}. WebGL and the prepared NASA assets (scripts/setup) are required.`);
    return;
  }
  placeWindow(app.now);
  syncTimeInputs();
  loadTimeline();
  await refreshState();
  if (url.view && url.view !== 'moon') setView(url.view, null, { instant: true });
}

start();
