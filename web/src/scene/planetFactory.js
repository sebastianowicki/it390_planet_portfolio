// Builds one planet from its appearance, ported from the original Portfolio Galaxy.
// The galaxy and every planet page (through planet-view.js) use this same file.
import * as THREE from 'three';

export const SPIN = { slow: 0.05, normal: 0.12, fast: 0.32 };
export const STYLE_LABELS = { banded: 'Banded', rocky: 'Rocky', ice: 'Ice', lava: 'Lava', ocean: 'Ocean' };

export function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const hashStr = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h += s.charCodeAt(i) * (i + 1);
  return h;
};

// Fills in anything content.json leaves out, so every planet has a complete appearance.
export function normalizeAppearance(planet) {
  const a = { ...(planet.appearance || {}) };
  const color = planet.color || a.color || '#6a4fd6';
  const hsl = {};
  new THREE.Color(color).getHSL(hsl);
  const style = a.style === 'bands' ? 'banded' : STYLE_LABELS[a.style] ? a.style : 'banded';
  const rings = a.rings ? { on: a.rings.on !== false, color: a.rings.color || '#d9c9a3', tilt: a.rings.tilt ?? 22 } : { on: false };
  return {
    style,
    color,
    accent: a.accent || '#' + new THREE.Color().setHSL((hsl.h + 0.07) % 1, 0.45, 0.28).getHexString(),
    rings,
    clouds: a.clouds ?? style === 'ocean',
    atmosphere: { color: a.atmosphere?.color || color, strength: a.atmosphere?.strength ?? 0.5 },
    spin: a.spin === 'medium' ? 'normal' : SPIN[a.spin] ? a.spin : 'normal',
  };
}

export function surfaceCanvas(app, sd, W = 512) {
  const H = W / 2;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const r = rng(sd);
  const k = W / 512;
  const A = new THREE.Color(app.color), B = new THREE.Color(app.accent), tmp = new THREE.Color();
  const mix = (t, a = 1) => {
    tmp.copy(B).lerp(A, Math.min(1, Math.max(0, t)));
    return `rgba(${Math.round(tmp.r * 255)},${Math.round(tmp.g * 255)},${Math.round(tmp.b * 255)},${a})`;
  };
  const walk = (n, len, step) => {
    for (let i = 0; i < n; i++) {
      let x = r() * W, y = H * 0.15 + r() * H * 0.7, a = r() * 6.28;
      g.beginPath();
      g.moveTo(x, y);
      for (let j = 0; j < len; j++) {
        a += (r() - 0.5) * 1.1;
        x += Math.cos(a) * step * k;
        y += Math.sin(a) * step * k * 0.6;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  };
  if (app.style === 'rocky') {
    g.fillStyle = mix(0.62);
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 1400; i++) { g.fillStyle = mix(r(), 0.25); g.fillRect(r() * W, r() * H, (2 + r() * 10) * k, (2 + r() * 6) * k); }
    for (let i = 0; i < 46; i++) {
      const x = r() * W, y = H * 0.1 + r() * H * 0.8, rad = (3 + Math.pow(r(), 2) * 22) * k;
      g.fillStyle = mix(0.18, 0.55);
      g.beginPath(); g.ellipse(x, y, rad, rad * 0.8, 0, 0, 7); g.fill();
      g.strokeStyle = mix(1, 0.45); g.lineWidth = 1.5 * k;
      g.beginPath(); g.ellipse(x - rad * 0.1, y - rad * 0.1, rad, rad * 0.8, 0, 3.6, 6); g.stroke();
    }
  } else if (app.style === 'ice') {
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#f4f8ff'); gr.addColorStop(0.18, mix(1)); gr.addColorStop(0.5, mix(0.72)); gr.addColorStop(0.82, mix(1)); gr.addColorStop(1, '#f4f8ff');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(255,255,255,${0.05 + r() * 0.12})`; g.fillRect(r() * W, r() * H, (4 + r() * 30) * k, 1.5 * k); }
    g.strokeStyle = mix(0, 0.5); g.lineWidth = 1.2 * k; walk(26, 14, 9);
  } else if (app.style === 'lava') {
    g.fillStyle = mix(0); g.fillRect(0, 0, W, H);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${0.1 + r() * 0.25})`; g.fillRect(r() * W, r() * H, (3 + r() * 14) * k, (2 + r() * 5) * k); }
    g.shadowColor = '#ffb25a'; g.shadowBlur = 8 * k; g.strokeStyle = mix(1); g.lineWidth = 2.2 * k; walk(22, 16, 8);
    g.strokeStyle = '#ffd08a'; g.lineWidth = 0.9 * k; walk(14, 12, 7); g.shadowBlur = 0;
  } else if (app.style === 'ocean') {
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, mix(0.8)); gr.addColorStop(0.5, mix(1)); gr.addColorStop(1, mix(0.8));
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let ci = 0; ci < 7; ci++) {
      const cx = r() * W, cy = H * 0.2 + r() * H * 0.6, sz = (14 + r() * 26) * k;
      for (let i = 0; i < 46; i++) { g.fillStyle = mix(r() * 0.18, 0.9); g.beginPath(); g.arc(cx + (r() - 0.5) * sz * 3.2, cy + (r() - 0.5) * sz * 1.6, 3 * k + r() * sz * 0.45, 0, 7); g.fill(); }
    }
    g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(0, 0, W, H * 0.06); g.fillRect(0, H * 0.94, W, H * 0.06);
  } else {
    const f1 = 0.03 + r() * 0.05, f2 = 0.1 + r() * 0.12, ph = r() * 10;
    for (let y = 0; y < H; y++) {
      const yy = y / k, v = 0.5 + 0.32 * Math.sin(yy * f1 + ph) + 0.18 * Math.sin(yy * f2 + ph * 2) + (r() - 0.5) * 0.08;
      g.fillStyle = mix(v); g.fillRect(0, y, W, 1);
    }
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '0,0,0'},${0.04 + r() * 0.06})`; g.fillRect(r() * W, r() * H, (20 + r() * 120) * k, (1 + r() * 2) * k); }
    for (let i = 0; i < 2; i++) { g.fillStyle = `rgba(0,0,0,${0.15 + r() * 0.15})`; g.beginPath(); g.ellipse(r() * W, H * (0.23 + r() * 0.55), (14 + r() * 22) * k, (6 + r() * 8) * k, 0, 0, 7); g.fill(); }
  }
  return c;
}

const surfCache = new Map();
export function surfaceURL(app, sd) {
  const key = [app.style, app.color, app.accent, sd].join('|');
  if (!surfCache.has(key)) surfCache.set(key, surfaceCanvas(app, sd, 256).toDataURL());
  return surfCache.get(key);
}

let shared = null;
function sharedAssets() {
  if (shared) return shared;
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d'), r = rng(77);
  for (let i = 0; i < 180; i++) {
    const x = r() * 512, y = 20 + r() * 216, rad = 6 + r() * 26, gr = g.createRadialGradient(x, y, 0, x, y, rad * 1.8);
    gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, rad * 1.8, rad * 0.7, 0, 0, 7); g.fill();
  }
  const cloud = new THREE.CanvasTexture(c);
  cloud.colorSpace = THREE.SRGBColorSpace;
  shared = {
    sphere: new THREE.SphereGeometry(1, 48, 36),
    ring: new THREE.RingGeometry(1.4, 2.2, 96),
    moon: new THREE.SphereGeometry(0.1, 16, 12),
    moonMat: new THREE.MeshStandardMaterial({ color: 0xb8bcc8, roughness: 1 }),
    cloud,
    ringTex: new Map(),
  };
  return shared;
}

function ringTexture(color) {
  const S = sharedAssets();
  if (S.ringTex.has(color)) return S.ringTex.get(color);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d'), r = rng(hashStr(color)), col = new THREE.Color(color), inner = (128 * 1.4) / 2.2;
  for (let rad = inner; rad < 128; rad += 1) {
    const t = (rad - inner) / (128 - inner);
    const a = (0.25 + 0.45 * Math.abs(Math.sin(t * 22 + r() * 0.3))) * Math.max(0, 1 - Math.pow(Math.abs(t - 0.45) * 1.6, 3));
    g.strokeStyle = `rgba(${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)},${a})`;
    g.beginPath(); g.arc(128, 128, rad, 0, 7); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  S.ringTex.set(color, t);
  return t;
}

// The planet body: surface, optional clouds and rings, one moon per project (up to 6).
// Its group is scaled to the planet's radius; the glow sprite lives outside it (see planets.js).
export function buildBody(app, sd, moonCount, { moonScale = 1, moonGap = 0.34, maxMoons = 6 } = {}) {
  const S = sharedAssets();
  const tex = new THREE.CanvasTexture(surfaceCanvas(app, sd));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const lava = app.style === 'lava';
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    map: tex, roughness: app.style === 'ice' ? 0.5 : 0.92, metalness: 0,
    emissive: new THREE.Color(lava ? '#ffffff' : app.color), emissiveIntensity: lava ? 0.9 : 0.06, emissiveMap: lava ? tex : null,
  });
  const sphere = new THREE.Mesh(S.sphere, mat);
  sphere.rotation.z = 0.2 + (sd % 10) * 0.03;
  group.add(sphere);
  let clouds = null;
  if (app.clouds) {
    clouds = new THREE.Mesh(S.sphere, new THREE.MeshStandardMaterial({ map: S.cloud, transparent: true, depthWrite: false, roughness: 1 }));
    clouds.scale.setScalar(1.035);
    group.add(clouds);
  }
  let ring = null;
  if (app.rings?.on) {
    ring = new THREE.Mesh(S.ring, new THREE.MeshBasicMaterial({ map: ringTexture(app.rings.color), side: THREE.DoubleSide, transparent: true, depthWrite: false }));
    ring.rotation.x = Math.PI / 2 - ((app.rings.tilt || 0) * Math.PI) / 180;
    group.add(ring);
  }
  const moons = [];
  for (let i = 0; i < Math.min(moonCount, maxMoons); i++) {
    const m = new THREE.Mesh(S.moon, S.moonMat.clone());
    m.scale.setScalar(moonScale);
    m.userData = { d: 1.75 + i * moonGap + (ring ? 0.55 : 0), a: i * 2.1, sp: 0.7 / (1 + i * 0.45), tilt: (i % 2 ? 1 : -1) * 0.15 };
    group.add(m);
    moons.push(m);
  }
  const body = {
    group, sphere, clouds, ring, moons, baseEmissive: lava ? 0.9 : 0.06,
    spin: SPIN[app.spin] ?? 0.12,
    update(dt) {
      sphere.rotation.y += dt * body.spin;
      if (clouds) clouds.rotation.y += dt * body.spin * 1.4;
      for (const m of moons) {
        const u = m.userData;
        u.a += u.sp * dt;
        m.position.set(Math.cos(u.a) * u.d, Math.sin(u.a) * u.d * u.tilt, Math.sin(u.a) * u.d);
      }
    },
    dispose() {
      tex.dispose(); mat.dispose();
      clouds?.material.dispose();
      ring?.material.dispose();
      moons.forEach((m) => m.material.dispose());
    },
  };
  body.update(0);
  return body;
}

// A soft radial glow, shared by the sun, the planets' atmospheres and the star points.
let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.45)'); gr.addColorStop(0.6, 'rgba(255,255,255,.08)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
export function glowSprite(color, scale, opacity) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(scale);
  return s;
}
