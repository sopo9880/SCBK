// 물리 파괴 시스템: 온전한 건물 ↔ 조각(Rapier 리지드바디) 관리
import * as THREE from 'three';
import { buildingShell, fractureBuilding } from './fracture.js';
import { makeBuildingMaterial } from './materials.js';
import { hash01, pointInPoly } from './geo.js';
import { PROF } from './prof.js';

const FIXED = 0, DYN = 1, FROZEN = 2, GONE = 3;
const GROUP_NORMAL = (0x0001 << 16) | 0xffff; // 소속 1, 모두와 충돌
const GROUP_SMALL = (0x0002 << 16) | 0x0001;  // 소속 2, 소속 1 하고만 충돌
const DENSITY = 0.55;

const PALETTE = {
  university: ['#d9d0bf', '#cfc6b4', '#b98466', '#e3ddd0'],
  school: ['#d9d0bf', '#c99a7a', '#e0d8c8'],
  residential: ['#e4dfd4', '#d8cab4', '#cdd2d6', '#e8e2d2'],
  apartments: ['#e6e2d9', '#d7d9db', '#e0d4c0', '#c9cfd4'],
  house: ['#d8b69c', '#e2d6c2', '#c49b7b', '#d9c9b0'],
  commercial: ['#aab6c1', '#c7ccd2', '#8fa1b3', '#b9bfc4'],
  office: ['#9fb0c0', '#c3c9cf', '#8597a8'],
  retail: ['#d4c6b3', '#c8c0b6', '#b9aea2'],
  industrial: ['#aaa69d', '#b9b3a6', '#9ea3a8'],
  warehouse: ['#aaa69d', '#b9b3a6'],
  church: ['#d8cfc0', '#b58a6c'],
  hospital: ['#e6e6e2', '#d6dde0'],
  default: ['#d0c9bc', '#dad4c8', '#beb9b1', '#c8c2b6', '#d6cdbf'],
};

class BatchPool {
  constructor(parent, material, opts) { this.parent = parent; this.mat = material; this.batches = []; this.opts = opts; }
  add(geo) {
    const v = geo.getAttribute('position').count, i = geo.index.count;
    let b = this.batches[this.batches.length - 1];
    const u = b && b.userData;
    if (!b || u.v + v > u.maxV || u.i + i > u.maxI || u.n >= u.maxN) b = this._new();
    const gid = b.addGeometry(geo);
    const inst = b.addInstance(gid);
    b.userData.v += v; b.userData.i += i; b.userData.n++;
    return { batch: b, inst };
  }
  _new() {
    const { maxN, maxV, maxI } = this.opts;
    const b = new THREE.BatchedMesh(maxN, maxV, maxI, this.mat);
    b.castShadow = true; b.receiveShadow = true; b.sortObjects = false;
    b.frustumCulled = false;
    b.userData = { v: 0, i: 0, n: 0, maxN, maxV, maxI };
    this.parent.add(b); this.batches.push(b);
    return b;
  }
  dispose() { for (const b of this.batches) { b.dispose(); this.parent.remove(b); } this.batches = []; }
}

// 광선-구 교차 (가까운 쪽 t, 없으면 null)
function raySphere(o, d, cx, cy, cz, r, maxT) {
  const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const c = ox * ox + oy * oy + oz * oz - r * r;
  const h = b * b - c;
  if (h < 0) return null;
  const t = -b - Math.sqrt(h);
  return t > 0 && t < maxT ? t : null;
}
// 광선-축정렬상자 교차
function slab(o, d, x0, y0, z0, x1, y1, z1) {
  let tmin = 0, tmax = Infinity;
  for (const [oo, dd, a, b] of [[o.x, d.x, x0, x1], [o.y, d.y, y0, y1], [o.z, d.z, z0, z1]]) {
    if (Math.abs(dd) < 1e-9) { if (oo < a || oo > b) return null; continue; }
    let t1 = (a - oo) / dd, t2 = (b - oo) / dd;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}

export class Destruction {
  constructor({ scene, phys, grid, buildings, quality, hooks }) {
    this.scene = scene; this.phys = phys; this.grid = grid; this.buildings = buildings; this.quality = quality;
    this.hooks = hooks || {};
    this.group = new THREE.Group(); scene.add(this.group);
    this.material = makeBuildingMaterial();
    this.dynamic = new Set();
    this.loose = new Set();       // DYN + FROZEN
    this.balls = [];
    this.score = 0; this.destroyed = 0; this.releasedVol = 0; this.totalVol = 0;
    this.pool = new BatchPool(this.group, this.material, { maxN: 5000, maxV: 220000, maxI: 380000 });
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);
    this._c = new THREE.Color();
    this._buildTerrainCollider();
    this._buildIntact();
    for (const name of ['fracture', 'explode', 'laser', 'field', 'quake', '_support']) {
      const f = this[name].bind(this);
      this[name] = (...a) => { const t = performance.now(); try { return f(...a); } finally { PROF.add(name, performance.now() - t); } };
    }
    this._dirty = new Set();
    this._crushing = new Set();
    this._pendingQ = []; this.fracBudgetMs = 7; this._fracSpent = 0; this._settled = [];
    this._lgrid = new Map(); this._frame = 0; this._lgridFrame = -1; this._lgridDirty = true; this._stepMs = 0;
    this._dustBudget = 0;
    this._impactIdx = 0;
    this.eaten = [];   // 블랙홀이 삼킨 조각 (화이트홀이 토해냄)
    this._anim = [];
    this._wakeQ = [];
    this.useLight = quality.lightDebris !== false;
    phys.lightEnv = { collide: (b, h) => this._lightCollide(b, h) };  // 받침이 사라진 자리: 그 위에 멈춰 있던 파편을 다시 움직이게
    if (!grid.h0) grid.h0 = grid.h.slice(); // 시간 역행용 원래 지형
  }
  get timeScale() { return this.phys.timeScale; }
  set timeScale(v) { this.phys.timeScale = v; }

  // ---------- 초기화 ----------
  _buildTerrainCollider() {
    const g = this.grid, n = g.n;
    const h = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) h[j + i * n] = g.h[j * n + i];
    // 같은 id 로 다시 보내면 이전 지형을 대체
    if (!this.terrainId) this.terrainId = this.phys._id++;
    this.phys._cmd(['hf', this.terrainId, n, h, g.span], [h.buffer]);
  }
  rebuildTerrainCollider() { this._buildTerrainCollider(); }
  // 물리 지형은 크레이터가 생긴 직후가 아니라 잠시 뒤 한 번만 다시 만든다 (폭발 프레임 끊김 방지)
  scheduleTerrainRebuild() { if (this._terrainT === undefined || this._terrainT < 0) this._terrainT = 0.6; }

  _buildIntact() {
    const g = this.grid;
    const geos = [];
    let V = 0, I = 0;
    this.hash = new Map();
    this.hashN = new Map(); // 숫자 키 (가벼운 파편 충돌용)
    for (const b of this.buildings) {
      let base = Infinity;
      for (const p of b.pts) base = Math.min(base, g.sample(p[0], p[1]));
      base = Math.min(base, g.sample(b.cx, b.cz));
      b.baseY = base;
      const geo = buildingShell(b, base);
      geos.push(geo);
      V += geo.getAttribute('position').count; I += geo.index.count;
      this.totalVol += b.area * b.height;
      // 색
      const pal = PALETTE[b.type] || PALETTE.default;
      const col = new THREE.Color(pal[Math.floor(hash01(b.id) * pal.length) % pal.length]);
      if (b.color) { try { const tc = new THREE.Color(b.color); col.lerp(tc, 0.55); } catch (e) { /* 무시 */ } }
      const l = 0.78 + hash01(b.id * 3.3) * 0.12;
      col.multiplyScalar(l);
      b.col = col; b.scorch = 0;
      b.state = 'intact'; b.released = 0; b.total = 0; b.destroyedFlag = false;
      // 공간 해시
      for (let x = Math.floor(b.minx / 60); x <= Math.floor(b.maxx / 60); x++)
        for (let z = Math.floor(b.minz / 60); z <= Math.floor(b.maxz / 60); z++) {
          const k = x + ',' + z;
          if (!this.hash.has(k)) this.hash.set(k, []);
          this.hash.get(k).push(b);
          const kn = x * 100003 + z;
          if (!this.hashN.has(kn)) this.hashN.set(kn, []);
          this.hashN.get(kn).push(b);
        }
    }
    this.intact = new THREE.BatchedMesh(this.buildings.length + 1, V + 1, I + 1, this.material);
    this.intact.castShadow = true; this.intact.receiveShadow = true; this.intact.sortObjects = false;
    this.buildings.forEach((b, k) => {
      const gid = this.intact.addGeometry(geos[k]);
      b.inst = this.intact.addInstance(gid);
      this.intact.setColorAt(b.inst, b.col);
      // 충돌체: 삼각형 메시 (지면 위 부분)
      const pos = geos[k].getAttribute('aOrig').array, idx = geos[k].index.array;
      b.bodyId = this.phys.trimesh(new Float32Array(pos), new Uint32Array(idx));
      geos[k].dispose();
    });
    this.group.add(this.intact);
  }

  buildingsNear(x, z, r) {
    const out = new Set();
    for (let cx = Math.floor((x - r) / 60); cx <= Math.floor((x + r) / 60); cx++)
      for (let cz = Math.floor((z - r) / 60); cz <= Math.floor((z + r) / 60); cz++) {
        const l = this.hash.get(cx + ',' + cz); if (!l) continue;
        for (const b of l) out.add(b);
      }
    return [...out].filter(b => {
      const dx = Math.max(b.minx - x, 0, x - b.maxx), dz = Math.max(b.minz - z, 0, z - b.maxz);
      return dx * dx + dz * dz <= r * r;
    });
  }

  // ---------- 조각화 ----------
  fracture(b, lod = 0) {
    if (b.state !== 'intact') return false;
    const max = lod === 0 ? this.quality.chunkFull : lod === 1 ? Math.min(90, this.quality.chunkFull) : 26;
    const f = fractureBuilding(b, b.baseY, (x, z) => this.grid.sample(x, z), max);
    if (!f.chunks.length) return false;
    this.intact.setVisibleAt(b.inst, false);
    this.phys.remove(b.bodyId); b.bodyId = 0;
    b.state = 'fractured';
    b.chunks = []; b.cmap = new Map(); b.colMin = new Map(); b.nL = f.nL;
    const col = this._c.copy(b.col).multiplyScalar(1 - Math.min(0.7, b.scorch));
    for (const ch of f.chunks) {
      const { batch, inst } = this.pool.add(ch.geo);
      ch.geo.dispose();
      const [cx, cy, cz] = ch.center;
      this._m.makeTranslation(cx, cy, cz);
      batch.setMatrixAt(inst, this._m);
      batch.setColorAt(inst, col);
      const shape = ch.box ? { box: [ch.box.hu, ch.box.hy, ch.box.hv, ch.box.ox, ch.box.oz, ch.box.qy, ch.box.qw] } : { hull: ch.hull };
      // 작은 파편끼리는 충돌하지 않음 (월드·큰 조각과는 충돌)
      const group = ch.vol < 14 ? GROUP_SMALL : GROUP_NORMAL;
      const mass = DENSITY * ch.vol * 0.88;
      const body = this.phys.chunk(cx, cy, cz, shape, DENSITY, group, mass);
      const c = { b, batch, inst, body, shape, group, mass, i: ch.i, j: ch.j, k: ch.k, vol: ch.vol, state: FIXED, age: 0, slowT: 0, size: Math.cbrt(ch.vol), hy: ch.half[1], x: cx, y: cy, z: cz, ox: cx, oy: cy, oz: cz, pvy: 0, top: ch.top };
      b.chunks.push(c);
      const key = c.i + ',' + c.j;
      b.cmap.set(key + ',' + c.k, c);
      b.colMin.set(key, Math.min(b.colMin.has(key) ? b.colMin.get(key) : 1e9, c.k));
    }
    b.chunks.sort((a, c) => a.k - c.k);
    b.total = b.chunks.length;
    b.layerCount = [];
    for (const c of b.chunks) b.layerCount[c.k] = (b.layerCount[c.k] || 0) + 1;
    b.baseCount = b.chunks.filter(c => c.k === b.colMin.get(c.i + ',' + c.j)).length;
    this._dirty.add(b);
    return true;
  }

  // ---------- 조각 상태 전환 ----------
  _count(c) {
    const b = c.b;
    b._cgDirty = true;
    b.released++;
    this.releasedVol += c.vol;
    this.score += Math.round(c.vol * 14);
    if (!b.destroyedFlag && b.released >= b.total * 0.45) {
      b.destroyedFlag = true; this.destroyed++;
      this.score += Math.round(b.area * b.height * 2.5);
      this.hooks.onBuildingDestroyed && this.hooks.onBuildingDestroyed(b);
    }
    this._dirty.add(b);
  }

  release(c, ix = 0, iy = 0, iz = 0, spin = 0, force = false) {
    if (c.state === GONE || c.state === DYN) {
      if (c.state === DYN && (ix || iy || iz)) c.body.applyImpulse({ x: ix, y: iy, z: iz }, true);
      return;
    }
    // 작은 조각은 가벼운 파편(간이 물리)으로: Rapier 부하 없이 수만 개까지
    // 정식 물리(Rapier) 예산이 차면 넘치는 조각도 가벼운 파편으로 (먼지로 사라지지 않게)
    const rapierFull = this.phys.dynCount >= (this.dynBudget || this.quality.maxDynamic);
    const toLight = this.useLight && (c.body.light || c.vol < (this.quality.lightVol || 30) || rapierFull);
    const full = toLight ? this.phys.lightCount >= (this.quality.maxLight || 20000) : rapierFull;
    if (!force && c.state === FROZEN && full) return;
    // 움직이는 조각이 예산을 넘으면 작은 조각은 물리 대신 먼지로 사라짐
    if (c.state === FIXED && full && c.size < 3.2) {
      this.hooks.onDust && this._dustBudget > 0.5 && (this._dustBudget -= 0.5, this.hooks.onDust({ x: c.x, y: c.y, z: c.z }, c.size));
      this.removeChunk(c);
      return;
    }
    const was = c.state;
    if (toLight && !c.body.light) {
      const r = c.body.rotation();
      const lb = this.phys.light(c.x, c.y, c.z, c.state === FIXED ? null : r, c.mass, c.size * 0.55);
      this.phys.remove(c.body); c.body = lb;
    }
    c.body.setDynamic(true);
    c.state = DYN; c.age = 0; c.slowT = 0;
    this.dynamic.add(c); this.loose.add(c); this._lgridDirty = true;
    this._wakeQ.push(c.x, c.y, c.z, c.size);
    if (ix || iy || iz) c.body.applyImpulse({ x: ix, y: iy, z: iz }, true);
    if (spin) {
      const m = c.body.mass() * spin;
      c.body.applyTorqueImpulse({ x: (Math.random() - 0.5) * m, y: (Math.random() - 0.5) * m, z: (Math.random() - 0.5) * m }, true);
    }
    if (was === FIXED) this._count(c);
  }

  removeChunk(c) {
    if (c.state === GONE) return;
    this._wakeQ.push(c.x, c.y, c.z, c.size);
    if (c.state === FIXED) this._count(c);
    this.phys.remove(c.body);
    c.batch.setVisibleAt(c.inst, false);
    this.dynamic.delete(c); this.loose.delete(c);
    c.state = GONE;
  }

  _freeze(c) {
    c.body.setDynamic(false);
    c.state = FROZEN; this.dynamic.delete(c);
    if (c.size < 3) this._settled.push(c);
  }
  // 쌓인 잔해가 너무 많으면 오래된 작은 조각부터 정리 (물리 부하 상한)
  _trimRubble() {
    const max = this.quality.maxLoose || 6000;
    let n = 0;
    while (this.loose.size > max && this._settled.length && n < 40) {
      const c = this._settled.shift();
      if (c.state !== FROZEN) continue;
      this.removeChunk(c); n++;
    }
  }

  chunkPos(c) {
    if (c.state === DYN) { const t = c.body.translation(); c.x = t.x; c.y = t.y; c.z = t.z; }
    return c;
  }

  _darken(b, amount) {
    b.scorch = Math.min(0.75, b.scorch + amount);
    const col = this._c.copy(b.col).multiplyScalar(1 - b.scorch);
    if (b.state === 'intact') this.intact.setColorAt(b.inst, col);
  }
  _darkenChunk(c, amount) {
    c.sc = Math.min(0.8, (c.sc || c.b.scorch) + amount);
    c.batch.setColorAt(c.inst, this._c.copy(c.b.col).multiplyScalar(1 - c.sc));
  }

  // ---------- 구조 지지 ----------
  _support(b) {
    if (b.state !== 'fractured') return;
    const grounded = new Set(), direct = new Set();
    let baseLeft = 0, failed = false, failK = 0;
    const layers = new Map();
    for (const c of b.chunks) {
      if (c.state !== FIXED) continue;
      if (!layers.has(c.k)) layers.set(c.k, []);
      layers.get(c.k).push(c);
    }
    for (let k = 0; k < b.nL; k++) {
      const layer = layers.get(k);
      if (!layer) continue;
      if (failed) continue;
      let nd = 0;
      for (const c of layer) {
        const col = c.i + ',' + c.j;
        if (c.k === b.colMin.get(col)) { grounded.add(c); direct.add(c); baseLeft++; nd++; continue; }
        const below = b.cmap.get(col + ',' + (c.k - 1));
        // 직접 지지는 아래 조각도 직접 지지일 때만 이어진다
        if (below && below.state === FIXED && direct.has(below)) { grounded.add(c); direct.add(c); nd++; }
      }
      for (const c of layer) {
        if (grounded.has(c)) continue;
        let nb = 0;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = b.cmap.get((c.i + di) + ',' + (c.j + dj) + ',' + c.k);
          if (n && n.state === FIXED && direct.has(n)) nb++;
        }
        if (nb >= 2 || (nb === 1 && hash01(c.i * 7 + c.j * 13 + c.k) > 0.45)) grounded.add(c);
      }
      // 이 층의 기둥이 대부분 사라지면 이 층과 그 위 전부 붕괴
      const orig = b.layerCount[k] || 0;
      if (orig >= 3 && nd / orig < 0.3) {
        failed = true; failK = k;
        for (const c of layer) { grounded.delete(c); direct.delete(c); }
      }
    }
    // 위층이 무너지면: 기울어 넘어지는 방향 + 아래층 연쇄 압괴 예약
    if (failed) {
      if (!b.tilt) { const a = b.blastDir ?? Math.random() * Math.PI * 2; b.tilt = [Math.cos(a), Math.sin(a)]; }
      const above = b.chunks.filter(c => c.k >= failK && c.state !== GONE).length;
      if (!b.crush || failK - 1 < b.crush.k) b.crush = { k: failK - 1, t: 0, mom: above * 1.4 };
      if (b.crush.k >= 0) this._crushing.add(b);
    }
    const total = baseLeft / Math.max(1, b.baseCount);
    const collapseAll = total < 0.42;
    let n = 0;
    for (const c of b.chunks) {
      if (c.state !== FIXED) continue;
      if (collapseAll || !grounded.has(c)) {
        const m = c.body.mass();
        let vx = (Math.random() - 0.5) * 1.2, vz = (Math.random() - 0.5) * 1.2, vy = -1.5;
        if (b.tilt && failed && c.k >= failK) {
          // 무너지는 지점 위로 높을수록 더 크게 기울어짐 (넘어지는 나무처럼)
          const h = (c.k - failK + 1) * (b.height / b.nL);
          vx += b.tilt[0] * h * 0.028; vz += b.tilt[1] * h * 0.028; vy -= h * 0.015;
        }
        this.release(c, vx * m, vy * m, vz * m, 0.25);
        n++;
      }
    }
    if (n && this.hooks.onCollapse) this.hooks.onCollapse(b, n);
  }

  // ---------- 폭발 ----------
  /**
   * opts: {x,y,z, r, power(m/s), vaporize(m), lift, inner, lod, scorch}
   */
  explode(o) {
    const { x, y, z, r } = o;
    const power = o.power || 20, lift = o.lift ?? 0.35, inner = o.inner || 0, vap = o.vaporize || 0;
    let blds = this.buildingsNear(x, z, r);
    // 충격파 링: 이미 지나간 안쪽 건물은 건너뜀
    if (inner) blds = blds.filter(b => Math.max(Math.hypot(b.minx - x, b.minz - z), Math.hypot(b.maxx - x, b.minz - z), Math.hypot(b.minx - x, b.maxz - z), Math.hypot(b.maxx - x, b.maxz - z)) >= inner);
    // LOD 결정
    const intactList = blds.filter(b => b.state === 'intact').map(b => [b, Math.hypot(b.cx - x, b.cz - z)]).sort((a, b) => a[1] - b[1]);
    const budget = o.lodBudget ?? 8;
    intactList.forEach(([b, d], idx) => {
      // 수직 범위 체크
      if (y - r > b.baseY + b.height || y + r < b.baseY + b.minH) return;
      if (inner && d + Math.max(b.maxx - b.minx, b.maxz - b.minz) / 2 < inner) return;
      const lod = o.lod ?? (idx < budget ? 0 : idx < budget * 4 ? 1 : 2);
      // 프레임 시간 예산을 넘으면 다음 프레임에 조각내고 이 폭발을 그때 적용
      if (this._fracSpent >= this.fracBudgetMs && idx > 0) { this._queueFracture(b, lod, o); return; }
      this._timedFracture(b, lod);
    });
    const hit = this._blastChunks(o, blds, true);
    for (const b of blds) { this._dirty.add(b); if (b.blastDir === undefined) b.blastDir = Math.atan2(b.cz - z, b.cx - x); }
    return hit;
  }

  _timedFracture(b, lod) {
    const t = performance.now();
    const ok = this.fracture(b, lod);
    this._fracSpent += performance.now() - t;
    return ok;
  }
  // 예산 안이면 바로, 아니면 다음 프레임에 조각화 (true = 지금 조각남)
  _fractureSoon(b, lod) {
    if (b.state !== 'intact') return b.state === 'fractured';
    if (this._fracSpent >= this.fracBudgetMs) { if (!b.pending) this._queueFracture(b, lod, null); return false; }
    return this._timedFracture(b, lod);
  }
  _queueFracture(b, lod, o) {
    if (b.pending) { if (o) b.pending.blasts.push(o); return; }
    b.pending = { lod, blasts: o ? [o] : [] };
    this._pendingQ.push(b);
  }
  _processPending() {
    while (this._pendingQ.length && this._fracSpent < this.fracBudgetMs) {
      const b = this._pendingQ.shift();
      const p = b.pending; b.pending = null;
      if (!p || b.state !== 'intact') continue;
      this._timedFracture(b, p.lod);
      for (const o of p.blasts) { if (typeof o === 'function') o(b); else this._blastChunks(o, [b], false); }
      this._dirty.add(b);
    }
  }

  // 폭발을 조각에 적용 (loose = 이미 흩어진 파편까지 포함할지)
  _blastChunks(o, blds, loose) {
    const { x, y, z, r } = o;
    const power = o.power || 20, lift = o.lift ?? 0.35, inner = o.inner || 0, vap = o.vaporize || 0;
    let hit = 0;
    const r2 = r * r;
    const apply = (c, base) => {
      const dx = c.x - x, dy = c.y - y, dz = c.z - z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > r2) return;
      const d = Math.sqrt(d2);
      if (inner && d < inner) return;
      if (vap && d < vap + c.size * 0.3) { this.removeChunk(c); this.hooks.onVaporize && this.hooks.onVaporize(c); hit++; return; }
      const f = Math.pow(1 - d / r, 1.3);
      if (base === FIXED && d > r * 0.7 && Math.random() > f * 2 + 0.3) { this._darkenChunk(c, 0.15 * f + 0.05); return; }
      const m = c.body.mass();
      const inv = 1 / Math.max(d, 0.5);
      const v = power * (0.25 + f) * (0.75 + Math.random() * 0.5);
      this.release(c, dx * inv * m * v, (dy * inv + lift) * m * v, dz * inv * m * v, v * 0.12 * c.size);
      if (o.scorch) this._darkenChunk(c, o.scorch * f);
      hit++;
    };
    for (const b of blds) {
      if (b.state === 'fractured') { for (const c of b.chunks) if (c.state === FIXED) apply(c, FIXED); }
      else if (b.state === 'intact' && o.scorch && !b.pending) {
        const d = Math.hypot(b.cx - x, b.cz - z);
        if (d < r * 1.3) this._darken(b, o.scorch * 0.5 * (1 - d / (r * 1.3)));
      }
    }
    if (loose) {
      // 공간 격자로 근처 파편만 검사
      for (const c of this._looseNear(x, z, r)) { if (c.state === GONE) continue; this.chunkPos(c); apply(c, c.state); }
    }
    return hit;
  }

  // 흩어진 파편 공간 격자 (프레임마다 갱신)
  _rebuildLooseGrid() {
    const G = this._lgrid; G.clear();
    for (const c of this.loose) {
      const k = Math.floor(c.x / 40) * 100003 + Math.floor(c.z / 40);
      let l = G.get(k); if (!l) { l = []; G.set(k, l); } l.push(c);
    }
    this._lgridFrame = this._frame;
  }
  *_looseNear(x, z, r) {
    if (this._lgridFrame !== this._frame || this._lgridDirty) { this._rebuildLooseGrid(); this._lgridDirty = false; }
    const c0 = Math.floor((x - r) / 40), c1 = Math.floor((x + r) / 40), d0 = Math.floor((z - r) / 40), d1 = Math.floor((z + r) / 40);
    if ((c1 - c0 + 1) * (d1 - d0 + 1) > this._lgrid.size) { yield* this.loose; return; }
    for (let i = c0; i <= c1; i++) for (let j = d0; j <= d1; j++) {
      const l = this._lgrid.get(i * 100003 + j); if (l) yield* l;
    }
  }

  // 수직 기둥(레이저) - xz 거리 기준
  laser(x, z, r, dt) {
    const blds = this.buildingsNear(x, z, r + 2);
    for (const b of blds) if (b.state === 'intact') this._fractureSoon(b, 0);
    let n = 0;
    for (const b of blds) {
      if (b.state !== 'fractured') continue;
      for (const c of b.chunks) {
        if (c.state !== FIXED) continue;
        const d = Math.hypot(c.x - x, c.z - z);
        if (d < r * 0.65) { this.removeChunk(c); this.hooks.onVaporize && this.hooks.onVaporize(c); n++; }
        else if (d < r * 1.3) this._darkenChunk(c, dt * 2);
      }
    }
    for (const c of this.loose) {
      if (c.state === GONE) continue;
      this.chunkPos(c);
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < r * 0.6) { this.removeChunk(c); n++; }
      else if (d < r * 1.6 && c.state === DYN) {
        const m = c.body.mass();
        c.body.applyImpulse({ x: (c.x - x) / d * m * 6 * dt, y: m * 9 * dt, z: (c.z - z) / d * m * 6 * dt }, true);
      }
    }
    for (const b of blds) this._dirty.add(b);
    return n;
  }

  // 회오리/블랙홀용 힘장. mode: 'vortex' | 'gravity'
  // 힘장: gravity(블랙홀) / vortex(회오리) / lift(반중력) / slam(반중력 해제)
  field(o, dt) {
    const { x, y, z, r, mode } = o;
    const grab = o.grab || 0;
    let consumed = 0;
    if (mode === 'slam') {
      // 떠 있던 모든 파편을 아래로 내리꽂음
      for (const c of this._looseNear(x, z, r)) {
        if (c.state !== DYN) continue;
        const m = c.body.mass();
        c.body.setGravityScale(1, true); c.float = false; c.age = 0;
        c.body.applyImpulse({ x: (Math.random() - 0.5) * m * 4, y: -m * 35, z: (Math.random() - 0.5) * m * 4 }, true);
      }
      return 0;
    }
    if (grab > 0) {
      const blds = this.buildingsNear(x, z, grab);
      for (const b of blds) {
        if (b.state === 'intact') this._fractureSoon(b, 1);
        if (b.state !== 'fractured') continue;
        for (const c of b.chunks) {
          if (c.state !== FIXED) continue;
          let d, rate;
          if (mode === 'gravity') { d = Math.hypot(c.x - x, (c.y - y) * 0.35, c.z - z); rate = (2.5 + (c.top ? 4 : 0)) * (o.consume ? 3 : 1); }
          else if (mode === 'lift') { d = Math.hypot(c.x - x, c.z - z); rate = 0.9 + (c.top ? 0.6 : 0); }
          else { d = Math.hypot(c.x - x, c.z - z); rate = 4 + (c.top ? 7 : 0) + (c.k > 2 ? 2 : 0); } // 회오리: 지붕부터 뜯김
          if (d < grab && Math.random() < dt * rate * (1.3 - d / grab)) {
            const m = c.body.mass();
            if (mode === 'lift') { this.release(c, 0, m * (2 + Math.random() * 3), 0, 0.15); if (c.state === DYN) { c.body.setGravityScale(-0.35, true); c.float = true; } }
            else this.release(c, (x - c.x) * m * 0.05, m * (mode === 'gravity' ? 8 : 4), (z - c.z) * m * 0.05, 0.5);
          }
        }
        this._dirty.add(b);
      }
    }
    for (const c of this._looseNear(x, z, r)) {
      if (c.state === GONE) continue;
      this.chunkPos(c);
      const dx = x - c.x, dy = y - c.y, dz = z - c.z;
      const dh = Math.hypot(dx, dz);
      const d = Math.hypot(dx, dy, dz);
      if ((mode === 'gravity' ? d : dh) > r) continue;
      if (c.state === FROZEN) { this.release(c); if (c.state !== DYN) continue; }
      const m = c.body.mass();
      if (mode === 'gravity') {
        if (d < o.core) { this.removeChunk(c); if (this.eaten.length < 5000) this.eaten.push(c); consumed++; continue; }
        const s = o.strength * m * dt / Math.max(0.15, (d / r) ** 1.2);
        const tx = -dz / (dh + 0.01), tz = dx / (dh + 0.01);
        c.body.applyImpulse({ x: (dx / d + tx * 0.35) * s, y: (dy / d) * s, z: (dz / d + tz * 0.35) * s }, true);
        const damp = 1 - (o.consume ? 1.2 : 0.6) * dt;
        c.body.scaleLinvel(damp, damp, damp);
      } else if (mode === 'lift') {
        // 천천히 떠오르며 회전, 너무 높이 가면 멈춤
        if (!c.float) { c.body.setGravityScale(-0.35, true); c.float = true; }
        const lv = c.body.linvel();
        const hgt = c.y - y;
        const cap = hgt > r * 0.9 ? 0.4 : 1;
        c.body.setLinvel({ x: lv.x * (1 - 0.8 * dt), y: Math.min(lv.y, 7) * cap, z: lv.z * (1 - 0.8 * dt) }, true);
        if (Math.random() < dt * 0.6) c.body.applyTorqueImpulse({ x: (Math.random() - 0.5) * m, y: (Math.random() - 0.5) * m, z: (Math.random() - 0.5) * m }, true);
      } else {
        // 회오리: 접선 + 상승 + 약한 구심, 꼭대기에서 바깥으로 내던짐
        const f = 1 - dh / r;
        const tx = -dz / (dh + 0.01), tz = dx / (dh + 0.01);
        const s = o.strength * m * dt;
        const height = c.y - y;
        const up = height < o.height ? 1.35 : -0.2;
        c.body.applyImpulse({ x: (tx * 1.3 + dx / (dh + 0.1) * 0.6) * s * f, y: up * s * (0.4 + f), z: (tz * 1.3 + dz / (dh + 0.1) * 0.6) * s * f }, true);
        if (height > o.height) c.body.applyImpulse({ x: -dx / (dh + 0.1) * s * 1.1, y: 0, z: -dz / (dh + 0.1) * s * 1.1 }, true);
      }
    }
    return consumed;
  }

  // 선분 관통 (레일건)
  lineBlast(a, b, r, power) {
    const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const L = Math.hypot(ab.x, ab.y, ab.z) || 1;
    const u = { x: ab.x / L, y: ab.y / L, z: ab.z / L };
    const segD = (px, py, pz) => {
      const t = Math.max(0, Math.min(L, (px - a.x) * u.x + (py - a.y) * u.y + (pz - a.z) * u.z));
      return Math.hypot(px - a.x - u.x * t, py - a.y - u.y * t, pz - a.z - u.z * t);
    };
    let hit = 0;
    const push = (c) => {
      const d = segD(c.x, c.y, c.z);
      if (d > r) return;
      if (d < r * 0.45) { this.removeChunk(c); this.hooks.onVaporize && this.hooks.onVaporize(c); hit++; return; }
      const m = c.body.mass(), f = 1 - d / r;
      this.release(c, u.x * m * power * f, (u.y * power * f + 4) * m, u.z * m * power * f, 1);
      hit++;
    };
    const seen = new Set();
    for (let t = 0; t <= L; t += 30) {
      const px = a.x + u.x * t, pz = a.z + u.z * t, py = a.y + u.y * t;
      for (const bd of this.buildingsNear(px, pz, r + 20)) {
        if (seen.has(bd)) continue;
        if (py < bd.baseY - r || py > bd.baseY + bd.height + r) continue;
        seen.add(bd);
        // 조각화가 다음 프레임으로 밀리면 그때 관통 효과를 적용
        if (!this._fractureSoon(bd, 0) && bd.pending) bd.pending.blasts.push((b2) => { for (const c of b2.chunks) if (c.state === FIXED) push(c); });
      }
    }
    for (const bd of seen) { if (bd.state === 'fractured') for (const c of bd.chunks) if (c.state === FIXED) push(c); this._dirty.add(bd); }
    for (const c of this.loose) { if (c.state === GONE) continue; this.chunkPos(c); push(c); }
    return hit;
  }

  // 쓰나미: 진행 방향 띠 안의 건물·파편을 밀어냄
  sweep(o, dt) {
    const { ox, oz, dx, dz, prev, front, halfW, waterY, power } = o;
    const sx = -dz, sz = dx;
    const proj = (x, z) => [(x - ox) * dx + (z - oz) * dz, (x - ox) * sx + (z - oz) * sz];
    const cx = ox + dx * front, cz = oz + dz * front;
    const blds = this.buildingsNear(cx, cz, halfW + 60);
    for (const b of blds) {
      const [s, l] = proj(b.cx, b.cz);
      const ext = Math.max(b.maxx - b.minx, b.maxz - b.minz) / 2;
      if (s - ext > front || s + ext < prev || Math.abs(l) > halfW + ext) continue;
      if (b.baseY > waterY) continue;
      if (b.state === 'intact') this._fractureSoon(b, 1);
      if (b.state !== 'fractured') continue;
      for (const c of b.chunks) {
        if (c.state !== FIXED) continue;
        const [cs] = proj(c.x, c.z);
        if (cs > front || c.y > waterY + 4) continue;
        if (Math.random() < 0.55) {
          const m = c.body.mass();
          this.release(c, dx * m * power, m * (3 + Math.random() * 4), dz * m * power, 0.6);
        }
      }
      this._dirty.add(b);
    }
    for (const c of this._looseNear(cx, cz, halfW + 60)) {
      if (c.state === GONE) continue;
      this.chunkPos(c);
      const [s, l] = proj(c.x, c.z);
      if (s > front || s < front - 70 || Math.abs(l) > halfW || c.y > waterY + 6) continue;
      if (c.state === FROZEN) { this.release(c); if (c.state !== DYN) continue; }
      const m = c.body.mass();
      c.body.applyImpulse({ x: dx * m * power * dt * 3, y: m * 14 * dt, z: dz * m * power * dt * 3 }, true);
    }
  }

  // 싱크홀: 아래로 빨려 들어감
  sink(x, z, r, dt, pull) {
    for (const b of this.buildingsNear(x, z, r)) {
      if (Math.hypot(b.cx - x, b.cz - z) > r + 10) continue;
      if (b.state === 'intact') this._fractureSoon(b, 1);
      if (b.state !== 'fractured') continue;
      for (const c of b.chunks) {
        if (c.state !== FIXED) continue;
        const d = Math.hypot(c.x - x, c.z - z);
        if (d > r) continue;
        const low = c.k <= (b.colMin.get(c.i + ',' + c.j) || 0) + 1;
        if (Math.random() < dt * (low ? 2.5 : 0.4) * (1.2 - d / r)) {
          const m = c.body.mass();
          this.release(c, (x - c.x) * m * 0.08, -m * 4, (z - c.z) * m * 0.08, 0.3);
        }
      }
      this._dirty.add(b);
    }
    for (const c of this._looseNear(x, z, r)) {
      if (c.state !== DYN && c.state !== FROZEN) continue;
      this.chunkPos(c);
      const d = Math.hypot(c.x - x, c.z - z);
      if (d > r) continue;
      if (c.state === FROZEN) { this.release(c); if (c.state !== DYN) continue; }
      const m = c.body.mass();
      c.body.applyImpulse({ x: (x - c.x) / (d + 1) * m * pull * dt, y: -m * pull * dt, z: (z - c.z) / (d + 1) * m * pull * dt }, true);
    }
  }

  // 네이팜: 불에 타며 서서히 약해짐
  burn(x, z, r, dt) {
    for (const b of this.buildingsNear(x, z, r)) {
      const d = Math.hypot(b.cx - x, b.cz - z);
      if (d > r + 15) continue;
      if (b.state === 'intact') {
        this._darken(b, dt * 0.3);
        if (Math.random() < dt * 0.7) this._fractureSoon(b, 0);
        continue;
      }
      if (b.state !== 'fractured') continue;
      for (const c of b.chunks) {
        if (c.state !== FIXED) continue;
        if (Math.hypot(c.x - x, c.z - z) > r) continue;
        if (Math.random() < dt * 0.8) this._darkenChunk(c, 0.1);
        if (Math.random() < dt * (c.k <= 1 ? 0.3 : 0.12)) this.release(c, 0, 0, 0, 0.2);
      }
      this._dirty.add(b);
    }
  }


  // 지진: 반경 내 건물에 무작위 손상 + 진동
  quake(x, z, r, intensity, dt) {
    const blds = this.buildingsNear(x, z, r);
    for (const b of blds) {
      const d = Math.hypot(b.cx - x, b.cz - z);
      const f = Math.max(0, 1 - d / r) * intensity;
      const tall = Math.min(1.6, b.height / 25);
      if (b.state === 'intact') {
        if (Math.random() < dt * f * 0.5 * (0.5 + tall)) this._fractureSoon(b, d < r * 0.4 ? 0 : 1);
        continue;
      }
      if (b.state !== 'fractured') continue;
      // 저층 기둥이 무작위로 부서짐 → 연쇄 붕괴
      let broke = 0;
      for (const c of b.chunks) {
        if (c.state !== FIXED) continue;
        const low = c.k <= 2 ? 2.2 : 0.35;
        if (Math.random() < dt * f * 0.22 * low * (0.6 + tall)) {
          const m = c.body.mass();
          this.release(c, (Math.random() - 0.5) * m * 3 * f, m * 0.5, (Math.random() - 0.5) * m * 3 * f, 0.8);
          broke++;
          if (broke > 6) break;
        }
      }
      if (broke) this._dirty.add(b);
    }
    for (const c of this.dynamic) {
      if (Math.random() > 0.3) continue;
      this.chunkPos(c);
      const d = Math.hypot(c.x - x, c.z - z);
      if (d > r) continue;
      const m = c.body.mass(), f = (1 - d / r) * intensity;
      c.body.applyImpulse({ x: (Math.random() - 0.5) * m * f * 2, y: Math.random() * m * f * 0.8, z: (Math.random() - 0.5) * m * f * 2 }, true);
    }
  }

  // ---------- 철구 ----------
  addBall(pos, vel, radius, mesh, opts = {}) {
    const body = this.phys.ball(pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, radius);
    const ball = { body, radius, mesh, age: 0, life: opts.life || 40, onHit: opts.onHit, hits: 0 };
    this.balls.push(ball);
    return ball;
  }
  _updateBalls(dt) {
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const ball = this.balls[i];
      ball.age += dt;
      const t = ball.body.translation(), v = ball.body.linvel(), q = ball.body.rotation();
      ball.mesh.position.set(t.x, t.y, t.z); ball.mesh.quaternion.set(q.x, q.y, q.z, q.w);
      const sp = Math.hypot(v.x, v.y, v.z);
      if (sp > 3) {
        const rr = ball.radius + 1.5;
        const blds = this.buildingsNear(t.x, t.z, rr);
        for (const b of blds) {
          if (t.y - rr > b.baseY + b.height || t.y + rr < b.baseY) continue;
          if (b.state === 'intact') { if (this._fractureSoon(b, 0)) { this.hooks.onImpact && this.hooks.onImpact(t, sp); ball.hits++; ball.onHit && ball.onHit(b); } }
          if (b.state !== 'fractured') continue;
          for (const c of b.chunks) {
            if (c.state !== FIXED) continue;
            const d = Math.hypot(c.x - t.x, c.y - t.y, c.z - t.z);
            if (d < ball.radius + c.size * 0.7) {
              const m = c.body.mass();
              const k = Math.min(1.2, sp / 25);
              this.release(c, v.x * m * k * 0.7 + (c.x - t.x) * m * 0.3, (v.y * 0.4 + 2) * m * k, v.z * m * k * 0.7 + (c.z - t.z) * m * 0.3, 0.6);
            }
          }
          this._dirty.add(b);
        }
      }
      if (ball.age > ball.life || t.y < -300) {
        this.phys.remove(ball.body);
        ball.mesh.parent && ball.mesh.parent.remove(ball.mesh);
        this.balls.splice(i, 1);
      }
    }
  }

  // ---------- 레이캐스트 (메인 스레드에서 직접 계산) ----------
  raycast(o, d, maxDist = 6000) {
    let best = maxDist, info = null;
    // 1) 지형
    const tg = this._rayTerrain(o, d, best);
    if (tg !== null) { best = tg; info = { terrain: true }; }
    // 2) 건물 / 조각 후보: 광선을 따라 공간 해시 칸을 훑음
    const seen = new Set();
    const step = 30;
    for (let t = 0; t <= best + step; t += step) {
      const px = o.x + d.x * t, pz = o.z + d.z * t;
      const l = this.hash.get(Math.floor(px / 60) + ',' + Math.floor(pz / 60));
      if (!l) continue;
      for (const b of l) {
        if (seen.has(b)) continue;
        seen.add(b);
        if (b.state === 'intact' || b.state === 'flat') {
          const th = this._rayPrism(o, d, b, best);
          if (th !== null) { best = th; info = { b }; }
        } else if (b.state === 'fractured') {
          // 건물 전체 상자에 먼저 닿는지 확인 후 조각 검사
          if (this._rayPrism(o, d, b, best, 3) === null && !this._rayInsideBox(o, b)) continue;
          for (const c of b.chunks) {
            if (c.state !== FIXED) continue;
            const tc = raySphere(o, d, c.x, c.y, c.z, c.size * 0.62, best);
            if (tc !== null) { best = tc; info = { chunk: c }; }
          }
        }
      }
    }
    // 3) 흩어진 파편
    if (this.loose.size) {
      if (this._lgridFrame !== this._frame || this._lgridDirty) { this._rebuildLooseGrid(); this._lgridDirty = false; }
      const cells = new Set();
      for (let t = 0; t <= best + 20; t += 20) cells.add(Math.floor((o.x + d.x * t) / 40) * 100003 + Math.floor((o.z + d.z * t) / 40));
      for (const k of cells) {
        const l = this._lgrid.get(k); if (!l) continue;
        for (const c of l) {
          if (c.state === GONE) continue;
          const tc = raySphere(o, d, c.x, c.y, c.z, c.size * 0.6, best);
          if (tc !== null) { best = tc; info = { chunk: c }; }
        }
      }
    }
    if (!info) return null;
    return { point: { x: o.x + d.x * best, y: o.y + d.y * best, z: o.z + d.z * best }, dist: best, info };
  }

  _rayTerrain(o, d, maxDist) {
    const g = this.grid, half = g.span / 2;
    const step = g.cell * 0.75;
    let t = 0, prevT = 0;
    // 지도 밖에서 시작하면 지도 안쪽으로 당겨서 시작
    if (o.y - g.sample(o.x, o.z) < 0) return 0;
    const lim = Math.min(maxDist, 40000);
    while (t <= lim) {
      const x = o.x + d.x * t, z = o.z + d.z * t, y = o.y + d.y * t;
      if (Math.abs(x) > half * 1.02 || Math.abs(z) > half * 1.02) { if (d.y >= 0) return null; }
      if (y < g.sample(x, z)) {
        let a = prevT, b = t;
        for (let i = 0; i < 10; i++) {
          const m = (a + b) / 2;
          const mx = o.x + d.x * m, mz = o.z + d.z * m, my = o.y + d.y * m;
          if (my < g.sample(mx, mz)) b = m; else a = m;
        }
        return b;
      }
      prevT = t;
      // 높이 여유가 크면 크게 건너뜀
      const clear = y - g.sample(x, z);
      t += Math.max(step, Math.min(clear * 0.5, 200));
    }
    return null;
  }

  _rayInsideBox(o, b) {
    return o.x > b.minx && o.x < b.maxx && o.z > b.minz && o.z < b.maxz && o.y > b.baseY && o.y < b.baseY + b.height;
  }

  // 각기둥(건물 외곽)과 광선 교차. pad > 0 이면 외곽을 넓혀 대략 검사
  _rayPrism(o, d, b, maxT, pad = 0) {
    const y0 = b.baseY + (b.minH > 0.5 ? b.minH : -5) - pad, y1 = b.baseY + (b.state === 'flat' ? b.flatH : b.height) + pad;
    let best = null;
    if (pad) {
      // 축 정렬 상자 근사
      const tmin = slab(o, d, b.minx - pad, y0, b.minz - pad, b.maxx + pad, y1, b.maxz + pad);
      return tmin !== null && tmin < maxT ? tmin : null;
    }
    // 지붕
    if (Math.abs(d.y) > 1e-6) {
      const t = (y1 - o.y) / d.y;
      if (t > 0 && t < maxT) {
        const px = o.x + d.x * t, pz = o.z + d.z * t;
        if (px >= b.minx && px <= b.maxx && pz >= b.minz && pz <= b.maxz && pointInPoly([px, pz], b.pts)) { best = t; maxT = t; }
      }
    }
    // 벽
    const pts = b.pts, n = pts.length;
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      const ex = q[0] - p[0], ez = q[1] - p[1];
      const den = d.x * ez - d.z * ex;
      if (Math.abs(den) < 1e-9) continue;
      const wx = p[0] - o.x, wz = p[1] - o.z;
      const t = (wx * ez - wz * ex) / den;
      if (t <= 0 || t >= maxT) continue;
      const u = (wx * d.z - wz * d.x) / den;
      if (u < 0 || u > 1) continue;
      const y = o.y + d.y * t;
      if (y < y0 || y > y1) continue;
      best = t; maxT = t;
    }
    return best;
  }

  // ---------- 매 프레임 ----------
  update(dt) {
    this._frame++;
    const tStep = performance.now();
    this.phys.step(dt);
    PROF.add('step', performance.now() - tStep);
    this._stepMs = this.phys.stepMs;
    const tSync = performance.now();
    const simDt = this.phys.takeSimDt();

    const m = this._m, q = this._q, v = this._v, s = this._s;
    // PC 성능에 맞춰 동시에 움직이는 조각 상한을 자동 조절 (목표: 물리 스텝 8ms 이하)
    const target = 8;
    const want = this._stepMs > target ? this.quality.maxDynamic * target / this._stepMs : this.quality.maxDynamic;
    this.dynBudget = Math.round(Math.max(250, Math.min(this.quality.maxDynamic, (this.dynBudget || this.quality.maxDynamic) * 0.9 + want * 0.1)));
    const budget = this.dynBudget;
    this._fast = [];
    this._dustBudget = Math.min(6, this._dustBudget + dt * 30);
    for (const c of this.dynamic) {
      const t = c.body.translation(), r = c.body.rotation();
      c.x = t.x; c.y = t.y; c.z = t.z;
      m.compose(v.set(t.x, t.y, t.z), q.set(r.x, r.y, r.z, r.w), s);
      c.batch.setMatrixAt(c.inst, m);
      c.age += simDt;
      if (t.y < this.grid.sample(t.x, t.z) - 60 || t.y < -400) { this.removeChunk(c); continue; }
      const lv = c.body.linvel();
      // 지면 충돌 먼지
      if (c.pvy < -7 && lv.y > -2.5 && this._dustBudget > 1 && c.size > 1.2) {
        this._dustBudget -= 1;
        this.hooks.onDust && this.hooks.onDust(t, c.size);
      }
      c.pvy = lv.y;
      const sp2 = lv.x * lv.x + lv.y * lv.y + lv.z * lv.z;
      // 계속 느린 상태 = 무언가 위에 놓여 있음 (공중에서는 중력 때문에 오래 느릴 수 없음)
      if (sp2 < 0.8) c.slowT += simDt; else c.slowT = 0;
      c.air = t.y - this.grid.sample(t.x, t.z) - c.size;
      if (sp2 > 140) this._fast.push(c);
      if (c.float) { /* 반중력·잡기로 떠 있는 동안은 정지시키지 않음 */ }
      else if (c.body.isSleeping() || c.slowT > 0.6 || (c.age > 25 && c.air < c.size * 1.5)) this._freeze(c);
    }
    // 예산 초과: 놓여 있거나 바닥 가까운 것부터 고정, 그래도 넘치면 공중의 작은 파편은 먼지로 (공중 고정 금지)
    if (this.phys.dynCount > budget * 1.05) {
      const arr = [...this.dynamic].filter(c => !c.float && !c.body.light).sort((a, b) => (b.slowT - a.slowT) || (a.air - b.air));
      let over = this.phys.dynCount - budget;
      for (const c of arr) {
        if (over <= 0) break;
        if (c.slowT > 0.1 || c.air < c.size * 1.2) { this._freeze(c); over--; }
      }
      if (over > 0) {
        arr.sort((a, b) => a.size - b.size);
        for (const c of arr) {
          if (over <= 0) break;
          if (c.state !== DYN || c.size > 3.5) continue;
          if (this._dustBudget > 0.5 && this.hooks.onDust) { this._dustBudget -= 0.5; this.hooks.onDust({ x: c.x, y: c.y, z: c.z }, c.size); }
          this.removeChunk(c); over--;
        }
      }
    }
    this._impacts();
    this._processWake();
    PROF.add('sync', performance.now() - tSync);
    this._updateBalls(dt);
    // 연쇄 압괴: 무너진 위층 질량이 아래층을 차례로 짓누름
    for (const b of this._crushing) {
      const cr = b.crush;
      cr.t += simDt;
      const interval = 0.06 + (b.height / b.nL) / 45;
      while (cr.t > interval && cr.k >= 0) {
        cr.t -= interval;
        let n = 0;
        for (const c of b.chunks) {
          if (c.k !== cr.k || c.state !== FIXED) continue;
          const m = c.body.mass();
          const tx = b.tilt ? b.tilt[0] : 0, tz = b.tilt ? b.tilt[1] : 0;
          this.release(c, (tx * 1.5 + (Math.random() - 0.5) * 3) * m, -3 * m, (tz * 1.5 + (Math.random() - 0.5) * 3) * m, 0.5);
          n++;
        }
        cr.mom -= Math.max(1, n) * 0.55;
        cr.k--;
        if (n && Math.random() < 0.5) this.hooks.onCrush && this.hooks.onCrush(b, cr.k);
        if (cr.mom <= 0) { cr.k = -1; break; }
      }
      if (cr.k < 0) this._crushing.delete(b);
    }
    if (this._terrainT >= 0) { this._terrainT -= dt; if (this._terrainT < 0 && this._fracSpent < this.fracBudgetMs) this._buildTerrainCollider(); else if (this._terrainT < 0) this._terrainT = 0.05; }
    this._updateAnims(dt);
    this._processPending();
    this._trimRubble();
    // 구조 계산 (프레임당 제한)
    let n = 0;
    for (const b of this._dirty) { this._dirty.delete(b); this._support(b); if (++n >= 8) break; }
    this._fracSpent = 0; // 다음 프레임 예산
  }

  // ---------- 무기용 도우미 ----------
  // 반경 안 조각 모으기: 건물은 조각내고(예산 안에서) 고정 조각 포함, 흩어진 파편 포함
  gather(x, z, r, lod = 1, out = new Set()) {
    for (const b of this.buildingsNear(x, z, r)) {
      if (Math.hypot(b.cx - x, b.cz - z) > r + 8) continue;
      if (b.state === 'intact') this._fractureSoon(b, lod);
      if (b.state === 'fractured') { for (const c of b.chunks) if (c.state === FIXED) out.add(c); this._dirty.add(b); }
    }
    for (const c of this._looseNear(x, z, r)) { if (c.state === GONE) continue; this.chunkPos(c); if (Math.hypot(c.x - x, c.z - z) < r) out.add(c); }
    return out;
  }
  // 조각 하나를 움직이게 하고 속도를 직접 지정
  launch(c, vx, vy, vz, spin = 0) {
    if (c.state === GONE) return false;
    if (c.state !== DYN) this.release(c);
    if (c.state !== DYN) return false;
    c.body.setLinvel({ x: vx, y: vy, z: vz }, true);
    if (spin) { const m = c.body.mass() * spin; c.body.applyTorqueImpulse({ x: (Math.random() - 0.5) * m, y: (Math.random() - 0.5) * m, z: (Math.random() - 0.5) * m }, true); }
    return true;
  }
  // 건물 색을 영구히 바꿈 (얼음 등). 시간 역행 때 원래 색으로
  tint(b, color, k) {
    if (!b.col0) b.col0 = b.col.clone();
    b.col = b.col.clone().lerp(color, k);
    const col = this._c.copy(b.col).multiplyScalar(1 - Math.min(0.7, b.scorch));
    if (b.state === 'intact' || b.state === 'flat' || b.state === 'collapsing') this.intact.setColorAt(b.inst, col);
    else if (b.state === 'fractured') for (const c of b.chunks) if (c.state !== GONE) c.batch.setColorAt(c.inst, col);
  }
  // 사라졌던 조각을 다시 등장시킴 (화이트홀)
  respawn(c, x, y, z, vx, vy, vz) {
    if (c.state !== GONE) return false;
    const small = this.useLight && (c.vol < (this.quality.lightVol || 30) || this.phys.dynCount >= (this.dynBudget || this.quality.maxDynamic));
    if (small ? this.phys.lightCount >= (this.quality.maxLight || 20000) : this.phys.dynCount >= (this.dynBudget || this.quality.maxDynamic)) return false;
    c.body = small ? this.phys.light(x, y, z, null, c.mass, c.size * 0.55) : this.phys.chunk(x, y, z, c.shape, DENSITY, c.group, c.mass);
    c.body.setDynamic(true);
    c.body.setLinvel({ x: vx, y: vy, z: vz }, true);
    const m = c.body.mass();
    c.body.applyTorqueImpulse({ x: (Math.random() - 0.5) * m * 3, y: (Math.random() - 0.5) * m * 3, z: (Math.random() - 0.5) * m * 3 }, true);
    c.batch.setVisibleAt(c.inst, true);
    c.x = x; c.y = y; c.z = z;
    c.state = DYN; c.age = 0; c.slowT = 0; c.float = false;
    this.dynamic.add(c); this.loose.add(c); this._lgridDirty = true;
    return true;
  }
  // 온전한 건물의 충돌체 다시 만들기
  _intactCollider(b) {
    const geo = buildingShell(b, b.baseY);
    const pos = geo.getAttribute('aOrig').array, idx = geo.index.array;
    b.bodyId = this.phys.trimesh(new Float32Array(pos), new Uint32Array(idx));
    geo.dispose();
  }
  // 시간 역행: 모든 건물 복원 (조각 건물은 조각을 원래 자리로 되돌림)
  // 반환: 되돌아가는 조각 목록 [{c, from:{p,q}}] → 애니메이션 후 finishRestore 호출
  beginRestore() {
    const moving = [];
    this._pendingQ = [];
    for (const b of this.buildings) {
      if (b.pending) { b.pending = null; }
      if (b.state === 'gone' && b.chunks && b.chunks.length) b.state = 'fractured';
      if (b.state === 'fractured') {
        for (const c of b.chunks) {
          if (c.state === FIXED) continue;
          let p, q;
          if (c.state === DYN || c.state === FROZEN) { const t = c.body.translation(), r = c.body.rotation(); p = { x: t.x, y: t.y, z: t.z }; q = { x: r.x, y: r.y, z: r.z, w: r.w }; this.phys.remove(c.body); }
          else { // 사라진 조각은 하늘에서 내려옴
            const a = Math.random() * 6.28, d = 30 + Math.random() * 120;
            p = { x: c.ox + Math.cos(a) * d, y: c.oy + 80 + Math.random() * 160, z: c.oz + Math.sin(a) * d }; q = { x: 0, y: 0, z: 0, w: 1 };
            c.batch.setVisibleAt(c.inst, true);
          }
          this.dynamic.delete(c); this.loose.delete(c);
          c.state = -1; // 복원 중
          moving.push({ c, p, q, delay: Math.random() * 0.35 });
        }
      } else if (b.state === 'collapsing' || b.state === 'flat' || b.state === 'gone') {
        moving.push({ b });
      }
    }
    this._anim = this._anim.filter(a => !a.b || a.b.state === 'intact');
    this._crushing.clear && this._crushing.clear();
    return moving;
  }
  restoreStep(moving, k) {
    const m = this._m, q = this._q, q2 = new THREE.Quaternion(), v = this._v, s = this._s;
    for (const it of moving) {
      if (it.c) {
        const c = it.c;
        const u = Math.max(0, Math.min(1, (k - it.delay) / (1 - it.delay)));
        const e = u * u * (3 - 2 * u);
        v.set(it.p.x + (c.ox - it.p.x) * e, it.p.y + (c.oy - it.p.y) * e, it.p.z + (c.oz - it.p.z) * e);
        q.set(it.q.x, it.q.y, it.q.z, it.q.w).slerp(q2.identity(), e);
        m.compose(v, q, s); c.batch.setMatrixAt(c.inst, m);
        c.x = v.x; c.y = v.y; c.z = v.z;
      } else {
        const b = it.b;
        if (!it.started) {
          it.started = true;
          if (b.state === 'gone' && b.chunks && b.chunks.length) { it.skip = true; continue; }
          this.intact.setVisibleAt(b.inst, true);
          it.m0 = new THREE.Matrix4(); this.intact.getMatrixAt(b.inst, it.m0);
          if (b.state === 'gone') it.m0.makeTranslation(b.cx, b.baseY, b.cz).multiply(new THREE.Matrix4().makeScale(1, 0.01, 1)).multiply(new THREE.Matrix4().makeTranslation(-b.cx, -b.baseY, -b.cz));
        }
        if (it.skip) continue;
        // 바닥에서 솟아오르며 원래 모양으로
        const e = k * k * (3 - 2 * k);
        const p0 = new THREE.Vector3(), q0 = new THREE.Quaternion(), s0 = new THREE.Vector3();
        it.m0.decompose(p0, q0, s0);
        m.copy(it.m0);
        const sy = s0.y + (1 - s0.y) * e;
        m.makeTranslation(b.cx, b.baseY, b.cz);
        m.multiply(new THREE.Matrix4().makeRotationFromQuaternion(q0.slerp(q2.identity(), e)));
        m.multiply(new THREE.Matrix4().makeScale(1, Math.max(0.01, sy), 1));
        m.multiply(new THREE.Matrix4().makeTranslation(-b.cx, -b.baseY, -b.cz));
        this.intact.setMatrixAt(b.inst, m);
      }
    }
  }
  finishRestore(moving) {
    for (const it of moving) {
      if (it.c) {
        const c = it.c;
        c.body = this.phys.chunk(c.ox, c.oy, c.oz, c.shape, DENSITY, c.group, c.mass);
        c.x = c.ox; c.y = c.oy; c.z = c.oz;
        this._m.makeTranslation(c.ox, c.oy, c.oz); c.batch.setMatrixAt(c.inst, this._m);
        c.batch.setColorAt(c.inst, c.b.col);
        c.state = FIXED; c.age = 0; c.slowT = 0; c.float = false; c.sc = 0;
      } else if (!it.skip) {
        const b = it.b;
        this.intact.setMatrixAt(b.inst, this._m.identity());
        b.scorch = 0; this.intact.setColorAt(b.inst, b.col);
        if (!b.bodyId) this._intactCollider(b);
        b.state = 'intact'; b.flatH = 0;
      }
    }
    for (const b of this.buildings) {
      if (b.col0) { b.col = b.col0; b.col0 = null; }
      b.tilt = null; b.crush = null; b.blastDir = undefined;
      if (b.state === 'fractured') {
        b._cgDirty = true;
        b.released = 0; b.destroyedFlag = false; b.scorch = 0;
        for (const c of b.chunks) if (c.state === FIXED) c.batch.setColorAt(c.inst, b.col);
        this._dirty.delete(b);
      } else if (b.state === 'intact') { b.destroyedFlag = false; b.scorch = 0; this.intact.setColorAt(b.inst, b.col); }
    }
    this._settled = [];
    this.destroyed = 0; this.releasedVol = 0;
    this.eaten = [];
  }

  // ---------- 물리 없이 가볍게 처리하는 대규모 파괴 (핵 등) ----------
  // 건물 증발: 즉시 사라짐
  vaporizeBuilding(b) {
    if (b.state === 'gone') return;
    if (b.state === 'intact' || b.state === 'collapsing' || b.state === 'flat') {
      this.intact.setVisibleAt(b.inst, false);
      if (b.bodyId) { this.phys.remove(b.bodyId); b.bodyId = 0; }
      if (b.pending) b.pending = null;
      this._scoreBuilding(b, 1);
    } else if (b.state === 'fractured') {
      for (const c of b.chunks) if (c.state !== GONE) this.removeChunk(c);
    }
    b.state = 'gone';
    this._wakeArea(b);
  }
  _scoreBuilding(b, frac) {
    if (b.destroyedFlag) return;
    b.destroyedFlag = true; this.destroyed++;
    this.releasedVol += b.area * b.height * frac;
    this.score += Math.round(b.area * b.height * (2.5 + 14 * frac));
  }
  // 제자리 붕괴: 주저앉으며 기울어짐 (sev 0~1). 시각 효과 + 점수만, 물리 없음
  flatten(b, sev, dirx, dirz, dur = 1.6) {
    if (b.state !== 'intact') return;
    if (sev < 0.3) {
      // 약한 피해: 살짝 기울고 그을림
      this._darken(b, 0.15 + sev * 0.4);
      this._anim.push({ b, t: 0, dur: 0.6, sev: sev * 0.25, dirx, dirz, keep: true });
      return;
    }
    b.state = 'collapsing';
    if (b.bodyId) { this.phys.remove(b.bodyId); b.bodyId = 0; }
    this._scoreBuilding(b, 0.6 + 0.4 * sev);
    this._anim.push({ b, t: 0, dur: dur * (0.8 + Math.random() * 0.5), sev, dirx, dirz });
    this._wakeArea(b);
    if (this.hooks.onFlatten) this.hooks.onFlatten(b, sev);
  }
  _updateAnims(dt) {
    if (!this._anim.length) return;
    const m = this._m, M2 = new THREE.Matrix4(), q = this._q, axis = this._v;
    for (let i = this._anim.length - 1; i >= 0; i--) {
      const a = this._anim[i], b = a.b;
      if (b.state === 'gone' || b.state === 'fractured') { this._anim.splice(i, 1); continue; }
      a.t += dt;
      const u = Math.min(1, a.t / a.dur), e = u * u * (3 - 2 * u);
      if (a.lift) {
        // 통째로 하늘로 떠올라 사라짐 (반중력·중력 반전 세계 멸망)
        const k = Math.max(0, (a.t - a.wait) / a.dur);
        const h = a.lift * k * k, ang = a.spin * k;
        q.setFromAxisAngle(axis.set(a.ax, 0.3, a.az).normalize(), ang);
        m.makeTranslation(b.cx, b.baseY + b.height * 0.5 + h, b.cz);
        m.multiply(M2.makeRotationFromQuaternion(q));
        m.multiply(M2.makeTranslation(-b.cx, -b.baseY - b.height * 0.5, -b.cz));
        this.intact.setMatrixAt(b.inst, m);
        if (k >= 1) { this.intact.setVisibleAt(b.inst, false); b.state = 'gone'; this._anim.splice(i, 1); }
        continue;
      }
      const minS = a.keep ? 1 : Math.max(0.06, Math.min(0.5, 6 / b.height)) + (1 - a.sev) * 0.25;
      const sy = 1 - (1 - minS) * e;
      const tilt = (a.keep ? a.sev * 0.12 : a.sev * 0.28) * e;
      axis.set(a.dirz, 0, -a.dirx).normalize();
      q.setFromAxisAngle(axis, tilt);
      // 바닥 중심을 축으로: T(p) R S T(-p)
      m.makeTranslation(b.cx, b.baseY, b.cz);
      m.multiply(M2.makeRotationFromQuaternion(q));
      m.multiply(M2.makeScale(1, sy, 1));
      m.multiply(M2.makeTranslation(-b.cx, -b.baseY, -b.cz));
      this.intact.setMatrixAt(b.inst, m);
      if (!a.keep) this.intact.setColorAt(b.inst, this._c.copy(b.col).multiplyScalar(1 - Math.min(0.8, b.scorch + 0.45 * e)));
      if (u >= 1) {
        if (!a.keep) { b.state = 'flat'; b.flatH = b.height * sy; }
        this._anim.splice(i, 1);
      }
    }
  }
  // 건물 통째로 하늘로 (물리 없이)
  levitate(b, height = 3000, dur = 8, wait = 0) {
    if (b.state !== 'intact') return;
    b.state = 'collapsing';
    if (b.bodyId) { this.phys.remove(b.bodyId); b.bodyId = 0; }
    this._scoreBuilding(b, 1);
    this._anim.push({ b, t: 0, dur, wait, lift: height * (0.7 + Math.random() * 0.6), spin: (Math.random() - 0.5) * 3, ax: Math.random() - 0.5, az: Math.random() - 0.5 });
    this._wakeArea(b);
  }
  // 특정 건물에 외부 폭원(q)에서 오는 충격 적용 (조각화 + 날림)
  blastFrom(b, q, power, opts = {}) {
    const d = Math.hypot(b.cx - q.x, b.cz - q.z);
    const o = { x: q.x, y: q.y + (opts.dy || 10), z: q.z, r: d * 1.5 + 60, power, lift: opts.lift ?? 0.25, scorch: opts.scorch ?? 0.5 };
    if (b.state === 'intact') {
      if (!this._fractureSoon(b, opts.lod ?? 1)) { if (b.pending) b.pending.blasts.push(o); return; }
    }
    if (b.state === 'fractured') { this._blastChunks(o, [b], false); this._dirty.add(b); if (b.blastDir === undefined) b.blastDir = Math.atan2(b.cz - q.z, b.cx - q.x); }
  }
  // 고리 모양 충격파가 흩어진 파편을 바깥으로 밀어냄
  ringPush(q, r0, r1, power, lift = 0.25) {
    for (const c of this.loose) {
      if (c.state === GONE) continue;
      const dx = c.x - q.x, dz = c.z - q.z, d = Math.hypot(dx, dz);
      if (d < r0 || d > r1) continue;
      if (c.state === FROZEN) { this.release(c); if (c.state !== DYN) continue; }
      const m = c.mass, k = power / Math.max(1, d) * m;
      c.body.applyImpulse({ x: dx * k, y: m * power * lift, z: dz * k });
    }
  }

  // 가벼운 파편 충돌: 지면 + 온전한 건물(지붕·벽) + 부서진 건물의 남은 조각
  _lightCollide(lb, h) {
    const p = lb.p, v = lb.v, r = lb.r;
    let hit = false;
    const list = this.hashN.get(Math.floor(p.x / 60) * 100003 + Math.floor(p.z / 60));
    if (list) for (const bd of list) {
      if (p.x < bd.minx - r || p.x > bd.maxx + r || p.z < bd.minz - r || p.z > bd.maxz + r) continue;
      if (p.y - r > bd.baseY + bd.height || p.y + r < bd.baseY) continue;
      if (bd.state === 'intact' || bd.state === 'flat') {
        const top = bd.baseY + (bd.state === 'flat' ? bd.flatH : bd.height);
        if (p.y - r > top || !pointInPoly([p.x, p.z], bd.pts)) continue;
        if (lb.py - r >= top - 1 || p.y > top - r * 0.5) { p.y = top + r; if (v.y < 0) v.y = -v.y * 0.2; v.x *= 0.8; v.z *= 0.8; }
        else { p.x = lb.px; p.z = lb.pz; v.x *= -0.3; v.z *= -0.3; }
        hit = true;
      } else if (bd.state === 'fractured') {
        if (bd._cgDirty !== false) this._buildChunkGrid(bd);
        const cell = bd._cg.get(Math.floor(p.x / 6) * 73856093 ^ Math.floor(p.y / 6) * 19349663 ^ Math.floor(p.z / 6) * 83492791);
        if (!cell) continue;
        for (const c of cell) {
          if (c.state !== FIXED) continue;
          const cr = c.size * 0.6 + r, dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z, d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= cr * cr) continue;
          const d = Math.sqrt(d2) || 1e-3, push = cr - d;
          p.x += dx / d * push; p.y += dy / d * push; p.z += dz / d * push;
          const vn = (v.x * dx + v.y * dy + v.z * dz) / d;
          if (vn < 0) { v.x -= 1.25 * vn * dx / d; v.y -= 1.25 * vn * dy / d; v.z -= 1.25 * vn * dz / d; v.x *= 0.85; v.z *= 0.85; }
          hit = true;
        }
      }
    }
    const gy = this.grid.sample(p.x, p.z);
    if (p.y - r < gy) { p.y = gy + r; if (v.y < 0) v.y = -v.y * 0.25; v.x *= 0.8; v.z *= 0.8; hit = true; }
    return hit;
  }
  // 부서진 건물의 남은 조각을 6m 칸에 넣어 둠 (칸 경계에 걸치게 주변 칸에도 등록)
  _buildChunkGrid(bd) {
    const g = new Map();
    for (const c of bd.chunks) {
      if (c.state !== FIXED) continue;
      const e = c.size * 0.6 + 1.5;
      for (let x = Math.floor((c.x - e) / 6); x <= Math.floor((c.x + e) / 6); x++)
        for (let y = Math.floor((c.y - e) / 6); y <= Math.floor((c.y + e) / 6); y++)
          for (let z = Math.floor((c.z - e) / 6); z <= Math.floor((c.z + e) / 6); z++) {
            const k = x * 73856093 ^ y * 19349663 ^ z * 83492791;
            let l = g.get(k); if (!l) { l = []; g.set(k, l); } l.push(c);
          }
    }
    bd._cg = g; bd._cgDirty = false;
  }

  // 받침(조각·건물)이 사라지면 그 위에 고정돼 있던 파편을 깨움 → 공중에 떠 있는 잔해 방지
  _processWake() {
    const q = this._wakeQ;
    let n = 0;
    while (q.length && n < 400) {
      const s = q.pop(), z = q.pop(), y = q.pop(), x = q.pop();
      n++;
      for (const c of this._looseNear(x, z, s + 4)) {
        if (c.state !== FROZEN || c.y < y + c.size * 0.3) continue; // 위에 얹혀 있던 것만
        const lim = (s + c.size) * 0.75 + 0.5;
        if (Math.abs(c.x - x) > lim || Math.abs(c.z - z) > lim) continue;
        if (c.y - this.grid.sample(c.x, c.z) < c.size * 1.2) continue; // 이미 땅바닥
        if (!c.body.light && this.phys.dynCount >= (this.dynBudget || this.quality.maxDynamic) && c.size < 3) { this.removeChunk(c); continue; }
        this.release(c, 0, 0, 0, 0, true);
      }
    }
    if (q.length > 60000) q.length = 0;
  }
  _wakeArea(b) { const e = Math.max(b.maxx - b.minx, b.maxz - b.minz) / 2; this._wakeQ.push(b.cx, b.baseY, b.cz, e); }

  // 빠르게 날아가는 큰 파편이 다른 건물에 부딪히면 그 건물도 부서짐 (도미노·볼링·던지기·연쇄 붕괴)
  _impacts() {
    const list = this._fast;
    if (!list.length) return;
    let n = 0;
    const start = this._impactIdx % list.length;
    for (let k = 0; k < list.length && n < 90; k++) {
      const c = list[(start + k) % list.length];
      if (c.size < 1.6 || c.state !== DYN) continue;
      n++;
      const v = c.body.linvel();
      const sp = Math.hypot(v.x, v.y, v.z);
      const reach = c.size * 0.9;
      for (const b of this.buildingsNear(c.x, c.z, reach)) {
        if (b === c.b) continue;
        if (c.y < b.baseY - reach || c.y > b.baseY + b.height + reach) continue;
        if (b.state === 'intact') {
          // 각기둥 안쪽(또는 가장자리)에 들어왔는지
          if (!(c.x > b.minx - reach && c.x < b.maxx + reach && c.z > b.minz - reach && c.z < b.maxz + reach)) continue;
          if (!pointInPoly([c.x, c.z], b.pts) && Math.max(c.x - b.maxx, b.minx - c.x, c.z - b.maxz, b.minz - c.z) > reach * 0.4) continue;
          b.tilt = b.tilt || [v.x / (Math.hypot(v.x, v.z) || 1), v.z / (Math.hypot(v.x, v.z) || 1)];
          b.blastDir = Math.atan2(v.z, v.x);
          if (!this._fractureSoon(b, 0)) continue;
          this.hooks.onImpact && this.hooks.onImpact({ x: c.x, y: c.y, z: c.z }, sp);
        }
        if (b.state !== 'fractured') continue;
        let hit = 0;
        for (const cc of b.chunks) {
          if (cc.state !== FIXED) continue;
          const d = Math.hypot(cc.x - c.x, cc.y - c.y, cc.z - c.z);
          if (d > c.size + cc.size * 0.8) continue;
          const k2 = Math.min(1, c.mass / cc.mass) * 0.6;
          this.release(cc, v.x * cc.mass * k2, (v.y * k2 + 1.5) * cc.mass, v.z * cc.mass * k2, 0.5);
          hit++;
        }
        if (hit) {
          if (!b.tilt) { const h = Math.hypot(v.x, v.z) || 1; b.tilt = [v.x / h, v.z / h]; }
          c.body.scaleLinvel(0.75, 0.75, 0.75);
          this._dirty.add(b);
        }
      }
    }
    this._impactIdx += 37;
  }

  // 지형이 바뀐 뒤 (크레이터 등): 위에 얹혀 있던 잔해와 건물 아랫부분을 풀어줌
  onTerrainChanged(x, z, r) {
    for (const c of this._looseNear(x, z, r * 1.2)) {
      if (c.state !== FROZEN) continue;
      if (Math.hypot(c.x - x, c.z - z) > r * 1.2) continue;
      if (c.y - c.size - this.grid.sample(c.x, c.z) > 0.6) this.release(c);
    }
    for (const b of this.buildingsNear(x, z, r)) {
      const drop = b.baseY - Math.min(this.grid.sample(b.cx, b.cz), ...b.pts.slice(0, 12).map(p => this.grid.sample(p[0], p[1])));
      if (b.state === 'intact') { if (drop > 1.5) { this._fractureSoon(b, 1); this._dirty.add(b); } continue; }
      if (b.state !== 'fractured') continue;
      for (const c of b.chunks) {
        if (c.state !== FIXED || c.k !== b.colMin.get(c.i + ',' + c.j)) continue;
        if (this.grid.sample(c.x, c.z) < c.y - c.hy - 1.5) this.release(c);
      }
      this._dirty.add(b);
    }
  }

  stats() {
    return {
      score: this.score, destroyed: this.destroyed, total: this.buildings.length,
      pct: this.totalVol ? this.releasedVol / this.totalVol : 0,
      dynamic: this.dynamic.size, loose: this.loose.size, budget: this.dynBudget || this.quality.maxDynamic, stepMs: this._stepMs,
    };
  }

  dispose() {
    this.pool.dispose();
    this.intact.dispose();
    this.material.dispose();
    this.scene.remove(this.group);
  }
}

export const CHUNK_STATE = { FIXED, DYN, FROZEN, GONE };
