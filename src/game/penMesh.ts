import * as THREE from 'three';
import { penModel, type Finish, type PenLook, type PenModelId, type PenPattern } from './pens';
import { PEN_HALF_HEIGHT, PEN_LENGTH } from './physics';
import { power as powerOf, type PowerId } from './powers';
import { UNITS } from './world';

const L = PEN_LENGTH / UNITS;
const HALF = L / 2;
/** Barrel radius: a touch under the physics half-thickness so pens rest on their collider. */
const R = (PEN_HALF_HEIGHT / UNITS) * 0.9;

export interface PenRig {
  group: THREE.Group;
  /** Every material, for fading the pen out as it falls. */
  materials: THREE.Material[];
  /** Back and front halves, only when built for breaking. */
  halves?: [THREE.Group, THREE.Group];
}

interface Options {
  /** Player colour for the thin ring that says whose pen it is. */
  marker?: string;
  /** Build in two halves that can fly apart. */
  split?: boolean;
}

/** The look a pen has once its hero power (if any) is applied. */
export function effectiveLook(model: PenModelId, power: PowerId | null): PenLook & { band?: string } {
  const look = penModel(model).look;
  if (!power) return look;
  const s = powerOf(power).skin;
  return {
    ...look,
    barrel: s.barrel,
    cap: s.cap,
    plug: s.plug,
    nib: s.nib,
    grip: s.grip ?? look.grip,
    trim: s.trim,
    print: s.print,
    printColor: s.printColor,
    finish: s.finish,
    band: s.band,
    pattern: undefined,
  };
}

/** Builds a pen lying along local +x (writing tip at +x), centred on its middle. */
export function buildPen(model: PenModelId, power: PowerId | null, opts: Options = {}): PenRig {
  const look = effectiveLook(model, power);
  const group = new THREE.Group();
  const materials: THREE.Material[] = [];
  const back = new THREE.Group();
  const front = new THREE.Group();
  if (opts.split) group.add(back, front);

  const keep = <M extends THREE.Material>(m: M): M => {
    m.userData.baseOpacity = m.opacity;
    materials.push(m);
    return m;
  };
  const finishMat = (color: string, finish: Finish) => keep(material(color, finish));
  const metal = (color: string, roughness = 0.18) =>
    keep(new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness, envMapIntensity: 1.6 }));
  const plastic = (color: string, extra: Partial<THREE.MeshPhysicalMaterialParameters> = {}) =>
    keep(new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.15, ...extra }));
  const chrome = metal('#dfe3e8', 0.1);
  const trim = look.trim ? metal(look.trim, 0.15) : null;
  /** Parts in the trim colour (gold, chrome) are metal, whatever the barrel is. */
  const isTrimColor = (c: string) => look.trim !== undefined && c.toLowerCase() === look.trim.toLowerCase();

  const add = (mesh: THREE.Object3D, centreX: number) => {
    mesh.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    (opts.split ? (centreX <= 0 ? back : front) : group).add(mesh);
  };
  /** A turned part: radius profile `[x, r][]` revolved round the pen's axis. */
  const turned = (profile: [number, number][], mat: THREE.Material, segments = 40) => {
    const geo = new THREE.LatheGeometry(
      profile.map(([x, r]) => new THREE.Vector2(r, x)),
      segments,
    );
    geo.rotateZ(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat);
    add(mesh, (profile[0][0] + profile[profile.length - 1][0]) / 2);
    return mesh;
  };
  const ring = (x: number, width: number, radius: number, mat: THREE.Material) =>
    turned(
      [
        [x, 0],
        [x, radius - 0.004],
        [x + 0.003, radius],
        [x + width - 0.003, radius],
        [x + width, radius - 0.004],
        [x + width, 0],
      ],
      mat,
    );

  const mace = power === 'hanuman';
  const click = look.form === 'click' && !mace;
  // Where the cap (or a click pen's top collar) ends and the barrel shows.
  const capEnd = click ? -HALF + 0.13 : -HALF + 0.4;
  const noseStart = HALF - 0.29;
  const tipStart = HALF - 0.075;

  // Barrel: slightly tapered, hexagonal for stick pens. Split pens break in the middle.
  const barrelMat = finishMat(look.barrel, look.finish);
  const barrelSpans: [number, number][] = opts.split
    ? [
        [-HALF + 0.06, 0],
        [0, noseStart],
      ]
    : [[-HALF + 0.06, noseStart]];
  for (const [x0, x1] of barrelSpans) {
    if (look.barrelShape === 'hex') {
      const geo = new THREE.CylinderGeometry(R * 1.02, R * 1.04, x1 - x0, 6, 1);
      geo.rotateY(Math.PI / 6);
      geo.rotateZ(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, barrelMat);
      mesh.position.x = (x0 + x1) / 2;
      add(mesh, mesh.position.x);
    } else {
      const taper = (x: number) => R * (1 - 0.04 * ((x + HALF) / L));
      turned(
        [
          [x0, 0],
          [x0, taper(x0) - 0.003],
          [x0 + 0.004, taper(x0)],
          [x1 - 0.004, taper(x1)],
          [x1, taper(x1) - 0.003],
          [x1, 0],
        ],
        barrelMat,
      );
    }
  }

  // A clear barrel shows the refill: a thin tube, part-filled with ink.
  if (look.finish === 'translucent') {
    turned([[-HALF + 0.08, 0], [-HALF + 0.08, 0.017], [noseStart + 0.06, 0.017], [noseStart + 0.06, 0]], plastic('#f3f5f7', { roughness: 0.5, clearcoat: 0 }), 16);
    turned([[-HALF + 0.1, 0], [-HALF + 0.1, 0.0145], [0.08, 0.0145], [0.08, 0]], plastic(look.ink, { roughness: 0.6, clearcoat: 0 }), 16);
  }

  // Printed name along one side.
  if (!opts.split) {
    const print = new THREE.Mesh(
      openTube(-0.12, 0.38, R * 1.012),
      keep(new THREE.MeshBasicMaterial({ map: printTexture(look.print, look.printColor), transparent: true, depthWrite: false })),
    );
    add(print, 0.1);
  }

  if (look.pattern && !opts.split) {
    const onGrip = look.pattern.on === 'grip';
    const x0 = onGrip ? noseStart - 0.25 : capEnd + 0.04;
    const x1 = onGrip ? noseStart - 0.01 : noseStart - (look.grip ? 0.27 : 0.02);
    const radius = (onGrip && look.grip ? R * 1.09 : R) * 1.012;
    const sleeve = new THREE.Mesh(
      openTube(x0, x1, radius),
      keep(
        new THREE.MeshStandardMaterial({
          map: patternTexture(look.pattern, x1 - x0),
          transparent: true,
          roughness: 0.35,
          depthWrite: false,
        }),
      ),
    );
    add(sleeve, (x0 + x1) / 2);
  }

  // Hero band round the middle of the barrel.
  if (look.band) ring(-0.2, 0.06, R * 1.03, finishMat(look.band, 'lacquer'));

  // Rubber grip with fine ribs.
  if (look.grip) {
    const gripMat = plastic(look.grip, { roughness: 0.9, clearcoat: 0 });
    const profile: [number, number][] = [[noseStart - 0.25, 0]];
    for (let x = noseStart - 0.25; x < noseStart - 0.005; x += 0.014) {
      profile.push([x, R * 1.04], [x + 0.007, R * 1.085]);
    }
    profile.push([noseStart, R * 1.04], [noseStart, 0]);
    turned(profile, gripMat);
  }
  if (trim) ring(noseStart - 0.006, 0.012, R * 1.05, trim);

  // Nose cone curving down to a metal tip and the ball.
  const metalNose = look.finish === 'metal' || isTrimColor(look.nib);
  const noseMat = metalNose ? metal(look.nib, 0.22) : finishMat(look.nib, look.finish === 'translucent' ? 'translucent' : 'plastic');
  turned(
    [
      [noseStart, 0],
      [noseStart, R],
      [noseStart + 0.06, R * 0.96],
      [noseStart + 0.13, R * 0.74],
      [tipStart - 0.01, 0.026],
      [tipStart, 0.024],
      [tipStart, 0],
    ],
    noseMat,
  );
  turned([[tipStart, 0], [tipStart, 0.021], [tipStart + 0.035, 0.014], [HALF - 0.012, 0.0075], [HALF - 0.008, 0]], chrome, 24);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 12, 8), metal('#2b2b2b', 0.25));
  ball.position.x = HALF - 0.007;
  add(ball, HALF);

  if (mace) {
    buildMaceHead(turned, metal, look);
  } else if (click) {
    // Click pen: a collar at the top, the plunger poking out of it, and a clip down the barrel.
    const collarMat = look.finish === 'metal' || isTrimColor(look.cap) ? metal(look.cap, 0.2) : finishMat(look.cap, look.finish);
    turned(
      [
        [-HALF + 0.04, 0],
        [-HALF + 0.04, R * 0.92],
        [-HALF + 0.05, R * 1.02],
        [capEnd - 0.006, R * 1.02],
        [capEnd, R * 0.98],
        [capEnd, 0],
      ],
      collarMat,
    );
    const plunger = metal(look.plug, 0.12);
    turned(
      [
        [-HALF - 0.035, 0],
        [-HALF - 0.035, R * 0.42],
        [-HALF - 0.028, R * 0.55],
        [-HALF + 0.045, R * 0.58],
        [-HALF + 0.045, 0],
      ],
      plunger,
      28,
    );
    add(buildClip(R * 1.02, -HALF + 0.46, trim ?? plunger), -HALF + 0.25);
    // A multi-colour pen's ink sliders, one on each side of the top.
    (look.sliders ?? []).forEach((color, i) => {
      const tab = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.018, 0.024), plastic(color));
      const a = (i / (look.sliders?.length ?? 1)) * Math.PI * 2 + Math.PI / 4;
      tab.position.set(-HALF + 0.08, Math.cos(a) * R * 1.05, Math.sin(a) * R * 1.05);
      tab.rotation.x = -a;
      add(tab, -HALF);
    });
  } else {
    // Cap posted on the back: a shell with a domed end, a lip and a sprung clip.
    const capMat =
      look.finish === 'metal' || isTrimColor(look.cap)
        ? metal(look.cap, 0.2)
        : finishMat(look.cap, look.finish === 'translucent' ? 'plastic' : look.finish);
    const rc = R * 1.14;
    turned(
      [
        [-HALF, 0],
        [-HALF, rc * 0.45],
        [-HALF + 0.008, rc * 0.82],
        [-HALF + 0.025, rc],
        [capEnd - 0.012, rc * 1.005],
        [capEnd - 0.004, rc * 1.03],
        [capEnd, rc * 0.96],
        [capEnd, 0],
      ],
      capMat,
    );
    // End finial in the plug colour.
    turned(
      [[-HALF - 0.004, 0], [-HALF - 0.004, rc * 0.4], [-HALF + 0.004, rc * 0.5], [-HALF + 0.004, 0]],
      isTrimColor(look.plug) ? metal(look.plug, 0.15) : finishMat(look.plug, 'lacquer'),
      24,
    );
    add(buildClip(rc, capEnd, trim ?? capMat), -HALF + 0.2);
    if (trim) ring(capEnd - 0.03, 0.014, rc * 1.02, trim);
  }

  // Thin player-colour ring where the cap meets the barrel.
  if (opts.marker) ring(capEnd + 0.004, 0.018, R * 1.06, plastic(opts.marker, { clearcoat: 0.3 }));

  return { group, materials, halves: opts.split ? [back, front] : undefined };
}

/** Hanuman's gada: a ribbed golden mace head where the cap would be, with a saffron collar. */
function buildMaceHead(
  turned: (p: [number, number][], m: THREE.Material, s?: number) => THREE.Mesh,
  metal: (c: string, r?: number) => THREE.Material,
  look: PenLook,
): void {
  const gold = metal(look.cap, 0.16);
  const saffron = metal(look.plug, 0.3);
  const cx = -HALF + 0.08;
  const head: [number, number][] = [[cx - 0.13, 0]];
  // Onion-shaped head with eight raised ribs, like a temple gada.
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const x = cx - 0.13 + t * 0.26;
    const bulge = Math.sin(t * Math.PI) * 0.12 + 0.03;
    const rib = 0.008 * Math.abs(Math.sin(t * Math.PI * 4));
    head.push([x, bulge + rib]);
  }
  head.push([cx + 0.13, 0]);
  turned(head, gold, 48);
  // Top knob.
  turned([[cx - 0.2, 0], [cx - 0.2, 0.012], [cx - 0.16, 0.03], [cx - 0.13, 0.02], [cx - 0.13, 0]], gold, 24);
  // Saffron collar and neck down to the handle.
  turned([[cx + 0.12, 0], [cx + 0.12, 0.05], [cx + 0.16, 0.05], [cx + 0.18, 0.062], [cx + 0.22, 0.062], [cx + 0.22, 0]], saffron, 32);
  // Saffron cloth wrapped round the handle.
  for (const x of [cx + 0.3, cx + 0.38, cx + 0.46]) turned([[x, 0], [x, R * 1.08], [x + 0.015, R * 1.08], [x + 0.015, 0]], saffron, 24);
}

/** A pen clip: a strip along the top of the cap that lifts at the end, with a bead. */
function buildClip(rc: number, capEnd: number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  const x0 = -HALF + 0.05;
  const x1 = capEnd - 0.045;
  shape.moveTo(x0, rc - 0.002);
  shape.lineTo(x0, rc + 0.012);
  shape.quadraticCurveTo((x0 + x1) / 2, rc + 0.02, x1, rc + 0.016);
  shape.lineTo(x1, rc + 0.006);
  shape.quadraticCurveTo((x0 + x1) / 2, rc + 0.009, x0 + 0.02, rc - 0.002);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.026,
    bevelEnabled: true,
    bevelThickness: 0.003,
    bevelSize: 0.003,
    bevelSegments: 2,
    curveSegments: 12,
  });
  geo.translate(0, 0, -0.013);
  g.add(new THREE.Mesh(geo, mat));
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.014, 14, 10), mat);
  bead.scale.set(1.5, 0.8, 1.1);
  bead.position.set(x1 - 0.004, rc + 0.006, 0);
  g.add(bead);
  return g;
}

/** Physically based material for a barrel finish. */
export function material(color: string, finish: Finish): THREE.MeshPhysicalMaterial {
  switch (finish) {
    case 'translucent':
      return new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.08,
        transmission: 0.9,
        thickness: 0.06,
        ior: 1.48,
        clearcoat: 1,
        attenuationColor: new THREE.Color(color),
        attenuationDistance: 0.4,
      });
    case 'pearl':
      return new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.28,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        sheen: 1,
        sheenColor: new THREE.Color('#ffffff'),
        sheenRoughness: 0.4,
        iridescence: 0.5,
        iridescenceIOR: 1.3,
      });
    case 'matte':
      return new THREE.MeshPhysicalMaterial({ color, roughness: 0.82, clearcoat: 0 });
    case 'lacquer':
      return new THREE.MeshPhysicalMaterial({ color, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.03 });
    case 'metal':
      return new THREE.MeshPhysicalMaterial({
        color,
        metalness: 1,
        roughness: 0.2,
        anisotropy: 0.6,
        envMapIntensity: 1.6,
      });
    default:
      return new THREE.MeshPhysicalMaterial({ color, roughness: 0.34, clearcoat: 0.55, clearcoatRoughness: 0.15 });
  }
}

/** An open tube along x, for printed text over the barrel. */
function openTube(x0: number, x1: number, r: number): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(r, r, x1 - x0, 40, 1, true);
  geo.rotateZ(-Math.PI / 2);
  geo.translate((x0 + x1) / 2, 0, 0);
  return geo;
}

/**
 * A printed pattern, laid out round the barrel (u) and along it (v).
 * `length` is the printed span, so dots and rings keep their size.
 */
function patternTexture(p: PenPattern, length: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = Math.max(64, Math.round(length * 900));
  const g = c.getContext('2d')!;
  const [a, b = a, d = a, e = a, f = a] = p.colors;
  if (p.kind === 'dots') {
    // A grid of small round dots, every other row offset.
    g.fillStyle = a;
    for (let y = 8, row = 0; y < c.height; y += 16, row++) {
      for (let x = (row % 2) * 8 + 4; x < c.width; x += 16) {
        g.beginPath();
        g.arc(x, y, 3.2, 0, Math.PI * 2);
        g.fill();
      }
    }
  } else if (p.kind === 'rings') {
    // Thin rings round the barrel: two at the middle, or a group of four on a grip.
    g.fillStyle = a;
    const n = p.on === 'grip' ? 4 : 2;
    for (let i = 0; i < n; i++) g.fillRect(0, c.height * (0.4 + i * 0.07), c.width, Math.max(3, c.height * 0.02));
  } else if (p.kind === 'label') {
    // A silver label band with a red logo box and coloured spots.
    g.fillStyle = a;
    g.fillRect(0, c.height * 0.15, c.width, c.height * 0.7);
    g.fillStyle = b;
    g.fillRect(0, c.height * 0.15, c.width, c.height * 0.05);
    g.fillRect(0, c.height * 0.8, c.width, c.height * 0.05);
    g.fillStyle = d;
    g.fillRect(c.width * 0.12, c.height * 0.25, c.width * 0.2, c.height * 0.06);
    g.fillStyle = b;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.arc(c.width * 0.2, c.height * (0.4 + i * 0.08), 6, 0, Math.PI * 2);
      g.fill();
    }
  } else {
    // A colourful graphic: overlapping blocks and triangles, like a printed gel pen.
    let seed = 17;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const colors = [a, b, d, e, f];
    for (let i = 0; i < 40; i++) {
      g.fillStyle = colors[i % colors.length];
      g.globalAlpha = 0.9;
      const x = rand() * c.width;
      const y = rand() * c.height;
      const s = 18 + rand() * 50;
      g.beginPath();
      if (i % 3 === 0) g.rect(x, y, s, s * 0.6);
      else {
        g.moveTo(x, y);
        g.lineTo(x + s, y + s * 0.3);
        g.lineTo(x + s * 0.2, y + s);
      }
      g.fill();
    }
    g.globalAlpha = 1;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function printTexture(text: string, color: string): THREE.CanvasTexture {
  // Cylinder UVs: u runs around the barrel, v along it.
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 1024;
  const g = c.getContext('2d')!;
  g.translate(32, c.height / 2);
  g.rotate(Math.PI / 2);
  g.fillStyle = color;
  g.font = '600 46px "Arial Narrow", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
