// 게임 본체: 렌더링, 카메라, 입력, 루프
import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { World } from './world.js';
import { Destruction } from './destruction.js';
import { FX } from './fx.js';
import { Arsenal } from './weapons.js';
import { Cinematic } from './cinematic.js';
import { sharedUniforms } from './materials.js';
import { PROF } from './prof.js';

export const QUALITY = {
  low: { name: '낮음', pixelRatio: 1, shadows: 0, bloom: false, ao: false, texSize: 2048, anisotropy: 4, trees: 2500, maxLoose: 2500, maxDynamic: 700, chunkFull: 120, particles: 2500, fxScale: 0.5, shockFracture: 10, msaa: 0 },
  medium: { name: '보통', pixelRatio: 1, shadows: 2048, bloom: true, ao: false, texSize: 4096, anisotropy: 8, trees: 7000, maxLoose: 4500, maxDynamic: 1400, chunkFull: 180, particles: 5000, fxScale: 0.8, shockFracture: 18, msaa: 4 },
  high: { name: '높음', pixelRatio: 1.25, shadows: 4096, bloom: true, ao: true, texSize: 4096, anisotropy: 12, trees: 14000, maxLoose: 7000, maxDynamic: 2200, chunkFull: 230, particles: 8000, fxScale: 1, shockFracture: 26, msaa: 4 },
  ultra: { name: '울트라', pixelRatio: 2, shadows: 4096, bloom: true, ao: true, texSize: 8192, anisotropy: 16, trees: 24000, maxLoose: 11000, maxDynamic: 3500, chunkFull: 300, particles: 12000, fxScale: 1.25, shockFracture: 36, msaa: 4 },
};

export const TIMES = {
  morning: { name: '아침', elev: 16, az: 110, exposure: 0.5, sunI: 2.4, hemi: 0.45, env: 0.22, night: 0 },
  noon: { name: '한낮', elev: 48, az: 150, exposure: 0.45, sunI: 2.8, hemi: 0.5, env: 0.25, night: 0 },
  sunset: { name: '노을', elev: 5, az: 255, exposure: 0.78, sunI: 2.4, hemi: 0.6, env: 0.3, night: 0.3 },
  night: { name: '밤', elev: -6, az: 230, exposure: 0.9, sunI: 0.45, hemi: 0.22, env: 0.15, night: 1 },
};

export class Game {
  constructor({ canvas, phys, grid, data, radius, place, quality, time, audio, hud }) {
    this.canvas = canvas; this.phys = phys; this.grid = grid; this.data = data; this.radius = radius;
    this.place = place; this.qualityKey = quality; this.Q = QUALITY[quality]; this.timeKey = time;
    this.audio = audio; this.hud = hud;
    this.clock = new THREE.Clock();
    this.running = true;
    this.aim = null; this.hover = null;
    this._shakeOff = new THREE.Vector3();
    this._keys = new Set();
    this._initRenderer();
    this._initScene();
    this._initContent();
    this._initControls();
    this.cine = new Cinematic(this);
    this.storm = 0;
    this._bind();
    this._fpsT = 0; this._fpsN = 0; this.fps = 60;
    this._loop = this._loop.bind(this);
    this.renderer.setAnimationLoop(this._loop);
  }

  _initRenderer() {
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true, logarithmicDepthBuffer: false });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.Q.pixelRatio));
    r.setSize(window.innerWidth, window.innerHeight, false);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = this.Q.shadows > 0;
    r.info.autoReset = false;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.renderer = r;
  }

  _initScene() {
    const scene = new THREE.Scene();
    this.scene = scene;
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 20000);
    this.camera = camera;
    // 하늘
    const sky = new Sky(); sky.scale.setScalar(18000); scene.add(sky); this.sky = sky;
    sky.renderOrder = -100; sky.material.depthTest = false; sky.frustumCulled = false;
    // 하늘 HDR 값을 제한해 블룸이 화면 전체로 번지지 않게
    sky.material.fragmentShader = sky.material.fragmentShader.replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( texColor * min( 1.0, 1.15 / max( max( texColor.r, texColor.g ), max( texColor.b, 1e-4 ) ) ), 1.0 );');
    sky.material.needsUpdate = true;
    if (sky.material.uniforms.cloudCoverage) { sky.material.uniforms.cloudCoverage.value = 0.32; sky.material.uniforms.cloudDensity.value = 0.35; }
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = this.Q.shadows > 0;
    if (this.sun.castShadow) {
      this.sun.shadow.mapSize.set(this.Q.shadows, this.Q.shadows);
      this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.6;
      this.sun.shadow.camera.near = 10; this.sun.shadow.camera.far = 4000;
    }
    scene.add(this.sun); scene.add(this.sun.target);
    // 밤하늘 별
    {
      const n = 2500, pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const u = Math.random() * Math.PI * 2, v = Math.acos(Math.random() * 0.95);
        pos.set([Math.sin(v) * Math.cos(u) * 9000, Math.cos(v) * 9000, Math.sin(v) * Math.sin(u) * 9000], i * 3);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85, depthWrite: false }));
      this.stars.renderOrder = -99; this.stars.frustumCulled = false; this.stars.visible = false;
      scene.add(this.stars);
    }
    this.hemi = new THREE.HemisphereLight(0xcfe3ff, 0x5a5040, 0.8); scene.add(this.hemi);
    scene.fog = new THREE.FogExp2(0xc8d4e0, 1 / (this.grid.span * 1.6));
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.setTime(this.timeKey);
    // 후처리
    const size = new THREE.Vector2(); this.renderer.getDrawingBufferSize(size);
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: this.Q.msaa });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    if (this.Q.ao) {
      this.gtao = new GTAOPass(scene, camera, size.x, size.y);
      this.gtao.updateGtaoMaterial({ radius: 6, distanceExponent: 1.5, thickness: 6, scale: 1.2, samples: 12 });
      this.gtao.blendIntensity = 0.85;
      this.composer.addPass(this.gtao);
    }
    if (this.Q.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.55, 0.45, 1.35);
      this.composer.addPass(this.bloom);
    }
    this.composer.addPass(new OutputPass());
  }

  setTime(key) {
    this.timeKey = key;
    const T = TIMES[key];
    const sky = this.sky, u = sky.material.uniforms;
    const night = T.night >= 1;
    u.turbidity.value = key === 'sunset' ? 6 : 3.2;
    u.rayleigh.value = key === 'sunset' ? 2.6 : night ? 0.4 : 1.4;
    u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.8;
    const phi = THREE.MathUtils.degToRad(90 - T.elev), th = THREE.MathUtils.degToRad(T.az);
    this.sunDir = new THREE.Vector3().setFromSphericalCoords(1, phi, th);
    u.sunPosition.value.copy(this.sunDir);
    // 광원
    if (night) {
      this.lightDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(50), th + 1.2);
      this.sun.color.set(0x9db4ff);
    } else {
      this.lightDir = this.sunDir.clone();
      this.sun.color.set(key === 'sunset' ? 0xffb27a : key === 'morning' ? 0xfff0dc : 0xffffff);
    }
    this.sun.intensity = T.sunI;
    this.hemi.intensity = T.hemi;
    this.hemi.color.set(night ? 0x3a4a78 : key === 'sunset' ? 0xffc9a0 : 0xcfe3ff);
    this.renderer.toneMappingExposure = T.exposure;
    sharedUniforms.uNight.value = T.night;
    this.scene.fog.color.set(night ? 0x0b1020 : key === 'sunset' ? 0xc7977c : key === 'morning' ? 0xb9c6d2 : 0xa9bfd6);
    // 환경맵
    const envScene = new THREE.Scene();
    const s2 = new Sky(); s2.scale.setScalar(1000); s2.material.depthTest = false;
    if (s2.material.uniforms.cloudCoverage) s2.material.uniforms.cloudCoverage.value = 0;
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) s2.material.uniforms[k].value = u[k].value;
    s2.material.uniforms.sunPosition.value.copy(this.sunDir);
    envScene.add(s2);
    if (night) envScene.background = new THREE.Color(0x05070d);
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(envScene, 0, 1, 2000);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = T.env;
    if (night) { this.sky.visible = false; this.scene.background = new THREE.Color(0x070a14); }
    else { this.sky.visible = true; this.scene.background = null; }
    if (this.stars) this.stars.visible = night;
    this._base = { sunI: T.sunI, hemi: T.hemi, exp: T.exposure, env: T.env, night: T.night, fog: this.scene.fog.color.clone(), fogD: this.scene.fog.density,
      turb: u.turbidity.value, cloud: u.cloudCoverage ? u.cloudCoverage.value : 0 };
    this._stormK = -1;
  }

  // 폭풍(토네이도)·핵겨울 중 하늘·조명 어둡게 + 멀리서 볼 때 안개 옅게
  _applyWeather(dt) {
    const B = this._base, u = this.sky.material.uniforms;
    if (this._stormK < 0) { this._stormK = 0; this._doomK = this._doomK || 0; }
    this._stormK += ((this.storm || 0) - this._stormK) * Math.min(1, dt * 1.2);
    this.doom = Math.max(0, (this.doom || 0) - dt / 300);
    this._doomK = (this._doomK || 0) + (this.doom - (this._doomK || 0)) * Math.min(1, dt * 0.25);
    const k = this._stormK, d = this._doomK;
    const dc = this.camera.position.length(), near = this.grid.span * 0.8;
    const far = dc > near ? (near / dc) ** 1.6 : 1;
    this.sun.intensity = B.sunI * (1 - 0.82 * k) * (1 - 0.55 * d);
    this.hemi.intensity = B.hemi * (1 - 0.5 * k) * (1 - 0.4 * d);
    this.renderer.toneMappingExposure = B.exp * (1 - 0.12 * k) * (1 + 0.15 * d);
    this.scene.environmentIntensity = B.env * (1 - 0.6 * k) * (1 - 0.5 * d);
    this.scene.fog.density = B.fogD * (1 + 2.6 * k) * (1 + 0.7 * d) * far;
    const fc = this.scene.fog.color.copy(B.fog).lerp(this._stormFog || (this._stormFog = new THREE.Color(0x30353b)), k);
    if (d > 0) fc.lerp(this._doomFog || (this._doomFog = new THREE.Color(0x5a3422)), d);
    this._frostK = (this._frostK || 0) + ((this.frost || 0) - (this._frostK || 0)) * Math.min(1, dt * 0.8);
    const fr = this._frostK;
    if (fr > 0.001) { fc.lerp(this._frostFog || (this._frostFog = new THREE.Color(0xdde7f0)), fr * 0.8); this.scene.fog.density *= 1 + 1.2 * fr; this.hemi.intensity *= 1 + 0.4 * fr; }
    if (u.cloudCoverage) u.cloudCoverage.value = B.cloud + (0.95 - B.cloud) * Math.max(k, d);
    u.turbidity.value = B.turb + 8 * k + 14 * d;
    if (u.rayleigh) { if (this._ray0 === undefined) this._ray0 = u.rayleigh.value; u.rayleigh.value = this._ray0 * (1 - 0.8 * d); }
    sharedUniforms.uNight.value = Math.max(B.night, 0.55 * k, 0.3 * d);
    // 눈
    if (fr > 0.1 && this.fx) {
      this._snowAcc = (this._snowAcc || 0) + dt * fr * 140 * this.Q.fxScale;
      const p = this.camera.position;
      while (this._snowAcc > 1) {
        this._snowAcc -= 1;
        this.fx.smoke.emit(p.x + (Math.random() - 0.5) * 220, p.y + 10 + Math.random() * 70, p.z + (Math.random() - 0.5) * 220, (Math.random() - 0.5) * 3, -4 - Math.random() * 2, (Math.random() - 0.5) * 3, 6, 0.45, 0.45, [0.95, 0.97, 1, 0.9], [0.95, 0.97, 1, 0], 0, 0, 0);
      }
    }
    if (this._dome) {
      this._dome.visible = d > 0.01;
      this._dome.position.copy(this.camera.position);
      this._dome.material.uniforms.uK.value = Math.min(1, d * 1.05);
      if (this.world && this.world.outer) { const oc = this.world.outer.material.color; if (!this._outer0) this._outer0 = oc.clone(); oc.copy(this._outer0).lerp(this._ashGround || (this._ashGround = new THREE.Color(0x3a2e26)), d * 0.8); }
      // 지평선 곳곳에서 타오르는 불길
      if (d > 0.4 && this.fx) {
        this._hzAcc = (this._hzAcc || 0) + dt * d * 6;
        const p = this.camera.position;
        while (this._hzAcc > 1) {
          this._hzAcc -= 1;
          const a = Math.random() * 6.28, r = 1500 + Math.random() * 9000;
          const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r, y = this.world.outer ? this.world.outer.position.y : 0;
          this.fx.fire.emit(x, y + 40, z, 0, 30, 0, 4, 160, 260, [1, 0.45, 0.1, 0.9], [0.6, 0.1, 0.02, 0], 0.2, 2);
          this.fx.smoke.emit(x, y + 200, z, 0, 40, 0, 14, 300, 900, [0.12, 0.1, 0.09, 0.8], [0.15, 0.13, 0.12, 0], 0.05, 3);
        }
      }
    }
    // 재(낙진)와 불씨가 카메라 주변에 떨어짐
    if (d > 0.15 && this.fx) {
      this._ashAcc = (this._ashAcc || 0) + dt * d * 90 * this.Q.fxScale;
      const p = this.camera.position;
      while (this._ashAcc > 1) {
        this._ashAcc -= 1;
        const x = p.x + (Math.random() - 0.5) * 260, z = p.z + (Math.random() - 0.5) * 260, y = p.y + 20 + Math.random() * 80;
        if (Math.random() < 0.15) this.fx.fire.emit(x, y, z, 0, -2, 0, 5, 0.35, 0.2, [1, 0.45, 0.1, 1], [0.6, 0.1, 0.02, 0], 0.2, 0, 0);
        else { const g = 0.25 + Math.random() * 0.2; this.fx.smoke.emit(x, y, z, (Math.random() - 0.5) * 2, -3 - Math.random() * 2, (Math.random() - 0.5) * 2, 7, 0.5, 0.6, [g, g, g, 0.85], [g, g, g, 0], 0, 0, 0); }
      }
    }
  }

  // 종말의 하늘: 하늘 위에 덧씌우는 붉고 어두운 돔
  _doomDome() {
    if (this._dome) return this._dome;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uK: { value: 0 }, uLow: { value: new THREE.Color(1.0, 0.36, 0.08) }, uHigh: { value: new THREE.Color(0.2, 0.075, 0.045) } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uK; uniform vec3 uLow, uHigh; varying vec3 vD;
        void main(){ float h = vD.y; vec3 c = mix(uLow, uHigh, smoothstep(-0.02, 0.2, h)); float a = uK * (0.72 + 0.16 * smoothstep(0.0, 0.3, h)); gl_FragColor = vec4(c * a, a); }`,
      transparent: false, depthTest: false, depthWrite: false, side: THREE.BackSide, fog: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), mat);
    m.renderOrder = -99; m.frustumCulled = false; m.visible = false;
    this.scene.add(m); this._dome = m;
    return m;
  }

  // 핵겨울 (0~1)
  setDoom(level, kind = 'nuke') {
    this.doom = Math.max(this.doom || 0, level);
    const u = this._doomDome().material.uniforms;
    if (kind === 'anti') { u.uLow.value.setRGB(0.7, 0.4, 1.0); u.uHigh.value.setRGB(0.12, 0.06, 0.2); } else { u.uLow.value.setRGB(1.0, 0.36, 0.08); u.uHigh.value.setRGB(0.2, 0.075, 0.045); }
    if (this._doomFog) this._doomFog.set(kind === 'anti' ? 0x241c34 : 0x5a3422);
    else this._doomFog = new THREE.Color(kind === 'anti' ? 0x241c34 : 0x5a3422);
  }

  // 거대 폭발을 볼 수 있게 시야·줌 거리 넓히기
  ensureView(far, maxDist) {
    const f = Math.min(250000, Math.max(this.camera.far, far));
    if (f > this.camera.far) { this.camera.far = f; this.camera.updateProjectionMatrix(); }
    this.controls.maxDistance = Math.max(this.controls.maxDistance, Math.min(60000, maxDist));
  }

  _initContent() {
    const hooks = {
      onBuildingDestroyed: (b) => { this.hud.toast(b.name ? `${b.name} 붕괴!` : null); this.fx.collapseDust(b); },
      onCollapse: (b, n) => { if (n > 6) { this.fx.collapseDust(b); this.audio.crumble(n); } },
      onDust: (p, s) => this.fx.dust(p, s),
      onCrush: (b, k) => { const y = b.baseY + (k + 0.5) * (b.height / b.nL); this.fx.dust({ x: b.cx + (Math.random() - 0.5) * (b.maxx - b.minx) * 0.6, y, z: b.cz + (Math.random() - 0.5) * (b.maxz - b.minz) * 0.6 }, 5); this.audio.crumble(20); },
      onVaporize: (c) => this.fx.vaporize(c),
      onImpact: (p, sp) => { this.audio.thud(); this.fx.dust(p, 6); },
    };
    this.world = new World({ scene: this.scene, grid: this.grid, data: this.data, radius: this.radius, quality: this.Q });
    this.D = new Destruction({ scene: this.scene, phys: this.phys, grid: this.grid, buildings: this.data.buildings, quality: this.Q, hooks });
    this.fx = new FX(this.scene, this.camera, this.Q);
    this.arsenal = new Arsenal({
      scene: this.scene, D: this.D, fx: this.fx, audio: this.audio, world: this.world, grid: this.grid, camera: this.camera, quality: this.Q, game: this, hud: this.hud,
      onCrater: (ranges, deep, list) => { for (const r of ranges) this.world.updateTerrainMesh(r); if (deep >= 1.5) this.D.scheduleTerrainRebuild(); for (const [x, z, r] of list || []) this.D.onTerrainChanged(x, z, r * 1.3); },
    });
    // 마커 (조준점)
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), new THREE.MeshBasicMaterial({ color: 0xff5a1f, transparent: true, opacity: 0.85, depthTest: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.renderOrder = 20; ring.visible = false;
    this.marker = ring; this.scene.add(ring);
  }

  _initControls() {
    const c = new MapControls(this.camera, this.canvas);
    c.enableDamping = true; c.dampingFactor = 0.08;
    c.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    c.minDistance = 25; c.maxDistance = Math.max(1600, this.radius * 3.2);
    c.maxPolarAngle = THREE.MathUtils.degToRad(84);
    c.zoomSpeed = 1.2; c.screenSpacePanning = false;
    const gy = this.grid.sample(0, 0);
    // 가장 높은 건물 근처를 바라보며 시작
    c.target.set(0, gy, 0);
    const d = Math.min(900, this.radius * 1.05 + 150);
    this.camera.position.set(d * 0.55, gy + d * 0.62, d * 0.72);
    c.update();
    this.controls = c;
  }

  _bind() {
    this._onResize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h, false);
      this.composer.setSize(w, h);
    };
    window.addEventListener('resize', this._onResize);
    this._mouse = new THREE.Vector2(); this._ray = new THREE.Raycaster();
    this._onMove = (e) => {
      const r = this.canvas.getBoundingClientRect();
      this._mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this._mx = e.clientX; this._my = e.clientY;
      this._moved = true;
    };
    this._onDown = (e) => {
      if (e.button !== 0) return;
      this._onMove(e);
      if (this.cine.active) { this.cine.skip(); return; }
      const hit = this.pick();
      if (!hit) return;
      this.audio.resume();
      const w = this.arsenal.current;
      if (this.arsenal.isHold()) { this._holding = true; this.aim = hit.point; this.arsenal.holdStart(hit); }
      else this.arsenal.fire(hit, this.camera.position);
      this.hud.fired(w);
    };
    this._onUp = (e) => { if (e.button === 0 && this._holding) { this._holding = false; this.arsenal.holdEnd(); } };
    this.canvas.addEventListener('pointermove', this._onMove);
    this.canvas.addEventListener('pointerdown', this._onDown);
    window.addEventListener('pointerup', this._onUp);
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    this._onKey = (e) => { if (e.type === 'keydown') this._keys.add(e.code); else this._keys.delete(e.code); };
    window.addEventListener('keydown', this._onKey); window.addEventListener('keyup', this._onKey);
    this._onBlur = () => { this._keys.clear(); if (this._holding) { this._holding = false; this.arsenal.holdEnd(); } };
    window.addEventListener('blur', this._onBlur);
  }

  pick() {
    this.camera.updateMatrixWorld();
    this._ray.setFromCamera(this._mouse, this.camera);
    const o = this._ray.ray.origin, d = this._ray.ray.direction;
    const hit = this.D.raycast({ x: o.x, y: o.y, z: o.z }, { x: d.x, y: d.y, z: d.z }, 20000);
    return hit;
  }

  simulate(seconds, dt = 1 / 30) {
    for (let t = 0; t < seconds; t += dt) {
      PROF.time('weapons', () => this.arsenal.update(dt, this.aim)); PROF.time('physics', () => this.D.update(dt)); PROF.time('fx', () => this.fx.update(dt, this.camera)); this.world.update(dt);
      if (this.onSimFrame) this.onSimFrame(); else PROF.endFrame();
    }
  }

  setSlowMo(on) { this.D.timeScale = on ? 0.22 : 1; }

  screenshot() {
    this.composer.render();
    return this.canvas.toDataURL('image/png');
  }

  _keyboard(dt) {
    const k = this._keys; if (!k.size) return;
    const c = this.controls;
    const dist = this.camera.position.distanceTo(c.target);
    const sp = dist * 0.9 * dt * (k.has('ShiftLeft') || k.has('ShiftRight') ? 2.5 : 1);
    const fwd = new THREE.Vector3().subVectors(c.target, this.camera.position); fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
    const mv = new THREE.Vector3();
    if (k.has('KeyW') || k.has('ArrowUp')) mv.add(fwd);
    if (k.has('KeyS') || k.has('ArrowDown')) mv.sub(fwd);
    if (k.has('KeyD') || k.has('ArrowRight')) mv.add(right);
    if (k.has('KeyA') || k.has('ArrowLeft')) mv.sub(right);
    if (mv.lengthSq()) { mv.normalize().multiplyScalar(sp); this.camera.position.add(mv); c.target.add(mv); }
    const rot = (k.has('KeyQ') ? 1 : 0) - (k.has('KeyE') ? 1 : 0);
    if (rot) {
      const off = new THREE.Vector3().subVectors(this.camera.position, c.target);
      off.applyAxisAngle(new THREE.Vector3(0, 1, 0), rot * dt * 1.4);
      this.camera.position.copy(c.target).add(off);
    }
    const zoom = (k.has('KeyR') ? 1 : 0) - (k.has('KeyF') ? 1 : 0);
    if (zoom) {
      const off = new THREE.Vector3().subVectors(this.camera.position, c.target);
      off.multiplyScalar(1 - zoom * dt * 1.2);
      if (off.length() > c.minDistance && off.length() < c.maxDistance) this.camera.position.copy(c.target).add(off);
    }
  }

  _loop() {
    if (!this.running) return;
    const dt = Math.min(0.05, this.clock.getDelta());
    sharedUniforms.uTime.value += dt;
    if (this.sky.material.uniforms.time) this.sky.material.uniforms.time.value += dt;
    if (this.stars && this.stars.visible) this.stars.position.copy(this.camera.position);
    this.sky.position.copy(this.camera.position);
    // 흔들림 제거 후 컨트롤(또는 시네마틱) 업데이트
    this.camera.position.sub(this._shakeOff);
    const cine = this.cine.active;
    if (cine) this.cine.update(dt);
    else { this._keyboard(dt); this.controls.update(); }
    const ts = this.cine.active ? this.cine.timeScale : 1;
    const dtSim = dt * ts;
    this._applyWeather(dt);
    const fade = document.getElementById('cineFade');
    if (fade) fade.style.opacity = this.cine.active ? String(this.cine.fade || 0) : '0';
    // 타깃을 지면 위로
    const lim = this.grid.span / 2 * 0.92;
    const t = this.controls.target;
    t.x = Math.max(-lim, Math.min(lim, t.x)); t.z = Math.max(-lim, Math.min(lim, t.z));
    const gy = this.grid.sample(t.x, t.z);
    t.y += (gy - t.y) * Math.min(1, dt * 4);
    const cg = this.grid.sample(this.camera.position.x, this.camera.position.z);
    if (this.camera.position.y < cg + 4) this.camera.position.y = cg + 4;

    // 조준
    if (!cine && (this._moved || this._holding || this.arsenal.active.length)) {
      this._moved = false;
      const hit = this.pick();
      this.aim = hit ? hit.point : null;
      this.hover = hit;
      if (hit) {
        this.marker.visible = true;
        this.marker.position.set(hit.point.x, hit.point.y + 0.6, hit.point.z);
        const dist = this.camera.position.distanceTo(this.marker.position);
        this.marker.scale.setScalar(Math.max(2, dist * 0.012));
      } else this.marker.visible = false;
      this.hud.hover(hit && hit.info && (hit.info.b || (hit.info.chunk && hit.info.chunk.b)), this._mx, this._my);
    }

    this.marker.visible = this.marker.visible && !cine;
    PROF.time('weapons', () => this.arsenal.update(dtSim * this.D.timeScale, this.aim));
    PROF.time('physics', () => this.D.update(dtSim));
    PROF.time('fx', () => this.fx.update(dtSim * (this.D.timeScale < 1 ? 0.35 : 1), this.camera));
    PROF.time('world', () => this.world.update(dt));

    // 그림자 카메라 따라가기
    if (this.sun.castShadow) {
      const dist = this.camera.position.distanceTo(t);
      const s = Math.max(160, Math.min(1100, dist * 1.25));
      const sc = this.sun.shadow.camera;
      if (Math.abs(sc.right - s) > s * 0.1) { sc.left = -s; sc.right = s; sc.top = s; sc.bottom = -s; sc.updateProjectionMatrix(); }
      // 텍셀 단위로 스냅 (흔들림 방지)
      const texel = (2 * s) / this.Q.shadows;
      const tx = Math.round(t.x / texel) * texel, tz = Math.round(t.z / texel) * texel;
      this.sun.target.position.set(tx, t.y, tz);
      this.sun.position.set(tx, t.y, tz).addScaledVector(this.lightDir, 1800);
      this.sun.target.updateMatrixWorld();
    } else {
      this.sun.position.copy(t).addScaledVector(this.lightDir, 1800); this.sun.target.position.copy(t);
    }

    // 흔들림
    const sh = this.fx.shake;
    if (sh > 0.001) {
      const dist = this.camera.position.distanceTo(t);
      const a = sh * sh * Math.min(6, dist * 0.006);
      this._shakeOff.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
    } else this._shakeOff.set(0, 0, 0);
    this.camera.position.add(this._shakeOff);

    this.renderer.info.reset();
    PROF.time('render', () => this.composer.render(dt));
    PROF.endFrame();

    this._fpsN++;
    const now = performance.now();
    if (!this._fpsT0) this._fpsT0 = now;
    if (now - this._fpsT0 > 250) { this.fps = this._fpsN * 1000 / (now - this._fpsT0); this._fpsN = 0; this._fpsT0 = now; this.hud.stats(this.D.stats(), this.fps); }
  }

  dispose() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('keydown', this._onKey); window.removeEventListener('keyup', this._onKey);
    window.removeEventListener('blur', this._onBlur);
    this.canvas.removeEventListener('pointermove', this._onMove);
    this.canvas.removeEventListener('pointerdown', this._onDown);
    if (this.cine.active) this.cine.stop(true);
    this.controls.dispose();
    this.arsenal.clear(); this.audio.laserStop();
    this.fx.dispose(); this.D.dispose(); this.world.dispose();
    this.phys.dispose();
    this.composer.dispose?.();
    if (this.envRT) this.envRT.dispose();
    this.pmrem.dispose();
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
  }
}
