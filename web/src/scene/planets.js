// Turns the planet list from /api/galaxy into 3D planets on their rings, and keeps them moving.
// A person's planet carries one larger, clickable moon per project.
import * as THREE from 'three';
import { buildBody, glowSprite, normalizeAppearance, hashStr } from './planetFactory.js';
import { ringRadius, ringTilt, ringSpeed, positionFor } from './layout.js';

export const MOON_SCALE = 2.3; // moons of a person's planet: big enough to click
const MOON_GAP = 0.62;

export function createPlanets(scene) {
  const views = new Map(); // id -> view
  const orbitLines = new THREE.Group();
  scene.add(orbitLines);
  let ringsDrawn = 0;

  function ensureRings(n) {
    while (ringsDrawn < n) {
      const R = ringRadius(ringsDrawn), k = ringTilt(ringsDrawn), pts = [];
      for (let i = 0; i <= 200; i++) {
        const a = (i / 200) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R * k, Math.sin(a) * R));
      }
      orbitLines.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x2b3756, transparent: true, opacity: 0.55 })));
      ringsDrawn += 1;
    }
  }

  function makeBody(v) {
    const p = v.data;
    v.app = normalizeAppearance(p);
    const person = p.kind === 'person';
    v.body = buildBody(v.app, hashStr(p.id) + 3, p.moons.length, person ? { moonScale: MOON_SCALE, moonGap: MOON_GAP, maxMoons: 8 } : {});
    v.body.sphere.userData.planetId = p.id;
    v.body.moons.forEach((m, i) => (m.userData.planetId = p.moons[i]?.id));
    v.body.group.scale.setScalar(v.r);
    v.body.group.position.copy(v.pos);
    scene.add(v.body.group);
    v.glow.material.color.set(v.app.atmosphere.color);
  }

  function add(p, grow) {
    const v = { data: p, r: grow ? 0.001 : p.radius, target: p.radius, ring: p.ring, base: p.base, pos: new THREE.Vector3(), prev: new THREE.Vector3() };
    v.glow = glowSprite(new THREE.Color('#ffffff'), 1, 0.28);
    scene.add(v.glow);
    makeBody(v);
    views.set(p.id, v);
  }

  function apply({ added, changed, removed }, list, first) {
    added.forEach((p) => add(p, !first));
    for (const p of changed) {
      const v = views.get(p.id);
      v.data = p;
      v.target = p.radius;
      scene.remove(v.body.group);
      v.body.dispose();
      makeBody(v);
    }
    for (const p of removed) {
      const v = views.get(p.id);
      v.removing = true;
      v.target = 0.001;
    }
    let maxRing = 0;
    for (const p of list) {
      const v = views.get(p.id);
      v.data = p;
      v.ring = p.ring;
      v.base = p.base;
      v.removing = false;
      maxRing = Math.max(maxRing, p.ring);
    }
    ensureRings(maxRing + 1);
    if (first) views.forEach((v) => place(v, 0));
  }

  function place(v, elapsed) {
    v.prev.copy(v.pos);
    const p = positionFor(v.ring, v.base + ringSpeed(v.ring) * elapsed);
    v.pos.set(p.x, p.y, p.z);
    v.body.group.position.copy(v.pos);
    v.glow.position.copy(v.pos);
    if (v.prev.lengthSq() === 0) v.prev.copy(v.pos);
  }

  function update(dt, elapsed, still) {
    for (const [id, v] of views) {
      v.r += (v.target - v.r) * Math.min(1, dt * 3);
      v.body.group.scale.setScalar(v.r);
      place(v, elapsed);
      v.body.update(still ? 0 : dt);
      if (v.removing && v.r < 0.01) {
        scene.remove(v.body.group, v.glow);
        v.body.dispose();
        views.delete(id);
      }
    }
  }

  const tmp = new THREE.Vector3();
  return {
    apply,
    update,
    get: (id) => views.get(id),
    all: () => [...views.values()].filter((v) => !v.removing),
    meshes: () => [...views.values()].flatMap((v) => [v.body.sphere, ...v.body.moons]),
    // A moon's place in the world right now, and its size there.
    moon(id) {
      const [slug] = String(id).split('/');
      const v = views.get(slug);
      const m = v?.body.moons.find((x) => x.userData.planetId === id);
      if (!m) return null;
      tmp.copy(m.position).multiplyScalar(v.r).add(v.pos);
      return { pos: tmp.clone(), r: 0.1 * MOON_SCALE * v.r, mesh: m, planet: v };
    },
  };
}
