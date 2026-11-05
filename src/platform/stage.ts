import * as THREE from 'three';
import { BRAND_ORANGE } from './catalog';

/** The logo's width over its height. */
export const LOGO_ASPECT = 947 / 610;
const LOGO_W = 4;
const FOV = 42;
const SKY = '#0b1c2b';

/** The logo's width on screen, in CSS pixels; `.wp-intro-logo` sets the same size. */
function logoPixels(): number {
  return Math.min(window.innerWidth * 0.84, window.innerHeight * 0.5 * LOGO_ASPECT, 520);
}

const POINT_VERTEX = /* glsl */ `
  attribute vec3 aStart;
  attribute vec3 aAmbient;
  attribute vec3 aColor;
  attribute float aSeed;
  uniform float uAssemble;
  uniform float uWarp;
  uniform float uTime;
  uniform float uSize;
  uniform float uLogoAlpha;
  uniform float uPulse;
  uniform vec3 uTint;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float a = clamp(uAssemble * 1.4 - aSeed * 0.4, 0.0, 1.0);
    a = 1.0 - pow(1.0 - a, 3.0);
    vec3 p = mix(aStart, position, a);
    float turn = (1.0 - a) * (2.4 + aSeed * 2.0);
    p.xy = mat2(cos(turn), -sin(turn), sin(turn), cos(turn)) * p.xy;

    float w = smoothstep(aSeed * 0.35, aSeed * 0.35 + 0.65, uWarp);
    vec3 drift = aAmbient + vec3(sin(uTime * 0.21 + aSeed * 31.0), cos(uTime * 0.17 + aSeed * 23.0), 0.0) * 0.35;
    vec3 flung = position * (1.0 + w * 3.0);
    flung.z += w * 9.0;
    p = mix(mix(p, flung, w), drift, smoothstep(0.35, 1.0, w));
    p.xy *= 1.0 + uPulse * 0.1 * aSeed;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (1.0 + w * aSeed * 1.8) / max(0.5, -mv.z);
    vColor = mix(aColor, uTint, w * 0.75);
    vAlpha = mix(uLogoAlpha * smoothstep(0.0, 0.25, uAssemble), 0.5, w);
  }
`;

const POINT_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    float glow = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor * glow * glow * vAlpha, glow * vAlpha);
  }
`;

const GRID_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GRID_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uShow;
  uniform vec3 uTint;
  varying vec2 vUv;

  void main() {
    vec2 g = vUv * 44.0;
    g.y += uTime * 0.55;
    vec2 cell = abs(fract(g) - 0.5) / fwidth(g);
    float line = 1.0 - min(min(cell.x, cell.y), 1.0);
    float fade = smoothstep(0.0, 0.55, vUv.y) * smoothstep(1.0, 0.72, vUv.y);
    gl_FragColor = vec4(uTint * line * fade * uShow * 0.5, 1.0);
  }
`;

interface Tween {
  from: number;
  to: number;
  start: number;
  seconds: number;
}

/**
 * The 3D behind the whole platform, in one scene: thousands of points that
 * pull together into the logo, burst through the screen when the player enters,
 * and then drift as the starfield behind the menus, with a neon grid and slowly
 * turning shards cut like the wolf in the logo.
 */
export class PlatformStage {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 80);
  private points: THREE.Points | null = null;
  private pointUniforms = {
    uAssemble: { value: 0 },
    uWarp: { value: 0 },
    uTime: { value: 0 },
    uSize: { value: 1 },
    uLogoAlpha: { value: 1 },
    uPulse: { value: 0 },
    uTint: { value: new THREE.Color(BRAND_ORANGE) },
  };
  private gridUniforms = {
    uTime: { value: 0 },
    uShow: { value: 0 },
    uTint: { value: new THREE.Color(BRAND_ORANGE) },
  };
  private shards: THREE.InstancedMesh | null = null;
  private shardData: { pos: THREE.Vector3; spin: THREE.Vector3; rot: THREE.Euler; size: number }[] = [];
  private shardMaterial: THREE.MeshStandardMaterial | null = null;
  private tint = new THREE.Color(BRAND_ORANGE);
  private tmp = new THREE.Object3D();
  private assembleTween: Tween | null = null;
  private warpTween: Tween | null = null;
  private pointer = { x: 0, y: 0 };
  private scroll = 0;
  private dist = 8;
  private pixelRatio: number;
  private raf = 0;
  private running = false;
  private last = 0;
  private slowFrames = 0;
  private minFrameMs: number;
  /** Resolves once the logo's points are in the scene. */
  readonly ready: Promise<void>;

  constructor(
    canvas: HTMLCanvasElement,
    private tier: 'high' | 'low',
    logoUrl: string,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, tier === 'high' ? 1.75 : 1.25);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setClearColor(SKY, 1);
    this.minFrameMs = tier === 'high' ? 0 : 30;
    this.scene.fog = new THREE.Fog(SKY, 9, 26);

    const grid = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.ShaderMaterial({
        vertexShader: GRID_VERTEX,
        fragmentShader: GRID_FRAGMENT,
        uniforms: this.gridUniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    grid.rotation.x = -Math.PI / 2;
    grid.position.set(0, -3.4, -12);
    this.scene.add(grid);

    this.buildShards(tier === 'high' ? 26 : 12);
    window.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.resize();
    this.ready = this.buildPoints(logoUrl, tier === 'high' ? 11000 : 5500);
    this.start();
  }

  private buildShards(count: number): void {
    const hemi = new THREE.HemisphereLight('#7fb6e0', '#10202e', 1.1);
    const key = new THREE.DirectionalLight('#ffb37a', 2.2);
    key.position.set(4, 6, 6);
    this.scene.add(hemi, key);
    this.shardMaterial = new THREE.MeshStandardMaterial({
      color: '#1d3c55',
      emissive: this.tint.clone(),
      emissiveIntensity: 0.28,
      roughness: 0.42,
      metalness: 0.35,
      flatShading: true,
    });
    this.shards = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(1, 0), this.shardMaterial, count);
    this.shards.frustumCulled = false;
    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      this.shardData.push({
        pos: new THREE.Vector3(side * (1.6 + Math.random() * 6), (Math.random() - 0.4) * 9, -2 - Math.random() * 13),
        spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.5),
        rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        size: 0.22 + Math.random() * 0.62,
      });
    }
    this.scene.add(this.shards);
  }

  /** Samples the logo's solid pixels: each point gets a spot and a colour from it. */
  private async buildPoints(url: string, count: number): Promise<void> {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('logo failed to load'));
      img.src = url;
    });
    const w = 420;
    const h = Math.round(w / LOGO_ASPECT);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(img, 0, 0, w, h);
    const { data } = g.getImageData(0, 0, w, h);
    const solid: number[] = [];
    for (let i = 0; i < w * h; i++) if (data[i * 4 + 3] > 120) solid.push(i);

    const position = new Float32Array(count * 3);
    const start = new Float32Array(count * 3);
    const ambient = new Float32Array(count * 3);
    const color = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    const worldPerPixel = LOGO_W / w;
    const paint = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const p = solid[Math.floor(Math.random() * solid.length)];
      const x = p % w;
      const y = Math.floor(p / w);
      position.set([(x - w / 2) * worldPerPixel, (h / 2 - y) * worldPerPixel, 0], i * 3);
      // Everything starts out of a wide ring round the camera and spirals in.
      const a = Math.random() * Math.PI * 2;
      const r = 6 + Math.random() * 9;
      start.set([Math.cos(a) * r, Math.sin(a) * r, -4 + Math.random() * 10], i * 3);
      ambient.set([(Math.random() - 0.5) * 20, (Math.random() - 0.5) * 13, -13 + Math.random() * 13], i * 3);
      paint.setRGB(data[p * 4] / 255, data[p * 4 + 1] / 255, data[p * 4 + 2] / 255, THREE.SRGBColorSpace);
      color.set([paint.r, paint.g, paint.b], i * 3);
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geo.setAttribute('aStart', new THREE.BufferAttribute(start, 3));
    geo.setAttribute('aAmbient', new THREE.BufferAttribute(ambient, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.points = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        vertexShader: POINT_VERTEX,
        fragmentShader: POINT_FRAGMENT,
        uniforms: this.pointUniforms,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
      }),
    );
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  private tween(from: number, to: number, seconds: number): Tween {
    return { from, to, start: performance.now(), seconds };
  }

  /** The points pull together into the logo. */
  playAssemble(seconds: number): void {
    this.assembleTween = this.tween(0, 1, seconds);
  }

  /** The logo bursts past the camera and becomes the starfield. */
  warp(seconds: number): void {
    this.assembleTween = null;
    this.pointUniforms.uAssemble.value = 1;
    this.warpTween = this.tween(this.pointUniforms.uWarp.value, 1, seconds);
  }

  /** Straight to the starfield, with no intro. */
  skipToStars(): void {
    this.assembleTween = null;
    this.warpTween = null;
    this.pointUniforms.uAssemble.value = 1;
    this.pointUniforms.uWarp.value = 1;
    this.gridUniforms.uShow.value = 1;
  }

  /** `x` and `y` from -1 to 1: the view leans towards the pointer. */
  setPointer(x: number, y: number): void {
    this.pointer.x = x;
    this.pointer.y = y;
  }

  setScroll(px: number): void {
    this.scroll = px;
  }

  /** The colour of the page being shown. */
  setAccent(color: string): void {
    this.tint.set(color);
  }

  /** A ripple through the stars, for a tap. */
  pulse(): void {
    this.pointUniforms.uPulse.value = 1;
  }

  private start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private onVisibility = () => {
    if (document.hidden) this.stop();
    else this.start();
  };

  private resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Far enough back that the logo's points land exactly under the logo image.
    this.dist = (LOGO_W * h) / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * logoPixels());
    this.camera.updateProjectionMatrix();
    this.pointUniforms.uSize.value = (this.tier === 'high' ? 0.085 : 0.11) * h * this.pixelRatio * 0.5;
  };

  private tick(tw: Tween | null, now: number): { value: number; done: boolean } | null {
    if (!tw) return null;
    const k = Math.min(1, (now - tw.start) / (tw.seconds * 1000));
    return { value: tw.from + (tw.to - tw.from) * k, done: k >= 1 };
  }

  private frame = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    const ms = now - this.last;
    if (ms < this.minFrameMs) return;
    this.last = now;
    const dt = Math.min(0.1, ms / 1000);
    const u = this.pointUniforms;
    u.uTime.value += dt;
    this.gridUniforms.uTime.value += dt;

    const assemble = this.tick(this.assembleTween, now);
    if (assemble) {
      u.uAssemble.value = assemble.value;
      if (assemble.done) this.assembleTween = null;
    }
    const warp = this.tick(this.warpTween, now);
    if (warp) {
      u.uWarp.value = warp.value * warp.value * (3 - 2 * warp.value);
      if (warp.done) this.warpTween = null;
    }
    const w = u.uWarp.value;
    // Once the sharp logo image is on top, the points sink behind it.
    u.uLogoAlpha.value += ((u.uAssemble.value >= 1 ? 0.18 : 1) - u.uLogoAlpha.value) * Math.min(1, dt * 5);
    u.uPulse.value *= Math.exp(-dt * 5);
    u.uTint.value.lerp(this.tint, Math.min(1, dt * 3));
    this.gridUniforms.uTint.value.copy(u.uTint.value);
    this.gridUniforms.uShow.value += (w - this.gridUniforms.uShow.value) * Math.min(1, dt * 3);

    if (this.shards && this.shardMaterial) {
      this.shardMaterial.emissive.copy(u.uTint.value);
      this.shards.visible = w > 0.3;
      if (this.shards.visible) {
        this.shardData.forEach((s, i) => {
          s.rot.x += s.spin.x * dt;
          s.rot.y += s.spin.y * dt;
          s.rot.z += s.spin.z * dt;
          this.tmp.position.copy(s.pos);
          this.tmp.position.y += Math.sin(u.uTime.value * 0.3 + i) * 0.25 + this.scroll * 0.0012 * (1 + s.size);
          this.tmp.rotation.copy(s.rot);
          this.tmp.scale.setScalar(s.size * Math.min(1, w * 1.2));
          this.tmp.updateMatrix();
          this.shards!.setMatrixAt(i, this.tmp.matrix);
        });
        this.shards.instanceMatrix.needsUpdate = true;
      }
    }

    const cam = this.camera;
    const lean = w * 0.7;
    cam.position.x += (this.pointer.x * lean - cam.position.x) * Math.min(1, dt * 3);
    cam.position.y += (-this.pointer.y * lean * 0.6 - cam.position.y) * Math.min(1, dt * 3);
    cam.position.z = this.dist;
    cam.lookAt(0, 0, 0);
    this.renderer.render(this.scene, cam);

    // If frames run slow for a while, draw fewer pixels so the menus stay smooth.
    this.slowFrames = ms > 34 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 1);
    if (this.slowFrames > 60 && this.pixelRatio > 0.75) {
      this.slowFrames = 0;
      this.pixelRatio = Math.max(0.75, this.pixelRatio - 0.25);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.resize();
    }
  };

  dispose(): void {
    this.stop();
    window.removeEventListener('resize', this.resize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.renderer.dispose();
    // Hands the graphics memory back before a game makes its own 3D context.
    this.renderer.forceContextLoss();
  }
}
