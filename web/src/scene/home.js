// The home planet in the middle of the galaxy: landing on it opens the welcome page.
import * as THREE from 'three';
import { buildBody, glowSprite, normalizeAppearance } from './planetFactory.js';
import { HOME_RADIUS } from './model.js';

export function createHome(scene) {
  const group = new THREE.Group();
  scene.add(group);
  let body = null, glows = [];
  const view = { pos: new THREE.Vector3(), prev: new THREE.Vector3(), r: HOME_RADIUS, app: null, body: null };

  function apply(home) {
    const key = JSON.stringify(home.appearance);
    if (view.key === key) return;
    view.key = key;
    if (body) { group.remove(body.group); body.dispose(); glows.forEach((g) => group.remove(g)); }
    view.app = normalizeAppearance(home);
    body = buildBody(view.app, 7, 0);
    body.sphere.userData.planetId = 'home';
    body.group.scale.setScalar(HOME_RADIUS);
    const c = new THREE.Color(view.app.atmosphere.color);
    glows = [glowSprite(c, HOME_RADIUS * 4.4, 0.55), glowSprite(c, HOME_RADIUS * 11, 0.16)];
    group.add(body.group, ...glows);
    view.body = body;
  }
  return {
    view, apply,
    mesh: () => body?.sphere,
    update(dt) { body?.update(dt); },
    glows: () => glows,
  };
}
