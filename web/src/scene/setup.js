import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function createSetup(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#05070f');
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 3000);
  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, enablePan: false, rotateSpeed: 0.6, zoomSpeed: 0.9, maxDistance: 450 });
  // The original used three r128 light units; newer three.js needs them times pi to look the same.
  scene.add(new THREE.AmbientLight(0x3a4670, 0.55 * Math.PI));
  // A distant star lights the whole galaxy from one side, so every planet, home included, has a day and a night side.
  const star = new THREE.DirectionalLight(0xfff0d0, 1.9 * Math.PI);
  star.position.set(-0.75, 0.42, 0.52);
  scene.add(star);
  // A faint fill from the home planet keeps the inner faces of the orbiting planets from going black.
  scene.add(new THREE.PointLight(0x9fb8ff, 0.35 * Math.PI, 0, 0));
  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();
  return { renderer, scene, camera, controls };
}
