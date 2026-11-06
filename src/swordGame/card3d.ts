import * as THREE from 'three';
import { cardShadowSize, runCard3D } from '../platform/card3d';
import { buildArena } from './arena';
import { Stick, Trail } from './figure';
import { poseFor, type Stance } from './pose';
import { characterOf, swordOf, type CharacterId, type SwordId, type ThemeId } from './story';

/** Small 3D scenes with stick men: the duel on the game's card, and the choosing screen's preview. */

const blood = (scene: THREE.Scene) => {
  const count = 60;
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), new THREE.MeshBasicMaterial({ color: '#c0111c' }), count);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const drops = Array.from({ length: count }, () => ({ x: 0, y: -1, vx: 0, vy: 0 }));
  const m = new THREE.Matrix4();
  return {
    burst(x: number, y: number, dir: number) {
      drops.forEach((d) => {
        Object.assign(d, { x, y, vx: dir * (1 + Math.random() * 5), vy: Math.random() * 5.5 - 1 });
      });
    },
    update(dt: number) {
      drops.forEach((d, i) => {
        d.vy -= 16 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        const size = d.y > 0 ? 0.035 : 0;
        mesh.setMatrixAt(i, m.makeScale(size, size, size).setPosition(d.x, d.y, 0.1));
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
};

/** Two stick men trading blows at sunset, with the camera moving around them. */
export function playDuelCard(canvas: HTMLCanvasElement): () => void {
  return runCard3D(canvas, () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1.8, 0.5, 120);
    const arena = buildArena(scene, 'embers', 6);
    scene.traverse((o) => {
      if ((o as THREE.DirectionalLight).isDirectionalLight && o.castShadow) (o as THREE.DirectionalLight).shadow.mapSize.setScalar(cardShadowSize());
    });
    const left = new Stick('#f2f0ea', swordOf('katana'));
    const right = new Stick('#1b0f10', swordOf('ember'));
    const trailL = new Trail('#dff0ff');
    const trailR = new Trail('#ff8a2a');
    scene.add(left.group, right.group, trailL.mesh, trailR.mesh);
    const spray = blood(scene);
    let time = 0;
    let lastBeat = -1;
    const BEAT = 1.15;
    return {
      scene,
      camera,
      frame(dt) {
        time += dt;
        arena.update(dt);
        spray.update(dt);
        const beat = Math.floor(time / BEAT);
        const p = (time % BEAT) / BEAT;
        const leftTurn = beat % 2 === 0;
        const swing = Math.min(1, p / 0.55);
        const lunge = Math.sin(Math.min(1, p / 0.5) * Math.PI) * 0.34;
        const pose = (mine: boolean): Stance => (mine ? 'swing' : p < 0.6 ? 'block' : 'idle');
        const a = poseFor({ stance: pose(leftTurn), time, stride: 0, swing, combo: beat % 3, vy: 0 });
        const b = poseFor({ stance: pose(!leftTurn), time, stride: 0, swing, combo: (beat + 1) % 3, vy: 0 });
        left.pose(a, -1 + (leftTurn ? lunge : 0), 0, 1);
        right.pose(b, 1 - (leftTurn ? 0 : lunge), 0, -1);
        trailL.update(left.hilt, left.tip, leftTurn && swing > 0.25 && swing < 0.85);
        trailR.update(right.hilt, right.tip, !leftTurn && swing > 0.25 && swing < 0.85);
        if (beat !== lastBeat && p > 0.3 && beat % 3 === 2) {
          lastBeat = beat;
          spray.burst(leftTurn ? 0.8 : -0.8, 1.2, leftTurn ? 1 : -1);
        }
        const angle = Math.sin(time * 0.4) * 0.42;
        camera.position.set(Math.sin(angle) * 7.4, 1.75, Math.cos(angle) * 7.4);
        camera.lookAt(0, 1.05, 0);
      },
    };
  });
}

/** The chosen fighter and sword, turning slowly, for the choosing screen. */
export function playPreview(canvas: HTMLCanvasElement, chosen: () => { character: CharacterId; sword: SwordId }, theme: ThemeId = 'dusk'): () => void {
  return runCard3D(canvas, () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 120);
    const arena = buildArena(scene, theme, 6);
    const first = chosen();
    const stick = new Stick(characterOf(first.character).color, swordOf(first.sword));
    const trail = new Trail('#dff0ff');
    scene.add(stick.group, trail.mesh);
    let time = 0;
    let shown = first;
    return {
      scene,
      camera,
      frame(dt) {
        time += dt;
        arena.update(dt);
        const now = chosen();
        if (now.character !== shown.character || now.sword !== shown.sword) {
          stick.setColor(characterOf(now.character).color);
          stick.setSword(swordOf(now.sword), characterOf(now.character).color);
          shown = now;
          time = 2.6;
        }
        const cycle = time % 3.6;
        const swinging = cycle > 2.6;
        const swing = swinging ? (cycle - 2.6) / 1 : 0;
        stick.pose(poseFor({ stance: swinging ? 'swing' : 'idle', time, stride: 0, swing, combo: Math.floor(time / 3.6) % 3, vy: 0 }), -0.1, 0, 1);
        trail.update(stick.hilt, stick.tip, swinging && swing > 0.25 && swing < 0.85);
        const angle = 0.4 + Math.sin(time * 0.5) * 0.5;
        camera.position.set(Math.sin(angle) * 5.8, 1.5, Math.cos(angle) * 5.8);
        camera.lookAt(0.2, 1.05, 0);
      },
    };
  });
}
