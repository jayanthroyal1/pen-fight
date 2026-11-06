import * as THREE from 'three';
import type { ThemeId } from './story';

/** The eight places the story goes, built from a few plain shapes and strong light. */

interface Theme {
  top: string;
  bottom: string;
  ground: string;
  sun: string;
  light: string;
  far: string;
  near: string;
  shape: 'ruin' | 'pine' | 'peak' | 'pillar';
  drift: 'ember' | 'snow' | 'mote';
}

const THEMES: Record<ThemeId, Theme> = {
  embers: { top: '#2a0f12', bottom: '#d9541e', ground: '#1d1311', sun: '#ffb45a', light: '#ffb07a', far: '#5c2418', near: '#2a1210', shape: 'ruin', drift: 'ember' },
  dusk: { top: '#2b2150', bottom: '#f08a4b', ground: '#2a1f28', sun: '#ffd28a', light: '#ffc79a', far: '#5a3560', near: '#2e1f3a', shape: 'pine', drift: 'mote' },
  gorge: { top: '#10283a', bottom: '#8fb7a8', ground: '#2b2a24', sun: '#e8efd8', light: '#dfe8d0', far: '#3f6660', near: '#1f3a3a', shape: 'peak', drift: 'mote' },
  bells: { top: '#2d2a5a', bottom: '#e8b86a', ground: '#3a2d22', sun: '#fff0c0', light: '#ffe4ac', far: '#6a5070', near: '#3a2a3e', shape: 'pillar', drift: 'mote' },
  snow: { top: '#20405e', bottom: '#cfe6f2', ground: '#dfeaf2', sun: '#ffffff', light: '#dff0ff', far: '#7fa3bd', near: '#4a6f8c', shape: 'peak', drift: 'snow' },
  forge: { top: '#120a0a', bottom: '#b3301a', ground: '#191210', sun: '#ff7a2a', light: '#ff8a4a', far: '#3e1712', near: '#1f0d0b', shape: 'pillar', drift: 'ember' },
  mirror: { top: '#0d0a1e', bottom: '#5a3ea8', ground: '#16122b', sun: '#d8c8ff', light: '#c0b0ff', far: '#2c2358', near: '#1a1438', shape: 'pillar', drift: 'mote' },
  throne: { top: '#1a0507', bottom: '#8e1b2e', ground: '#120708', sun: '#ff4a26', light: '#ff7a5a', far: '#40101a', near: '#1f070c', shape: 'ruin', drift: 'ember' },
};

function sky(theme: Theme): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const fill = g.createLinearGradient(0, 0, 0, 256);
  fill.addColorStop(0, theme.top);
  fill.addColorStop(0.72, theme.bottom);
  g.fillStyle = fill;
  g.fillRect(0, 0, 4, 256);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function shapeFor(kind: Theme['shape'], size: number): THREE.BufferGeometry {
  if (kind === 'pine') return new THREE.ConeGeometry(size * 0.42, size * 1.4, 6);
  if (kind === 'peak') return new THREE.ConeGeometry(size, size * 1.1, 5);
  if (kind === 'pillar') return new THREE.BoxGeometry(size * 0.4, size * 2, size * 0.4);
  return new THREE.BoxGeometry(size * 0.9, size * (0.7 + (size % 1)), size * 0.5);
}

export interface Arena {
  /** Moves the drifting ash or snow on. */
  update(dt: number): void;
}

export function buildArena(scene: THREE.Scene, id: ThemeId, width: number): Arena {
  const theme = THEMES[id];
  scene.background = sky(theme);
  scene.fog = new THREE.Fog(theme.bottom, 16, 58);

  scene.add(new THREE.HemisphereLight(theme.light, theme.ground, 1.5));
  const sun = new THREE.DirectionalLight(theme.light, 2.6);
  sun.position.set(-6, 11, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(1024);
  Object.assign(sun.shadow.camera, { left: -width - 2, right: width + 2, top: 8, bottom: -3, near: 1, far: 34 });
  const rim = new THREE.DirectionalLight(theme.sun, 1.8);
  rim.position.set(5, 4, -10);
  scene.add(sun, rim);

  const disc = new THREE.Mesh(new THREE.CircleGeometry(4.6, 40), new THREE.MeshBasicMaterial({ color: theme.sun, fog: false }));
  disc.position.set(9, 8.5, -44);
  scene.add(disc);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 70), new THREE.MeshStandardMaterial({ color: theme.ground, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = -18;
  ground.receiveShadow = true;
  scene.add(ground);

  const layer = (color: string, z: number, count: number, size: number, spread: number) => {
    const material = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 1 });
    for (let i = 0; i < count; i++) {
      const s = size * (0.7 + ((i * 37) % 10) / 14);
      const mesh = new THREE.Mesh(shapeFor(theme.shape, s), material);
      const x = -spread + (i / (count - 1)) * spread * 2 + (((i * 53) % 7) - 3);
      mesh.position.set(x, s * 0.55, z - ((i * 29) % 6));
      mesh.rotation.y = i;
      scene.add(mesh);
    }
  };
  layer(theme.far, -34, 13, 8, 48);
  layer(theme.near, -14, 11, 3.2, 26);

  const count = 90;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 34;
    positions[i * 3 + 1] = Math.random() * 11;
    positions[i * 3 + 2] = (Math.random() - 0.7) * 14;
    seeds[i] = Math.random();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const color = theme.drift === 'ember' ? '#ff9a3a' : theme.drift === 'snow' ? '#ffffff' : '#fff0d0';
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color, size: theme.drift === 'snow' ? 0.09 : 0.06, transparent: true, opacity: 0.85, depthWrite: false, fog: false }));
  points.frustumCulled = false;
  scene.add(points);
  const rise = theme.drift === 'snow' ? -1.3 : 0.7;
  let time = 0;

  return {
    update(dt) {
      time += dt;
      for (let i = 0; i < count; i++) {
        const y = i * 3 + 1;
        positions[y] += rise * dt * (0.6 + seeds[i]);
        positions[i * 3] += Math.sin(time + seeds[i] * 9) * dt * 0.4;
        if (positions[y] > 11) positions[y] = 0;
        if (positions[y] < 0) positions[y] = 11;
      }
      geometry.attributes.position.needsUpdate = true;
    },
  };
}
