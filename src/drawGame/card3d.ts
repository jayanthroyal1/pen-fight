import * as THREE from 'three';
import { cardShadowSize, runCard3D } from '../platform/card3d';

/**
 * Doodle Rush's card in real 3D: a sheet of paper on a bright desk, a pencil
 * drawing on it line by line, crayons lying about and a camera drifting around,
 * until the finished sheet flips over and it starts again.
 */

export interface DoodleTiming {
  draw: number;
  loop: number;
  wipeAt: number;
  revealAt: number;
}

export interface DoodleStroke {
  path: SVGPathElement;
  color: string;
  width: number;
}

const SHEET_W = 200;
const SHEET_H = 150;
const TEX_SCALE = 5;
/** How far apart, along a line, the pencil's marks are made. */
const STEP = 1.5;

function buildPencil(): THREE.Group {
  const pencil = new THREE.Group();
  const add = (geometry: THREE.BufferGeometry, color: string, y: number, flat = true) => {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, flatShading: flat, roughness: 0.55 }));
    mesh.position.y = y;
    mesh.castShadow = true;
    pencil.add(mesh);
  };
  add(new THREE.ConeGeometry(1.6, 5, 6), '#1b1b20', 2.5);
  pencil.children[0].rotation.x = Math.PI;
  add(new THREE.ConeGeometry(5.2, 14, 6), '#e9c9a0', 10);
  pencil.children[1].rotation.x = Math.PI;
  add(new THREE.CylinderGeometry(5.2, 5.2, 104, 6), '#ff6a13', 69);
  add(new THREE.CylinderGeometry(5.5, 5.5, 9, 12), '#b9bec8', 125, false);
  add(new THREE.CylinderGeometry(5.2, 5.2, 10, 12), '#e84f9c', 134, false);
  return pencil;
}

function buildCrayon(color: string): THREE.Group {
  const crayon = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 58, 12), skin);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(6, 13, 12), skin);
  tip.position.y = 35;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.2, 30, 12), new THREE.MeshStandardMaterial({ color: '#14100c', roughness: 0.8 }));
  band.scale.set(1, 0.14, 1);
  band.position.y = 16;
  crayon.add(body, tip, band);
  crayon.traverse((o) => (o.castShadow = true));
  crayon.rotation.z = Math.PI / 2;
  return crayon;
}

export function playDoodle3D(canvas: HTMLCanvasElement, strokes: DoodleStroke[], timing: DoodleTiming, onTime: (t: number) => void): () => void {
  return runCard3D(canvas, () => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#ffc21a');
    const camera = new THREE.PerspectiveCamera(30, 1.8, 10, 1800);

    scene.add(new THREE.HemisphereLight('#ffffff', '#ffb648', 1.9));
    const sun = new THREE.DirectionalLight('#fff4dc', 2.3);
    sun.position.set(-130, 260, 90);
    sun.castShadow = true;
    sun.shadow.mapSize.setScalar(cardShadowSize());
    sun.shadow.radius = 4;
    Object.assign(sun.shadow.camera, { left: -230, right: 230, top: 200, bottom: -200, near: 20, far: 620 });
    scene.add(sun);

    const desk = new THREE.Mesh(new THREE.PlaneGeometry(2200, 1600), new THREE.MeshStandardMaterial({ color: '#ffc21a', roughness: 0.9 }));
    desk.rotation.x = -Math.PI / 2;
    desk.receiveShadow = true;
    scene.add(desk);

    // The paper, as a texture the pencil draws on.
    const page = document.createElement('canvas');
    page.width = SHEET_W * TEX_SCALE;
    page.height = SHEET_H * TEX_SCALE;
    const g = page.getContext('2d')!;
    g.scale(TEX_SCALE, TEX_SCALE);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const texture = new THREE.CanvasTexture(page);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;

    const label = (text: string, color: string) => {
      g.fillStyle = '#ffffff';
      g.fillRect(40, 134, 120, 16);
      g.fillStyle = color;
      g.font = '12px Anton, Impact, sans-serif';
      g.textAlign = 'center';
      g.fillText(text, 100, 146);
    };
    const blank = () => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, SHEET_W, SHEET_H);
      label('_ _ _ _ _ _', '#14100c');
      texture.needsUpdate = true;
    };
    blank();

    const edge = new THREE.MeshStandardMaterial({ color: '#e8e4da' });
    const sheet = new THREE.Group();
    const paper = new THREE.Mesh(new THREE.BoxGeometry(SHEET_W, 2.4, SHEET_H), [edge, edge, new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85 }), edge, edge, edge]);
    paper.castShadow = true;
    paper.receiveShadow = true;
    sheet.add(paper);
    // Two more sheets under it: a pad, not a single page.
    const pad = new THREE.Mesh(new THREE.BoxGeometry(SHEET_W + 4, 10, SHEET_H + 4), new THREE.MeshStandardMaterial({ color: '#f4efe4' }));
    pad.position.set(-30, 5, 0);
    pad.rotation.y = 0.1;
    pad.castShadow = true;
    pad.receiveShadow = true;
    scene.add(pad);
    sheet.position.set(-30, 12, 0);
    sheet.rotation.y = 0.1;
    scene.add(sheet);

    const pencil = buildPencil();
    pencil.rotation.set(0.3, 0, -0.55);
    pencil.scale.setScalar(1.4);
    sheet.add(pencil);

    const crayons: [string, number, number, number][] = [
      ['#e0322b', 118, -62, 0.5],
      ['#2a6fdb', 156, 26, -0.35],
      ['#3fae3a', 104, 104, 2.6],
      ['#7a3fc9', -178, -60, 2.2],
    ];
    crayons.forEach(([color, x, z, turn]) => {
      const crayon = buildCrayon(color);
      const holder = new THREE.Group();
      holder.add(crayon);
      holder.position.set(x, 6, z);
      holder.rotation.y = turn;
      scene.add(holder);
    });

    const lengths = strokes.map((s) => s.path.getTotalLength());
    const total = lengths.reduce((a, b) => a + b, 0);

    let t = 0;
    let line = 0;
    let along = 0;
    let revealed = false;
    let cleared = false;
    const tip = new THREE.Vector3(60, 44, -40);
    const goal = new THREE.Vector3();

    /** The pencil's marks up to `length` of the whole drawing. */
    const drawTo = (length: number) => {
      let before = lengths.slice(0, line).reduce((a, b) => a + b, 0);
      let changed = false;
      while (line < strokes.length && before + along < length) {
        const s = strokes[line];
        const from = s.path.getPointAtLength(along);
        along = Math.min(lengths[line], along + STEP);
        const to = s.path.getPointAtLength(along);
        g.strokeStyle = s.color;
        g.lineWidth = s.width;
        g.beginPath();
        g.moveTo(from.x, from.y);
        g.lineTo(to.x, to.y);
        g.stroke();
        changed = true;
        if (along >= lengths[line]) {
          before += lengths[line];
          line += 1;
          along = 0;
        }
      }
      if (changed) texture.needsUpdate = true;
    };

    return {
      scene,
      camera,
      frame(dt) {
        t += dt;
        if (t >= timing.loop) {
          t = 0;
          line = 0;
          along = 0;
          revealed = false;
          cleared = false;
          sheet.rotation.x = 0;
          sheet.position.y = 12;
        }
        onTime(t);

        const drawing = t < timing.draw;
        if (drawing) {
          drawTo((t / timing.draw) * total);
          const s = strokes[Math.min(line, strokes.length - 1)];
          const at = s.path.getPointAtLength(along);
          goal.set(at.x - SHEET_W / 2, along === 0 ? 8 : 1.4, at.y - SHEET_H / 2);
        } else {
          drawTo(total);
          goal.set(112, 44, -46);
        }
        tip.lerp(goal, drawing ? 0.5 : 0.07);
        pencil.position.copy(tip);
        pencil.rotation.z = -0.55 + Math.sin(t * 13) * 0.03;
        pencil.rotation.x = 0.3 + Math.cos(t * 10) * 0.03;

        if (t >= timing.revealAt && !revealed) {
          revealed = true;
          label('ROCKET', '#1f9d55');
          texture.needsUpdate = true;
        }

        // The finished page flips up and over, and lands as a clean one.
        if (t >= timing.wipeAt) {
          const k = Math.min(1, (t - timing.wipeAt) / (timing.loop - timing.wipeAt));
          sheet.rotation.x = k * Math.PI * 2;
          sheet.position.y = 12 + Math.sin(k * Math.PI) * 90;
          if (k > 0.5 && !cleared) {
            cleared = true;
            blank();
          }
        }

        const swing = Math.sin(t * (Math.PI * 2 / timing.loop));
        camera.position.set(34 + swing * 95, 335 - Math.abs(swing) * 20, 285);
        camera.lookAt(34, 0, 8);
      },
    };
  });
}
