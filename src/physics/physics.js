// 메인 스레드 물리 창구: body 프록시 + 백엔드(워커 / 인라인)
// 파괴 로직은 프록시의 Rapier 비슷한 API 만 사용하고, 실제 계산은 워커(또는 같은 스레드)에서 일어난다.
import RAPIER from '@dimforge/rapier3d-simd-compat';
import { PhysCore, STRIDE } from './core.js';

/* global __PHYS_WORKER_SRC__ */
const WORKER_SRC = typeof __PHYS_WORKER_SRC__ !== 'undefined' ? __PHYS_WORKER_SRC__ : null;

class Body {
  constructor(phys, id, x, y, z, mass, dyn) {
    this.phys = phys; this.id = id; this.handle = id;
    this.p = { x, y, z }; this.q = { x: 0, y: 0, z: 0, w: 1 }; this.v = { x: 0, y: 0, z: 0 };
    this.m = mass; this.dyn = dyn; this.sl = false; this.gs = 1; this.alive = true;
  }
  translation() { return this.p; }
  rotation() { return this.q; }
  linvel() { return this.v; }
  isSleeping() { return this.sl; }
  mass() { return this.m; }
  isDynamic() { return this.dyn; }
  setDynamic(on) {
    if (this.dyn === on) return;
    this.dyn = on; this.sl = false;
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
  constructor(worker) {
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
    this.worker = worker || null;
    if (this.worker) {
      this.mode = 'worker';
      this.worker.onmessage = (e) => this._onMsg(e.data);
      this.worker.onerror = (e) => console.warn('physics worker error', e.message);
    } else {
      this.mode = 'inline';
      this.core = new PhysCore(RAPIER);
    }
  }

  // 워커가 준비되면 워커, 아니면 같은 스레드에서 계산
  static async create({ useWorker = true } = {}) {
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
  trimesh(verts, idx) {
    const id = this._id++;
    this._cmd(['tri', id, verts, idx], [verts.buffer, idx.buffer]);
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
  light(x, y, z, q, mass, r) { return new LightBody(this, x, y, z, q || { x: 0, y: 0, z: 0, w: 1 }, mass, r); }
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
    const n = dt > 0.034 ? 2 : 1, h = dt / n;
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
  step(dt) {
    const d = Math.min(dt, 0.1) * this.timeScale;
    const tl = performance.now();
    this._stepLight(d);
    this.lightMs = this.lightMs * 0.9 + (performance.now() - tl) * 0.1;
    if (this.mode === 'inline') {
      for (const c of this._cmds) this.core.exec(c);
      this._cmds = []; this._xfer = [];
      const maxSteps = this.core.stepMs > 9 ? 1 : 2;
      const st = this.core.step(d, maxSteps);
      this.stepMs = this.core.stepMs;
      const s = this.core.snapshot();
      this._apply(s.ids, s.f);
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
    this._apply(m.ids, m.f);
    this.simDt += m.simDt;
  }

  _apply(ids, f) {
    for (let k = 0; k < ids.length; k++) {
      const b = this.bodies.get(ids[k]);
      if (!b || !b.dyn) continue;
      const o = k * STRIDE;
      b.p = { x: f[o], y: f[o + 1], z: f[o + 2] };
      b.q = { x: f[o + 3], y: f[o + 4], z: f[o + 5], w: f[o + 6] };
      b.v = { x: f[o + 7], y: f[o + 8], z: f[o + 9] };
      b.sl = f[o + 10] > 0.5;
    }
  }

  // 마지막 호출 이후 진행된 시뮬레이션 시간
  takeSimDt() { const s = this.simDt; this.simDt = 0; return s; }

  dispose() {
    if (this.worker) { try { this.worker.postMessage({ type: 'dispose' }); } catch (e) { /* 무시 */ } setTimeout(() => { try { this.worker.terminate(); } catch (e) { /* 무시 */ } }, 500); }
    if (this.core) this.core.free();
    this.bodies.clear(); this._dyn.clear(); this._light.clear();
  }
}
