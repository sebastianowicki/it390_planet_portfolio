// Loaded by the welcome page and every planet page from /planet-view.js: draws that page's planet
// (or moon) in 3D with the same code as the galaxy. Without the 3D build, the page keeps its CSS orb.
import * as THREE from 'three';
import { buildBody, glowSprite, normalizeAppearance, hashStr } from './scene/planetFactory.js';
import { lookup } from './scene/model.js';
import { MOON_SCALE } from './scene/planets.js';

for (const host of document.querySelectorAll('[data-planet-view]')) {
  fetch(host.dataset.api)
    .then((r) => r.json())
    .then((galaxy) => {
      const item = lookup(galaxy, host.dataset.slug);
      if (!item) return;
      const moon = item.kind === 'moon';
      const app = normalizeAppearance(moon ? { appearance: { style: 'rocky', color: '#a9aebd', atmosphere: { color: '#c9cfe0', strength: 0.2 } } } : item);
      const moons = item.moons?.length ?? 0;
      const body = buildBody(app, moon ? hashStr(item.id) : item.id === 'home' ? 7 : hashStr(item.id) + 3, moons, item.kind === 'person' ? { moonScale: MOON_SCALE, moonGap: 0.62, maxMoons: 8 } : {});
      const size = host.clientWidth || 300;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(size, size);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
      const glow = glowSprite(new THREE.Color(app.atmosphere.color), 3.4 + app.atmosphere.strength * 1.6, 0.06 + app.atmosphere.strength * 0.42);
      const fit = moons ? 5.8 + Math.min(moons, 8) * 0.95 : app.rings.on ? 8.6 : 6.2;
      camera.position.set(0, 1.4, fit);
      camera.lookAt(0, 0, 0);
      scene.add(body.group, glow, new THREE.AmbientLight(0x3a4670, 0.55 * Math.PI));
      const light = new THREE.DirectionalLight(0xfff0d0, 1.9 * Math.PI);
      light.position.set(-0.75, 0.42, 0.52);
      scene.add(light);
      host.replaceChildren(renderer.domElement);
      const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      let last = performance.now();
      (function loop(now) {
        requestAnimationFrame(loop);
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        body.update(still ? 0 : dt);
        renderer.render(scene, camera);
      })(last);
    })
    .catch(() => {});
}
