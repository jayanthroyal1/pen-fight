import * as THREE from 'three';
import { stageTier } from './tier';
import { whileSeen } from './whileSeen';

export interface Card3D {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Moves the scene on by `dt` seconds. */
  frame(dt: number): void;
}

/** Frames measured before judging how a device is coping. */
const SAMPLE_FRAMES = 40;
/** Slower than this on average, and the scene gets simpler. */
const TOO_SLOW_MS = 38;
const MIN_PIXELS = 1;

/** The size of shadow map a card should use on this device. */
export const cardShadowSize = () => (stageTier() === 'high' ? 1024 : 512);

/**
 * Runs a small 3D scene on a game card's canvas while the card is on screen.
 * Throws where WebGL isn't available, so the card can fall back on its 2D art.
 * Returns a way to stop and free the graphics memory.
 */
export function runCard3D(canvas: HTMLCanvasElement, build: () => Card3D): () => void {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  const high = stageTier() === 'high';
  let pixels = Math.min(window.devicePixelRatio || 1, high ? 2 : 1.5);
  renderer.setPixelRatio(pixels);
  // Modest devices share their graphics with the background too, so cards run at half rate there.
  const minFrameMs = high ? 0 : 30;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const { scene, camera, frame } = build();

  const fit = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  };
  const observer = new ResizeObserver(fit);
  observer.observe(canvas);
  fit();

  const stopWatching = whileSeen(canvas, () => {
    let id = 0;
    let last = performance.now();
    let sampleFrom = last;
    let frames = 0;
    const loop = (now: number) => {
      id = requestAnimationFrame(loop);
      if (now - last < minFrameMs) return;
      frame(Math.min(0.1, (now - last) / 1000));
      last = now;
      renderer.render(scene, camera);
      if (++frames < SAMPLE_FRAMES) return;
      // A device that can't keep up gets fewer pixels first, then no shadows.
      if ((now - sampleFrom) / frames > TOO_SLOW_MS) {
        if (pixels > MIN_PIXELS) {
          pixels = Math.max(MIN_PIXELS, pixels - 0.25);
          renderer.setPixelRatio(pixels);
          fit();
        } else if (renderer.shadowMap.enabled) {
          renderer.shadowMap.enabled = false;
          scene.traverse((o) => {
            if ((o as THREE.Light).isLight) o.castShadow = false;
            const material = (o as THREE.Mesh).material as THREE.Material | undefined;
            if (material && !Array.isArray(material)) material.needsUpdate = true;
          });
        }
      }
      frames = 0;
      sampleFrom = now;
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  });

  return () => {
    stopWatching();
    observer.disconnect();
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      (o as THREE.InstancedMesh).dispose?.();
      mesh.geometry?.dispose();
      const materials = mesh.material ? ([] as THREE.Material[]).concat(mesh.material) : [];
      materials.forEach((m) => {
        (m as THREE.MeshStandardMaterial).map?.dispose();
        m.dispose();
      });
    });
    renderer.dispose();
    renderer.forceContextLoss();
  };
}
