// DOM rendering for panels, cards, charts and timeline lanes.
// External or scientific text is always inserted as text nodes, never as HTML.

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Small hyperscript helper: h('p', { class: 'x', onClick }, 'text', childNode). */
export function h(tag, props, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) if (child !== null && child !== undefined && child !== false) node.append(child);
  return node;
}

function svg(tag, attrs = {}, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) if (value !== undefined && value !== null) node.setAttribute(key, String(value));
  for (const child of children) if (child) node.append(child);
  return node;
}

export const fmt = (x, digits = 1) => (Number.isFinite(x) ? x.toFixed(digits) : '—');
/** Signed number with a typographic minus, e.g. "−0.3". */
export const signed = (x, digits = 1) => {
  if (!Number.isFinite(x)) return '—';
  const text = Math.abs(x).toFixed(digits);
  return Number(text) === 0 ? text : `${x < 0 ? '−' : '+'}${text}`;
};
export const coords = (p) => `${fmt(Math.abs(p.latitude), 2)}° ${p.latitude < 0 ? 'S' : 'N'}, ${fmt(Math.abs(p.longitude), 2)}° ${p.longitude < 0 ? 'W' : 'E'}`;
export const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');
/** "14 Nov 2026, 12:00 UTC" */
export function utcLong(ms) {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}
/** "14 Nov 12:00" */
export function utcShort(ms) {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
export const dateLong = (isoDate) => { const [y, m, d] = isoDate.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
/** Whole percents, but never round a brief gap up to 100% (or a brief window down to 0%). */
const percent = (x) => {
  if (!Number.isFinite(x)) return '—';
  if (x < 1 && x > .995) return `${(Math.floor(x * 1000) / 10).toFixed(1)}%`;
  if (x > 0 && x < .005) return `${(Math.ceil(x * 1000) / 10).toFixed(1)}%`;
  return `${fmt(x * 100, 0)}%`;
};
const withCommas = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('en-US') : '—');

function link(text, href) {
  return h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text, h('span', { class: 'ext', 'aria-hidden': 'true', text: ' ↗' }));
}

function icon(path) {
  return svg('svg', { viewBox: '0 0 16 16', 'aria-hidden': 'true' }, svg('path', { d: path }));
}
export const ICONS = {
  focus: 'M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3M8 5.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z',
  close: 'M4 4l8 8M12 4l-8 8',
  jump: 'M3 8h9M8.5 4.5 12 8l-3.5 3.5',
};
const iconButton = (label, path, onClick, extra = {}) => h('button', { type: 'button', class: 'icon-button', 'aria-label': label, title: label, onClick, ...extra }, icon(path));

// ---------- site list (left panel) ----------
export function siteList(catalog, selected, { toggle, focus, maxSites }) {
  const full = selected.length >= maxSites;
  return catalog.sites.map((site) => {
    const on = selected.includes(site.id);
    const id = `site-${site.id}`;
    const check = h('input', { type: 'checkbox', id, checked: on, disabled: !on && full });
    check.addEventListener('change', () => toggle(site.id, check));
    const program = site.program === 'CLPS' ? 'CLPS' : 'Apollo';
    return h('div', { class: `site-option${on ? ' selected' : ''}`, dataset: { site: site.id } },
      check,
      h('label', { for: id },
        h('span', { class: 'site-name' }, site.name),
        h('span', { class: 'site-meta' }, h('span', { class: `tag ${program.toLowerCase()}`, text: program }), ` ${site.region} · ${site.landed.slice(0, 4)}`)),
      iconButton(`Fly to ${site.name}`, ICONS.focus, () => focus(site.id)));
  });
}

// ---------- sky chart ----------
/** Local horizon chart: terrain silhouette plus Sun and Earth now and across the window. */
export function skyChart(site, series) {
  const W = 320, top = 10, bottom = 104, H = 122;
  const terrain = site.model.horizon === 'terrain' ? site.terrain.altitudeDeg : site.terrain.altitudeDeg.map(() => 0);
  const azimuths = site.terrain.azimuthDeg;
  const sunPath = (series || []).map((r) => [r.sunAzimuthDeg, r.sunAltitudeDeg]);
  const earthPath = (series || []).map((r) => [r.earthAzimuthDeg, r.earthAltitudeDeg]);
  let lo = Math.min(-4, Math.min(...terrain) - 2);
  let hi = Math.max(10, Math.max(...terrain) + 4, site.earth.altitudeDeg + 4);
  if (site.sun.altitudeDeg > lo) hi = Math.max(hi, site.sun.altitudeDeg + 4);
  for (const [, alt] of [...sunPath, ...earthPath]) if (Number.isFinite(alt) && alt > lo) hi = Math.max(hi, alt + 3);
  hi = Math.min(hi, 90);
  lo = Math.max(lo, -20);
  const x = (az) => (az / 360) * W;
  const y = (alt) => top + ((hi - Math.min(hi, Math.max(lo, alt))) / (hi - lo)) * (bottom - top);

  const chart = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'sky-chart', role: 'img' });
  chart.setAttribute('aria-label', `Local sky at ${site.name}. Sun ${fmt(site.sun.altitudeDeg)} degrees high at azimuth ${fmt(site.sun.azimuthDeg, 0)}; Earth ${fmt(site.earth.altitudeDeg)} degrees high at azimuth ${fmt(site.earth.azimuthDeg, 0)}. Terrain horizon reaches ${fmt(Math.max(...terrain))} degrees.`);
  chart.append(svg('rect', { x: 0, y: top, width: W, height: bottom - top, class: 'sky-bg' }));
  const step = hi - lo > 40 ? 20 : hi - lo > 20 ? 10 : 5;
  for (let a = Math.ceil(lo / step) * step; a <= hi; a += step) {
    chart.append(svg('line', { x1: 0, x2: W, y1: y(a), y2: y(a), class: a === 0 ? 'grid zero' : 'grid' }));
    chart.append(svg('text', { x: 3, y: y(a) - 2.5, class: 'tick' }, document.createTextNode(`${a}°`)));
  }
  const ridge = terrain.map((alt, i) => `${x(azimuths[i]).toFixed(1)},${y(alt).toFixed(1)}`).join(' L');
  chart.append(svg('path', { d: `M${ridge} L${W},${y(terrain[0]).toFixed(1)} L${W},${bottom} L0,${bottom} Z`, class: 'terrain' }));

  const trace = (points, cls) => {
    let d = '';
    let previous = null;
    for (const [az, alt] of points) {
      if (!Number.isFinite(az) || !Number.isFinite(alt) || alt < lo || alt > hi) { previous = null; continue; }
      d += `${previous === null || Math.abs(az - previous) > 180 ? 'M' : 'L'}${x(az).toFixed(1)},${y(alt).toFixed(1)} `;
      previous = az;
    }
    if (d) chart.append(svg('path', { d, class: `path ${cls}` }));
  };
  trace(sunPath, 'sun');
  trace(earthPath, 'earth');

  const body = (b, cls, name) => {
    const az = b.azimuthDeg ?? 0, alt = b.altitudeDeg;
    const cx = x(az), cy = y(alt);
    if (alt < lo) {
      chart.append(svg('path', { d: `M${cx - 5},${bottom - 7} L${cx + 5},${bottom - 7} L${cx},${bottom - 1} Z`, class: `marker ${cls}` }));
      chart.append(svg('text', { x: Math.min(W - 40, Math.max(2, cx - 18)), y: bottom - 10, class: `body-label ${cls}` }, document.createTextNode(`${name} ${fmt(alt, 0)}°`)));
      return;
    }
    if (cls === 'sun') chart.append(svg('circle', { cx, cy, r: 8, class: 'halo' }));
    chart.append(svg('circle', { cx, cy, r: 4.2, class: `marker ${cls}` }));
  };
  body(site.earth, 'earth', 'Earth');
  body(site.sun, 'sun', 'Sun');
  [['N', 0], ['E', 90], ['S', 180], ['W', 270], ['N', 360]].forEach(([label, az]) => {
    chart.append(svg('text', { x: Math.min(W - 8, Math.max(1, x(az) - 3.5)), y: H - 3, class: 'cardinal' }, document.createTextNode(label)));
  });
  const legend = h('figcaption', { class: 'legend' },
    h('span', { class: 'key terrain', text: site.model.horizon === 'terrain' ? 'Terrain horizon' : 'Flat horizon' }),
    h('span', { class: 'key sun', text: series ? 'Sun · path over window' : 'Sun' }),
    h('span', { class: 'key earth', text: series ? 'Earth · path' : 'Earth' }));
  return h('figure', { class: 'sky' }, chart, legend);
}

// ---------- site cards ----------
function metric(label, value, unit, note, cls) {
  return h('div', { class: `metric ${cls}` },
    h('span', { class: 'metric-label', text: label }),
    h('span', { class: 'metric-value' }, value, h('small', { text: unit })),
    h('span', { class: 'metric-note', text: note }));
}

function statusChips(site) {
  const visible = site.stations.filter((s) => s.visible);
  const diskFraction = site.solarDiskVisibleFraction;
  const sun = site.sunVisible
    ? (diskFraction < .995 ? `Sun ${percent(diskFraction)} visible` : 'Sunlit')
    : site.sun.altitudeDeg > -1 ? 'Sun behind terrain' : 'Night';
  const link = visible.length ? `${visible.length} DSN antenna${visible.length > 1 ? 's' : ''} in view` : site.earth.clearanceDeg > 0 ? 'Earth up, no DSN contact' : 'Earth below horizon';
  return h('div', { class: 'chips' },
    h('span', { class: `pill sun ${site.sunVisible ? 'on' : 'off'}`, text: sun }),
    h('span', { class: `pill link ${visible.length ? 'on' : 'off'}`, text: link }));
}

function sunNote(site) {
  const c = site.sun.clearanceDeg;
  if (!Number.isFinite(c)) return '';
  const where = site.model.horizon === 'terrain' ? 'terrain' : 'flat horizon';
  return c >= 0 ? `above ${where}` : `below ${where}`;
}

function panelNote(model) {
  return `${model.panel === 'tracking' ? 'tracking' : 'level'} · ${fmt(model.areaM2, model.areaM2 < 10 ? 1 : 0)} m² · ${fmt(model.efficiency * 100, 0)}%`;
}

export function siteCard(site, ctx) {
  const catalogSite = ctx.catalogSite || {};
  const head = h('header', { class: 'card-head' },
    h('div', { class: 'card-title' },
      h('h3', { text: site.name }),
      h('p', { class: 'meta', text: (catalogSite.id
        ? [`${catalogSite.program} · ${catalogSite.provider}`, coords(site)]
        : [site.status, site.name === coords(site) ? null : coords(site), site.gridOffsetKm ? `${offsetText(site.gridOffsetKm)} of grid center` : null]).filter(Boolean).join(' · ') })),
    h('div', { class: 'card-actions' },
      iconButton(`Fly to ${site.name}`, ICONS.focus, () => ctx.focus(site)),
      ctx.remove ? iconButton(`Remove ${site.name} from the comparison`, ICONS.close, () => ctx.remove(site), { disabled: !ctx.canRemove }) : null));
  const card = h('article', { class: 'card site-card', dataset: { key: `site:${site.id}` } }, head);
  if (catalogSite.touchdownUtc) card.append(touchdownLine(catalogSite, ctx));
  card.append(statusChips(site),
    h('div', { class: 'metrics' },
      metric('Sun clearance', signed(site.sun.clearanceDeg), '°', sunNote(site), 'sun'),
      metric('Panel power', fmt(site.powerW, site.powerW < 10 ? 1 : 0), ' W', panelNote(site.model), 'sun'),
      metric('Earth clearance', signed(site.earth.clearanceDeg), '°', site.earth.clearanceDeg >= 0 ? 'above horizon' : 'below horizon', 'earth'),
      metric('Signal delay', fmt(site.oneWayLightSeconds, 2), ' s', 'one way to Earth', 'earth')),
    skyChart(site, ctx.series));
  if (!ctx.noWindow) card.append(windowSection(site, ctx));
  card.append(detailBlock(site, catalogSite, ctx));
  if (ctx.horizonCheck) card.append(horizonCheckBlock(site, ctx));
  return card;
}

function touchdownLine(catalogSite, ctx) {
  const touchdown = Date.parse(catalogSite.touchdownUtc);
  const inRange = touchdown >= ctx.coverage.start && touchdown <= ctx.coverage.end;
  const line = h('p', { class: 'mission-line' }, h('span', { text: `${catalogSite.lander} · landed ${dateLong(catalogSite.landed)}` }));
  if (inRange) {
    line.append(h('button', { type: 'button', class: 'link-button', title: `Set the time to ${utcLong(touchdown)}`, onClick: () => ctx.jumpToLanding(catalogSite) }, 'Touchdown conditions →'));
  }
  return line;
}

function windowSection(site, ctx) {
  const box = h('section', { class: 'window-box', 'aria-label': 'Exploration window summary' });
  const { timeline } = ctx;
  const summary = timeline?.summary?.[site.id];
  if (!summary) {
    box.append(h('p', { class: 'window-pending' }, ctx.timelineLoading ? h('span', { class: 'spinner small', 'aria-hidden': 'true' }) : null,
      ctx.timelineLoading ? 'Calculating sunlight and contact across the window…' : 'Window summary unavailable for this range.'));
    return box;
  }
  box.append(h('div', { class: 'window-stats' },
    h('div', { class: 'stat sun' }, h('b', { text: percent(summary.sunVisible) }), h('span', { text: 'sunlit' })),
    h('div', { class: 'stat earth' }, h('b', { text: percent(summary.anyStationVisible) }), h('span', { text: 'DSN contact' })),
    h('div', { class: 'stat' }, h('b', { text: `${withCommas(summary.energyWh)} Wh` }), h('span', { text: 'ideal energy' }))));
  const events = timeline.events[site.id] || [];
  const names = { sunVisible: 'Sunlight', earthVisible: 'Earth above margin', anyStationVisible: 'DSN contact' };
  const relevant = events.filter((e) => names[e.metric]);
  const list = h('ol', { class: 'events' }, relevant.map((event) => h('li', null,
    h('button', { type: 'button', class: `event ${event.metric === 'sunVisible' ? 'sun' : 'earth'}`, title: `Bracketed between ${event.bracketStartUtc} and ${event.bracketEndUtc}`, onClick: () => ctx.jump(Date.parse(event.utc)) },
      h('span', { class: 'event-time', text: utcShort(Date.parse(event.utc)) }),
      h('span', { text: `${names[event.metric]} ${event.starts ? 'begins' : 'ends'}` })))));
  const details = h('details', { dataset: { key: `events:${site.id}` } },
    h('summary', { text: relevant.length ? `Sunrise, sunset & contact changes (${relevant.length})` : 'No sunlight or contact changes in this window' }));
  if (relevant.length) details.append(list);
  details.append(h('p', { class: 'hint', text: `Searched every ${fmt(timeline.searchStepSeconds / 60, 0)} min and bracketed to ${timeline.numericalBracketSeconds} s; shorter events can be missed. Numerical timing is not terrain accuracy.` }));
  box.append(details);
  return box;
}

function detailBlock(site, catalogSite, ctx) {
  const rows = [];
  const add = (term, value) => { if (value !== undefined && value !== null && value !== '') rows.push(h('dt', { text: term }), h('dd', { text: value })); };
  if (catalogSite.id) {
    add('Lander', `${catalogSite.lander} · ${catalogSite.provider}`);
    add('Launched', dateLong(catalogSite.launched));
    add('Touchdown', `${catalogSite.touchdownUtc.replace('T', ' ').replace('Z', ' UTC')} (${catalogSite.touchdownPrecision})`);
    add('Crew', catalogSite.crew);
    add('Outcome', catalogSite.outcome);
    add('NASA payloads', catalogSite.nasaPayloads);
  }
  add('Sun', `altitude ${fmt(site.sun.altitudeDeg, 2)}°, azimuth ${fmt(site.sun.azimuthDeg, 1)}°; terrain horizon ${fmt(site.sun.horizonDeg, 2)}° in that direction`);
  add('Sun disk visible', `${percent(site.solarDiskVisibleFraction)} (Earth eclipse ${site.solarDiskUnocculted < 1 ? `blocks ${percent(1 - site.solarDiskUnocculted)}` : 'none'})`);
  add('Earth', `altitude ${fmt(site.earth.altitudeDeg, 2)}°, azimuth ${fmt(site.earth.azimuthDeg, 1)}°; distance ${withCommas(site.earth.distanceKm)} km`);
  add('Terrain', `LOLA elevation ${fmt(site.terrain.elevationKm, 3)} km; regional slope ${fmt(site.terrain.slopeDeg)}° over ~${site.terrain.resolutionM} m cells`);
  add('Horizon model', `${site.terrain.azimuthStepDeg}° rays to ${site.terrain.searchRadiusKm} km, observer ${site.terrain.observerHeightM} m above ground`);
  add('Solar flux', `${withCommas(site.solarFluxWm2)} W/m² at the Moon; ${fmt(site.irradianceWm2, 1)} W/m² on the panel`);
  const stations = h('ul', { class: 'station-mini' }, site.stations.map((s) => h('li', { class: s.visible ? 'on' : 'off' },
    h('span', { text: s.id }),
    h('span', { text: `${s.visible ? 'in view' : 'no contact'} · Moon ${fmt(s.groundAltitudeDeg, 0)}° up at station · lunar clearance ${signed(s.lunarClearanceDeg, 1)}°` }))));
  const block = h('details', { class: 'more', dataset: { key: `detail:${site.id}` } },
    h('summary', { text: catalogSite.id ? 'Mission & model details' : 'Model details' }),
    h('dl', { class: 'facts' }, rows),
    h('p', { class: 'subhead', text: 'Deep Space Network antennas' }), stations);
  if (site.note) block.append(h('p', { class: 'hint', text: site.note }));
  const sources = h('p', { class: 'sources' });
  if (site.source) sources.append(link('Location evidence', site.source));
  if (catalogSite.missionSource) sources.append(link('NASA mission page', catalogSite.missionSource));
  if (sources.childNodes.length) block.append(sources);
  return block;
}

export const checkKey = (p) => `${p.latitude.toFixed(4)},${p.longitude.toFixed(4)}`;

function horizonCheckBlock(site, ctx) {
  const result = ctx.horizonCheckResults.get(checkKey(site));
  const text = h('p', { class: 'hint', text: result || 'Compares 2° rays to 1° rays, extends the horizon search from 150 to 200 km, and swaps the 20 m local tiles for regional terrain. Differences are sensitivity measures, not accuracy guarantees.' });
  const run = h('button', { type: 'button', class: 'ghost small', onClick: async () => {
    run.disabled = true;
    text.textContent = 'Calculating three terrain horizons…';
    text.textContent = await ctx.horizonCheck(site);
    run.disabled = false;
  } }, result ? 'Run again' : 'Compare horizon sampling');
  return h('details', { class: 'more', dataset: { key: `check:${site.id}` } }, h('summary', { text: 'How sensitive is this terrain horizon?' }), text, run);
}

// ---------- focus card (picked point or candidate) ----------
export function focusCard(item, ctx) {
  const card = siteCard(item, { ...ctx, remove: null, catalogSite: {}, noWindow: true });
  card.classList.add('focus-card');
  const banner = h('p', { class: 'notice', text: item.constraints
    ? 'Exploratory candidate. Passing these screens does not qualify a landing site: rocks, small craters, approach and vehicle limits still need assessment.'
    : 'Exploratory point. Terrain is sampled from NASA LOLA; nothing here certifies a landing site.' });
  card.querySelector('.card-head').after(banner);
  if (item.constraints) card.querySelector('.metrics').after(evidenceBlock(item));
  const actions = h('div', { class: 'card-footer' });
  if (ctx.screenHere) actions.append(h('button', { type: 'button', class: 'primary small', onClick: () => ctx.screenHere(item) }, 'Screen 25 locations around here'));
  card.append(actions);
  return card;
}

const CONSTRAINT_NAMES = {
  regionalSlope: 'Regional slope', missionZone: 'Mission zone', sampledEllipseSlope: 'Slope across ellipse (20 m)',
  roughness100m: '100 m roughness', sunlight: 'Sunlight at this time', radio: 'DSN line of sight',
  approachSunAltitude: 'Approach Sun angle', landerScaleRoughness: 'Lander-scale roughness', bouldersAndCraters: 'Boulders & small craters',
  approachAndPropellant: 'Approach & propellant', landingEllipse: 'Full landing ellipse', vehicleDesign: 'Vehicle design limits',
  approachSunDirection: 'Sun direction on approach', spatialResolution: 'Hazard-scale resolution',
};
const STATE_TEXT = { pass: 'Pass', fail: 'Fail', unknown: 'Unknown', 'not-required': 'Not needed' };

function evidenceBlock(item) {
  const order = ['fail', 'pass', 'not-required', 'unknown'];
  const entries = Object.entries(item.constraints).sort((a, b) => order.indexOf(a[1]) - order.indexOf(b[1]));
  const list = h('ul', { class: 'constraints' }, entries.map(([key, value]) => h('li', { class: value },
    h('span', { class: 'state', text: STATE_TEXT[value] || value }), h('span', { text: CONSTRAINT_NAMES[key] || key }))));
  const e = item.evidence;
  const block = h('details', { class: 'more', open: true, dataset: { key: 'evidence' } },
    h('summary', { text: 'Landing evidence · pass / fail / unknown' }), list);
  if (e) {
    const lines = [['slope', 'Slope', '°'], ['roughness100m', '100 m roughness', ' m'], ['elevationError', 'Elevation error', ' m'], ['effectiveResolution', 'Effective resolution', ' m']]
      .map(([key, label, unit]) => `${label}: max ${fmt(e[key].maximum, 2)}${unit}, ${percent(e[key].coverageFraction)} of samples covered (${e[key].pixelM} m pixels)`);
    block.append(h('p', { class: 'hint', text: `${fmt(e.ellipseMajorM, 0)} × ${fmt(e.ellipseMinorM, 0)} m ellipse at ${fmt(e.headingDeg, 0)}°, ${e.samples} samples. ${lines.join('. ')}.` }));
  }
  return block;
}

// ---------- Earth view: stations ----------
export function stationsView(state, ctx) {
  const sites = state.sites;
  const table = h('table', { class: 'stations' },
    h('thead', null, h('tr', null, h('th', { scope: 'col', text: 'Antenna' }), h('th', { scope: 'col', title: 'Moon elevation above each antenna’s horizon', text: 'Moon' }),
      sites.map((s) => h('th', { scope: 'col', title: s.name, text: ctx.shortName(s) })))),
    h('tbody', null, state.stations.map((station) => {
      const rows = sites.map((s) => s.stations.find((x) => x.id === station.id));
      const elevation = rows[0]?.groundAltitudeDeg;
      return h('tr', { class: station.id === ctx.focused ? 'focused' : '' },
        h('th', { scope: 'row' }, h('button', { type: 'button', class: 'link-button', onClick: () => ctx.focus(station) }, station.name), h('small', { text: `${station.country} · ${station.diameterM} m dish` })),
        h('td', { class: elevation > 10 ? 'up' : 'down', text: `${fmt(elevation, 0)}°` }),
        rows.map((r, i) => h('td', { class: r?.visible ? 'yes' : 'no', title: `${sites[i].name}: lunar clearance ${signed(r?.lunarClearanceDeg)}°, Moon ${fmt(r?.groundAltitudeDeg)}° above the antenna's horizon` }, r?.visible ? '✓' : '–')));
    })));
  const visibleAny = sites.map((s) => `${ctx.shortName(s)}: ${s.stations.filter((x) => x.visible).length ? 'line home available' : 'no DSN contact'}`);
  return [
    h('p', { class: 'lede', text: 'Six NASA Deep Space Network antennas, placed from NAIF station kernels. A site has a line home when the antenna sees the Moon more than 10° above its horizon and the site sees Earth above its own margin.' }),
    table,
    h('p', { class: 'summary-line', text: visibleAny.join(' · ') }),
    h('p', { class: 'hint', text: 'Earth is a WGS84 ellipsoid with a static Blue Marble mosaic, not current weather. Scheduling, antenna terrain and radio link budgets are not modeled.' }),
  ];
}

// ---------- discover results ----------
export function candidateResults(result, ctx) {
  const nodes = [];
  const passing = result.candidates.filter((c) => c.passesDateScreen);
  let rank = 0;
  nodes.push(h('ul', { class: 'candidates' }, result.candidates.map((c) => {
    const failed = Object.entries(c.constraints).filter(([, v]) => v === 'fail').map(([k]) => CONSTRAINT_NAMES[k] || k);
    const offset = c.gridOffsetKm ? offsetText(c.gridOffsetKm) : '';
    if (c.passesDateScreen) rank++;
    return h('li', null, h('button', { type: 'button', class: `candidate ${c.passesDateScreen ? 'pass' : 'fail'}${ctx.focusedId === c.id ? ' focused' : ''}`, 'aria-pressed': String(ctx.focusedId === c.id), onClick: () => ctx.select(c) },
      h('span', { class: 'rank', text: c.passesDateScreen ? `#${rank}` : '–' }),
      h('span', { class: 'candidate-main' }, h('b', { text: coords(c) }), h('small', { text: [offset, `${fmt(c.terrain.slopeDeg)}° slope`, `${fmt(c.powerW, 0)} W`].filter(Boolean).join(' · ') })),
      h('span', { class: 'candidate-state', text: c.passesDateScreen ? 'Passes' : failed.length ? `Fails: ${failed.join(', ')}` : 'Fails' })));
  })));
  if (result.rejections?.length) {
    const reasons = {};
    for (const r of result.rejections) for (const k of r.failedCriteria) reasons[k] = (reasons[k] || 0) + 1;
    nodes.push(h('details', { class: 'more' }, h('summary', { text: `Rejected by terrain or zone (${result.rejections.length})` }),
      h('p', { class: 'hint', text: Object.entries(reasons).map(([k, n]) => `${CONSTRAINT_NAMES[k] || k}: ${n}`).join(' · ') })));
  }
  if (!passing.length) nodes.push(h('p', { class: 'hint', text: 'No location passed every screen at this time. Try another time, a wider grid, or relaxed assumptions; nothing is substituted.' }));
  return nodes;
}

function offsetText({ north, east }) {
  const part = (v, pos, neg) => (Math.abs(v) < .05 ? '' : `${fmt(Math.abs(v), 0)} km ${v > 0 ? pos : neg}`);
  return [part(north, 'N', 'S'), part(east, 'E', 'W')].filter(Boolean).join(' ') || 'center';
}

// ---------- timeline lanes ----------
export function lanes(timeline, sites, { anchor, end, loading, jump, shortName }) {
  const span = end - anchor;
  if (!sites.length) return [];
  return sites.map((site) => {
    const track = h('div', { class: 'lane-track' });
    const windows = timeline?.windows?.[site.id];
    if (windows) {
      for (const [key, cls] of [['sunVisible', 'sun'], ['anyStationVisible', 'link']]) {
        for (const w of windows[key]) {
          const a = Date.parse(w.startUtc), b = Date.parse(w.endUtc);
          const left = ((a - anchor) / span) * 100, width = ((b - a) / span) * 100;
          if (width <= 0) continue;
          track.append(h('span', { class: `seg ${cls}`, style: { left: `${left}%`, width: `${Math.max(width, .25)}%` } }));
        }
      }
      const sum = timeline.summary[site.id];
      track.setAttribute('role', 'img');
      track.setAttribute('aria-label', `${site.name}: sunlit ${percent(sum.sunVisible)} and DSN contact ${percent(sum.anyStationVisible)} of the window`);
    } else if (loading(site)) {
      track.classList.add('loading');
    }
    track.append(h('span', { class: 'cursor' }));
    track.addEventListener('click', (event) => {
      const box = track.getBoundingClientRect();
      jump(anchor + Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)) * span);
    });
    return h('div', { class: 'lane' }, h('span', { class: 'lane-name', title: site.name, text: shortName(site) }), track);
  });
}

// ---------- sources dialog ----------
export function sourcesContent(catalog) {
  const nodes = [
    h('p', { text: 'Lunar Horizon is an educational geometry and terrain explorer, not a flight-certified planning system. No model is 100% accurate: every value has a finite resolution and stated assumptions.' }),
    h('h3', { text: 'Calculations' }),
    h('ul', null,
      h('li', { text: `Positions: JPL DE440 via NASA/NAIF SPICE, simultaneous geometric J2000 vectors (no light-time correction). Moon orientation: ${catalog.lunarFrame}. Earth orientation: ITRF93, predicted after ${catalog.coverage.earthPredictedAfter.slice(0, 10)}.` }),
      h('li', { text: `Supported times: ${catalog.coverage.start.slice(0, 10)} to ${catalog.coverage.end.slice(0, 10)} UTC, limited by the pinned Earth orientation kernel. Requests outside this range fail instead of extrapolating.` }),
      h('li', { text: 'Terrain: NASA LOLA elevations (20 m tiles near IM-1 and IM-2, 240 m south of 60° S, about 1.9 km elsewhere). Horizons are traced along 180 rays to 150 km from an observer 2 m above the ground.' }),
      h('li', { text: 'Power: 1361 W/m² scaled by Sun distance, times the visible fraction of the solar disk (terrain and Earth eclipse), panel orientation, area and efficiency.' }),
      h('li', { text: 'Line home: each DSN antenna needs the Moon above 10° locally, and the site needs Earth above the chosen margin over its terrain horizon. No link budgets or scheduling.' })),
    h('h3', { text: 'Known limits' }),
    h('ul', null, catalog.limits.map((text) => h('li', { text }))),
    h('h3', { text: 'Landing criteria' }),
    h('p', null, 'NASA weighs terrain hazards, lighting, communications and vehicle and trajectory constraints. The Discover screen applies the available slope and roughness data, then date-specific sunlight and DSN geometry. Missing hazard evidence stays unknown, and no candidate is ever certified landable. ',
      link('NASA site-selection history', catalog.landingCriteriaSource), ' · ', link('Hazard detection', catalog.hazardSource)),
    h('h3', { text: 'Existing NASA/JPL tools' }),
    h('p', { class: 'link-list' }, catalog.references.map((r) => link(r.name, r.url))),
    h('h3', { text: 'Display' }),
    h('p', { text: 'Moon colour: NASA CGI Moon Kit (LROC). Relief: LOLA heights on a 0.5° mesh plus a LOLA-derived normal map for finer shading, all unexaggerated. Earth: NASA Blue Marble. Stars, marker sizes, glow and brightness only aid readability; textures do not change with date. True scale keeps real radii and distances; illustrative scale compresses distances and shrinks the Sun.' }),
    h('p', { text: 'Keyboard: Space plays or pauses, ← and → step, 1–4 switch views, L toggles labels, R recenters.' }),
  ];
  const inputs = h('details', null, h('summary', { text: `Downloaded inputs and SHA-256 fingerprints (${catalog.inputs.length})` }),
    catalog.inputs.map((source) => h('p', { class: 'input' }, link(source.path, source.url), h('br'), h('code', { text: source.sha256 || source.valuesSha256 }), h('br'), h('span', { class: 'hint', text: source.credit }))));
  nodes.push(inputs);
  return nodes;
}
