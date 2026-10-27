// 게임 본체: 렌더링, 카메라, 입력, 루프
import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SSRPass } from 'three/examples/jsm/postprocessing/SSRPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { HueSaturationShader } from 'three/examples/jsm/shaders/HueSaturationShader.js';
import { BrightnessContrastShader } from 'three/examples/jsm/shaders/BrightnessContrastShader.js';
import { VignetteShader } from 'three/examples/jsm/shaders/VignetteShader.js';
import { defaultCfg } from './settings.js';
import { PlanetFinale } from './planet.js';
import { World } from './world.js';
import { Destruction } from './destruction.js';
import { FX } from './fx.js';
import { Arsenal } from './weapons.js';
import { Cinematic } from './cinematic.js';
import { sharedUniforms } from './materials.js';
import { PROF } from './prof.js';

export const QUALITY = {
  low: { name: '낮음', pixelRatio: 1, shadows: 0, bloom: false, ao: false, texSize: 2048, anisotropy: 4, trees: 2500, maxLoose: 8000, maxDynamic: 1200, maxLight: 6000, chunkFull: 120, particles: 2500, fxScale: 0.5, shockFracture: 10, msaa: 0 },
  medium: { name: '보통', pixelRatio: 1, shadows: 2048, bloom: true, ao: false, texSize: 4096, anisotropy: 8, trees: 7000, maxLoose: 16000, maxDynamic: 2200, maxLight: 12000, chunkFull: 180, particles: 5000, fxScale: 0.8, shockFracture: 18, msaa: 4 },
  high: { name: '높음', pixelRatio: 1.25, shadows: 4096, bloom: true, ao: true, texSize: 4096, anisotropy: 12, trees: 14000, maxLoose: 26000, maxDynamic: 3500, maxLight: 20000, chunkFull: 230, particles: 8000, fxScale: 1, shockFracture: 26, msaa: 4 },
  ultra: { name: '울트라', pixelRatio: 2, shadows: 4096, bloom: true, ao: true, texSize: 8192, anisotropy: 16, trees: 24000, maxLoose: 38000, maxDynamic: 5000, maxLight: 30000, chunkFull: 300, particles: 12000, fxScale: 1.25, shockFracture: 36, msaa: 4 },
};

// 종말 날씨 종류: 하늘(지평선/위쪽) 색, 안개 색, 떨어지는 재 색, 불씨 비율, 지평선 불길
export const DOOM_KINDS = {
  nuke: { low: [1.0, 0.36, 0.08], high: [0.2, 0.075, 0.045], fog: 0x5a3422, ash: [0.25, 0.45], ember: 0.15, fires: true },
  impact: { low: [0.9, 0.45, 0.2], high: [0.22, 0.13, 0.08], fog: 0x5c4630, ash: [0.3, 0.45], ember: 0.1, fires: true },
  fire: { low: [1.0, 0.45, 0.1], high: [0.45, 0.12, 0.04], fog: 0x7a3a18, ash: [0.2, 0.35], ember: 0.55, fires: true },
  ash: { low: [0.55, 0.45, 0.35], high: [0.12, 0.11, 0.1], fog: 0x4a4540, ash: [0.35, 0.55], ember: 0.04, fires: false },
  ice: { low: [0.8, 0.9, 1.0], high: [0.35, 0.45, 0.6], fog: 0xc8d8e8, ash: [0.9, 1.0], ember: 0, fires: false, snow: true },
  void: { low: [0.55, 0.3, 0.9], high: [0.03, 0.0, 0.06], fog: 0x1a1028, ash: [0.4, 0.6], ember: 0.2, emberCol: [0.7, 0.4, 1.0], fires: false },
  anti: { low: [0.7, 0.4, 1.0], high: [0.12, 0.06, 0.2], fog: 0x241c34, ash: [0.5, 0.7], ember: 0.2, emberCol: [0.8, 0.6, 1.0], fires: true },
  dust: { low: [0.85, 0.6, 0.35], high: [0.35, 0.25, 0.15], fog: 0x8a6a48, ash: [0.5, 0.6], ember: 0, fires: false },
  water: { low: [0.4, 0.55, 0.65], high: [0.15, 0.2, 0.28], fog: 0x506070, ash: [0.6, 0.7], ember: 0, fires: false, rain: true },
  fallout: { low: [0.62, 0.7, 0.3], high: [0.12, 0.15, 0.06], fog: 0x4e5a30, ash: [0.45, 0.6], ember: 0.08, emberCol: [0.6, 1.0, 0.4], fires: false },
  space: { low: [0.08, 0.08, 0.12], high: [0.0, 0.0, 0.01], fog: 0x0a0a12, ash: [0.3, 0.4], ember: 0.02, emberCol: [0.8, 0.85, 1.0], fires: false },
  data: { low: [0.1, 0.55, 0.3], high: [0.0, 0.03, 0.02], fog: 0x08241a, ash: [0.3, 0.5], ember: 0.35, emberCol: [0.45, 1.0, 0.6], fires: false },
};

export const TIMES = {
  morning: { name: '아침', elev: 16, az: 110, exposure: 0.5, sunI: 2.4, hemi: 0.45, env: 0.22, night: 0 },
  noon: { name: '한낮', elev: 48, az: 150, exposure: 0.45, sunI: 2.8, hemi: 0.5, env: 0.25, night: 0 },
  sunset: { name: '노을', elev: 5, az: 255, exposure: 0.78, sunI: 2.4, hemi: 0.6, env: 0.3, night: 0.3 },
  night: { name: '밤', elev: -6, az: 230, exposure: 0.9, sunI: 0.45, hemi: 0.22, env: 0.15, night: 1 },
};

export class Game {
  constructor({ canvas, phys, grid, data, radius, place, quality, time, audio, hud, cfg }) {
    this.canvas = canvas; this.phys = phys; this.grid = grid; this.data = data; this.radius = radius;
    this.cfg = Object.assign(defaultCfg(), cfg || {});
    sharedUniforms.uPower.value = 1;
    this.place = place; this.qualityKey = quality; this.Q = { ...QUALITY[quality] }; this.timeKey = time;
    this.Q0 = QUALITY[quality];
    // 도시를 만들 때 정해지는 설정 (나무·파티클 양)
    this.Q.trees = Math.round(this.Q0.trees * this.cfg.treeMul);
    this.Q.particles = Math.round(this.Q0.particles * this.cfg.particleMul);
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
    // 폭발을 연출 카메라에 알려 가리면 시야를 확보하게
    { const fx = this.fx, D = this.D, cine = this.cine;
      const oe = fx.explosion.bind(fx); fx.explosion = (p, r, o) => { cine.noteEvent(p); return oe(p, r, o); };
      const ox = D.explode.bind(D); D.explode = (o) => { if (o && o.r > 8) cine.noteEvent(o); return ox(o); }; }
    this.storm = 0;
    this._bind();
    this._fpsT = 0; this._fpsN = 0; this.fps = 60;
    this._loop = this._loop.bind(this);
    for (const k of Object.keys(this.cfg)) this.applyCfg(k);
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
    this.renderPass = new RenderPass(scene, camera);
    this.outputPass = new OutputPass();
    this.gradePass = new ShaderPass(HueSaturationShader);
    this.bcPass = new ShaderPass(BrightnessContrastShader);
    this.vigPass = new ShaderPass(VignetteShader); this.vigPass.uniforms.offset.value = 1.0;
    this._passFlags = {};
    this._rebuildPasses();
  }

  // 켜진 후처리만 순서대로 다시 구성 (무거운 패스는 처음 켤 때 만듦)
  _rebuildPasses() {
    const c = this.cfg || {}, Q = this.Q0 || this.Q;
    const size = new THREE.Vector2(); this.renderer.getDrawingBufferSize(size);
    const want = {
      ssr: !!c.ssr,
      ao: c.ao === undefined || c.ao < 0 ? !!Q.ao : !!c.ao,
      bloom: c.bloom === undefined || c.bloom < 0 ? !!Q.bloom : !!c.bloom,
      dof: !!c.dof,
      grade: !!(c.saturation || c.contrast || c.brightness),
      vig: (c.vignette || 0) > 0,
      aa: c.aa || 'msaa',
    };
    const f = this._passFlags;
    if (Object.keys(want).every(k => want[k] === f[k])) return;
    this._passFlags = want;
    const S = this.scene, cam = this.camera;
    if (want.ssr && !this.ssr) {
      this.ssr = new SSRPass({ renderer: this.renderer, scene: S, camera: cam, width: size.x, height: size.y, selects: [] });
      this.ssr.thickness = 0.4; this.ssr.infiniteThick = false; this.ssr.blur = true; this.ssr.fresnel = true; this.ssr.distanceAttenuation = true;
    }
    if (want.ao && !this.gtao) {
      this.gtao = new GTAOPass(S, cam, size.x, size.y);
      this.gtao.updateGtaoMaterial({ radius: 6, distanceExponent: 1.5, thickness: 6, scale: 1.2, samples: 12 });
      this.gtao.blendIntensity = 0.85;
    }
    if (want.bloom && !this.bloom) this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.55, 0.45, 1.35);
    if (want.dof && !this.bokeh) { this.bokeh = new BokehPass(S, cam, { focus: 300, aperture: 0.00002, maxblur: 0.006 }); this.bokeh.enabled = false; }
    if (want.aa === 'fxaa' && !this.fxaa) this.fxaa = new FXAAPass();
    if (want.aa === 'smaa' && !this.smaa) this.smaa = new SMAAPass();
    const P = this.composer.passes; P.length = 0;
    P.push(want.ssr ? this.ssr : this.renderPass);
    if (want.ao) P.push(this.gtao);
    if (want.bloom) P.push(this.bloom);
    if (want.dof) P.push(this.bokeh);
    P.push(this.outputPass);
    if (want.grade) P.push(this.gradePass, this.bcPass);
    if (want.vig) P.push(this.vigPass);
    if (want.aa === 'fxaa') P.push(this.fxaa); else if (want.aa === 'smaa') P.push(this.smaa);
    // 다중 샘플링(MSAA)은 렌더 타깃 설정, SSR 은 MSAA 와 함께 못 씀
    const samples = want.aa === 'msaa' && !want.ssr ? (this.Q0 || this.Q).msaa || 4 : 0;
    for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) if (rt.samples !== samples) { rt.samples = samples; rt.dispose(); }
    const w = window.innerWidth, h = window.innerHeight;
    this.composer.setSize(w, h);
  }

  // 설정 하나를 바로 반영
  applyCfg(key) {
    const c = this.cfg, Q0 = this.Q0, r = this.renderer;
    switch (key) {
      case 'renderScale': {
        r.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q0.pixelRatio) * c.renderScale);
        r.setSize(window.innerWidth, window.innerHeight, false);
        this.composer.setPixelRatio(r.getPixelRatio()); this.composer.setSize(window.innerWidth, window.innerHeight);
        break;
      }
      case 'shadows': {
        const size = c.shadows < 0 ? Q0.shadows : c.shadows;
        const on = size > 0;
        if (r.shadowMap.enabled !== on || this.sun.shadow.mapSize.x !== size) {
          r.shadowMap.enabled = on; this.sun.castShadow = on; this.Q.shadows = size || 1024;
          if (on) { this.sun.shadow.mapSize.set(size, size); this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.6; this.sun.shadow.camera.near = 10; this.sun.shadow.camera.far = 4000; }
          if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
          this.scene.traverse(o => { const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach(x => { x.needsUpdate = true; }); });
        }
        break;
      }
      case 'ssr': case 'ao': case 'bloom': case 'dof': case 'aa': case 'saturation': case 'contrast': case 'brightness': case 'vignette':
        this._rebuildPasses();
        if (this.ssr && this.D) this.ssr.selects = [this.D.intact, ...(this.world.water ? [this.world.water] : [])];
        if (key === 'saturation') this.gradePass.uniforms.saturation.value = c.saturation;
        if (key === 'contrast') this.bcPass.uniforms.contrast.value = c.contrast;
        if (key === 'brightness') this.bcPass.uniforms.brightness.value = c.brightness;
        if (key === 'vignette') this.vigPass.uniforms.darkness.value = c.vignette * 1.6;
        this.applyCfg('ssrStrength'); this.applyCfg('aoStrength'); this.applyCfg('bloomStrength');
        break;
      case 'ssrStrength': if (this.ssr) this.ssr.opacity = c.ssrStrength; break;
      case 'ssrDist': if (this.ssr) this.ssr.maxDistance = c.ssrDist; break;
      case 'aoStrength': if (this.gtao) this.gtao.blendIntensity = c.aoStrength; break;
      case 'bloomStrength': case 'bloomThreshold': case 'bloomRadius':
        if (this.bloom) { this.bloom.strength = c.bloomStrength; this.bloom.threshold = c.bloomThreshold; this.bloom.radius = c.bloomRadius; }
        break;
      case 'glass': sharedUniforms.uGlass.value = c.glass; break;
      case 'water': if (this.world && this.world.waterMat) { const w = this.world.waterMat; w.roughness = 0.45 - 0.42 * c.water; w.metalness = 0.15 + 0.35 * c.water; w.envMapIntensity = 0.4 + 1.6 * c.water; } break;
      case 'toneMap': r.toneMapping = { aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, neutral: THREE.NeutralToneMapping, reinhard: THREE.ReinhardToneMapping }[c.toneMap] || THREE.ACESFilmicToneMapping; break;
      case 'anisotropy': if (this.world && this.world.landTex) { this.world.landTex.anisotropy = Math.min(r.capabilities.getMaxAnisotropy(), c.anisotropy < 0 ? Q0.anisotropy : c.anisotropy); this.world.landTex.needsUpdate = true; } break;
      case 'clouds': this._stormK = -1; break;
      case 'fov': if (!this.cine.active) { this.camera.fov = c.fov; this.camera.updateProjectionMatrix(); } this.cine._fov0 = c.fov; break;
      case 'rotSens': this.controls.rotateSpeed = c.rotSens; this.controls.panSpeed = c.rotSens; break;
      case 'zoomSens': this.controls.zoomSpeed = 1.2 * c.zoomSens; break;
      case 'cinematic': case 'autoPull': case 'soundDelay': case 'planet': if (this.arsenal) this.arsenal.opts[key] = c[key]; break;
      case 'maxDynamic': this.Q.maxDynamic = this.phys.mode === 'gpu' ? this._gpuDyn() : c.maxDynamic < 0 ? Q0.maxDynamic : c.maxDynamic; this.D.dynBudget = this.Q.maxDynamic; break;
      case 'maxLight': this.Q.maxLight = c.maxLight < 0 ? Q0.maxLight : c.maxLight; break;
      case 'maxLoose': this.Q.maxLoose = c.maxLoose < 0 ? Q0.maxLoose : c.maxLoose; break;
      case 'lightVol': this.Q.lightVol = c.lightVol; this.D.useLight = c.lightVol > 0 && this.phys.mode !== 'gpu'; break;
      case 'chunkDetail': this.Q.chunkFull = Math.round(Q0.chunkFull * c.chunkDetail); break;
      case 'solverIter': this.phys.setSolverIterations && this.phys.setSolverIterations(c.solverIter); break;
      case 'fxMul': this.Q.fxScale = Q0.fxScale * c.fxMul; break;
      case 'flash': this.fx.flashMul = c.flash; break;
      case 'strobe': if (this.arsenal) this.arsenal.opts.strobe = c.strobe; break;
    }
  }
  setCfg(cfg, key) { this.cfg = Object.assign(this.cfg, cfg); this.applyCfg(key); }

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
    this.scene.fog.color.set(night ? 0x12141f : key === 'sunset' ? 0xc7977c : key === 'morning' ? 0xb9c6d2 : 0xa9bfd6);
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
    this.renderer.toneMappingExposure = B.exp * (1 - 0.12 * k) * (1 + 0.15 * d) * (this.cfg.exposure || 1);
    this.scene.environmentIntensity = B.env * (1 - 0.6 * k) * (1 - 0.5 * d);
    this.scene.fog.density = B.fogD * (1 + 2.6 * k) * (1 + 0.7 * d) * far * (this.cfg.fogMul ?? 1);
    const fc = this.scene.fog.color.copy(B.fog).lerp(this._stormFog || (this._stormFog = new THREE.Color(0x30353b)), k);
    if (d > 0) fc.lerp(this._doomFog || (this._doomFog = new THREE.Color(0x5a3422)), d);
    this._frostK = (this._frostK || 0) + ((this.frost || 0) - (this._frostK || 0)) * Math.min(1, dt * 0.8);
    const fr = this._frostK;
    if (fr > 0.001) { fc.lerp(this._frostFog || (this._frostFog = new THREE.Color(0xdde7f0)), fr * 0.8); this.scene.fog.density *= 1 + 1.2 * fr; this.hemi.intensity *= 1 + 0.4 * fr; }
    if (u.cloudCoverage) u.cloudCoverage.value = (this.cfg.clouds === false ? 0 : B.cloud) + (0.95 - (this.cfg.clouds === false ? 0 : B.cloud)) * Math.max(k, d);
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
      if (d > 0.4 && this.fx && (!this._dk || this._dk.fires)) {
        this._hzAcc = (this._hzAcc || 0) + dt * d * 6;
        const p = this.camera.position;
        while (this._hzAcc > 1) {
          this._hzAcc -= 1;
          const a = Math.random() * 6.28, r = 1500 + Math.random() * 9000;
          const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r, y = this.world.outerHeight ? this.world.outerHeight(x, z) : 0;
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
        const P = this._dk || DOOM_KINDS.nuke;
        if (Math.random() < P.ember) { const ec = P.emberCol || [1, 0.45, 0.1]; this.fx.fire.emit(x, y, z, 0, -2, 0, 5, 0.35, 0.2, [ec[0], ec[1], ec[2], 1], [ec[0] * 0.6, ec[1] * 0.2, ec[2] * 0.2, 0], 0.2, 0, 0); }
        else if (!P.snow) { const g = P.ash[0] + Math.random() * (P.ash[1] - P.ash[0]); this.fx.smoke.emit(x, y, z, (Math.random() - 0.5) * 2, -3 - Math.random() * 2, (Math.random() - 0.5) * 2, 7, 0.5, 0.6, [g, g * 0.97, g * 0.94, 0.85], [g, g, g, 0], 0, 0, 0); }
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

  // 지도 안은 지형, 밖은 바깥 세계 높이
  groundAt(x, z) {
    const h = this.grid.span / 2;
    if (Math.abs(x) < h && Math.abs(z) < h) return this.grid.sample(x, z);
    return this.world && this.world.outerHeight ? Math.max(this.world.outerHeight(x, z), this.grid.sample(x, z) - 400) : this.grid.sample(x, z);
  }

  // 핵겨울 (0~1)
  setDoom(level, kind = 'nuke') {
    const P = DOOM_KINDS[kind] || DOOM_KINDS.nuke;
    this.doom = Math.max(this.doom || 0, level);
    this._dk = P;
    const u = this._doomDome().material.uniforms;
    u.uLow.value.setRGB(...P.low); u.uHigh.value.setRGB(...P.high);
    if (this._doomFog) this._doomFog.set(P.fog); else this._doomFog = new THREE.Color(P.fog);
    if (P.snow) this.frost = Math.max(this.frost || 0, level);
    if (P.rain) this.storm = Math.max(this.storm || 0, level * 0.8);
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
    // GPU 물리: 움직이는 조각 상한을 크게
    if (this.phys.mode === 'gpu') { this.Q.maxDynamic = this._gpuDyn(); this.Q.maxLoose = Math.max(this.Q.maxLoose, Math.round(this.phys.gpu.N * 0.9)); }
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
      if (this.planetFX) this.planetFX.resize(w, h);
    };
    window.addEventListener('resize', this._onResize);
    this._mouse = new THREE.Vector2(); this._ray = new THREE.Raycaster();
    this._onMove = (e) => {
      const r = this.canvas.getBoundingClientRect();
      this._mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this._mx = e.clientX; this._my = e.clientY;
      this._moved = true;
      if (this.pilot) { this._mdx = (this._mdx || 0) + (e.movementX || 0); this._mdy = (this._mdy || 0) + (e.movementY || 0); }
    };
    this._onDown = (e) => {
      if (e.button === 0) this._lmb = true; else if (e.button === 2) this._rmb = true;
      if (e.button !== 0) return;
      this._onMove(e);
      if (this.planetFX) { this.endPlanet(); return; }
      if (this.pilot) { if (this.pilot.click) this.pilot.click(); return; }
      if (this.arsenal._qte) { this.arsenal._qte(); return; }
      if (this.cine.active) { this.cine.skip(); return; }
      const hit = this.pick();
      if (!hit) return;
      this.audio.resume();
      const w = this.arsenal.current;
      if (this.arsenal.isHold()) { this._holding = true; this.aim = hit.point; this.arsenal.holdStart(hit); }
      else this.arsenal.fire(hit, this.camera.position);
      this.hud.fired(w);
    };
    this._onUp = (e) => { if (e.button === 0) this._lmb = false; else if (e.button === 2) this._rmb = false; if (e.button === 0 && this._holding) { this._holding = false; this.arsenal.holdEnd(); } };
    this.canvas.addEventListener('pointermove', this._onMove);
    this.canvas.addEventListener('pointerdown', this._onDown);
    window.addEventListener('pointerup', this._onUp);
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    this._onKey = (e) => { if (e.type === 'keydown') this._keys.add(e.code); else this._keys.delete(e.code); };
    window.addEventListener('keydown', this._onKey); window.addEventListener('keyup', this._onKey);
    this._onBlur = () => { this._keys.clear(); this._lmb = this._rmb = false; if (this._holding) { this._holding = false; this.arsenal.holdEnd(); } };
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
  _gpuDyn() { return Math.round(this.phys.gpu.N * 0.6); }
  // 빨리 감기 (1, 2, 4배)
  setTimeRate(r) { this.D.timeScale = r; }

  // ---------- 관제실: 위에서 똑바로 내려다보는 고정 시점 (높이만 줌) ----------
  startOverhead(x, z, h) {
    this.overhead = { x, z, h, hx: x, hz: z, hh: h, snap: true };
    this.controls.enabled = false;
    this.marker.visible = false;
  }
  setOverhead(x, z) { if (this.overhead) { this.overhead.x = x; this.overhead.z = z; } }
  zoomOverhead(f) { const o = this.overhead; if (o) o.h = Math.max(70, Math.min(this.grid.span * 1.6, o.h * f)); }
  endOverhead() {
    const o = this.overhead; if (!o) return;
    this.overhead = null;
    this.controls.enabled = true;
    const gy = this.grid.sample(o.hx, o.hz);
    this.controls.target.set(o.hx, gy, o.hz);
    const d = Math.min(800, Math.max(220, o.hh * 0.8));
    this.camera.position.set(o.hx + d * 0.55, gy + d * 0.65, o.hz + d * 0.55);
    this.camera.fov = this.cfg.fov || 50; this.camera.updateProjectionMatrix();
    this.controls.update();
  }
  _overheadStep(dt) {
    const o = this.overhead, k = o.snap ? 1 : 1 - Math.exp(-dt * 6);
    o.snap = false;
    o.hx += (o.x - o.hx) * k; o.hz += (o.z - o.hz) * k; o.hh += (o.h - o.hh) * k;
    const gy = this.grid.sample(o.hx, o.hz);
    this.camera.position.set(o.hx, gy + o.hh, o.hz + 0.01);
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(o.hx, gy, o.hz);
    this.camera.up.set(0, 1, 0);
    if (Math.abs(this.camera.fov - 45) > 0.01) { this.camera.fov = 45; this.camera.updateProjectionMatrix(); }
  }

  // ---------- 직접 조종 (유도 미사일, 이후 탈것) ----------
  // p: { update(dt, input) → false 이면 끝, camera(out:{pos,look,fov}), click(), abort(), dispose() }
  startPilot(p) {
    if (this.pilot) this.endPilot(true);
    if (this.cine.active) this.cine.stop(true);
    this.pilot = p;
    this._pilotCam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 70 };
    this._pilotSnap = true;
    this._fov0 = this.camera.fov;
    document.body.classList.add('pilot');
    this.marker.visible = false;
    this.controls.enabled = false;
    this._mdx = this._mdy = 0;
    // 탈것: 마우스로 둘러보기 (포인터 잠금)
    if (p.lockMouse && this.canvas.requestPointerLock) { try { const r = this.canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* 잠금 못 해도 조작은 됨 */ } }
  }
  endPilot(aborted = false) {
    const p = this.pilot; if (!p) return;
    this.pilot = null;
    document.body.classList.remove('pilot');
    this.controls.enabled = true;
    if (document.pointerLockElement === this.canvas) { try { document.exitPointerLock(); } catch (e) { /* 무시 */ } }
    if (p.dispose) p.dispose(aborted);
    this.camera.fov = this._fov0 || this.cfg.fov || 50; this.camera.updateProjectionMatrix();
    // 끝난 자리를 바라보며 일반 조작으로
    const at = p.endPoint || this._pilotCam.look;
    const gy = this.grid.sample(at.x, at.z);
    const back = new THREE.Vector3().subVectors(this.camera.position, at); back.y = 0;
    if (back.lengthSq() < 1) back.set(1, 0, 0);
    back.normalize().multiplyScalar(260);
    this.controls.target.set(at.x, gy, at.z);
    this.camera.position.set(at.x + back.x, gy + 170, at.z + back.z);
    this.controls.update();
  }
  _pilotStep(dt) {
    const k = this._keys, K = this.cfg;
    const input = {
      x: this._mouse.x, y: this._mouse.y,
      left: k.has(K.k_left) || k.has('ArrowLeft'), right: k.has(K.k_right) || k.has('ArrowRight'),
      up: k.has(K.k_back) || k.has('ArrowDown'), down: k.has(K.k_fwd) || k.has('ArrowUp'),
      boost: k.has('ShiftLeft') || k.has('ShiftRight'), space: k.has('Space'),
      w: k.has(K.k_fwd) || k.has('ArrowUp'), s: k.has(K.k_back) || k.has('ArrowDown'), a: k.has(K.k_left) || k.has('ArrowLeft'), d: k.has(K.k_right) || k.has('ArrowRight'),
      q: k.has(K.k_rotL), e: k.has(K.k_rotR), lmb: !!this._lmb, rmb: !!this._rmb, has: (c) => k.has(c),
      mdx: this._mdx || 0, mdy: this._mdy || 0,
    };
    this._mdx = this._mdy = 0;
    // 탈것은 빨리 감기와 상관없이 실제 속도로 (슬로모션은 따름)
    const ts = this.pilot.ignoreFast ? Math.min(1, this.D.timeScale) : this.D.timeScale;
    const alive = this.pilot.update(dt * ts, input, dt);
    const c = this._pilotCam;
    this.pilot.camera(c);
    // 탈것과 카메라 사이를 건물이 가리면 그 앞으로 당김
    if (c.anchor) {
      const o = this._pa || (this._pa = new THREE.Vector3()); o.copy(c.anchor); o.y += 2;
      const d = new THREE.Vector3().subVectors(c.pos, o); const len = d.length();
      if (len > 1) { d.divideScalar(len); const h = this.D.raycast(o, d, len); if (h && h.info && (h.info.b || h.info.terrain || (h.info.chunk && h.info.chunk.state === 0))) c.pos.copy(o).addScaledVector(d, Math.max(1.5, h.dist - 1.5)); }
    }
    const cam = this.camera;
    const kk = this._pilotSnap ? 1 : 1 - Math.exp(-dt * 10);
    this._pilotSnap = false;
    cam.position.lerp(c.pos, kk);
    const gy = this.groundAt(cam.position.x, cam.position.z);
    if (cam.position.y < gy + 2) cam.position.y = gy + 2;
    // 조종석에서 기체가 기울면 카메라도 같이 (배면비행)
    if (c.up) { this._camUp = (this._camUp || new THREE.Vector3(0, 1, 0)).lerp(c.up, kk).normalize(); cam.up.copy(this._camUp); }
    else { cam.up.set(0, 1, 0); this._camUp = null; }
    cam.lookAt(c.look);
    cam.up.set(0, 1, 0);
    if (Math.abs(cam.fov - c.fov) > 0.01) { cam.fov = c.fov; cam.updateProjectionMatrix(); }
    if (alive === false) this.endPilot(false);
  }

  screenshot() {
    this.composer.render();
    return this.canvas.toDataURL('image/png');
  }

  _keyboard(dt) {
    const k = this._keys; if (!k.size) return;
    const c = this.controls;
    const dist = this.camera.position.distanceTo(c.target);
    const K = this.cfg;
    const sp = dist * 0.9 * dt * (K.moveSpeed || 1) * (k.has('ShiftLeft') || k.has('ShiftRight') ? 2.5 : 1);
    const fwd = new THREE.Vector3().subVectors(c.target, this.camera.position); fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
    const mv = new THREE.Vector3();
    if (k.has(K.k_fwd) || k.has('ArrowUp')) mv.add(fwd);
    if (k.has(K.k_back) || k.has('ArrowDown')) mv.sub(fwd);
    if (k.has(K.k_right) || k.has('ArrowRight')) mv.add(right);
    if (k.has(K.k_left) || k.has('ArrowLeft')) mv.sub(right);
    if (mv.lengthSq()) { mv.normalize().multiplyScalar(sp); this.camera.position.add(mv); c.target.add(mv); }
    const rot = (k.has(K.k_rotL) ? 1 : 0) - (k.has(K.k_rotR) ? 1 : 0);
    if (rot) {
      const off = new THREE.Vector3().subVectors(this.camera.position, c.target);
      off.applyAxisAngle(new THREE.Vector3(0, 1, 0), rot * dt * 1.4);
      this.camera.position.copy(c.target).add(off);
    }
    const zoom = (k.has(K.k_zoomIn) ? 1 : 0) - (k.has(K.k_zoomOut) ? 1 : 0);
    if (zoom) {
      const off = new THREE.Vector3().subVectors(this.camera.position, c.target);
      off.multiplyScalar(1 - zoom * dt * 1.2);
      if (off.length() > c.minDistance && off.length() < c.maxDistance) this.camera.position.copy(c.target).add(off);
    }
  }

  // 행성 시점 마무리 시작 / 끝
  playPlanet(kind, opts = {}) {
    if (this.planetFX || this.cfg.planet === false) return false;
    const now = performance.now();
    if (this._planetAt && now - this._planetAt < 45000) return false;
    this._planetAt = now;
    if (this.cine.active) this.cine.stop(true);
    const lat = this.place && isFinite(this.place.lat) ? this.place.lat : 37.5, lon = this.place && isFinite(this.place.lon) ? this.place.lon : 127;
    this.planetFX = new PlanetFinale(this.renderer, kind, { lat, lon, dur: opts.dur || 10 });
    this.planetFX.resize(window.innerWidth, window.innerHeight);
    document.body.classList.add('cine');
    this.fx.flash = 0; if (this.fx.flashEl) this.fx.flashEl.style.opacity = '0';
    return true;
  }
  endPlanet() {
    if (!this.planetFX) return;
    this.planetFX.dispose(); this.planetFX = null;
    const cap = document.getElementById('cineCap'); if (cap) { cap.classList.remove('show'); cap.textContent = ''; }
    document.body.classList.remove('cine');
    this.fx.flash = Math.max(this.fx.flash, 0.5);
    this.camera.fov = this.cfg.fov || 50; this.camera.updateProjectionMatrix();
  }

  _loop() {
    if (!this.running) return;
    if (this.planetFX) {
      const dtp = Math.min(0.05, this.clock.getDelta());
      this.planetFX.update(dtp);
      this.fx.update(dtp, this.camera);
      this.planetFX.render();
      if (this.planetFX.done) this.endPlanet();
      return;
    }
    // 프레임 제한
    if (this.cfg.fpsCap > 0) { const now = performance.now(); if (this._lastF && now - this._lastF < 1000 / this.cfg.fpsCap - 1) return; this._lastF = now; }
    const dt = Math.min(0.05, this.clock.getDelta());
    sharedUniforms.uTime.value += dt;
    if (this.sky.material.uniforms.time) this.sky.material.uniforms.time.value += dt;
    if (this.stars && this.stars.visible) this.stars.position.copy(this.camera.position);
    this.sky.position.copy(this.camera.position);
    // 흔들림 제거 후 컨트롤(또는 시네마틱) 업데이트
    this.camera.position.sub(this._shakeOff);
    const cine = this.cine.active;
    // 샷은 게임 시간(연출 배속 × 슬로모션)으로 진행 → 무기 사건과 항상 맞음
    if (this.pilot) this._pilotStep(dt);
    else if (this.overhead) this._overheadStep(dt);
    else if (cine) this.cine.update(dt, dt * this.cine.timeScale * this.D.timeScale);
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
    const cg = this.groundAt(this.camera.position.x, this.camera.position.z);
    if (this.camera.position.y < cg + 4) this.camera.position.y = cg + 4;

    // 조준
    if (!cine && !this.pilot && !this.overhead && (this._moved || this._holding || this.arsenal.active.length)) {
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

    this.marker.visible = this.marker.visible && !cine && !this.pilot;
    // 빨리 감기일 때는 무기·연출을 잘게 나눠 진행 (빠른 발사체가 건물을 뚫고 지나가지 않게)
    const nSub = this.D.timeScale > 1.01 ? Math.ceil(this.D.timeScale) : 1;
    PROF.time('weapons', () => { for (let i = 0; i < nSub; i++) this.arsenal.update(dtSim * this.D.timeScale / nSub, this.aim); });
    PROF.time('physics', () => this.D.update(dtSim));
    PROF.time('fx', () => { for (let i = 0; i < nSub; i++) this.fx.update(dtSim * this.D.timeScale / nSub, this.camera); });
    PROF.time('world', () => this.world.update(dt));

    // 그림자 카메라 따라가기
    if (this.sun.castShadow) {
      const dist = this.camera.position.distanceTo(t);
      const s = Math.max(160, Math.min(1100, dist * 1.25)) * (this.cfg.shadowDist || 1);
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
      const a = sh * sh * Math.min(6, dist * 0.006) * (this.cfg.shake ?? 1);
      this._shakeOff.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
    } else this._shakeOff.set(0, 0, 0);
    this.camera.position.add(this._shakeOff);

    // 연출 중 초점 흐림
    if (this.bokeh) {
      this.bokeh.enabled = this.cine.active && !!this.cfg.dof;
      if (this.bokeh.enabled) this.bokeh.uniforms.focus.value = this.camera.position.distanceTo(this.cine._smoothLook);
    }
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
