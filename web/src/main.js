// The 3D galaxy page. You start on the home planet (the welcome page); zoom out and every planet in
// orbit is a project, or a person whose moons are their projects. Look and camera moves are ported
// from the original Portfolio Galaxy; the data comes from /api/galaxy.
import * as THREE from 'three';
import './style.css';
import { createSetup } from './scene/setup.js';
import { createStarfield } from './scene/starfield.js';
import { createHome } from './scene/home.js';
import { createPlanets } from './scene/planets.js';
import { createCameraDirector, focusPose, poseAround } from './scene/cameraDirector.js';
import { normalizeAppearance, surfaceURL, hashStr, glowSprite, STYLE_LABELS } from './scene/planetFactory.js';
import { HOME_RADIUS, homeOf, tagsOf, matches, pathFor } from './scene/model.js';
import { ringRadius } from './scene/layout.js';
import { createClient, createMockSource } from './api/client.js';
import { pageFor } from './ui/window.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const later = (ms, fn) => setTimeout(fn, reduceMotion ? Math.min(ms, 300) : ms);

// The demo has two example galaxies; a real deployment only ever has its own.
const MOCK = Boolean(import.meta.env.VITE_USE_MOCK);
const EXAMPLE = MOCK && new URLSearchParams(location.search).get('example') === 'team' ? 'team' : 'solo';
const shownPath = (id) => pathFor(id);
const framePath = (id) => (MOCK ? `./${EXAMPLE}${pathFor(id)}/index.html` : pathFor(id));

document.body.classList.add('pre-explore');
const canvas = $('#scene');
const { renderer, scene, camera, controls } = createSetup(canvas);
const stars = createStarfield();
scene.add(stars.group);
// The distant star that lights the galaxy, far off in the direction its light comes from.
const starDir = new THREE.Vector3(-0.75, 0.42, 0.52).normalize();
for (const [s, o, c] of [[60, 0.95, 0xfff4d6], [170, 0.35, 0xffc36a], [420, 0.12, 0xff9a4a]]) {
  const g = glowSprite(c, s, o);
  g.position.copy(starDir).multiplyScalar(900);
  scene.add(g);
}
const home = createHome(scene);
const planets = createPlanets(scene);
const director = createCameraDirector(camera, controls, { reducedMotion: reduceMotion });
const ORIGIN = new THREE.Vector3();

const ringMark = new THREE.Mesh(new THREE.RingGeometry(1.45, 1.52, 96), new THREE.MeshBasicMaterial({ color: 0xf2c56b, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false }));
ringMark.visible = false;
scene.add(ringMark);

const data = { planets: [], galaxy: null, error: false, rolling: false };
const planetOf = (id) => data.planets.find((p) => p.id === String(id).split('/')[0]);
const moonOf = (id) => planetOf(id)?.moons.find((m) => m.id === id);
const itemOf = (id) => (id === 'home' ? homeOf(data.galaxy || {}) : String(id).includes('/') ? moonOf(id) : planetOf(id));
const isTeam = () => data.planets.some((p) => p.kind === 'person');
// selected: 'home', a planet id, or a moon id ('<planet>/<project>')
let state = 'intro', selected = null, hovered = null, hoverFromList = null, inPage = false, diving = false, anchor = null;
const filter = { q: '', tag: '' };

/* ---------------- toasts ---------------- */
function toast(html, ms = 3600) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = html;
  $('#toasts').appendChild(t);
  while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
  setTimeout(() => t.remove(), ms);
}

/* ---------------- labels ---------------- */
const labelsEl = $('#labels');
const labels = new Map();
function labelFor(id) {
  if (!labels.has(id)) {
    const el = document.createElement('div');
    el.className = 'label';
    labelsEl.appendChild(el);
    labels.set(id, el);
  }
  return labels.get(id);
}
function syncLabels() {
  const ids = new Set(['home', ...data.planets.flatMap((p) => [p.id, ...p.moons.map((m) => m.id)])]);
  for (const [id, el] of labels) if (!ids.has(id)) { el.remove(); labels.delete(id); }
  labelFor('home').innerHTML = `<b>${esc(data.galaxy?.title ?? 'Home')}</b>home planet · welcome page`;
  for (const p of data.planets) {
    labelFor(p.id).innerHTML = `<b>${esc(p.title)}</b>${p.kind === 'person' ? plural(p.moons.length, 'moon') : `${p.size} · project`}`;
    for (const m of p.moons) {
      const el = labelFor(m.id);
      el.classList.add('moon');
      el.innerHTML = `<b>${esc(m.title)}</b>moon`;
    }
  }
}

/* ---------------- HUD + roster ---------------- */
function renderHud() {
  const g = data.galaxy;
  const moons = data.planets.reduce((n, p) => n + p.moons.length, 0);
  $('[data-title]').textContent = g?.title ?? 'Portfolio galaxy';
  const parts = [plural(data.planets.length, 'planet')];
  if (moons) parts.push(plural(moons, 'moon'));
  parts.push(`visits ${g?.views ?? '—'}`);
  if (g) parts.push(g.environment);
  $('#stats').textContent = parts.join(' · ');
  $('#reconnecting').hidden = !data.error;
  if (MOCK) {
    const r = mock.ready().length, n = mock.state.pods.length;
    $('#mcBtn .dot').style.background = r ? (r < n || data.rolling ? 'var(--warn)' : 'var(--ok)') : 'var(--bad)';
  }
}
const searchEl = $('#rosterSearch'), tagEl = $('#rosterTag'), listEl = $('#rosterList');
let rosterKey = '';
function rowButton(cls, dot, name, size, onClick, hoverId) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'world-btn ' + cls;
  b.innerHTML = `<span class="dot" style="${dot}"></span><span class="nm">${esc(name)}</span><span class="sz">${esc(size)}</span>`;
  b.addEventListener('click', onClick);
  if (hoverId) {
    b.addEventListener('mouseenter', () => (hoverFromList = hoverId));
    b.addEventListener('mouseleave', () => (hoverFromList = null));
  }
  return b;
}
function renderRoster() {
  filter.q = searchEl.value;
  filter.tag = tagEl.value;
  const tags = tagsOf(data.planets);
  const key = JSON.stringify([filter, selected, data.error, tags, data.planets.map((p) => [p.id, p.title, p.color, p.moons.map((m) => m.id)])]);
  if (key === rosterKey) return;
  rosterKey = key;
  if (tagEl.options.length - 1 !== tags.length || tags.some((t, i) => tagEl.options[i + 1]?.value !== t)) {
    const keep = tagEl.value;
    tagEl.replaceChildren(new Option('All tags', ''), ...tags.map((t) => new Option(t, t)));
    tagEl.value = tags.includes(keep) ? keep : '';
  }
  const shown = data.planets.filter((p) => matches(p, filter));
  const open = selected && selected !== 'home' ? String(selected).split('/')[0] : null;
  const rows = [rowButton('home-btn' + (selected === 'home' ? ' on' : ''), `background:${esc(data.galaxy?.color ?? '#f2c56b')};box-shadow:0 0 8px ${esc(data.galaxy?.color ?? '#f2c56b')}`, '⌂ Home planet', 'welcome', () => focusOn('home'), 'home')];
  for (const p of shown) {
    rows.push(rowButton((selected === p.id ? 'on' : '') + (data.error ? ' off' : ''), `background:${esc(p.color)}`, p.title, p.kind === 'person' ? plural(p.moons.length, 'moon') : p.size, () => focusOn(p.id), p.id));
    if (p.id === open) {
      for (const m of p.moons) {
        if (filter.tag && !m.tags.includes(filter.tag) && !p.tags.includes(filter.tag)) continue;
        rows.push(rowButton('moon-btn' + (selected === m.id ? ' on' : ''), '', m.title, 'moon', () => focusOn(m.id), m.id));
      }
    }
  }
  if (!shown.length) {
    const e = document.createElement('div');
    e.className = 'empty';
    e.textContent = 'Nothing matches that.';
    rows.push(e);
  }
  listEl.replaceChildren(...rows);
  const filtered = filter.q.trim() || filter.tag;
  $('#rosterCount').textContent = filtered ? `${shown.length} of ${plural(data.planets.length, 'planet')}` : isTeam() ? `${plural(data.planets.length, 'planet')} · moons are projects` : `${plural(data.planets.length, 'planet')} · one per project`;
}
searchEl.addEventListener('input', renderRoster);
searchEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') listEl.querySelectorAll('.world-btn')[1]?.click(); });
tagEl.addEventListener('change', renderRoster);

/* ---------------- info panel ---------------- */
const info = $('#info');
function look(app) {
  return `${STYLE_LABELS[app.style]}${app.rings.on ? ' · rings' : ''}${app.clouds ? ' · clouds' : ''}`;
}
// Polls change a few numbers (the pod that answered, visit counts), so only the parts of the card
// that changed are swapped. The buttons stay put and never move under the pointer.
function setInfo(html, wire) {
  info.hidden = false;
  if (info.dataset.html === html) return;
  info.dataset.html = html;
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  const next = [...t.content.children], now = [...info.children];
  if (next.length !== now.length || next.some((el, i) => el.className !== now[i].className)) info.replaceChildren(...next);
  else next.forEach((el, i) => { if (el.outerHTML !== now[i].outerHTML) now[i].replaceWith(el); });
  wire();
}
function landButton(id, label) {
  return `<a class="btn primary" href="${esc(shownPath(id))}" id="landBtn">${esc(label)}</a>`;
}
function wireLand(id) {
  const b = $('#landBtn');
  if (b) b.onclick = (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    if (data.error) toast('the galaxy has <b>no ready pods</b>, so the Service has nowhere to send the request');
    else land(id);
  };
}
const apiDetails = (title, obj) => `<details class="api"><summary>${esc(title)}</summary><pre>${esc(JSON.stringify(obj, null, 2))}</pre></details>`;
const chip = () => (data.error ? '<span class="chip stopped">no ready pods</span>' : data.rolling ? '<span class="chip rolling">rolling out</span>' : '<span class="chip running">running</span>');

function showInfo(id) {
  const g = data.galaxy;
  if (!g) return;
  if (id === 'home') {
    const h = homeOf(g), app = normalizeAppearance(h);
    const moons = data.planets.reduce((n, p) => n + p.moons.length, 0);
    const summary = { ...g, planets: `[${data.planets.length} planets]` };
    return setInfo(`
      <div class="ic-head"><div class="swatch" style="background-image:url(${surfaceURL(app, 7)})"></div>
        <div><p class="ic-name">${esc(g.title)}</p><div class="ic-ctr">home planet · /welcome ${chip()}</div></div></div>
      <p class="tagline">${esc(g.headline)}. ${esc(g.tagline)}</p>
      <dl class="facts">
        <dt>In orbit</dt><dd>${plural(data.planets.length, 'planet')}<small>${moons ? `${plural(moons, 'moon')} · a moon is a project` : 'one planet per project'}</small></dd>
        <dt>Visits</dt><dd>${g.views ?? '—'}<small>${g.counter === 'online' ? 'counted in Redis' : 'Redis is down · pages still work'}</small></dd>
        <dt>Image</dt><dd>ghcr.io/you/galaxy<small>:${esc(g.version)}</small></dd>
        <dt>Pod</dt><dd>${esc(g.pod)}<small>the replica that answered</small></dd>
        <dt>Environment</dt><dd>${esc(g.environment)}<small>from ENVIRONMENT · color from GALAXY_COLOR</small></dd>
        <dt>Planet</dt><dd>${look(app)}<small>home.appearance in content.json</small></dd>
      </dl>
      ${apiDetails('GET /api/galaxy', summary)}
      <div class="actions">${landButton('home', 'Land on home planet')}<button class="btn" type="button" id="backBtn">Back to galaxy</button></div>`,
    () => { wireLand('home'); $('#backBtn').onclick = backToGalaxy; });
  }
  const item = itemOf(id);
  if (!item) return;
  if (item.kind === 'moon') {
    const p = planetOf(id);
    return setInfo(`
      <div class="ic-head"><div class="swatch moon-swatch"></div>
        <div><p class="ic-name">${esc(item.title)}</p><div class="ic-ctr">/p/${esc(item.id)} <span class="chip moon">moon of ${esc(p.title)}</span></div></div></div>
      <p class="tagline">${esc(item.summary)}</p>
      <dl class="facts">
        <dt>Orbits</dt><dd>${esc(p.title)}<small>moon ${item.index + 1} of ${p.moons.length}</small></dd>
        <dt>Tags</dt><dd>${esc(item.tags.join(', ') || '—')}</dd>
        <dt>Visits</dt><dd>${item.views ?? '—'}<small>${g.counter === 'online' ? 'counted in Redis' : 'Redis is down'}</small></dd>
        <dt>Comes from</dt><dd>planets/${esc(p.slug)}.json<small>projects[${item.index}]</small></dd>
      </dl>
      <div class="actions">${landButton(id, 'Land on moon')}<button class="btn" type="button" id="backBtn">Back to ${esc(p.title)}</button></div>`,
    () => { wireLand(id); $('#backBtn').onclick = () => focusOn(p.id); });
  }
  const app = normalizeAppearance(item);
  const person = item.kind === 'person';
  const raw = g.planets.find((x) => x.slug === item.slug);
  setInfo(`
    <div class="ic-head"><div class="swatch" style="background-image:url(${surfaceURL(app, hashStr(item.id) + 3)})"></div>
      <div><p class="ic-name">${esc(item.title)}</p><div class="ic-ctr">/p/${esc(item.slug)} <span class="chip ${person ? 'person' : 'project'}">${person ? 'landing page' : 'project'}</span></div></div></div>
    <p class="tagline">${esc(item.summary)}</p>
    ${person ? `<div class="moon-list" role="list">${item.moons.map((m) => `<button type="button" class="moon-row" data-moon="${esc(m.id)}"><span class="mdot"></span><span>${esc(m.title)}</span></button>`).join('')}</div>` : ''}
    <dl class="facts">
      ${person ? `<dt>Moons</dt><dd>${item.moons.length}<small>one per project · sets the planet's size</small></dd>` : `<dt>Size</dt><dd>${item.size}<small>sets the planet's radius</small></dd><dt>Tags</dt><dd>${esc(item.tags.join(', ') || '—')}</dd>`}
      <dt>Visits</dt><dd>${item.views ?? '—'}<small>${g.counter === 'online' ? 'counted in Redis' : 'Redis is down'}</small></dd>
      <dt>Planet</dt><dd>${look(app)}<small>${person ? `planets/${esc(item.slug)}.json` : 'from content.json'}</small></dd>
    </dl>
    ${apiDetails(`/api/galaxy → planets[${item.index}]`, raw)}
    <div class="actions">${landButton(id, person ? 'Land on planet' : 'Land on planet')}<button class="btn" type="button" id="backBtn">Back to galaxy</button></div>`,
  () => {
    wireLand(id);
    $('#backBtn').onclick = backToGalaxy;
    info.querySelectorAll('[data-moon]').forEach((b) => {
      b.onclick = () => focusOn(b.dataset.moon);
      b.onmouseenter = () => (hoverFromList = b.dataset.moon);
      b.onmouseleave = () => (hoverFromList = null);
    });
  });
}

/* ---------------- camera states ---------------- */
// Intro: sitting just above the home planet, like the original's view of the sun.
controls.target.set(0, HOME_RADIUS * 1.68, 0);
camera.position.set(0, HOME_RADIUS * 1.63, HOME_RADIUS * 5.4);
controls.minDistance = HOME_RADIUS * 1.8;
const overview = () => {
  const R = ringRadius(Math.max(0, ...data.planets.map((p) => p.ring)));
  return { cam: new THREE.Vector3(0, R * 0.98 + 13, R * 1.62 + 16), tgt: ORIGIN.clone() };
};
function leaveIntro() {
  $('#intro').classList.add('gone');
  document.body.classList.remove('pre-explore');
  controls.minDistance = 2;
}
function beginExplore() {
  if (state !== 'intro') return;
  state = 'galaxy';
  leaveIntro();
  director.tween(2600, overview);
}
const homeView = () => ({ tgt: ORIGIN.clone(), cam: new THREE.Vector3(0, HOME_RADIUS * 2.2, HOME_RADIUS * 5.2) });
// A person's planet is framed wide enough to show its moons.
function planetPose(v) {
  const wide = v.data.moons.length ? 1.9 : 1;
  return focusPose(v.pos, v.r * wide);
}
function poseFor(id) {
  if (id === 'home') return homeView();
  const v = planets.get(String(id).split('/')[0]);
  return v ? planetPose(v) : overview();
}
function focusOn(id) {
  if (!itemOf(id)) return;
  if (state === 'intro') leaveIntro();
  closeMC();
  const samePlanet = selected && selected !== 'home' && id !== 'home' && String(selected).split('/')[0] === String(id).split('/')[0] && state === 'focus';
  state = 'focus'; selected = id;
  showInfo(id); renderRoster();
  if (!samePlanet) director.tween(1500, () => poseFor(id));
}
function backToGalaxy() {
  selected = null; state = 'galaxy'; info.hidden = true;
  renderRoster();
  director.tween(1500, overview);
}
$('#zoomBtn').addEventListener('click', beginExplore);
$('#welcomeBtn').addEventListener('click', () => { leaveIntro(); state = 'focus'; selected = 'home'; land('home'); });

/* ---------------- landing: dive in, then open the page in a window floating in space ---------------- */
const win = $('#win'), frame = $('#wFrame'), flash = $('#flash');
const visits = [];
// Where a thing is right now and how big: home, a planet, or a moon of a planet.
function targetOf(id) {
  if (id === 'home') return home.view;
  if (String(id).includes('/')) return planets.moon(id);
  return planets.get(id);
}
function land(id) {
  const t = targetOf(id), item = itemOf(id);
  if (diving || inPage || !t || !item) return;
  diving = true; closeMC(); info.hidden = true; inPage = true; state = 'dive';
  document.body.classList.add('in-page');
  const color = item.kind === 'moon' ? '#b8bcc8' : item.color;
  win.style.setProperty('--c', color);
  flash.style.setProperty('--c', color);
  // The camera rides with whatever it landed on: a moon rides with its planet.
  anchor = id === 'home' ? home.view : planets.get(String(id).split('/')[0]);
  const open = () => {
    const now = targetOf(id);
    const pose = poseAround(now.pos, id === 'home' ? HOME_RADIUS : anchor.r * (item.kind === 'moon' ? 1.6 : 1));
    camera.position.copy(pose.cam); controls.target.copy(pose.tgt); camera.lookAt(pose.tgt);
    controls.enabled = false; state = 'inside';
    visits.length = 0;
    frame.src = framePath(id);
    $('#wUrl').textContent = location.host + shownPath(id);
    win.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => { win.classList.add('open'); flash.classList.remove('on'); }));
    diving = false;
    $('#wBack').focus();
  };
  if (reduceMotion) return open();
  director.tween(1150, () => {
    const now = targetOf(id) || t;
    const d = camera.position.clone().sub(now.pos).normalize();
    return { tgt: now.pos.clone(), cam: now.pos.clone().add(d.multiplyScalar(now.r * 1.06)) };
  }, open);
  setTimeout(() => flash.classList.add('on'), 720);
}
function closePage() {
  if (!inPage || diving) return;
  diving = true;
  win.classList.remove('open');
  later(380, () => {
    win.hidden = true; frame.src = 'about:blank'; inPage = false; diving = false; anchor = null; state = 'focus';
    document.body.classList.remove('in-page');
    const id = selected && itemOf(selected) ? selected : 'home';
    selected = id;
    director.tween(1300, () => poseFor(id), () => showInfo(id));
    renderRoster();
  });
}
frame.addEventListener('load', () => {
  let path;
  try { path = frame.contentWindow.location.pathname; } catch { return; }
  if (!path || frame.src === 'about:blank' || path === 'blank') return;
  const page = pageFor(path);
  if (page.kind === 'galaxy') return closePage();
  if (page.kind === 'other') return;
  $('#wUrl').textContent = location.host + shownPath(page.id);
  if (visits[visits.length - 1] !== path) visits.push(path);
  // Following a link inside the window (a moon from a landing page, say) moves the selection with it.
  if (page.id !== selected && itemOf(page.id)) {
    selected = page.id;
    anchor = page.id === 'home' ? home.view : planets.get(page.planet) || anchor;
  }
});
$('#wLeave').onclick = () => closePage();
// A page's "Back out to space" link posts this instead of loading the galaxy inside the window.
addEventListener('message', (e) => { if (e.source === frame.contentWindow && e.data === 'leave-planet') closePage(); });
$('#wReload').onclick = () => frame.contentWindow?.location.reload();
$('#wBack').onclick = () => {
  visits.pop();
  const prev = visits.pop();
  if (prev) frame.src = prev; else closePage();
};
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (inPage) return closePage();
  if (!$('#mc').hidden) return closeMC();
  if (state === 'focus' && String(selected).includes('/')) return focusOn(String(selected).split('/')[0]);
  if (state === 'focus') backToGalaxy();
});

/* ---------------- picking ---------------- */
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
let down = null;
function pickAt(e) {
  const r = canvas.getBoundingClientRect();
  mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects([home.mesh(), ...planets.meshes()].filter(Boolean))[0];
  return hit ? hit.object.userData.planetId : null;
}
canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
canvas.addEventListener('pointermove', (e) => {
  if (state === 'intro' || inPage || e.pointerType === 'touch') return;
  hovered = pickAt(e);
  canvas.style.cursor = hovered ? 'pointer' : 'grab';
});
canvas.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6 || state === 'intro' || inPage) { down = null; return; }
  down = null;
  const h = pickAt(e);
  if (h && h !== selected) focusOn(h);
});

/* ---------------- mission control (demo only: stands in for kubectl) ---------------- */
const mock = MOCK ? createMockSource(`./mock/${EXAMPLE}/`) : null;
const mc = $('#mc'), mcBtn = $('#mcBtn');
let mcKey = '';
function renderMC(force) {
  const st = mock.state, ready = mock.ready();
  const key = JSON.stringify([st.pods, [...st.starting], st.redis, st.history.length, data.rolling, mock.current()?.version]);
  if (!force && key === mcKey) return;
  mcKey = key;
  const next = st.pushes[st.history.length - 1];
  const nextLabel = next ? (next.planet ? `a new planet: ${next.planet.title}` : `a new moon for ${next.moon.parentTitle}: ${next.moon.project.title}`) : '';
  const ver = mock.current().version, prev = st.history[st.history.length - 2]?.version;
  mc.innerHTML = `
    <div class="head"><h2>Mission control</h2><button class="btn sm" type="button" id="mcClose">Close</button></div>
    <p>This panel stands in for <span class="mono">kubectl</span> and <span class="mono">git push</span>, so you can watch the galaxy react without a cluster. On the real cluster you run the commands shown under each button.</p>
    <section><h3>Deployment galaxy · ${ready.length}/${st.pods.length} ready · :${esc(ver)}</h3>
      <div class="ctr-list">${st.pods.length ? st.pods.map((p) => `<div class="ctr pod"><span class="n">${esc(p)}</span><span class="m"><span class="chip ${st.starting.has(p) ? 'rolling' : 'running'}">${st.starting.has(p) ? 'starting · not ready' : 'ready'}</span></span></div>`).join('') : '<div class="ctr pod"><span class="n">no pods</span><span class="m"><span class="chip stopped">replicas 0</span></span></div>'}</div>
      <div class="btn-row">${[0, 1, 2, 3].map((n) => `<button class="btn sm ${n === st.pods.length ? 'on' : ''}" type="button" data-scale="${n}">${n}</button>`).join('')}<button class="btn sm" type="button" id="mcDelete" ${st.pods.length ? '' : 'disabled'}>Delete a pod</button></div>
      <pre class="term">kubectl scale deploy/galaxy --replicas=${st.pods.length}\nkubectl delete pod ${esc(st.pods[0] ?? 'galaxy-…')}</pre></section>
    <section><h3>Ship a change</h3>
      <p>${next ? `Push ${esc(nextLabel)}. CI tests it, builds <span class="mono">ghcr.io/you/galaxy:sha-…</span>, then you roll it out.` : 'Every example change is pushed. Roll back to undo them one at a time.'}</p>
      <div class="btn-row"><button class="btn sm primary" type="button" id="mcPush" ${next && ready.length && !data.rolling ? '' : 'disabled'}>Push and roll out</button><button class="btn sm" type="button" id="mcUndo" ${prev && ready.length && !data.rolling ? '' : 'disabled'}>Roll back${prev ? ` to :${esc(prev)}` : ''}</button></div>
      <pre class="term"><span class="c"># after CI publishes the image</span>\nkubectl set image deploy/galaxy galaxy=ghcr.io/you/galaxy:sha-…\nkubectl rollout status deploy/galaxy\nkubectl rollout undo deploy/galaxy</pre></section>
    <section><h3>Supporting service · redis</h3>
      <div class="ctr"><span class="n">deploy/redis</span><span class="b"><button class="btn sm ${st.redis ? 'danger' : ''}" type="button" id="mcRedis">${st.redis ? 'Stop Redis' : 'Start Redis'}</button></span><span class="m"><span class="chip ${st.redis ? 'running' : 'stopped'}">${st.redis ? '1/1 ready' : '0/0'}</span>visit counter</span></div>
      <p>${st.redis ? 'The galaxy reaches Redis at <span class="mono">redis:6379</span>, by its Service name.' : 'Redis is down: visit counts show —, but every page still loads, and the readiness probe on <span class="mono">/health</span> keeps the galaxy ready.'}</p></section>`;
  $('#mcClose').onclick = closeMC;
  mc.querySelectorAll('[data-scale]').forEach((b) => (b.onclick = () => {
    const n = Number(b.dataset.scale), was = mock.state.pods.length;
    mock.scale(n);
    toast(`<b>kubectl scale</b> deploy/galaxy --replicas=${n}${n === 0 ? ' · no ready pods, so the galaxy goes dark' : n > was ? ' · new pods join once their readiness probe passes' : ' · requests now share fewer pods'}`);
    renderMC(true); client.refresh();
  }));
  $('#mcDelete').onclick = () => {
    const r = mock.deletePod();
    toast(`<b>kubectl delete pod</b> ${esc(r.gone)} · the Deployment starts <b>${esc(r.replacement)}</b> to keep ${mock.state.pods.length} replicas`, 4800);
    renderMC(true); client.refresh();
    later(1900, () => { renderMC(); client.refresh(); });
  };
  $('#mcPush').onclick = () => {
    data.rolling = true;
    toast('<b>git push</b> · CI runs the tests, then builds and publishes a new image');
    renderMC(true); renderHud();
    if (selected) showInfo(selected);
    later(1500, () => toast('<b>kubectl set image</b> deploy/galaxy · maxSurge 1, maxUnavailable 0'));
    later(3000, () => {
      const r = mock.push();
      data.rolling = false;
      client.refresh().then(() => {
        const n = r.next;
        toast(`rollout complete · <b>:${esc(r.version)}</b> · ${n.planet ? `new planet <b>${esc(n.planet.title)}</b>` : `new moon <b>${esc(n.moon.project.title)}</b> around ${esc(n.moon.parentTitle)}`}`, 5200);
        renderMC(true);
      });
    });
  };
  $('#mcUndo').onclick = () => {
    data.rolling = true;
    toast('<b>kubectl rollout undo</b> deploy/galaxy · back to the previous ReplicaSet');
    renderMC(true); renderHud();
    later(1600, () => {
      const v = mock.undo();
      data.rolling = false;
      client.refresh().then(() => { toast(`rolled back to <b>:${esc(v)}</b>`, 4200); renderMC(true); });
    });
  };
  $('#mcRedis').onclick = () => {
    mock.setRedis(!mock.state.redis);
    toast(mock.state.redis ? '<b>kubectl scale</b> deploy/redis --replicas=1 · visits counting again' : '<b>kubectl scale</b> deploy/redis --replicas=0 · counts go blank, pages keep working');
    renderMC(true); client.refresh();
  };
}
function openMC() { renderMC(true); mc.hidden = false; mcBtn.setAttribute('aria-expanded', 'true'); info.hidden = true; }
function closeMC() {
  if (mc.hidden) return;
  mc.hidden = true; mcBtn.setAttribute('aria-expanded', 'false');
  if (selected && state !== 'intro' && !inPage) showInfo(selected);
}
if (MOCK) {
  mcBtn.hidden = false;
  mcBtn.onclick = () => (mc.hidden ? openMC() : closeMC());
  const seg = $('#example');
  seg.hidden = false;
  seg.querySelectorAll('a').forEach((a) => a.classList.toggle('on', a.dataset.example === EXAMPLE));
}

/* ---------------- data ---------------- */
let first = true;
const client = createClient({
  intervalMs: MOCK ? 1500 : 5000,
  mock,
  onUpdate({ diff, planets: list, galaxy }) {
    data.error = false;
    data.planets = list;
    data.galaxy = galaxy;
    home.apply(homeOf(galaxy));
    planets.apply(diff, list, first);
    if (first) {
      $('#introTitle').textContent = galaxy.headline;
      $('#introText').textContent = `${galaxy.tagline} ${isTeam() ? 'Each planet out there is one of us, and its moons are our projects.' : 'Every planet out there is one of my projects.'} Zoom out to explore.`;
      document.title = galaxy.title;
    }
    first = false;
    if (selected && !itemOf(selected)) { selected = null; info.hidden = true; if (state === 'focus') director.tween(1500, overview); }
    syncLabels(); renderHud(); renderRoster();
    if (MOCK && !mc.hidden) renderMC();
    if (!inPage && !info.hidden && selected) showInfo(selected);
  },
  onError() {
    data.error = true;
    renderHud(); renderRoster();
    if (MOCK && !mc.hidden) renderMC();
    if (!inPage && !info.hidden && selected) showInfo(selected);
  },
});
client.start();
if (MOCK) setInterval(() => { renderHud(); if (!mc.hidden) renderMC(); }, 700);

/* ---------------- loop ---------------- */
const v3 = new THREE.Vector3(), vt = new THREE.Vector3();
let last = performance.now(), elapsed = 0;
function placeLabel(el, pos, r, show, extra = '') {
  v3.copy(pos).project(camera);
  const vis = v3.z < 1 && Math.abs(v3.x) < 1.15 && Math.abs(v3.y) < 1.15;
  el.className = `label${el.classList.contains('moon') ? ' moon' : ''}${show && vis ? ' show' : ''}${extra}`;
  if (!vis) return;
  vt.copy(pos).add(camera.up.clone().multiplyScalar(r * 1.15)).project(camera);
  el.style.transform = `translate(${(v3.x * 0.5 + 0.5) * window.innerWidth}px, ${(-vt.y * 0.5 + 0.5) * window.innerHeight - 6}px) translate(-50%, -100%)`;
}
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state !== 'intro' && !reduceMotion) elapsed += dt;
  planets.update(dt, elapsed, reduceMotion);
  home.update(reduceMotion ? 0 : dt);
  stars.update(dt);
  if (!director.busy) {
    const fv = (state === 'focus' && selected && selected !== 'home') ? planets.get(String(selected).split('/')[0]) : state === 'inside' ? anchor : null;
    if (fv) { v3.subVectors(fv.pos, fv.prev); camera.position.add(v3); controls.target.add(v3); }
  }
  if (!director.step(now)) {
    if (state !== 'inside') controls.update();
    if (state === 'intro' && camera.position.distanceTo(controls.target) > 34) beginExplore();
  }
  const H = window.innerHeight;
  const pxPerUnit = H / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  const calm = state !== 'intro' && !director.busy && !inPage;
  const openPlanet = selected && selected !== 'home' ? String(selected).split('/')[0] : null;
  const hotId = hovered || hoverFromList;
  for (const v of planets.all()) {
    const p = v.data, id = p.id;
    const hot = id === hotId || id === selected || id === openPlanet;
    const dim = data.error || !matches(p, filter);
    const atm = v.app.atmosphere.strength ?? 0.5;
    const pulse = data.rolling ? 0.45 + 0.3 * Math.sin(now / 180) : 0;
    v.glow.material.opacity += ((dim ? 0.04 : hot ? 0.8 : data.rolling ? pulse : 0.06 + atm * 0.42) - v.glow.material.opacity) * 0.15;
    v.glow.scale.setScalar(v.r * (3.4 + atm * 1.6));
    v.body.sphere.material.color.setScalar(dim ? 0.32 : 1);
    v.body.sphere.material.emissiveIntensity += ((dim ? 0 : hot ? v.body.baseEmissive + 0.18 : v.body.baseEmissive) - v.body.sphere.material.emissiveIntensity) * 0.15;
    const screenR = (v.r * pxPerUnit) / camera.position.distanceTo(v.pos);
    const el = labels.get(id);
    if (el) placeLabel(el, v.pos, v.r, calm && (hot || screenR > 15) && !(openPlanet === id && p.moons.length), (hot ? ' hot' : '') + (dim ? ' off' : ''));
    // Moon labels: only around the planet you're looking at, so the overview stays clean.
    v.body.moons.forEach((m) => {
      const mid = m.userData.planetId, mel = labels.get(mid);
      const mhot = mid === hotId || mid === selected;
      m.material.emissive?.setHex(mhot ? 0x6a5420 : 0x000000);
      if (!mel) return;
      vt.copy(m.position).multiplyScalar(v.r).add(v.pos);
      placeLabel(mel, vt.clone(), 0.23 * v.r, calm && openPlanet === id, mhot ? ' hot' : '');
    });
  }
  const homeEl = labels.get('home');
  if (homeEl) placeLabel(homeEl, ORIGIN, HOME_RADIUS * 1.12, calm && !selected, hotId === 'home' ? ' hot' : '');
  // The gold ring marks what's selected: home, a planet, or a moon.
  let mark = null;
  if (selected && !inPage) {
    if (selected === 'home') mark = { pos: ORIGIN, r: HOME_RADIUS };
    else if (String(selected).includes('/')) { const m = planets.moon(selected); if (m) mark = { pos: m.pos, r: m.r * 2.2 }; }
    else { const v = planets.get(selected); if (v) mark = { pos: v.pos, r: v.r }; }
  }
  if (mark) { ringMark.visible = true; ringMark.position.copy(mark.pos); ringMark.scale.setScalar(mark.r); ringMark.lookAt(camera.position); }
  else ringMark.visible = false;
  renderer.render(scene, camera);
}
requestAnimationFrame(loop);
