// Pure: what a path inside the in-space window is. Works for the real paths and the demo's
// snapshot paths (…/solo/p/<slug>/index.html).
export function pageFor(path) {
  const p = (path || '').replace(/index\.html$/, '');
  let m = /\/p\/([a-z0-9-]+)\/([a-z0-9-]+)\/?$/.exec(p);
  if (m) return { kind: 'moon', id: `${m[1]}/${m[2]}`, planet: m[1] };
  m = /\/p\/([a-z0-9-]+)\/?$/.exec(p);
  if (m) return { kind: 'planet', id: m[1], planet: m[1] };
  if (/\/welcome(\/|$)/.test(p)) return { kind: 'home', id: 'home' };
  if (!p.includes('/api/') && !p.includes('/static/')) return { kind: 'galaxy' };
  return { kind: 'other' };
}
