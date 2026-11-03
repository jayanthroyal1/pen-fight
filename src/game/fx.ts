import * as THREE from 'three';

/** A short-lived visual effect; returns false once finished. */
type Effect = (dt: number) => boolean;

/**
 * Effects for hero moments: rings rolling out across the desk, spark bursts,
 * glowing trails behind a flying pen, a beam of light, a web line, cracks.
 */
export class Fx {
  readonly group = new THREE.Group();
  private effects: Effect[] = [];
  private dot = makeDotTexture();

  update(dt: number): void {
    this.effects = this.effects.filter((e) => e(dt));
  }

  clear(): void {
    this.effects = [];
    for (const child of [...this.group.children]) this.remove(child);
  }

  /** A flat ring that grows outward from `at` on the desk and fades. */
  ring(at: THREE.Vector3, color: string, radius = 1.2, duration = 0.6, width = 0.06): void {
    const geo = new THREE.RingGeometry(1 - width, 1, 48);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(at).setY(Math.max(at.y, 0.01));
    this.group.add(mesh);
    let t = 0;
    this.effects.push((dt) => {
      t += dt;
      const k = Math.min(1, t / duration);
      const s = 0.05 + radius * (1 - (1 - k) ** 3);
      mesh.scale.setScalar(s);
      mat.opacity = 0.9 * (1 - k);
      if (k >= 1) this.remove(mesh);
      return k < 1;
    });
  }

  /** Sparks flying out from `at`. */
  burst(at: THREE.Vector3, color: string, count = 40, speed = 2.5, life = 0.7): void {
    const positions = new Float32Array(count * 3);
    const velocities: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      positions.set([at.x, at.y + 0.05, at.z], i * 3);
      const a = Math.random() * Math.PI * 2;
      const up = 0.3 + Math.random() * 0.9;
      const v = speed * (0.4 + Math.random() * 0.6);
      velocities.push(new THREE.Vector3(Math.cos(a) * v, up * v, Math.sin(a) * v));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color,
      size: 0.09,
      map: this.dot,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geo, mat);
    this.group.add(points);
    let t = 0;
    this.effects.push((dt) => {
      t += dt;
      const p = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < count; i++) {
        const v = velocities[i];
        v.y -= 6 * dt;
        p.setXYZ(i, p.getX(i) + v.x * dt, Math.max(0.01, p.getY(i) + v.y * dt), p.getZ(i) + v.z * dt);
      }
      p.needsUpdate = true;
      mat.opacity = Math.max(0, 1 - t / life);
      if (t >= life) this.remove(points);
      return t < life;
    });
  }

  /** Glowing dots left behind a moving object for `duration` seconds. */
  trail(follow: () => THREE.Vector3 | null, color: string, duration = 1.5): void {
    const max = 90;
    const positions = new Float32Array(max * 3);
    const ages = new Float32Array(max).fill(99);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color,
      size: 0.11,
      map: this.dot,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    this.group.add(points);
    let t = 0;
    let next = 0;
    let emit = 0;
    this.effects.push((dt) => {
      t += dt;
      emit += dt;
      const at = t < duration ? follow() : null;
      while (at && emit > 0.016) {
        emit -= 0.016;
        positions.set([at.x + (Math.random() - 0.5) * 0.05, at.y + 0.02, at.z + (Math.random() - 0.5) * 0.05], next * 3);
        ages[next] = 0;
        next = (next + 1) % max;
      }
      for (let i = 0; i < max; i++) {
        ages[i] += dt;
        // Old dots sink into the desk and vanish.
        if (ages[i] > 0.5) positions[i * 3 + 1] = -100;
      }
      (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      const done = t > duration + 0.6;
      if (done) this.remove(points);
      return !done;
    });
  }

  /** A soft cone of light from above onto `at`. */
  beam(at: THREE.Vector3, color: string, duration = 1.6): void {
    const geo = new THREE.CylinderGeometry(0.15, 0.9, 7, 32, 1, true);
    geo.translate(0, 3.5, 0);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(at.x, 0, at.z);
    this.group.add(mesh);
    let t = 0;
    this.effects.push((dt) => {
      t += dt;
      const k = t / duration;
      mat.opacity = 0.35 * Math.sin(Math.min(1, k) * Math.PI);
      mesh.rotation.y += dt * 0.8;
      if (k >= 1) this.remove(mesh);
      return k < 1;
    });
  }

  /** A thin line between two moving points, e.g. a web or a lasso rope. */
  line(ends: () => [THREE.Vector3, THREE.Vector3] | null, color: string, duration: number): void {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    this.group.add(line);
    let t = 0;
    this.effects.push((dt) => {
      t += dt;
      const e = ends();
      if (e) geo.setFromPoints(e);
      mat.opacity = t > duration - 0.2 ? Math.max(0, (duration - t) / 0.2) : 0.95;
      if (t >= duration) this.remove(line);
      return t < duration;
    });
  }

  /** A spinning loop of glowing rope that tightens onto `at`. */
  lasso(at: THREE.Vector3, color: string, duration = 1.1): void {
    const geo = new THREE.TorusGeometry(1, 0.025, 8, 64);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(at).setY(0.15);
    this.group.add(mesh);
    let t = 0;
    this.effects.push((dt) => {
      t += dt;
      const k = Math.min(1, t / duration);
      mesh.scale.setScalar(1.4 * (1 - k) + 0.9);
      mesh.rotation.y += dt * 9;
      mesh.position.y = 0.15 + Math.sin(k * Math.PI) * 0.3;
      mat.opacity = 0.95 * (1 - Math.max(0, k - 0.7) / 0.3);
      if (k >= 1) this.remove(mesh);
      return k < 1;
    });
  }

  /** Spinning rings stacked round a vertical axis, like a whirlwind. */
  whirl(at: () => THREE.Vector3, color: string, duration = 1.2): void {
    const rings: THREE.Mesh[] = [];
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (let i = 0; i < 5; i++) {
      const geo = new THREE.TorusGeometry(0.4 + i * 0.12, 0.015, 6, 48, Math.PI * 1.3);
      geo.rotateX(Math.PI / 2);
      const m = new THREE.Mesh(geo, mat);
      rings.push(m);
      this.group.add(m);
    }
    let t = 0;
    this.effects.push((dt) => {
      t += dt;
      const p = at();
      rings.forEach((m, i) => {
        m.position.set(p.x, p.y - 0.3 + i * 0.18, p.z);
        m.rotation.y += dt * (10 + i * 3);
      });
      mat.opacity = 0.7 * Math.min(1, (duration - t) / 0.3);
      const done = t >= duration;
      if (done) rings.forEach((m) => this.remove(m));
      return !done;
    });
  }

  /** Dark cracks spreading out from `at` across the desk, fading slowly. */
  crack(at: THREE.Vector3, color = '#2a1408', duration = 2.5): void {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.strokeStyle = color;
    g.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      let x = 128;
      let y = 128;
      let a = (i / 9) * Math.PI * 2 + Math.random() * 0.4;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 6; s++) {
        a += (Math.random() - 0.5) * 0.7;
        x += Math.cos(a) * 18;
        y += Math.sin(a) * 18;
        g.lineTo(x, y);
        g.lineWidth = Math.max(0.5, 3 - s * 0.5);
      }
      g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    const geo = new THREE.PlaneGeometry(1.6, 1.6);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(at.x, 0.004, at.z);
    mesh.rotation.y = Math.random() * Math.PI;
    this.group.add(mesh);
    let t = 0;
    this.effects.push((dt) => {
      t += dt;
      mat.opacity = 0.85 * Math.max(0, 1 - t / duration);
      if (t >= duration) this.remove(mesh);
      return t < duration;
    });
  }

  /** A dark, wing-shaped shadow sweeping across the desk. */
  wings(at: THREE.Vector3, duration = 0.9): void {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.25);
    shape.quadraticCurveTo(0.6, 0.6, 1.4, 0.35);
    shape.lineTo(1.2, 0.1);
    shape.lineTo(1.0, 0.2);
    shape.lineTo(0.8, 0.0);
    shape.lineTo(0.55, 0.12);
    shape.lineTo(0, -0.2);
    shape.lineTo(-0.55, 0.12);
    shape.lineTo(-0.8, 0.0);
    shape.lineTo(-1.0, 0.2);
    shape.lineTo(-1.2, 0.1);
    shape.lineTo(-1.4, 0.35);
    shape.quadraticCurveTo(-0.6, 0.6, 0, 0.25);
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.55, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    this.group.add(mesh);
    let t = 0;
    this.effects.push((dt) => {
      t += dt;
      const k = Math.min(1, t / duration);
      mesh.position.set(at.x - 3 + k * 3, 0.006, at.z - 1.5 + k * 1.5);
      mesh.scale.setScalar(1.6 - k * 0.6);
      mat.opacity = 0.55 * Math.sin(k * Math.PI);
      if (k >= 1) this.remove(mesh);
      return k < 1;
    });
  }

  private remove(o: THREE.Object3D): void {
    this.group.remove(o);
    o.traverse((x) => {
      if (x instanceof THREE.Mesh || x instanceof THREE.Points || x instanceof THREE.Line) {
        x.geometry.dispose();
        const m = x.material as THREE.Material & { map?: THREE.Texture | null };
        if (m.map && m.map !== this.dot) m.map.dispose();
        m.dispose();
      }
    });
  }
}

function makeDotTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
