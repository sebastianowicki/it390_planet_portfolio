// Camera moves, ported from the original: intro at the sun, the galaxy overview, focus on a world,
// the dive into it, and the "inside" pose beside the in-space window.
import * as THREE from 'three';

export const OVERVIEW = new THREE.Vector3(0, 86, 140);
const UP = new THREE.Vector3(0, 1, 0);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Pure: the focus view of a world: outward from the sun, 5 radii out and 1.8 up.
export function focusPose(p, r) {
  const out = p.clone().setY(0);
  if (out.lengthSq() < 1e-6) out.set(0, 0, 1);
  out.normalize();
  return { tgt: p.clone(), cam: p.clone().add(out.multiplyScalar(r * 5)).add(new THREE.Vector3(0, r * 1.8, 0)) };
}

// Pure: where the camera sits while a planet's page is open, with the world shifted to the left of the window.
export function poseAround(p, r) {
  const out = p.clone().setY(0);
  if (out.lengthSq() < 1e-6) out.set(0, 0, 1);
  out.normalize();
  const cam = p.clone().add(out.multiplyScalar(r * 5.4)).add(new THREE.Vector3(0, r * 1.3, 0));
  const dir = p.clone().sub(cam).normalize();
  const right = new THREE.Vector3().crossVectors(dir, UP).normalize();
  return { cam, tgt: p.clone().sub(right.multiplyScalar(r * 2.6)) };
}

export function createCameraDirector(camera, controls, { reducedMotion }) {
  let tween = null;
  return {
    get busy() { return Boolean(tween); },
    tween(duration, endFn, done) {
      tween = { t0: performance.now(), dur: reducedMotion ? 1 : duration, cam0: camera.position.clone(), tgt0: controls.target.clone(), endFn, done };
      controls.enabled = false;
    },
    step(now) {
      if (!tween) return false;
      const k = Math.min(1, (now - tween.t0) / tween.dur), e = ease(k), end = tween.endFn();
      camera.position.lerpVectors(tween.cam0, end.cam, e);
      controls.target.lerpVectors(tween.tgt0, end.tgt, e);
      camera.lookAt(controls.target);
      if (k >= 1) {
        const d = tween.done;
        tween = null;
        controls.enabled = true;
        d?.();
      }
      return true;
    },
  };
}
