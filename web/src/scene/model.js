// Pure functions that turn /api/galaxy into what the scene draws. Tested without a browser.
// A planet is either a project, or a person whose moons are their projects.
import { slotFor, baseAngle } from './layout.js';

export const HOME_RADIUS = 4.2;
export const SIZE_RADIUS = { small: 1.3, medium: 2.0, large: 2.8 };

// A person's planet grows with their moons: 1.7 with one project, up to 3.1 with six or more.
export const personRadius = (moons) => 1.4 + 0.28 * Math.min(Math.max(moons, 1), 6);

const hexToHsl = (hex) => {
  const n = parseInt(String(hex).replace('#', ''), 16) || 0;
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
};
export const hslToHex = (h, s, l) => {
  const f = (n) => {
    const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

// A planet with no color of its own gets one stepped around the color wheel from the galaxy's.
export function colorFor(galaxyColor, index) {
  const [h] = hexToHsl(galaxyColor || '#f2c56b');
  return hslToHex((h + 0.12 + index * 0.618) % 1, 0.5, 0.6);
}

export function homeOf(galaxy) {
  const color = galaxy.color || '#f2c56b';
  return { id: 'home', kind: 'home', title: galaxy.title, color, radius: HOME_RADIUS, appearance: { ...(galaxy.home?.appearance || {}), color } };
}

export function planetsFrom(galaxy) {
  return (galaxy.planets || []).map((p, index) => {
    const person = p.kind === 'person' || Array.isArray(p.projects);
    const color = p.appearance?.color || colorFor(galaxy.color, index);
    const moons = person
      ? (p.projects || []).map((m, i) => ({ id: `${p.slug}/${m.slug}`, kind: 'moon', parent: p.slug, index: i, slug: m.slug, title: m.title, summary: m.summary, tags: m.tags || [], views: m.views ?? null }))
      : [];
    const size = SIZE_RADIUS[p.size] ? p.size : 'medium';
    const { ring, slot } = slotFor(index);
    return {
      id: p.slug, slug: p.slug, kind: person ? 'person' : 'project', index,
      title: p.title, summary: p.summary, tags: p.tags || [], views: p.views ?? null,
      size, radius: person ? personRadius(moons.length) : SIZE_RADIUS[size],
      color, appearance: { ...(p.appearance || {}), color }, moons, ring, slot, base: baseAngle(ring, slot),
    };
  });
}

// Every tag in the galaxy: on project planets and on every moon.
export function tagsOf(planets) {
  return [...new Set(planets.flatMap((p) => [...p.tags, ...p.moons.flatMap((m) => m.tags)]))].sort();
}

export function matches(planet, { q = '', tag = '' } = {}) {
  const text = [planet.title, planet.summary, ...planet.tags, ...planet.moons.flatMap((m) => [m.title, ...m.tags])].join(' ').toLowerCase();
  const tagOk = !tag || planet.tags.includes(tag) || planet.moons.some((m) => m.tags.includes(tag));
  return tagOk && text.includes(q.trim().toLowerCase());
}

// The page each thing opens when you land on it.
export const pathFor = (id) => (id === 'home' ? '/welcome' : `/p/${id}`);

// planet-view.js on a page asks for 'home', '<planet>' or '<planet>/<project>'.
export function lookup(galaxy, key) {
  if (key === 'home') return homeOf(galaxy);
  const [slug, moon] = String(key).split('/');
  const p = planetsFrom(galaxy).find((x) => x.slug === slug);
  if (!p) return null;
  return moon ? p.moons.find((m) => m.slug === moon) || null : p;
}

const WATCHED = ['title', 'summary', 'tags', 'size', 'appearance', 'kind', 'radius', 'color'];
// What changed between two planet lists, by id. Moons are compared by their ids.
export function diffPlanets(previous, next) {
  const before = new Map(previous.map((p) => [p.id, p]));
  const after = new Map(next.map((p) => [p.id, p]));
  const sig = (p) => JSON.stringify([WATCHED.map((k) => p[k]), p.moons.map((m) => m.id)]);
  return {
    added: next.filter((p) => !before.has(p.id)),
    removed: previous.filter((p) => !after.has(p.id)),
    changed: next.filter((p) => before.has(p.id) && sig(before.get(p.id)) !== sig(p)),
  };
}
