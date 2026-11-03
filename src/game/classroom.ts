import * as THREE from 'three';
import { DESK } from './physics';
import type { RoomTheme } from './rooms';
import { UNITS } from './world';

const W = DESK.width / UNITS;
const D = DESK.height / UNITS;
/** At this scale a 15 cm pen is 1.5 units, so a 75 cm school desk stands about 5 units tall. */
export const FLOOR_Y = -4.8;
const DESK_THICKNESS = 0.22;
/** How far beyond the desk's far edge the classroom wall stands. */
const WALL_GAP = 4.2;
/** Bench back in front of the desk, where the score is chalked. */
const BENCH_H = 0.95;

/** What the chalk on the bench says. */
export interface ChalkScore {
  names: [string, string];
  colors: [string, string];
  scores: [number, number];
  round: number;
  final: boolean;
  /** Rounds needed to win the match. */
  target: number;
}

export interface Classroom {
  /** The desk with its frame and legs, so the desk can be tipped (Uneven Desk). */
  table: THREE.Group;
  /** Far wall, bench and posters, seen beyond the desk's far end; one set per camera orientation. */
  far: { landscape: THREE.Group; portrait: THREE.Group };
  setScore(score: ChalkScore): void;
  /** Places the far side beyond the end of the desk facing the camera. */
  orient(portrait: boolean, flipped: boolean): void;
}

export function buildClassroom(scene: THREE.Scene, theme: RoomTheme, maxAnisotropy: number): Classroom {
  const hemi = new THREE.HemisphereLight(theme.light, '#4a3a28', 0.55);
  scene.add(hemi);
  // Daylight from the classroom windows, off to one side.
  const sun = new THREE.DirectionalLight(theme.light, 2.0);
  sun.position.set(W / 2 + 4, 10, D / 2 + 3);
  sun.target.position.set(W / 2, 0, D / 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.01;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight('#dfe8ff', 0.35);
  fill.position.set(W / 2 - 6, 6, D / 2 - 4);
  scene.add(fill);

  // Desk top: worn and carved in a government school, spotless in an international one.
  const wood = new THREE.CanvasTexture(deskCanvas(theme));
  wood.colorSpace = THREE.SRGBColorSpace;
  wood.anisotropy = maxAnisotropy;
  const top = new THREE.MeshPhysicalMaterial({
    map: wood,
    roughness: 0.62 - (1 - theme.wear) * 0.25,
    clearcoat: 0.25 + (1 - theme.wear) * 0.5,
    clearcoatRoughness: 0.5,
  });
  const edge = new THREE.MeshStandardMaterial({ color: new THREE.Color(theme.desk[1]).multiplyScalar(0.7), roughness: 0.7 });
  const desk = new THREE.Mesh(new THREE.BoxGeometry(W, DESK_THICKNESS, D), [edge, edge, top, edge, edge, edge]);
  desk.position.set(W / 2, -DESK_THICKNESS / 2, D / 2);
  desk.receiveShadow = true;
  desk.castShadow = true;
  const table = new THREE.Group();
  table.add(desk);
  scene.add(table);

  // Steel frame and legs.
  const steel = new THREE.MeshStandardMaterial({ color: '#3b3f45', metalness: 0.7, roughness: 0.45 });
  const legH = -DESK_THICKNESS - FLOOR_Y;
  for (const [x, z] of [
    [0.35, 0.35],
    [W - 0.35, 0.35],
    [0.35, D - 0.35],
    [W - 0.35, D - 0.35],
  ]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, legH, 0.16), steel);
    leg.position.set(x, FLOOR_Y + legH / 2, z);
    leg.castShadow = true;
    table.add(leg);
  }
  const apron = new THREE.Mesh(new THREE.BoxGeometry(W - 0.6, 0.3, D - 0.6), steel);
  apron.position.set(W / 2, -DESK_THICKNESS - 0.15, D / 2);
  table.add(apron);

  const floorTex = new THREE.CanvasTexture(floorCanvas(theme));
  floorTex.colorSpace = THREE.SRGBColorSpace;
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(9, 9);
  floorTex.anisotropy = 8;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(72, 72),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: theme.floor === 'carpet' ? 1 : 0.7 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(W / 2, FLOOR_Y, D / 2);
  floor.receiveShadow = true;
  scene.add(floor);

  // One chalk texture, shared by the bench on both far sides.
  const chalk = document.createElement('canvas');
  chalk.width = 1100;
  chalk.height = 220;
  const chalkTex = new THREE.CanvasTexture(chalk);
  chalkTex.colorSpace = THREE.SRGBColorSpace;
  chalkTex.anisotropy = maxAnisotropy;

  const landscape = buildFarSide(theme, W * 0.62, chalkTex);
  const portrait = buildFarSide(theme, D * 0.86, chalkTex);
  scene.add(landscape, portrait);

  return {
    table,
    far: { landscape, portrait },
    setScore(score) {
      drawChalkScore(chalk, theme.bench, score);
      chalkTex.needsUpdate = true;
    },
    orient(isPortrait, flipped) {
      landscape.visible = !isPortrait;
      portrait.visible = isPortrait;
      if (isPortrait) {
        portrait.rotation.y = flipped ? -Math.PI / 2 : Math.PI / 2;
        portrait.position.set(flipped ? W + WALL_GAP : -WALL_GAP, 0, D / 2);
      } else {
        landscape.rotation.y = flipped ? Math.PI : 0;
        landscape.position.set(W / 2, 0, flipped ? D + WALL_GAP : -WALL_GAP);
      }
    },
  };
}

/** Wall, posters and the bench in front, in a group whose +z faces the desk. */
function buildFarSide(theme: RoomTheme, benchWidth: number, chalkTex: THREE.Texture): THREE.Group {
  const group = new THREE.Group();
  const wallH = 14;
  const wallTex = new THREE.CanvasTexture(wallCanvas(theme));
  wallTex.colorSpace = THREE.SRGBColorSpace;
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, wallH), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 }));
  wall.position.set(0, FLOOR_Y + wallH / 2, 0);
  wall.receiveShadow = true;
  group.add(wall);

  // Charts on the wall, more of them in the better-funded schools.
  const posters = theme.wear > 0.8 ? 1 : theme.wear > 0.4 ? 2 : 3;
  const colors = ['#f2c230', '#e85d75', '#3fa7d6', '#59cd90'];
  for (let i = 0; i < posters; i++) {
    const poster = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 2.1),
      new THREE.MeshStandardMaterial({ map: posterTexture(colors[i % colors.length], i), roughness: 0.8 }),
    );
    poster.position.set(-3.2 + i * 3.2, 2.6, 0.03);
    group.add(poster);
  }

  // Bench back: wood, with the score chalked on the side facing the desk.
  const benchMat = new THREE.MeshStandardMaterial({ color: theme.bench, roughness: 0.6 });
  const chalkMat = new THREE.MeshStandardMaterial({ map: chalkTex, roughness: 0.85 });
  const benchBack = new THREE.Mesh(new THREE.BoxGeometry(benchWidth, BENCH_H, 0.09), [benchMat, benchMat, benchMat, benchMat, chalkMat, benchMat]);
  benchBack.position.set(0, 0.6, WALL_GAP - 1.6);
  benchBack.castShadow = true;
  benchBack.receiveShadow = true;
  group.add(benchBack);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 5.6, 0.1),
      new THREE.MeshStandardMaterial({ color: '#3b3f45', metalness: 0.7, roughness: 0.45 }),
    );
    post.position.set(side * (benchWidth / 2 - 0.2), FLOOR_Y + 2.8, WALL_GAP - 1.6);
    group.add(post);
  }
  return group;
}

function seeded(seed: number) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

/** Writes in coloured chalk: several faint, slightly shaky passes, then dusty gaps. */
function chalkText(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, rand: () => number, align: CanvasTextAlign = 'left') {
  g.save();
  g.font = `700 ${size}px "Patrick Hand", "Comic Sans MS", cursive`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillStyle = color;
  for (let i = 0; i < 4; i++) {
    g.globalAlpha = 0.35;
    g.fillText(text, x + (rand() - 0.5) * 2.5, y + (rand() - 0.5) * 2.5);
  }
  g.restore();
}

function drawChalkScore(c: HTMLCanvasElement, bench: string, s: ChalkScore): void {
  const g = c.getContext('2d')!;
  const rand = seeded(s.round * 31 + s.scores[0] * 7 + s.scores[1] * 3 + 1);
  // Bench wood with a little grain.
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = bench;
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(0,0,0,${0.04 + rand() * 0.06})`;
    g.lineWidth = 1 + rand() * 2;
    const y = rand() * c.height;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(c.width, y + (rand() - 0.5) * 8);
    g.stroke();
  }
  // Old chalk smudges.
  for (let i = 0; i < 6; i++) {
    const x = rand() * c.width;
    const y = rand() * c.height;
    const grad = g.createRadialGradient(x, y, 0, x, y, 80);
    grad.addColorStop(0, 'rgba(255,255,255,0.08)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(x - 80, y - 80, 160, 160);
  }

  const mid = c.width / 2;
  const cy = 120;
  const tally = (x: number, wins: number, color: string, dir: 1 | -1) => {
    for (let i = 0; i < s.target; i++) {
      const bx = x + dir * i * 58;
      g.save();
      g.globalAlpha = 0.8;
      g.strokeStyle = color;
      g.lineWidth = 5;
      g.strokeRect(bx - 20, cy - 20, 40, 40);
      if (i < wins) {
        // A chalk tick in the box for each round won.
        g.beginPath();
        g.moveTo(bx - 12, cy);
        g.lineTo(bx - 3, cy + 12);
        g.lineTo(bx + 15, cy - 16);
        g.lineWidth = 7;
        g.stroke();
      }
      g.restore();
    }
  };

  chalkText(g, short(s.names[0]), 40, 50, 46, s.colors[0], rand);
  tally(70, s.scores[0], s.colors[0], 1);
  chalkText(g, short(s.names[1]), c.width - 40, 50, 46, s.colors[1], rand, 'right');
  tally(c.width - 70, s.scores[1], s.colors[1], -1);
  if (s.final) {
    chalkText(g, 'FINAL', mid, 82, 58, '#ffe066', rand, 'center');
    chalkText(g, 'ROUND!', mid, 146, 58, '#ffe066', rand, 'center');
  } else {
    chalkText(g, 'vs', mid, 70, 54, '#f4f1e8', rand, 'center');
    chalkText(g, `round ${s.round}`, mid, 145, 40, '#f4f1e8', rand, 'center');
  }

  // Dusty gaps where the chalk skipped over the grain.
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(0,0,0,${0.15 + rand() * 0.35})`;
    g.fillRect(rand() * c.width, rand() * c.height, 1 + rand() * 2.5, 1 + rand() * 2.5);
  }
  // Put the wood back under the gaps.
  g.globalCompositeOperation = 'destination-over';
  g.fillStyle = bench;
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'source-over';
}

const short = (name: string) => (name.length > 12 ? `${name.slice(0, 11)}…` : name);

/** The desk top: varnished wood, worn according to the school. */
function deskCanvas(theme: RoomTheme): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 1280;
  const g = c.getContext('2d')!;
  const rand = seeded(7);
  const wear = theme.wear;

  const base = g.createLinearGradient(0, 0, c.width, c.height);
  base.addColorStop(0, theme.desk[0]);
  base.addColorStop(1, theme.desk[1]);
  g.fillStyle = base;
  g.fillRect(0, 0, c.width, c.height);

  // Grain along the length of the desk.
  for (let i = 0; i < 260; i++) {
    const y = rand() * c.height;
    const dark = rand() < 0.65;
    g.strokeStyle = dark ? `rgba(92, 42, 12, ${0.04 + rand() * 0.1})` : `rgba(255, 220, 170, ${0.03 + rand() * 0.06})`;
    g.lineWidth = 0.8 + rand() * 3;
    g.beginPath();
    g.moveTo(-20, y);
    const amp = 2 + rand() * 7;
    const freq = 120 + rand() * 260;
    const phase = rand() * 10;
    for (let x = 0; x <= c.width + 40; x += 24) g.lineTo(x, y + Math.sin(x / freq + phase) * amp);
    g.stroke();
  }

  // Worn patches where elbows and books rub.
  for (let i = 0; i < Math.round(14 * wear); i++) {
    const x = rand() * c.width;
    const y = rand() * c.height;
    const rad = 120 + rand() * 260;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, `rgba(240, 180, 110, ${0.06 + rand() * 0.06})`);
    grad.addColorStop(1, 'rgba(240, 180, 110, 0)');
    g.fillStyle = grad;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }

  // Scratches: light gouges, each with a darker lip.
  for (let i = 0; i < Math.round(30 + 200 * wear); i++) {
    const x = rand() * c.width;
    const y = rand() * c.height;
    const a = rand() * Math.PI * 2;
    const len = 12 + rand() * (rand() < 0.15 ? 260 : 90);
    const bend = (rand() - 0.5) * 0.4;
    g.lineWidth = 0.6 + rand() * 1.4;
    g.strokeStyle = `rgba(70, 30, 8, ${(0.1 + rand() * 0.2) * (0.4 + wear)})`;
    curve(g, x + 1.2, y + 1.2, a, len, bend);
    g.strokeStyle = `rgba(255, 230, 190, ${(0.12 + rand() * 0.3) * (0.4 + wear)})`;
    curve(g, x, y, a, len, bend);
  }

  if (wear > 0.5) {
    // A cup ring, and things carved and scribbled into it over the years.
    ring(g, c.width * 0.56, c.height * 0.2, 46, 'rgba(70, 30, 8, 0.32)', 5, 0, Math.PI * 2);
    ring(g, c.width * 0.18, c.height * 0.78, 52, 'rgba(70, 30, 8, 0.2)', 4, 0.6, Math.PI * 1.5);
    carve(g, '#', c.width * 0.27, c.height * 0.13, -0.15, 70);
    carve(g, 'A + K', c.width * 0.8, c.height * 0.48, 1.45, 56);
    carve(g, 'X-B', c.width * 0.12, c.height * 0.5, -1.6, 48);
    carve(g, '2026', c.width * 0.66, c.height * 0.86, 0.05, 44);
  }
  for (let i = 0; i < Math.round(9 * wear); i++) {
    g.fillStyle = rand() < 0.6 ? 'rgba(25, 30, 70, 0.55)' : 'rgba(20, 15, 10, 0.5)';
    g.beginPath();
    g.ellipse(rand() * c.width, rand() * c.height, 3 + rand() * 8, 2 + rand() * 6, rand() * 3, 0, Math.PI * 2);
    g.fill();
  }

  // Darker grime towards the edges.
  const vignette = g.createRadialGradient(c.width / 2, c.height / 2, c.height * 0.4, c.width / 2, c.height / 2, c.width * 0.62);
  vignette.addColorStop(0, 'rgba(50, 20, 5, 0)');
  vignette.addColorStop(1, `rgba(50, 20, 5, ${0.1 + 0.25 * wear})`);
  g.fillStyle = vignette;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

function curve(g: CanvasRenderingContext2D, x: number, y: number, a: number, len: number, bend: number): void {
  g.beginPath();
  g.moveTo(x, y);
  g.quadraticCurveTo(x + Math.cos(a + bend) * len * 0.5, y + Math.sin(a + bend) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
  g.stroke();
}

function ring(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, width: number, a0: number, a1: number): void {
  g.strokeStyle = color;
  g.lineWidth = width;
  g.beginPath();
  g.arc(x, y, r, a0, a1);
  g.stroke();
}

function carve(g: CanvasRenderingContext2D, text: string, x: number, y: number, rot: number, size: number): void {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.font = `600 ${size}px "Courier New", monospace`;
  g.textAlign = 'center';
  g.lineWidth = 2.5;
  g.strokeStyle = 'rgba(60, 25, 6, 0.45)';
  g.strokeText(text, 1.5, 1.5);
  g.lineWidth = 1.6;
  g.strokeStyle = 'rgba(255, 215, 165, 0.45)';
  g.strokeText(text, 0, 0);
  g.restore();
}

function floorCanvas(theme: RoomTheme): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  const rand = seeded(3);
  const [light, dark] = theme.floorColors;
  if (theme.floor === 'tiles' || theme.floor === 'vinyl') {
    g.fillStyle = dark;
    g.fillRect(0, 0, 512, 512);
    const n = 4;
    const s = 512 / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        g.fillStyle = light;
        if (theme.floor === 'tiles') g.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
        else g.fillRect(0, j * s + 2, 512, s - 4);
        g.fillStyle = `rgba(0, 0, 0, ${rand() * 0.07})`;
        g.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
      }
    }
  } else if (theme.floor === 'terrazzo') {
    g.fillStyle = light;
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = [dark, '#ffffff', '#b98b6a', '#6f6a64'][Math.floor(rand() * 4)];
      g.globalAlpha = 0.5 + rand() * 0.4;
      g.beginPath();
      g.ellipse(rand() * 512, rand() * 512, 1 + rand() * 4, 1 + rand() * 3, rand() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  } else {
    // Carpet: fine, soft noise.
    g.fillStyle = light;
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = rand() < 0.5 ? dark : 'rgba(255,255,255,0.06)';
      g.fillRect(rand() * 512, rand() * 512, 1.5, 1.5);
    }
  }
  return c;
}

function wallCanvas(theme: RoomTheme): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const g = c.getContext('2d')!;
  // Painted dado at the bottom, lighter paint above.
  g.fillStyle = theme.wall;
  g.fillRect(0, 0, 256, 512);
  g.fillStyle = theme.dado;
  g.fillRect(0, 512 * 0.62, 256, 512 * 0.38);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(0, 512 * 0.615, 256, 6);
  g.fillStyle = '#4a3420';
  g.fillRect(0, 500, 256, 12);
  return c;
}

/** A simple classroom chart: a coloured header and some lines. */
function posterTexture(color: string, i: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 336;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fbf7ec';
  g.fillRect(0, 0, 256, 336);
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 70);
  g.fillStyle = '#ffffff';
  g.font = '700 30px "Arial Narrow", Arial';
  g.textAlign = 'center';
  g.fillText(['ABC', 'TIMES TABLES', 'SOLAR SYSTEM', 'MAP'][i % 4], 128, 46);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  for (let y = 100; y < 320; y += 26) g.fillRect(24, y, 160 + ((y * 7) % 50), 8);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
