import * as THREE from 'three';
import { onAwayChange } from '../platform/lifecycle';
import { buzz, sfx } from '../platform/sfx';
import { buildArena, type Arena } from './arena';
import { decide, idle, isDangerous, newBrain, newFighter, strike, swingProgress, tick, type FightEvent, type Fighter, type HitResult, type Input } from './combat';
import { Stick, Trail } from './figure';
import { poseFor, type Motion, type Pose, type Stance } from './pose';
import { characterOf, swordOf, type Chapter, type CharacterId, type Foe, type Sword, type SwordId } from './story';
import { ARENA_HALF, STEP, SwordWorld, partEnds, type FighterBody, type Ragdoll } from './world';

const WAVE_SPEED = 13;
const WAVE_DAMAGE = 20;
const DASH_DAMAGE = 15;
const DASH_SPEED = 17;
const BLOCK_SPEED = 0.25;
const SWING_SPEED = 0.3;
const MAX_DROPS = 220;
const MAX_STAINS = 70;
const KO_SLOW = 0.28;
const KO_HOLD_S = 2.6;
const STRIDE_M = 1.9;
/** Below this share of health, the last boss stops holding back. */
const ENRAGE_AT = 0.5;

export interface Hud {
  hp: number;
  foeHp: number;
  energy: number;
  guard: number;
  foeGuard: number;
}

export interface FightOptions {
  chapter: Chapter;
  character: CharacterId;
  sword: SwordId;
  blood: boolean;
  input: Input;
  low: boolean;
  onHud: (hud: Hud) => void;
  onCall: (text: string) => void;
  onEnd: (won: boolean) => void;
  onAway: () => void;
}

interface Side {
  stats: Fighter;
  sword: Sword;
  body: FighterBody;
  stick: Stick;
  trail: Trail;
  facing: 1 | -1;
  speed: number;
  stride: number;
  knocked: number;
  doll: Ragdoll | null;
  pose: Pose;
}

/** A pool of little spheres for blood and sparks, and the marks blood leaves on the floor. */
class Droplets {
  readonly mesh: THREE.InstancedMesh;
  readonly stains: THREE.InstancedMesh;
  private readonly drops = Array.from({ length: MAX_DROPS }, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0, stain: false }));
  private next = 0;
  private nextStain = 0;
  private readonly matrix = new THREE.Matrix4();
  private readonly color = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), new THREE.MeshBasicMaterial(), MAX_DROPS);
    this.mesh.frustumCulled = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DROPS * 3), 3);
    const circle = new THREE.CircleGeometry(1, 10);
    circle.rotateX(-Math.PI / 2);
    this.stains = new THREE.InstancedMesh(circle, new THREE.MeshBasicMaterial({ color: '#7a0d14', transparent: true, opacity: 0.85 }), MAX_STAINS);
    this.stains.frustumCulled = false;
    this.matrix.makeScale(0, 0, 0);
    for (let i = 0; i < MAX_DROPS; i++) this.mesh.setMatrixAt(i, this.matrix);
    for (let i = 0; i < MAX_STAINS; i++) this.stains.setMatrixAt(i, this.matrix);
    scene.add(this.mesh, this.stains);
  }

  /** Throws `count` drops from a point, spraying towards `dir`. */
  burst(p: THREE.Vector3, dir: number, count: number, color: string, speed: number, stain: boolean): void {
    this.color.set(color);
    for (let i = 0; i < count; i++) {
      const d = this.drops[this.next];
      this.mesh.setColorAt(this.next, this.color);
      this.next = (this.next + 1) % MAX_DROPS;
      d.on = true;
      d.x = p.x;
      d.y = p.y;
      d.z = p.z + (Math.random() - 0.5) * 0.2;
      d.vx = dir * speed * (0.3 + Math.random()) + (Math.random() - 0.5) * 2;
      d.vy = speed * (Math.random() * 1.1 - 0.1);
      d.vz = (Math.random() - 0.5) * speed;
      d.size = 0.018 + Math.random() * 0.04;
      d.stain = stain;
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number): void {
    this.drops.forEach((d, i) => {
      if (!d.on) return;
      d.vy -= 20 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      if (d.y <= 0.01) {
        d.on = false;
        this.mesh.setMatrixAt(i, this.matrix.makeScale(0, 0, 0));
        if (d.stain) {
          const r = 0.05 + d.size * 3 * Math.random() * 2;
          this.stains.setMatrixAt(this.nextStain, this.matrix.makeScale(r, 1, r * 0.7).setPosition(d.x, 0.012, d.z));
          this.stains.instanceMatrix.needsUpdate = true;
          this.nextStain = (this.nextStain + 1) % MAX_STAINS;
        }
        return;
      }
      this.mesh.setMatrixAt(i, this.matrix.makeScale(d.size, d.size, d.size).setPosition(d.x, d.y, d.z));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** The fight: Rapier moves the bodies, the rules decide the blows, and Three.js draws it. */
export class SwordScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 2, 0.5, 140);
  private readonly world = new SwordWorld();
  private readonly arena: Arena;
  private readonly hero: Side;
  private readonly foe: Side;
  private readonly profile: Foe;
  private readonly brain = newBrain();
  private readonly droplets: Droplets;
  private readonly waves: { mesh: THREE.Mesh; dir: number; from: Side; to: Side }[] = [];
  private readonly waveShape = new THREE.TorusGeometry(0.75, 0.13, 6, 18, Math.PI);
  private readonly waveSkin = new THREE.MeshBasicMaterial({ color: '#ff8a2a', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  private raf = 0;
  private last = 0;
  private spare = 0;
  private time = 0;
  private freeze = 0;
  private slow = 1;
  private shake = 0;
  private fighting = false;
  private paused = false;
  private ended = false;
  private endIn = 0;
  private enraged = false;
  private focusX = 0;
  private zoom = 9;
  private disposed = false;
  private readonly mid = new THREE.Vector3();
  private readonly observer: ResizeObserver;
  private readonly stopAway: () => void;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly o: FightOptions,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !o.low, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, o.low ? 1.25 : 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.arena = buildArena(this.scene, o.chapter.theme, ARENA_HALF);
    this.droplets = new Droplets(this.scene);

    const me = characterOf(o.character);
    const mySword = swordOf(o.sword);
    // The shadow is the player, turned against them.
    const mirrored = o.chapter.theme === 'mirror';
    const foe = o.chapter.foe;
    this.profile = foe;
    const foeSword = mirrored ? mySword : swordOf(foe.sword);
    const foeBase = characterOf(mirrored ? o.character : foe.character);
    this.hero = this.side(newFighter(me.hp, me.focus), mySword, -4, 1, me.color, me.speed);
    this.foe = this.side(newFighter(foeBase.hp * foe.hpScale, 1, foe.damageScale), foeSword, 4, -1, foe.color, foeBase.speed * foe.speedScale);

    this.observer = new ResizeObserver(() => this.fit());
    this.observer.observe(canvas);
    this.fit();
    this.stopAway = onAwayChange((away) => {
      if (away && this.fighting) o.onAway();
    });
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private side(stats: Fighter, sword: Sword, x: number, facing: 1 | -1, color: string, speed: number): Side {
    const stick = new Stick(color, sword);
    const trail = new Trail(sword.id === 'ember' ? '#ff8a2a' : '#dff0ff');
    this.scene.add(stick.group, trail.mesh);
    return { stats, sword, body: this.world.addFighter(x), stick, trail, facing, speed, stride: 0, knocked: 0, doll: null, pose: poseFor(this.motion('idle')) };
  }

  /** Where a fighter is. Once they're a ragdoll their old body is gone, so it's the torso. */
  private at(s: Side): { x: number; y: number } {
    if (!s.doll) return this.world.feet(s.body);
    const t = s.doll.parts[0].body.translation();
    return { x: t.x, y: 0 };
  }

  private motion(stance: Stance, s?: Side): Motion {
    return { stance, time: this.time, stride: s?.stride ?? 0, swing: s ? swingProgress(s.stats, s.sword) : 0, combo: s?.stats.combo ?? 0, vy: s && !s.doll ? s.body.body.linvel().y : 0 };
  }

  private fit(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** The story is over: fight. */
  begin(): void {
    this.fighting = true;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.paused) return;
    this.time += dt;
    if (this.freeze > 0) this.freeze -= dt;
    else {
      this.spare += dt * this.slow;
      while (this.spare >= STEP) {
        this.spare -= STEP;
        this.step();
      }
    }
    this.draw(dt);
  };

  private foeInput(): Input {
    if (!this.fighting || this.hero.stats.action === 'ko') return idle();
    const gap = this.at(this.hero).x - this.at(this.foe).x;
    return decide(this.foe.stats, this.hero.stats, gap, this.foe.sword, this.hero.sword, this.profile, this.brain, STEP);
  }

  private step(): void {
    const heroInput = this.fighting && !this.ended ? { ...this.o.input } : idle();
    const { input } = this.o;
    input.attack = false;
    input.jump = false;
    input.power = null;
    this.act(this.hero, this.foe, heroInput);
    this.act(this.foe, this.hero, this.foeInput());
    this.strikes(this.hero, this.foe);
    this.strikes(this.foe, this.hero);
    this.moveWaves();

    if (!this.enraged && this.o.chapter.theme === 'throne' && this.foe.stats.hp < this.foe.stats.maxHp * ENRAGE_AT && this.foe.stats.hp > 0) {
      this.enraged = true;
      this.foe.stats.energy = 100;
      this.foe.speed *= 1.15;
      this.foe.stats.damageScale *= 1.2;
      this.o.onCall('The Blade awakens!');
      this.shake = 0.3;
      this.droplets.burst(this.foe.stick.tip, 0, 26, '#ff8a2a', 7, false);
      sfx.warp();
    }
    this.world.step();

    if (this.endIn > 0) {
      this.endIn -= STEP;
      if (this.endIn <= 0 && !this.ended) {
        this.ended = true;
        this.o.onEnd(this.foe.stats.action === 'ko');
      }
    }
  }

  private act(me: Side, other: Side, input: Input): void {
    if (me.doll) return;
    const events: FightEvent[] = tick(me.stats, input, me.sword, STEP);
    for (const e of events) {
      if (e.type === 'swing') sfx.slash(e.combo === 2);
      else if (e.type === 'heal') {
        sfx.right();
        this.droplets.burst(me.stick.hilt, 0, 18, '#59e08c', 4, false);
      } else if (e.type === 'power') {
        if (e.power === 'wave') this.launchWave(me, other);
        else if (e.power === 'dash') sfx.warp();
      }
    }

    const at = this.at(me);
    const there = this.at(other);
    if (me.stats.action === 'free' || me.stats.action === 'attack') {
      if (Math.abs(there.x - at.x) > 0.1) me.facing = there.x > at.x ? 1 : -1;
    }
    me.knocked = Math.max(0, me.knocked - STEP);
    if (me.knocked > 0) return;
    const free = me.stats.action === 'free';
    if (me.stats.action === 'dash') this.world.run(me.body, me.facing * DASH_SPEED);
    else if (me.stats.action === 'stun') this.world.run(me.body, 0);
    else {
      const scale = me.stats.action === 'attack' ? SWING_SPEED : me.stats.blocking ? BLOCK_SPEED : 1;
      const lunge = me.stats.action === 'attack' && isDangerous(me.stats, me.sword) ? me.facing * (me.stats.combo === 2 ? 5 : 2.4) : 0;
      this.world.run(me.body, input.move * me.speed * scale + lunge);
    }
    if (input.jump && free && this.world.grounded(me.body)) {
      this.world.jump(me.body);
      sfx.hop();
    }
    me.stride += (Math.abs(me.body.body.linvel().x) * STEP) / STRIDE_M;
  }

  private launchWave(me: Side, other: Side): void {
    const mesh = new THREE.Mesh(this.waveShape, this.waveSkin);
    const at = this.at(me);
    mesh.position.set(at.x + me.facing * 0.9, at.y + 1, 0);
    mesh.rotation.z = -me.facing * (Math.PI / 2);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.waves.push({ mesh, dir: me.facing, from: me, to: other });
    sfx.launch();
  }

  private moveWaves(): void {
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.mesh.position.x += w.dir * WAVE_SPEED * STEP;
      w.mesh.scale.multiplyScalar(1.006);
      const target = this.at(w.to);
      const reached = !w.to.doll && Math.abs(w.mesh.position.x - target.x) < 0.5 && target.y < 1.3;
      if (reached || Math.abs(w.mesh.position.x) > ARENA_HALF + 2) {
        if (reached) this.land(w.from, w.to, strike(w.from.stats, w.to.stats, WAVE_DAMAGE, 6, this.faces(w.to, w.from)));
        this.scene.remove(w.mesh);
        this.waves.splice(i, 1);
      }
    }
  }

  private faces(me: Side, other: Side): boolean {
    return Math.sign(this.at(other).x - this.at(me).x) === me.facing;
  }

  private strikes(me: Side, other: Side): void {
    if (me.doll || other.doll) return;
    if (me.stats.action === 'dash' && !me.stats.landed) {
      if (Math.abs(this.at(me).x - this.at(other).x) < 1) {
        this.land(me, other, strike(me.stats, other.stats, DASH_DAMAGE, 5, this.faces(other, me)));
      }
      return;
    }
    if (!isDangerous(me.stats, me.sword)) return;
    this.pose(me);
    me.stick.pose(me.pose, this.at(me).x, this.at(me).y, me.facing);
    if (this.world.touches(me.stick.hilt, me.stick.tip, other.body)) {
      this.land(me, other, strike(me.stats, other.stats, me.sword.damage, me.sword.knock, this.faces(other, me)));
    }
  }

  private land(me: Side, other: Side, hit: HitResult): void {
    if (hit.kind === 'none') return;
    const dir = Math.sign(this.at(other).x - this.at(me).x) || me.facing;
    const point = new THREE.Vector3().copy(me.stick.tip);
    point.x = this.at(other).x - dir * 0.15;
    point.z = 0.1;
    point.y = Math.min(1.6, Math.max(0.7, point.y));

    if (hit.kind === 'parry' || hit.kind === 'block' || hit.kind === 'guard-break') {
      sfx.clang(hit.kind === 'parry');
      this.droplets.burst(point, -dir, hit.kind === 'parry' ? 30 : 12, '#ffd28a', 6, false);
      this.shake = Math.max(this.shake, hit.kind === 'block' ? 0.05 : 0.14);
      this.freeze = hit.kind === 'block' ? 0.02 : 0.09;
      this.world.knock(hit.kind === 'parry' ? me.body : other.body, (hit.kind === 'parry' ? -dir : dir) * hit.knock, 0.8);
      (hit.kind === 'parry' ? me : other).knocked = 0.14;
      if (hit.kind === 'parry') this.o.onCall('Parry!');
      if (hit.kind === 'guard-break') this.o.onCall('Guard broken!');
      buzz(12);
      return;
    }

    other.stick.hurt();
    sfx.thud(hit.finisher);
    buzz(hit.finisher ? 45 : 22);
    const blood = this.o.blood;
    this.droplets.burst(point, dir, (hit.finisher ? 42 : 20) + (hit.ko ? 40 : 0), blood ? '#b3101a' : '#f2f0ea', hit.finisher ? 8 : 5.5, blood);
    this.shake = Math.max(this.shake, hit.finisher ? 0.22 : 0.1);
    this.freeze = hit.finisher ? 0.11 : 0.05;
    if (hit.ko) {
      const vx = dir * (hit.knock + 4);
      this.pose(other);
      other.doll = this.world.fall(other.body, other.pose, other.facing, vx, 6, other.sword.length);
      other.stick.blade.visible = true;
      this.slow = KO_SLOW;
      this.freeze = 0.16;
      this.shake = 0.32;
      this.endIn = KO_HOLD_S * KO_SLOW + 0.6;
      sfx.crash();
      this.o.onCall(other === this.foe ? 'Victory' : 'You fell');
      return;
    }
    if (hit.finisher) this.o.onCall('Finisher!');
    other.knocked = hit.finisher ? 0.3 : 0.16;
    this.world.knock(other.body, dir * hit.knock, hit.finisher ? 4.5 : 1.5);
  }

  private pose(s: Side): void {
    const st = s.stats;
    const grounded = this.world.grounded(s.body);
    const moving = Math.abs(s.body.body.linvel().x) > 0.5;
    const stance: Stance = st.action === 'attack' ? 'swing' : st.action === 'stun' ? 'stun' : st.action === 'dash' ? 'dash' : !grounded ? 'air' : st.blocking ? 'block' : moving ? 'run' : 'idle';
    s.pose = poseFor(this.motion(stance, s));
  }

  private drawSide(s: Side, dt: number): void {
    s.stick.fade(dt);
    if (s.doll) {
      const doll = s.doll;
      const t = doll.head.translation();
      s.stick.ragdoll(doll.parts.map(partEnds), new THREE.Vector3(t.x, t.y, t.z));
      const b = doll.sword.translation();
      const q = doll.sword.rotation();
      s.stick.blade.position.set(b.x, b.y, b.z);
      s.stick.blade.quaternion.set(q.x, q.y, q.z, q.w);
      s.trail.update(s.stick.hilt, s.stick.tip, false);
      return;
    }
    const at = this.at(s);
    this.pose(s);
    s.stick.pose(s.pose, at.x, at.y, s.facing);
    const cutting = (s.stats.action === 'attack' && swingProgress(s.stats, s.sword) > 0.25 && swingProgress(s.stats, s.sword) < 0.82) || s.stats.action === 'dash';
    this.mid.lerpVectors(s.stick.hilt, s.stick.tip, 0.55);
    s.trail.update(this.mid, s.stick.tip, cutting);
  }

  private draw(dt: number): void {
    this.arena.update(dt);
    this.droplets.update(dt * Math.max(this.slow, 0.5));
    this.drawSide(this.hero, dt);
    this.drawSide(this.foe, dt);

    const a = this.at(this.hero).x;
    const b = this.at(this.foe).x;
    const narrow = this.camera.aspect < 1.5 ? 1.5 / this.camera.aspect : 1;
    const zoomTo = Math.min(19, Math.max(8.5, 6.5 + Math.abs(a - b) * 1.05)) * narrow * (this.endIn > 0 ? 0.82 : 1);
    this.zoom += (zoomTo - this.zoom) * Math.min(1, dt * 3.5);
    this.focusX += ((a + b) / 2 - this.focusX) * Math.min(1, dt * 5);
    this.shake *= Math.exp(-dt * 9);
    const sway = Math.sin(this.time * 0.35) * 1.3;
    this.camera.position.set(this.focusX + sway + (Math.random() - 0.5) * this.shake, 2.3 + (Math.random() - 0.5) * this.shake, this.zoom);
    this.camera.lookAt(this.focusX, 1.25, 0);

    this.o.onHud({
      hp: this.hero.stats.hp / this.hero.stats.maxHp,
      foeHp: this.foe.stats.hp / this.foe.stats.maxHp,
      energy: this.hero.stats.energy,
      guard: this.hero.stats.guard / 100,
      foeGuard: this.foe.stats.guard / 100,
    });
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.stopAway();
    this.hero.stick.dispose();
    this.foe.stick.dispose();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      (o as THREE.InstancedMesh).dispose?.();
      mesh.geometry?.dispose();
      ([] as THREE.Material[]).concat(mesh.material ?? []).forEach((m) => m.dispose());
    });
    (this.scene.background as THREE.Texture | null)?.dispose?.();
    this.waveShape.dispose();
    this.world.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
