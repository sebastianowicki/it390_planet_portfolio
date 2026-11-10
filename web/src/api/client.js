// Polls /api/galaxy. With VITE_USE_MOCK set, a stand-in for the cluster answers instead, so the demo's
// Mission control can scale, delete pods, push a new image, roll back and stop Redis without kubectl.
import { planetsFrom, diffPlanets } from '../scene/model.js';

const hex = (n = 7) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
const podName = () => `galaxy-${hex(9)}-${hex(5)}`;

export function createMockSource(base) {
  let loaded = null;
  const st = { history: [], pods: [], replicas: 2, starting: new Set(), redis: true, views: {}, turn: 0, pushes: [] };
  const load = () => (loaded ??= Promise.all([
    fetch(base + 'galaxy.json').then((r) => r.json()),
    fetch(base + 'push.json').then((r) => r.json()).catch(() => []),
  ]).then(([g, pushes]) => {
    st.history.push({ version: g.version, galaxy: g });
    st.pushes = pushes;
    st.pods = [podName(), podName()];
    st.views.galaxy = g.views ?? 0;
  }));
  const current = () => st.history[st.history.length - 1];
  const ready = () => st.pods.filter((p) => !st.starting.has(p));

  return {
    get state() { return st; },
    ready,
    current,
    async galaxy(visit) {
      await load();
      const live = ready();
      if (!live.length) throw new Error('no ready pods');
      if (visit) st.views.galaxy += 1;
      const g = structuredClone(current().galaxy);
      g.version = current().version;
      g.pod = live[st.turn++ % live.length]; // the Service spreads requests across ready pods
      g.counter = st.redis ? 'online' : 'offline';
      g.views = st.redis ? st.views.galaxy : null;
      if (!st.redis) for (const p of g.planets) { p.views = null; (p.projects || []).forEach((m) => (m.views = null)); }
      return g;
    },
    scale(n) {
      st.replicas = n;
      while (st.pods.length > n) st.pods.pop();
      while (st.pods.length < n) { const p = podName(); st.pods.push(p); st.starting.add(p); setTimeout(() => st.starting.delete(p), 1600); }
    },
    deletePod() {
      if (!st.pods.length) return null;
      const gone = st.pods.shift();
      const p = podName();
      st.pods.push(p); st.starting.add(p);
      setTimeout(() => st.starting.delete(p), 1800);
      return { gone, replacement: p };
    },
    canPush: () => st.history.length - 1 < st.pushes.length,
    // git push → CI builds a new image → kubectl set image. The new content arrives with the new pods.
    push() {
      const next = st.pushes[st.history.length - 1];
      if (!next) return null;
      const g = structuredClone(current().galaxy);
      if (next.planet) g.planets.push(next.planet);
      if (next.moon) g.planets.find((p) => p.slug === next.moon.parent)?.projects.push(next.moon.project);
      const version = 'sha-' + hex();
      st.history.push({ version, galaxy: g });
      st.pods = st.pods.map(() => podName());
      return { version, next };
    },
    canUndo: () => st.history.length > 1,
    undo() { if (st.history.length < 2) return null; st.history.pop(); st.pods = st.pods.map(() => podName()); return current().version; },
    setRedis(on) { st.redis = on; },
  };
}

export function createClient({ intervalMs = 5000, onUpdate, onError, mock = null }) {
  let last = [];
  let timer = null;
  let first = true;

  async function tick() {
    try {
      const galaxy = mock ? await mock.galaxy(first) : await fetch(first ? '/api/galaxy?visit=1' : '/api/galaxy').then((r) => {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      });
      first = false;
      const planets = planetsFrom(galaxy);
      const diff = diffPlanets(last, planets);
      last = planets;
      onUpdate({ diff, planets, galaxy });
    } catch (err) {
      onError?.(err);
    }
  }

  function start() {
    tick();
    timer = setInterval(() => !document.hidden && tick(), intervalMs);
    document.addEventListener('visibilitychange', () => !document.hidden && tick());
  }
  return { start, stop: () => clearInterval(timer), refresh: tick };
}
