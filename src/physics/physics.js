// 메인 스레드 물리 창구: body 프록시 + 백엔드(워커 / 인라인)
// 파괴 로직은 프록시의 Rapier 비슷한 API 만 사용하고, 실제 계산은 워커(또는 같은 스레드)에서 일어난다.
import RAPIER from '@dimforge/rapier3d-simd-compat';
import { PhysCore, STRIDE } from './core.js';
import { GPUCore } from './gpucore.js';

/* global __PHYS_WORKER_SRC__ */
const WORKER_SRC = typeof __PHYS_WORKER_SRC__ !== 'undefined' ? __PHYS_WORKER_SRC__ : null;

class Body {
  constructor(phys, id, x, y, z, mass, dyn) {
    this.phys = phys; this.id = id; this.handle = id;
    this.p = { x, y, z }; this.q = { x: 0, y: 0, z: 0, w: 1 }; this.v = { x: 0, y: 0, z: 0 };
    this.m = mass; this.dyn = dyn; this.sl = false; this.gs = 1; this.alive = true;
  }
  // 화면에 그릴 자세: 물리 결과 두 개 사이를 화면 시각에 맞춰 이어 줌 (물리 60Hz, 화면 144Hz 여도 부드럽게)
  translation() { return this._interp() ? this.rp : this.p; }
  rotation() { return this._interp() ? this.rq : this.q; }
  _interp() {
    const ph = this.phys;
    if (!this.dyn || this.t0 === undefined || !ph.smooth) return false;
    if (this._fr === ph._frame) return this._ok;
    this._fr = ph._frame;
    const span = this.t1 - this.t0;
    let a = span > 1e-6 ? (ph.dispT - this.t0) / span : 1;
    if (this.sl || a >= 1) {
      // 최신 결과보다 앞선 시각: 잠깐(최대 1/120초)은 속도로 내다보고, 그 이상은 최신 자세에서 기다림
      const ex = this.sl ? 0 : Math.min(ph.dispT - this.t1, 1 / 120);
      if (ex <= 0) { this._ok = false; return false; }
      const rp = this.rp || (this.rp = { x: 0, y: 0, z: 0 });
      rp.x = this.p.x + this.v.x * ex; rp.y = this.p.y + this.v.y * ex; rp.z = this.p.z + this.v.z * ex;
      this.rq = this.q; this._ok = true; return true;
    }
    if (a < 0) a = 0;
    const p0 = this.p0, p1 = this.p, q0 = this.q0, q1 = this.q;
    const rp = this.rp || (this.rp = { x: 0, y: 0, z: 0 });
    rp.x = p0.x + (p1.x - p0.x) * a; rp.y = p0.y + (p1.y - p0.y) * a; rp.z = p0.z + (p1.z - p0.z) * a;
    // 회전: 짧은 쪽으로 정규화 선형 보간 (1/60초 사이 회전은 작아서 충분)
    const d = q0.x * q1.x + q0.y * q1.y + q0.z * q1.z + q0.w * q1.w, sg = d < 0 ? -1 : 1, b = 1 - a;
    const rq = this.rqb || (this.rqb = { x: 0, y: 0, z: 0, w: 1 });
    rq.x = q0.x * b + q1.x * a * sg; rq.y = q0.y * b + q1.y * a * sg; rq.z = q0.z * b + q1.z * a * sg; rq.w = q0.w * b + q1.w * a * sg;
    const l = 1 / (Math.hypot(rq.x, rq.y, rq.z, rq.w) || 1); rq.x *= l; rq.y *= l; rq.z *= l; rq.w *= l;
    this.rq = rq; this._ok = true; return true;
  }
  // 새 물리 결과 받기 (T = 그 결과의 시뮬레이션 시각)
  _set(T, px, py, pz, qx, qy, qz, qw) {
    const fresh = this.t1 === undefined || T - this.t1 > 0.1 || T <= this.t1;
    if (fresh) { this.p0 = { x: px, y: py, z: pz }; this.q0 = { x: qx, y: qy, z: qz, w: qw }; this.t0 = T - 1 / 60; }
    else { this.p0 = this.p; this.q0 = this.q; this.t0 = this.t1; }
    this.p = { x: px, y: py, z: pz }; this.q = { x: qx, y: qy, z: qz, w: qw }; this.t1 = T;
    this._fr = -1;
  }
  linvel() { return this.v; }
  isSleeping() { return this.sl; }
  mass() { return this.m; }
  isDynamic() { return this.dyn; }
  setDynamic(on) {
    if (this.dyn === on) return;
    this.dyn = on; this.sl = false; this.t0 = this.t1 = undefined;
    if (!on) { this.v = { x: 0, y: 0, z: 0 }; this.phys._dyn.delete(this); } else this.phys._dyn.add(this);
    this.phys._cmd(['dyn', this.id, on ? 1 : 0]);
  }
  applyImpulse(i) {
    if (!this.dyn) return;
    const k = 1 / this.m;
    this.v = { x: this.v.x + i.x * k, y: this.v.y + i.y * k, z: this.v.z + i.z * k };
    this.sl = false;
    this.phys._cmd(['imp', this.id, i.x, i.y, i.z]);
  }
  applyTorqueImpulse(t) { if (this.dyn) this.phys._cmd(['tor', this.id, t.x, t.y, t.z]); }
  setLinvel(v) { if (!this.dyn) return; this.v = { x: v.x, y: v.y, z: v.z }; this.sl = false; this.phys._cmd(['vel', this.id, v.x, v.y, v.z]); }
  setAngvel(v) { if (this.dyn) this.phys._cmd(['ang', this.id, v.x, v.y, v.z]); }
  scaleLinvel(kx, ky, kz) { if (!this.dyn) return; this.v = { x: this.v.x * kx, y: this.v.y * ky, z: this.v.z * kz }; this.phys._cmd(['mulvel', this.id, kx, ky, kz]); }
  setGravityScale(s) { if (this.gs === s) return; this.gs = s; this.phys._cmd(['grav', this.id, s]); }
  gravityScale() { return this.gs; }
}


// 가벼운 파편: Rapier 를 쓰지 않는 간이 강체 (지면·건물에만 부딪히고 서로는 통과)
// Body 와 같은 API 라서 파괴 로직·무기 코드가 그대로 동작한다
let _lightId = -1;
class LightBody {
  constructor(phys, x, y, z, q, mass, r) {
    this.phys = phys; this.id = _lightId--; this.light = true;
    this.p = { x, y, z }; this.q = { x: q.x, y: q.y, z: q.z, w: q.w }; this.v = { x: 0, y: 0, z: 0 }; this.w = { x: 0, y: 0, z: 0 };
    this.m = mass; this.r = r; this.inertia = 0.4 * mass * r * r;
    this.dyn = false; this.sl = false; this.gs = 1; this.alive = true; this.restT = 0;
  }
  translation() { return this.p; }
  rotation() { return this.q; }
  linvel() { return this.v; }
  isSleeping() { return this.sl; }
  mass() { return this.m; }
  isDynamic() { return this.dyn; }
  setDynamic(on) {
    if (this.dyn === on) return;
    this.dyn = on; this.sl = false; this.restT = 0;
    if (on) this.phys._light.add(this); else { this.phys._light.delete(this); this.v.x = this.v.y = this.v.z = 0; this.w.x = this.w.y = this.w.z = 0; }
  }
  applyImpulse(i) { if (!this.dyn) return; const k = 1 / this.m; this.v.x += i.x * k; this.v.y += i.y * k; this.v.z += i.z * k; this.sl = false; this.restT = 0; }
  applyTorqueImpulse(t) { if (!this.dyn) return; const k = 1 / this.inertia; this.w.x += t.x * k; this.w.y += t.y * k; this.w.z += t.z * k; this.sl = false; }
  setLinvel(v) { if (!this.dyn) return; this.v.x = v.x; this.v.y = v.y; this.v.z = v.z; this.sl = false; this.restT = 0; }
  setAngvel(v) { if (!this.dyn) return; this.w.x = v.x; this.w.y = v.y; this.w.z = v.z; }
  scaleLinvel(kx, ky, kz) { this.v.x *= kx; this.v.y *= ky; this.v.z *= kz; }
  setGravityScale(s) { this.gs = s; this.sl = false; }
  gravityScale() { return this.gs; }
}

export class Physics {
  constructor(worker, gpu = null) {
    this._id = 1;
    this._cmds = []; this._xfer = [];
    this.bodies = new Map();
    this._dyn = new Set();
    this._light = new Set();   // 움직이는 가벼운 파편
    this.gravity = { x: 0, y: -9.81, z: 0 };
    this.lightEnv = null;      // { collide(body, h) } 파괴 로직이 지정
    this.stepMs = 0; this.lightMs = 0;
    this.simDt = 0;          // 마지막 갱신 이후 진행된 시뮬레이션 시간 (소비형)
    this.timeScale = 1;
    this._inflight = false; this._dtAcc = 0;
    // 화면 보간: simT = 받은 결과 중 가장 최신 시뮬레이션 시각, dispT = 지금 그릴 시각 (simT 보다 lag 만큼 뒤)
    this.smooth = true; this.simT = 0; this.dispT = 0; this._frame = 0;
    this.worker = worker || null;
    if (gpu) {
      // GPU 물리: 같은 스레드에서 명령을 모아 GPU 로 보내고, 결과는 비동기로 받음
      this.mode = 'gpu'; this.gpu = gpu;
      gpu.onState = (n, f, T) => this._applyGPU(n, f, T);
    } else if (this.worker) {
      this.mode = 'worker';
      this.worker.onmessage = (e) => this._onMsg(e.data);
      this.worker.onerror = (e) => console.warn('physics worker error', e.message);
    } else {
      this.mode = 'inline';
      this.core = new PhysCore(RAPIER);
    }
    // 결과 간격 + 도착 지연을 덮을 만큼 뒤에서 그림 (밀리면 조금씩 늘리고, 여유가 있으면 줄임)
    this.lagBase = this.mode === 'inline' ? 1 / 60 : this.mode === 'worker' ? 1.3 / 60 : 1.5 / 60;
    this.lag = this.lagBase;
  }

  // 새 결과를 받은 시각 기록: 결과 사이 간격(시뮬레이션 시간)을 평균 내 둠
  _gotResult(T) {
    if (T <= this.simT) return;
    const gap = T - this.simT;
    this.gapAvg = this.gapAvg ? this.gapAvg + (Math.min(gap, 4 / 60) - this.gapAvg) * 0.2 : gap;
    this.simT = T; this._since = 0;
  }
  // 지금의 시뮬레이션 시각
  // 같은 스레드·GPU: 계산을 맡긴 시각 + 아직 계산하지 않고 쌓인 시간 (정확히 앎)
  // 워커: 결과를 받은 뒤 흐른 시간으로 어림 (결과 간격까지만)
  _clock(I) {
    if (this.mode === 'inline') return this.simT + (this.core._acc || 0);
    if (this.mode === 'gpu') return (this.gpu.simT || 0) + (this.gpu._acc || 0);
    return this.simT + Math.min(this._since || 0, I);
  }
  // 매 프레임 그릴 시각(dispT)을 정함: 지금 시각보다 L 만큼 뒤 → 받아 둔 두 결과 사이
  // L = 결과 간격 + (GPU 는 결과가 돌아오기까지 걸리는 시간, 최근 최댓값으로 천천히 줄어듦)
  // 실제로는 매 프레임 흐른 시간만큼 앞으로만 가고 목표 쪽으로 살살 당겨서 들쭉날쭉함을 흡수
  _advanceDisplay(d, real) {
    this._frame++;
    this._since = (this._since || 0) + d;
    const I = Math.max(1 / 60, Math.min(4 / 60, this.gapAvg || 1 / 60));
    // GPU 에 조각이 하나도 없으면 읽어 올 결과도 없으니 받은 시각을 맡긴 시각에 맞춰 둠
    if (this.mode === 'gpu' && !this.gpu.staging.some(x => x.busy) && (this.gpu.top - this.gpu.free.length) <= 0) this._gotResult(this.gpu.simT || 0);
    const clock = this._clock(I);
    const behind = Math.max(0, clock - this.simT);                 // 맡겼지만 아직 못 받은 만큼
    const extra = this.mode === 'gpu' ? Math.min(0.1, behind) : 0;
    this._behindMax = Math.max(extra, (this._behindMax || 0) - real * 0.1);
    const L = I + (this.mode === 'gpu' ? Math.max(0, this._behindMax - I) : 0) + 0.001;
    this.lag = L;
    const target = clock - L;
    if (Math.abs(target - this.dispT) > 0.15) { this.dispT = target; this._lastClock = clock; return; }   // 크게 벌어지면 바로 맞춤
    // 물리가 실제 시간보다 느리게 갈 때(무거운 장면)는 시계가 실제로 나아간 만큼만 진행
    const dc = this._lastClock === undefined ? d : Math.max(0, Math.min(d * 1.5, clock - this._lastClock));
    this._lastClock = clock;
    this.dispT += dc + (target - this.dispT) * (1 - Math.exp(-real * 6));
    if (this.dispT > this.simT) this.dispT = this.simT;   // 아직 없는 결과는 그리지 않음 (최신에서 기다림)
  }

  // GPU 물리를 고르면 WebGPU 로, 안 되면 워커, 그것도 안 되면 같은 스레드에서 계산
  static async create({ useWorker = true, gpu = false, capacity = 32768 } = {}) {
    if (gpu) {
      try { const core = await GPUCore.create(capacity); if (core) return new Physics(null, core); } catch (e) { console.warn('GPU 물리를 못 써서 Rapier 로 바꿈:', e); }
    }
    await RAPIER.init();
    if (useWorker && WORKER_SRC && typeof Worker !== 'undefined') {
      try {
        const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
        const w = new Worker(url);
        const ok = await new Promise((res) => {
          const to = setTimeout(() => res(false), 8000);
          w.onmessage = (e) => { if (e.data && e.data.type === 'ready') { clearTimeout(to); res(true); } };
          w.onerror = () => { clearTimeout(to); res(false); };
        });
        URL.revokeObjectURL(url);
        if (ok) return new Physics(w);
        w.terminate();
      } catch (e) { /* 폴백 */ }
    }
    return new Physics(null);
  }

  _cmd(c, xfer) { this._cmds.push(c); if (xfer) for (const x of xfer) this._xfer.push(x); }

  // ---- 생성 ----
  heightfield(n, heightsColMajor, span) {
    const id = this._id++;
    this._cmd(['hf', id, n, heightsColMajor, span], [heightsColMajor.buffer]);
    return id;
  }
  trimesh(verts, idx, meta) {
    const id = this._id++;
    this._cmd(this.mode === 'gpu' ? ['tri', id, null, null, meta] : ['tri', id, verts, idx], this.mode === 'gpu' ? null : [verts.buffer, idx.buffer]);
    return id;
  }
  // shape: {box:[hu,hy,hv,ox,oz,qy,qw]} 또는 {hull: Float32Array}
  chunk(x, y, z, shape, density, group, mass) {
    const id = this._id++;
    if (shape.box) this._cmd(['chunk', id, x, y, z, 0, shape.box, density, group]);
    else { const h = shape.hull.slice(); this._cmd(['chunk', id, x, y, z, 1, h, density, group], [h.buffer]); }
    const b = new Body(this, id, x, y, z, mass, false);
    this.bodies.set(id, b);
    return b;
  }
  ball(x, y, z, vx, vy, vz, r) {
    const id = this._id++;
    this._cmd(['ball', id, x, y, z, vx, vy, vz, r]);
    const b = new Body(this, id, x, y, z, 7.8 * (4 / 3) * Math.PI * r * r * r, true);
    b.v = { x: vx, y: vy, z: vz };
    this.bodies.set(id, b); this._dyn.add(b);
    return b;
  }
  // 가벼운 파편 만들기 (처음엔 고정)
  light(x, y, z, q, mass, r) {
    if (this.mode === 'gpu') {
      // GPU 에서는 가벼운 파편도 다른 조각과 똑같이 서로 부딪힘
      const id = this._id++;
      this._cmd(['lball', id, x, y, z, 0, 0, 0, r, mass]);
      const b = new Body(this, id, x, y, z, mass, false); if (q) b.q = { x: q.x, y: q.y, z: q.z, w: q.w };
      this.bodies.set(id, b); return b;
    }
    return new LightBody(this, x, y, z, q || { x: 0, y: 0, z: 0, w: 1 }, mass, r);
  }
  get dynCount() { return this._dyn.size; }
  get lightCount() { return this._light.size; }

  remove(bodyOrId) {
    if (bodyOrId && bodyOrId.light) { bodyOrId.alive = false; this._light.delete(bodyOrId); return; }
    const id = typeof bodyOrId === 'number' ? bodyOrId : bodyOrId.id;
    const b = this.bodies.get(id);
    if (b) { b.alive = false; this._dyn.delete(b); this.bodies.delete(id); }
    this._cmd(['rm', id]);
  }
  setSolverIterations(n) { this._cmd(['iter', n]); }
  setGravity(gx, gy, gz) { this.gravity = { x: gx, y: gy, z: gz }; for (const b of this._light) b.sl = false; this._cmd(['wgrav', gx, gy, gz]); }

  // 가벼운 파편 진행 (메인 스레드, 프레임마다)
  _stepLight(dt) {
    if (!this._light.size || dt <= 0) return;
    const n = Math.min(8, Math.max(1, Math.ceil(dt / 0.017))), h = dt / n;
    const g = this.gravity, env = this.lightEnv;
    const drag = Math.exp(-0.04 * h);
    for (const b of this._light) {
      if (b.sl) continue;
      const p = b.p, v = b.v, w = b.w, q = b.q;
      let contact = false;
      for (let k = 0; k < n; k++) {
        v.x += g.x * b.gs * h; v.y += g.y * b.gs * h; v.z += g.z * b.gs * h;
        v.x *= drag; v.y *= drag; v.z *= drag;
        b.px = p.x; b.py = p.y; b.pz = p.z;
        p.x += v.x * h; p.y += v.y * h; p.z += v.z * h;
        // 회전 적분: q += 0.5 * (w, 0) * q * h
        const wx = w.x * h * 0.5, wy = w.y * h * 0.5, wz = w.z * h * 0.5;
        const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
        q.x += wx * qw + wy * qz - wz * qy; q.y += wy * qw + wz * qx - wx * qz; q.z += wz * qw + wx * qy - wy * qx; q.w += -wx * qx - wy * qy - wz * qz;
        const l = 1 / Math.hypot(q.x, q.y, q.z, q.w); q.x *= l; q.y *= l; q.z *= l; q.w *= l;
        if (env && env.collide(b, h)) contact = true;
      }
      const ad = Math.exp(-(contact ? 6 : 0.3) * dt);
      w.x *= ad; w.y *= ad; w.z *= ad;
      if (contact && v.x * v.x + v.y * v.y + v.z * v.z < 0.6 && b.gs > 0) { b.restT += dt; if (b.restT > 0.35) { b.sl = true; v.x = v.y = v.z = 0; } }
      else b.restT = 0;
    }
  }

  // ---- 진행 ----
  // 물리를 진행한 뒤에 그릴 시각을 정함 (진행 전에 정하면 방금 받은 결과보다 앞선 시각이 되어 멈칫함)
  step(dt) {
    this._stepInner(dt);
    this._advanceDisplay(Math.min(dt, 0.1) * this.timeScale, Math.min(dt, 0.1));
  }
  _stepInner(dt) {
    const d = Math.min(dt, 0.1) * this.timeScale;
    const tl = performance.now();
    this._stepLight(d);
    this.lightMs = this.lightMs * 0.9 + (performance.now() - tl) * 0.1;
    if (this.mode === 'gpu') {
      for (const c of this._cmds) this.gpu.exec(c);
      this._cmds = []; this._xfer = [];
      const maxSteps = Math.max(1, Math.ceil(this.timeScale)) * (this.gpu.stepMs > 12 ? 1 : 2);
      const st = this.gpu.step(d, maxSteps);
      this.stepMs = this.gpu.stepMs;
      this.simDt += st.steps / 60;
      return;
    }
    if (this.mode === 'inline') {
      for (const c of this._cmds) this.core.exec(c);
      this._cmds = []; this._xfer = [];
      const maxSteps = (this.core.stepMs > 9 ? 1 : 2) * Math.max(1, Math.ceil(this.timeScale));
      const st = this.core.step(d, maxSteps);
      this.stepMs = this.core.stepMs;
      if (st.steps > 0) { this._gotResult(this.simT + st.steps / 60); const s = this.core.snapshot(); this._apply(s.ids, s.f, this.simT); }
      this.simDt += st.steps / 60;
      return;
    }
    // 워커는 스스로 실제 시간에 맞춰 진행 → 여기서는 쌓인 명령과 배속만 보냄
    if (!this._cmds.length && this._sentTs === this.timeScale) return;
    const cmds = this._cmds, xfer = this._xfer;
    this._cmds = []; this._xfer = [];
    this._sentTs = this.timeScale;
    try { this.worker.postMessage({ type: 'cmds', ts: this.timeScale, cmds }, xfer); }
    catch (e) { console.warn('physics postMessage failed', e); }
  }

  _onMsg(m) {
    if (m.type !== 'state') return;
    if (m.err) { this.lastErr = m.err; if (!this._errShown) { this._errShown = true; console.warn('physics worker:', m.err); } }
    this.stepMs = m.stepMs;
    this._gotResult(this.simT + m.simDt);
    this._apply(m.ids, m.f, this.simT);
    this.simDt += m.simDt;
  }

  _apply(ids, f, T) {
    for (let k = 0; k < ids.length; k++) {
      const b = this.bodies.get(ids[k]);
      if (!b || !b.dyn) continue;
      const o = k * STRIDE;
      b._set(T, f[o], f[o + 1], f[o + 2], f[o + 3], f[o + 4], f[o + 5], f[o + 6]);
      b.v = { x: f[o + 7], y: f[o + 8], z: f[o + 9] };
      b.sl = f[o + 10] > 0.5;
    }
  }

  // GPU 결과: body 마다 [x y z 칸, 회전 4, 속도 3, 잠] (칸 → id)
  _applyGPU(n, f, T) {
    const ids = this.gpu.ids;
    this._gotResult(T);
    for (let k = 0; k < n; k++) {
      const o = k * 12;
      const id = ids[f[o + 3] | 0]; if (id < 0) continue;
      const b = this.bodies.get(id);
      if (!b || !b.dyn) continue;
      b._set(T, f[o], f[o + 1], f[o + 2], f[o + 4], f[o + 5], f[o + 6], f[o + 7]);
      b.v = { x: f[o + 8], y: f[o + 9], z: f[o + 10] };
      b.sl = f[o + 11] > 0.5;
    }
  }
  // 마지막 호출 이후 진행된 시뮬레이션 시간
  takeSimDt() { const s = this.simDt; this.simDt = 0; return s; }

  dispose() {
    if (this.worker) { try { this.worker.postMessage({ type: 'dispose' }); } catch (e) { /* 무시 */ } setTimeout(() => { try { this.worker.terminate(); } catch (e) { /* 무시 */ } }, 500); }
    if (this.core) this.core.free();
    if (this.gpu) this.gpu.destroy();
    this.bodies.clear(); this._dyn.clear(); this._light.clear();
  }
}
