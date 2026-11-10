import * as THREE from 'three';
import { glowTexture } from './planetFactory.js';

function points(n, fn, size, opacity) {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const p = fn(i, c);
    pos.set(p, i * 3);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({
    size, map: glowTexture(), vertexColors: true, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
}

// Background stars on a far shell, and three spiral arms of dust in the galaxy plane.
export function createStarfield() {
  const group = new THREE.Group();
  group.add(points(4000, (i, c) => {
    const r = 450 + Math.random() * 500, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    c.setHSL(0.58 + Math.random() * 0.12, 0.3, 0.7 + Math.random() * 0.3);
    return [r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th)];
  }, 3.2, 0.9));
  const dust = points(7000, (i, c) => {
    const arm = i % 3, d = 8 + Math.pow(Math.random(), 0.7) * 200;
    const a = arm * ((Math.PI * 2) / 3) + d * 0.03 + (Math.random() - 0.5) * 0.7;
    c.setHSL(0.62 + Math.random() * 0.1 - (d < 40 ? 0.5 : 0), 0.5, 0.35 + Math.random() * 0.25);
    return [Math.cos(a) * d, (Math.random() - 0.5) * (6 - d * 0.02), Math.sin(a) * d];
  }, 1.6, 0.45);
  group.add(dust);
  return { group, update: (dt) => (dust.rotation.y += dt * 0.004) };
}
