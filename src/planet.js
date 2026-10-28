// 행성 시점 마무리: 세계 멸망급 공격의 끝에 카메라가 우주로 빠지며 지구가 어떻게 되는지 보여줌
// 별도의 장면(우주)을 같은 렌더러로 그린다. 지구는 쐐기 조각 수백 개로 이루어져 있어 산산조각도 가능.
import * as THREE from 'three';

const NOISE = /* glsl */`
float ph(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float pn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(ph(i), ph(i + vec3(1,0,0)), f.x), mix(ph(i + vec3(0,1,0)), ph(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(ph(i + vec3(0,0,1)), ph(i + vec3(1,0,1)), f.x), mix(ph(i + vec3(0,1,1)), ph(i + vec3(1,1,1)), f.x), f.y), f.z); }
float pf(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * pn(p); p *= 2.03; a *= 0.5; } return s; }`;

// kind → 연출 매개변수
const KINDS = {
  nuke:    { burn: 1, smoke: 0.8, crack: 0.15, glow: [1.0, 0.45, 0.12], atm: [1.0, 0.45, 0.25], shatter: 0, ice: 0, hole: 0 },
  impact:  { burn: 1, smoke: 0.9, crack: 0.6, glow: [1.0, 0.5, 0.15], atm: [1.0, 0.5, 0.3], shatter: 0, ice: 0, hole: 0, crater: 1 },
  fire:    { burn: 1, smoke: 0.5, crack: 0.2, glow: [1.0, 0.35, 0.08], atm: [1.0, 0.3, 0.1], shatter: 0, ice: 0, hole: 0 },
  crack:   { burn: 0.6, smoke: 0.4, crack: 1, glow: [1.0, 0.4, 0.05], atm: [0.9, 0.5, 0.35], shatter: 0, ice: 0, hole: 0 },
  ice:     { burn: 0, smoke: 0.1, crack: 0.2, glow: [0.6, 0.85, 1.0], atm: [0.7, 0.85, 1.0], shatter: 0, ice: 1, hole: 0 },
  ash:     { burn: 0.4, smoke: 1, crack: 0.3, glow: [1.0, 0.4, 0.1], atm: [0.55, 0.5, 0.45], shatter: 0, ice: 0, hole: 0 },
  water:   { burn: 0, smoke: 0.2, crack: 0, glow: [0.5, 0.75, 1.0], atm: [0.6, 0.8, 1.0], shatter: 0, ice: 0, hole: 0, flood: 1 },
  void:    { burn: 0.3, smoke: 0.2, crack: 0.5, glow: [0.7, 0.4, 1.0], atm: [0.6, 0.35, 1.0], shatter: 0.15, ice: 0, hole: 1 },
  anti:    { burn: 1, smoke: 0.3, crack: 0.5, glow: [0.8, 0.6, 1.0], atm: [0.75, 0.55, 1.0], shatter: 0.25, ice: 0, hole: 0 },
  shatter: { burn: 1, smoke: 0.3, crack: 1, glow: [1.0, 0.5, 0.12], atm: [1.0, 0.5, 0.3], shatter: 1, ice: 0, hole: 0, crater: 1 },
  calm:    { burn: 0, smoke: 0, crack: 0, glow: [1.0, 1.0, 1.0], atm: [0.35, 0.6, 1.0], shatter: 0, ice: 0, hole: 0 },   // 멀쩡한 지구 (도입 장면용)
};

const NAMES = {
  nuke: '전 지구 핵겨울', impact: '대멸종 충돌', fire: '불타는 행성', crack: '지각 붕괴', ice: '전 지구 동결', ash: '화산 겨울',
  water: '전 지구 해일', void: '행성 소멸', anti: '반물질 소멸', shatter: '행성 붕괴', calm: '',
};

function buildPlanetGeometry() {
  // 정이십면체(세분화)의 각 삼각형을 중심까지 이은 쐐기 조각으로
  const ico = new THREE.IcosahedronGeometry(1, 4);
  const p = ico.getAttribute('position');
  const nTri = p.count / 3;
  const pos = [], nrm = [], piece = [], rnd = [], surf = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), cen = new THREE.Vector3(), n = new THREE.Vector3();
  const inner = 0.0;
  const push = (v, nn, s) => { pos.push(v.x, v.y, v.z); nrm.push(nn.x, nn.y, nn.z); piece.push(cen.x, cen.y, cen.z); surf.push(s); };
  for (let t = 0; t < nTri; t++) {
    a.fromBufferAttribute(p, t * 3); b.fromBufferAttribute(p, t * 3 + 1); c.fromBufferAttribute(p, t * 3 + 2);
    cen.copy(a).add(b).add(c).divideScalar(3).normalize();
    const r = Math.random();
    // 바깥 면 (지표)
    for (const v of [a, b, c]) { push(v, v.clone().normalize(), 1); rnd.push(r); }
    // 옆면 3개 (단면: 속살)
    const o = new THREE.Vector3(0, 0, 0).addScaledVector(cen, inner);
    for (const [u, w] of [[a, b], [b, c], [c, a]]) {
      n.subVectors(u, o).cross(new THREE.Vector3().subVectors(w, o)).normalize();
      for (const v of [o, w, u]) { push(v, n, 0); rnd.push(r); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aPiece', new THREE.Float32BufferAttribute(piece, 3));
  g.setAttribute('aRnd', new THREE.Float32BufferAttribute(rnd, 1));
  g.setAttribute('aSurf', new THREE.Float32BufferAttribute(surf, 1));
  return g;
}

export class PlanetFinale {
  constructor(renderer, kind = 'nuke', { lat = 36, lon = 128, dur = 10 } = {}) {
    this.renderer = renderer;
    this.kind = KINDS[kind] ? kind : 'nuke';
    this.K = KINDS[this.kind];
    this.name = NAMES[this.kind];
    this.t = 0; this.dur = dur; this.done = false;
    const scene = new THREE.Scene(); this.scene = scene;
    scene.background = new THREE.Color(0x01020a);
    this.camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.001, 200);
    // 별
    {
      const n = 4000, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(90); a.set([v.x, v.y, v.z], i * 3); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3));
      scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdfe6ff, size: 1.3, sizeAttenuation: false })));
    }
    const sunDir = new THREE.Vector3(-0.6, 0.35, 0.72).normalize(); // 아래에서 표적 쪽 낮으로 다시 맞춤
    this.sunDir = sunDir;
    // 표적 지점 (위도·경도 → 방향)
    const la = THREE.MathUtils.degToRad(lat), lo = THREE.MathUtils.degToRad(lon);
    this.hit = new THREE.Vector3(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)).normalize();
    // 표적이 낮인 쪽에 오도록 해 방향을 맞춤
    { const sd = new THREE.Vector3().crossVectors(this.hit, new THREE.Vector3(0, 1, 0)).normalize(); sunDir.copy(this.hit).multiplyScalar(0.75).addScaledVector(sd, -0.55).add(new THREE.Vector3(0, 0.25, 0)).normalize(); }
    const K = this.K;
    this.uni = {
      uT: { value: 0 }, uP: { value: 0 }, uHit: { value: this.hit }, uSun: { value: sunDir },
      uBurn: { value: 0 }, uSmoke: { value: 0 }, uCrack: { value: 0 }, uIce: { value: 0 }, uFlood: { value: 0 },
      uShatter: { value: 0 }, uHole: { value: 0 }, uGlow: { value: new THREE.Color(...K.glow) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uni,
      vertexShader: `${NOISE}
        attribute vec3 aPiece; attribute float aRnd; attribute float aSurf;
        uniform float uShatter, uHole, uT; uniform vec3 uHit;
        varying vec3 vN; varying vec3 vP; varying float vSurf; varying float vRnd; varying vec3 vW;
        void main(){
          vec3 p = position;
          // 산산조각: 조각마다 바깥으로 날아가며 회전
          float near = smoothstep(-0.2, 1.0, dot(aPiece, uHit));
          float s = uShatter * (0.4 + 0.6 * aRnd) * (0.6 + 0.8 * near);
          vec3 off = aPiece * s * (0.6 + 1.4 * aRnd) + uHit * s * 0.4;
          float ang = s * (2.0 + aRnd * 6.0);
          vec3 ax = normalize(cross(aPiece, vec3(0.3, 1.0, 0.2)) + 1e-4);
          vec3 q = p - aPiece * 0.9;
          q = q * cos(ang) + cross(ax, q) * sin(ang) + ax * dot(ax, q) * (1.0 - cos(ang));
          p = q + aPiece * 0.9 + off;
          // 블랙홀: 표적 쪽 한 점으로 빨려 들어감
          vec3 sink = uHit * 1.6;
          p = mix(p, sink, uHole * uHole * (0.4 + 0.6 * aRnd));
          p *= 1.0 - 0.55 * uHole * smoothstep(0.6, 1.0, uHole);
          vSurf = aSurf; vRnd = aRnd; vP = position; vN = normalize(normalMatrix * normal);
          vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: `${NOISE}
        uniform float uT, uP, uBurn, uSmoke, uCrack, uIce, uFlood; uniform vec3 uHit, uSun, uGlow;
        varying vec3 vN; varying vec3 vP; varying float vSurf; varying float vRnd; varying vec3 vW;
        void main(){
          vec3 n = normalize(vP);
          float lit = clamp(dot(normalize(vN), normalize((viewMatrix * vec4(uSun, 0.0)).xyz)), 0.0, 1.0);
          if (vSurf < 0.5) { // 단면: 녹은 속
            float h = pf(vP * 9.0 + uT * 0.4);
            vec3 c = mix(vec3(0.25, 0.08, 0.03), vec3(1.0, 0.55, 0.12), h) * (1.5 - length(vP) * 0.6);
            gl_FragColor = vec4(c * 1.8, 1.0); return;
          }
          // 지표: 바다·대륙·사막·빙하
          float land = pf(n * 2.2 + 3.1);
          float isLand = smoothstep(0.47, 0.5, land);
          float hgt = pf(n * 7.0);
          vec3 ocean = mix(vec3(0.02, 0.07, 0.2), vec3(0.04, 0.16, 0.34), hgt);
          vec3 green = mix(vec3(0.12, 0.28, 0.08), vec3(0.45, 0.4, 0.22), smoothstep(0.45, 0.7, hgt));
          vec3 col = mix(ocean, green, isLand);
          float polar = smoothstep(0.78, 0.86, abs(n.y) + (hgt - 0.5) * 0.1);
          col = mix(col, vec3(0.92, 0.95, 1.0), polar);
          // 피해가 표적에서 퍼짐
          float d = acos(clamp(dot(n, uHit), -1.0, 1.0)) / 3.14159;
          float front = smoothstep(uP + 0.05, uP - 0.05, d);
          float nz = pf(n * 6.0 + uT * 0.05);
          // 불탐·그을림
          col = mix(col, mix(vec3(0.1, 0.11, 0.13), vec3(0.06, 0.04, 0.035), isLand), front * uBurn * mix(0.55, 0.85, isLand));
          vec3 emis = uGlow * front * uBurn * smoothstep(0.55, 0.8, nz) * 1.6;
          // 그 바로 앞 불길 띠
          emis += uGlow * smoothstep(0.06, 0.0, abs(d - uP)) * (uBurn + uCrack) * 2.5;
          // 지각 균열 (용암)
          float cr = 1.0 - abs(pf(n * 4.0) * 2.0 - 1.0);
          emis += uGlow * smoothstep(0.93, 0.985, cr) * front * uCrack * 3.0;
          // 동결
          col = mix(col, vec3(0.85, 0.93, 1.0), front * uIce);
          // 물에 잠김
          col = mix(col, ocean * 1.3, front * uFlood * isLand);
          // 표적 충돌구
          float ccore = smoothstep(0.035, 0.0, d);
          emis += uGlow * ccore * 2.0 * max(uBurn, uCrack);
          vec3 c = col * (0.06 + 1.1 * lit) + emis;
          // 연기 구름층
          float sm = pf(n * 3.0 + vec3(uT * 0.03, 0.0, 0.0));
          c = mix(c, vec3(0.08, 0.07, 0.065) * (0.3 + lit), front * uSmoke * smoothstep(0.35, 0.65, sm) * 0.85);
          // 평소 구름
          float cl = smoothstep(0.55, 0.75, pf(n * 4.5 + 9.0));
          c = mix(c, vec3(1.0) * (0.08 + lit), cl * 0.6 * (1.0 - front * 0.8));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.planet = new THREE.Mesh(buildPlanetGeometry(), mat);
    scene.add(this.planet);
    // 대기 테두리
    this.atmMat = new THREE.ShaderMaterial({
      uniforms: { uCol: { value: new THREE.Color(0.35, 0.6, 1.0) }, uSun: { value: sunDir }, uA: { value: 1 } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 uCol; uniform float uA; varying vec3 vN; varying vec3 vV; void main(){ float r = pow(1.0 - abs(dot(vN, vV)), 3.0); gl_FragColor = vec4(uCol * r * 1.6 * uA, r * uA); }',
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
    });
    this.atm = new THREE.Mesh(new THREE.SphereGeometry(1.06, 64, 32), this.atmMat);
    scene.add(this.atm);
    this.atmColor0 = new THREE.Color(0.35, 0.6, 1.0); this.atmColor1 = new THREE.Color(...K.atm);
    // 충격파 고리 (지표를 따라 퍼지는 빛)
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.98, 1, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(...K.glow), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    scene.add(this.ring);
    // 블랙홀이면 점 하나
    if (K.hole) {
      this.bh = new THREE.Mesh(new THREE.SphereGeometry(0.08, 32, 16), new THREE.MeshBasicMaterial({ color: 0x000000 }));
      this.bh.position.copy(this.hit).multiplyScalar(1.6); scene.add(this.bh);
      this.disk = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.6, 96), new THREE.MeshBasicMaterial({ color: 0xffa860, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
      this.disk.position.copy(this.bh.position); this.disk.lookAt(0, 0, 0); this.disk.rotateX(1.2); scene.add(this.disk);
    }
    // 카메라: 표적 바로 위 저궤도에서 시작해 멀어짐
    this.camStart = this.hit.clone().multiplyScalar(1.45);
    const sideV = new THREE.Vector3().crossVectors(this.hit, new THREE.Vector3(0, 1, 0)).normalize();
    const far = K.shatter > 0.5 ? 2.2 : 1;
    this.camEnd = this.hit.clone().multiplyScalar(2.6 * far).addScaledVector(sideV, 1.8 * far).add(new THREE.Vector3(0, 0.6 * far, 0));
    this.capEl = document.getElementById('cineCap');
  }

  update(dt) {
    this.t += dt;
    const t = this.t, u = Math.min(1, t / this.dur), K = this.K, U = this.uni;
    const e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
    U.uT.value = t;
    U.uP.value = Math.min(1.05, Math.max(0, u - 0.08) * 1.15);  // 피해가 퍼지는 각도(0~1 = 0~180°): 처음엔 멀쩡한 지구
    U.uBurn.value = K.burn; U.uSmoke.value = K.smoke * Math.min(1, u * 1.6); U.uCrack.value = K.crack;
    U.uIce.value = K.ice; U.uFlood.value = K.flood || 0;
    U.uShatter.value = K.shatter * Math.max(0, (u - 0.45) / 0.55) ** 1.8 * 1.4;
    U.uHole.value = K.hole * Math.max(0, (u - 0.25) / 0.75);
    this.atmMat.uniforms.uCol.value.copy(this.atmColor0).lerp(this.atmColor1, Math.min(1, u * 2));
    this.atmMat.uniforms.uA.value = 1 - Math.max(U.uShatter.value * 0.6, U.uHole.value);
    // 지표를 따라 퍼지는 빛 고리
    const ang = U.uP.value * Math.PI;
    this.ring.position.copy(this.hit).multiplyScalar(Math.cos(ang) * 1.003);
    this.ring.scale.setScalar(Math.max(0.01, Math.sin(ang)));
    this.ring.lookAt(this.hit.clone().multiplyScalar(5));
    this.ring.material.opacity = 0.8 * (1 - u) * (U.uP.value < 1 ? 1 : 0);
    if (this.disk) this.disk.rotateZ(dt * 2);
    this.planet.rotation.y += dt * 0.02 * (1 - K.shatter * u);
    // 카메라
    const cam = this.camera;
    cam.position.copy(this.camStart).lerp(this.camEnd, e);
    cam.lookAt(0, 0, 0);
    if (this.capEl) { this.capEl.textContent = this.name; this.capEl.classList.add('show'); }
    if (t >= this.dur + 1.2) this.done = true;
  }

  resize(w, h) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

  render() { this.renderer.render(this.scene, this.camera); }

  dispose() {
    this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    if (this.capEl) this.capEl.classList.remove('show');
  }
}


// 우주 도입 장면: 지구 저궤도에서 두 개가 붙은 물체가 둘로 갈라져 하나는 지구로 떨어지고 하나는 멀리 날아감
// opts.make() 로 한 개짜리 모형을 만들어 씀. 지구 반지름 = 1 (모형은 영화적으로 크게)
export class OrbitIntro extends PlanetFinale {
  constructor(renderer, { lat = 37.5, lon = 127, dur = 7, make, caption = '', caption2 = '', audio = null, height = 0.0042 } = {}) {
    super(renderer, 'calm', { lat, lon, dur });
    this.audio = audio; this.cap1 = caption; this.cap2 = caption2;
    const scene = this.scene, hit = this.hit;
    // 금속 모형이 보이도록 햇빛과 은은한 빛
    const sun = new THREE.DirectionalLight(0xfff4e6, 3.2); sun.position.copy(this.sunDir).multiplyScalar(10); scene.add(sun);
    scene.add(new THREE.HemisphereLight(0xbfd6ff, 0x2a3240, 1.4));
    // 기준 방향: up = 지구 바깥, side = 옆, fwd = 진행 방향
    this.up = hit.clone();
    this.side = new THREE.Vector3().crossVectors(hit, new THREE.Vector3(0, 1, 0)).normalize();
    this.fwd = new THREE.Vector3().crossVectors(this.side, this.up).normalize();
    this.P0 = hit.clone().multiplyScalar(1.028);
    // 두 개를 나란히 붙이고 가운데를 버팀대로 연결 (아래 = 지구 쪽)
    // 우주엔 비출 주변 풍경이 없어 금속 재질이 새까매지므로, 햇빛을 받는 무광 재질로 바꿔 씀
    const relit = (m) => { m.traverse(o => { if (o.isMesh && o.material && o.material.isMeshStandardMaterial) { const mm = o.material.clone(); mm.metalness = 0.3; mm.roughness = 0.5; mm.color.lerp(new THREE.Color(0xb8c0cc), 0.55); if (mm.emissive) mm.emissive.multiplyScalar(1); o.material = mm; } }); return m; };
    const one = () => { const m = relit(make()); const bb = new THREE.Box3().setFromObject(m); const h = bb.max.y - bb.min.y; m.scale.setScalar(height / h); return m; };
    this.A = one(); this.B = one();
    const w = height * 0.95;
    this.pair = new THREE.Group(); this.pair.position.copy(this.P0);
    this.pair.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.up);
    this.A.position.set(-w * 0.5, 0, 0); this.B.position.set(w * 0.5, 0, 0); this.B.rotation.y = Math.PI / 3;
    const truss = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, height * 0.05, height * 0.05), new THREE.MeshStandardMaterial({ color: 0x3a3f48, metalness: 0.8, roughness: 0.4 }));
    truss.position.y = height * 0.7; this.truss = truss;
    this.pair.add(this.A, this.B, truss); scene.add(this.pair);
    // 분리 순간 빛, 대기권 진입 불꽃, 멀어지는 쪽 추진 불빛
    const add = (geo, color, op = 0) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); scene.add(m); return m; };
    this.flash = add(new THREE.SphereGeometry(1, 16, 12), 0xdff2ff);
    this.trail = add(new THREE.ConeGeometry(1, 1, 16, 1, true), 0xff8a3a);
    this.trailCore = add(new THREE.SphereGeometry(1, 16, 12), 0xffd28a);
    this.jet = add(new THREE.SphereGeometry(1, 12, 8), 0x8fd0ff);
    this.wPos = new THREE.Vector3(); this.h = height;
    this.sepAt = 1.7; this.split = false;
    this.planet.rotation.y = 0;
    this.camera.near = 0.00005; this.camera.updateProjectionMatrix();
  }

  update(dt) {
    this.t += dt;
    const t = this.t, U = this.uni, h = this.h;
    U.uT.value = t; U.uP.value = 0; U.uBurn.value = 0; U.uSmoke.value = 0; U.uCrack.value = 0;
    this.atmMat.uniforms.uA.value = 1; this.ring.material.opacity = 0;
    const up = this.up, side = this.side, fwd = this.fwd;
    // 붙어서 천천히 떠다니다가 분리
    const ts = t - this.sepAt;
    this.pair.position.copy(this.P0).addScaledVector(fwd, t * h * 0.15);
    this.pair.rotateOnAxis(new THREE.Vector3(0, 1, 0), dt * 0.12);
    if (ts >= 0 && !this.split) {
      this.split = true; this.truss.visible = false;
      if (this.audio) { this.audio.clack(); this.audio.whoosh(1.4); this.audio.boom(1.2, 200); }
    }
    const A = this.A, B = this.B;
    if (ts > 0) {
      // A: 지구 쪽으로 점점 빨라지며 떨어짐 (모형 기준 아래 = 지구)
      A.position.y = -0.5 * 0.42 * ts * ts * h;           // 끝날 무렵 대기권(지표 위 약 0.006)까지
      A.rotation.y += dt * 0.3;
      // B: 옆·위로 가속하며 화면 밖으로
      B.position.x = h * 0.475 + 0.5 * 5 * ts * ts * h; B.position.y = 0.5 * 1.2 * ts * ts * h;
      B.rotation.z = -Math.min(0.5, ts * 0.25);
    }
    // 분리 빛
    const cw = this.pair.localToWorld(new THREE.Vector3(0, h * 0.7, 0));
    const fl = ts > 0 ? Math.max(0, 1 - ts / 0.7) : 0;
    this.flash.position.copy(cw); this.flash.scale.setScalar(h * (0.08 + (1 - fl) * 0.35)); this.flash.material.opacity = fl * 0.85;
    // A 위치와 진입 불꽃 (지구에 가까워질수록 앞쪽이 달아오름)
    A.getWorldPosition(this.wPos);
    const alt = this.wPos.length() - 1;                    // 지표 위 높이 (지구 반지름 단위)
    const heat = ts > 0 ? Math.max(0, Math.min(1, (0.02 - alt) / 0.012)) : 0;
    const aBottom = this.wPos.clone().addScaledVector(up, -h * 0.05);
    this.trailCore.position.copy(aBottom); this.trailCore.scale.setScalar(h * (0.12 + heat * 0.16)); this.trailCore.material.opacity = heat * 0.9;
    const L = h * (0.4 + heat * 5);
    this.trail.position.copy(aBottom).addScaledVector(up, L * 0.5); this.trail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);   // 뾰족한 끝이 위(지나온 쪽)로
    this.trail.scale.set(h * (0.12 + heat * 0.14), L, h * (0.12 + heat * 0.14)); this.trail.material.opacity = heat * 0.6;
    // B 추진 불빛
    const bw = B.getWorldPosition(new THREE.Vector3());
    this.jet.position.copy(bw).addScaledVector(side, -h * 0.2); this.jet.scale.setScalar(h * 0.06 * (ts > 0 ? 1 + Math.min(1.5, ts) : 0.001)); this.jet.material.opacity = ts > 0 ? 0.9 : 0;
    // 카메라: 처음엔 둘을 옆에서 → 분리 뒤엔 떨어지는 쪽의 뒤·위에서 따라가며 아래로 지구가 가득
    const cam = this.camera;
    const look0 = this.pair.position.clone().addScaledVector(up, h * 0.5);
    const u = Math.max(0, Math.min(1, ts / (this.dur - this.sepAt)));
    const e = u * u * (3 - 2 * u);
    const camA = look0.clone().addScaledVector(side, -h * 1.8).addScaledVector(fwd, -h * 3.2).addScaledVector(up, h * 0.9);
    const camB = this.wPos.clone().addScaledVector(up, h * 2.6).addScaledVector(fwd, -h * 2.4).addScaledVector(side, -h * 1.1);
    cam.position.copy(camA).lerp(camB, e);
    cam.up.copy(up);
    const look = look0.clone().lerp(this.wPos.clone().addScaledVector(up, -h * 0.8 * e), Math.min(1, e * 1.4));
    cam.lookAt(look);
    if (this.capEl) { this.capEl.textContent = ts < 0.3 ? this.cap1 : this.cap2; this.capEl.classList.add('show'); }
    if (t >= this.dur) this.done = true;
  }

  dispose() { this.camera.up.set(0, 1, 0); super.dispose(); }
}
