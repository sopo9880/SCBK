// 물리 파괴 시스템: 온전한 건물 ↔ 조각(Rapier 리지드바디) 관리
import * as THREE from 'three';
import { buildingShell, fractureBuilding } from './fracture.js';
import { makeBuildingMaterial } from './materials.js';
import { hash01 } from './geo.js';

const FIXED = 0, DYN = 1, FROZEN = 2, GONE = 3;
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

export class Destruction {
  constructor({ scene, RAPIER, grid, buildings, quality, hooks }) {
    this.scene = scene; this.R = RAPIER; this.grid = grid; this.buildings = buildings; this.quality = quality;
    this.hooks = hooks || {};
    this.group = new THREE.Group(); scene.add(this.group);
    this.material = makeBuildingMaterial();
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.integrationParameters.numSolverIterations = 4;
    this.world.timestep = 1 / 60;
    this.timeScale = 1; this._acc = 0;
    this.bodyMap = new Map();     // body handle → {b} 또는 {chunk}
    this.dynamic = new Set();
    this.loose = new Set();       // DYN + FROZEN
    this.balls = [];
    this.score = 0; this.destroyed = 0; this.releasedVol = 0; this.totalVol = 0;
    this.pool = new BatchPool(this.group, this.material, { maxN: 5000, maxV: 220000, maxI: 380000 });
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);
    this._c = new THREE.Color();
    this._buildTerrainCollider();
    this._buildIntact();
    this._dirty = new Set();
    this._crushing = new Set();
    this._dustBudget = 0;
  }

  // ---------- 초기화 ----------
  _buildTerrainCollider() {
    const g = this.grid, n = g.n, R = this.R;
    const h = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) h[j + i * n] = g.h[j * n + i];
    if (this.terrainBody) this.world.removeRigidBody(this.terrainBody);
    this.terrainBody = this.world.createRigidBody(R.RigidBodyDesc.fixed());
    this.world.createCollider(R.ColliderDesc.heightfield(n - 1, n - 1, h, { x: g.span, y: 1, z: g.span }).setFriction(0.9), this.terrainBody);
    this.bodyMap.set(this.terrainBody.handle, { terrain: true });
  }
  rebuildTerrainCollider() { this._buildTerrainCollider(); }

  _buildIntact() {
    const g = this.grid, R = this.R;
    const geos = [];
    let V = 0, I = 0;
    this.hash = new Map();
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
      const body = this.world.createRigidBody(R.RigidBodyDesc.fixed());
      this.world.createCollider(R.ColliderDesc.trimesh(new Float32Array(pos), new Uint32Array(idx)), body);
      b.body = body;
      this.bodyMap.set(body.handle, { b });
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
    const R = this.R;
    const max = lod === 0 ? this.quality.chunkFull : lod === 1 ? Math.min(90, this.quality.chunkFull) : 26;
    const f = fractureBuilding(b, b.baseY, (x, z) => this.grid.sample(x, z), max);
    if (!f.chunks.length) return false;
    this.intact.setVisibleAt(b.inst, false);
    this.world.removeRigidBody(b.body); this.bodyMap.delete(b.body.handle); b.body = null;
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
      const body = this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(cx, cy, cz).setCanSleep(true).setLinearDamping(0.05).setAngularDamping(0.25));
      let cd = R.ColliderDesc.convexHull(ch.hull);
      if (!cd) cd = R.ColliderDesc.cuboid(Math.max(0.3, ch.half[0]), Math.max(0.3, ch.half[1]), Math.max(0.3, ch.half[0]));
      cd.setDensity(DENSITY).setFriction(0.6).setRestitution(0.05);
      this.world.createCollider(cd, body);
      const c = { b, batch, inst, body, i: ch.i, j: ch.j, k: ch.k, vol: ch.vol, state: FIXED, age: 0, size: Math.cbrt(ch.vol), x: cx, y: cy, z: cz, pvy: 0, top: ch.top };
      this.bodyMap.set(body.handle, { chunk: c });
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
    return true;
  }

  // ---------- 조각 상태 전환 ----------
  _count(c) {
    const b = c.b;
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

  release(c, ix = 0, iy = 0, iz = 0, spin = 0) {
    if (c.state === GONE || c.state === DYN) {
      if (c.state === DYN && (ix || iy || iz)) c.body.applyImpulse({ x: ix, y: iy, z: iz }, true);
      return;
    }
    if (c.state === FROZEN && this.dynamic.size >= this.quality.maxDynamic) return;
    const was = c.state;
    c.body.setBodyType(this.R.RigidBodyType.Dynamic, true);
    c.state = DYN; c.age = 0;
    this.dynamic.add(c); this.loose.add(c);
    if (ix || iy || iz) c.body.applyImpulse({ x: ix, y: iy, z: iz }, true);
    if (spin) {
      const m = c.body.mass() * spin;
      c.body.applyTorqueImpulse({ x: (Math.random() - 0.5) * m, y: (Math.random() - 0.5) * m, z: (Math.random() - 0.5) * m }, true);
    }
    if (was === FIXED) this._count(c);
  }

  removeChunk(c) {
    if (c.state === GONE) return;
    if (c.state === FIXED) this._count(c);
    this.world.removeRigidBody(c.body); this.bodyMap.delete(c.body.handle);
    c.batch.setVisibleAt(c.inst, false);
    this.dynamic.delete(c); this.loose.delete(c);
    c.state = GONE;
  }

  _freeze(c) {
    c.body.setBodyType(this.R.RigidBodyType.Fixed, true);
    c.state = FROZEN; this.dynamic.delete(c);
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
      for (let pass = 0; pass < 2; pass++) for (const c of layer) {
        if (grounded.has(c)) continue;
        let nb = 0;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = b.cmap.get((c.i + di) + ',' + (c.j + dj) + ',' + c.k);
          if (n && n.state === FIXED && (pass === 0 ? direct.has(n) : grounded.has(n))) nb++;
        }
        if (nb >= 2 || (nb === 1 && pass === 0 && hash01(c.i * 7 + c.j * 13 + c.k) > 0.45)) grounded.add(c);
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
    const blds = this.buildingsNear(x, z, r);
    // LOD 결정
    const intactList = blds.filter(b => b.state === 'intact').map(b => [b, Math.hypot(b.cx - x, b.cz - z)]).sort((a, b) => a[1] - b[1]);
    const budget = o.lodBudget ?? 8;
    let fr = 0;
    intactList.forEach(([b, d], idx) => {
      // 수직 범위 체크
      if (y - r > b.baseY + b.height || y + r < b.baseY + b.minH) return;
      if (inner && d + Math.max(b.maxx - b.minx, b.maxz - b.minz) / 2 < inner) return;
      const lod = o.lod ?? (idx < budget ? 0 : idx < budget * 4 ? 1 : 2);
      if (o.maxFracture && fr >= o.maxFracture) { this._darken(b, 0.25); return; }
      if (this.fracture(b, lod)) fr++;
    });
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
      else if (b.state === 'intact' && o.scorch) {
        const d = Math.hypot(b.cx - x, b.cz - z);
        if (d < r * 1.3) this._darken(b, o.scorch * 0.5 * (1 - d / (r * 1.3)));
      }
    }
    for (const c of this.loose) { if (c.state === GONE) continue; this.chunkPos(c); apply(c, c.state); }
    for (const b of blds) { this._dirty.add(b); if (b.blastDir === undefined) b.blastDir = Math.atan2(b.cz - z, b.cx - x); }
    return hit;
  }

  // 수직 기둥(레이저) - xz 거리 기준
  laser(x, z, r, dt) {
    const blds = this.buildingsNear(x, z, r + 2);
    for (const b of blds) if (b.state === 'intact') this.fracture(b, 0);
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
  field(o, dt) {
    const { x, y, z, r, mode } = o;
    const blds = this.buildingsNear(x, z, o.grab || r * 0.35);
    const grab = o.grab || r * 0.35;
    for (const b of blds) {
      if (b.state === 'intact') this.fracture(b, 1);
      if (b.state !== 'fractured') continue;
      for (const c of b.chunks) {
        if (c.state !== FIXED) continue;
        // 블랙홀: 수직 거리는 덜 따진다 (아래 건물 지붕부터 뜯겨 올라감)
        const d = mode === 'gravity' ? Math.hypot(c.x - x, (c.y - y) * 0.35, c.z - z) : Math.hypot(c.x - x, c.z - z);
        if (d < grab && Math.random() < dt * (mode === 'gravity' ? 2.5 + (c.top ? 4 : 0) : 6) * (1.3 - d / grab)) {
          const m = c.body.mass();
          this.release(c, (x - c.x) * m * 0.05, m * (mode === 'gravity' ? 8 : 2), (z - c.z) * m * 0.05, 0.5);
        }
      }
      this._dirty.add(b);
    }
    let consumed = 0;
    for (const c of this.loose) {
      if (c.state === GONE) continue;
      this.chunkPos(c);
      const dx = x - c.x, dy = y - c.y, dz = z - c.z;
      const dh = Math.hypot(dx, dz);
      const d = Math.hypot(dx, dy, dz);
      if ((mode === 'gravity' ? d : dh) > r) continue;
      if (c.state === FROZEN) { this.release(c); if (c.state !== DYN) continue; }
      const m = c.body.mass();
      if (mode === 'gravity') {
        if (d < o.core) { this.removeChunk(c); consumed++; continue; }
        const s = o.strength * m * dt / Math.max(0.15, (d / r) ** 1.2);
        const tx = -dz / (dh + 0.01), tz = dx / (dh + 0.01);
        c.body.applyImpulse({ x: (dx / d + tx * 0.35) * s, y: (dy / d) * s, z: (dz / d + tz * 0.35) * s }, true);
        const lv = c.body.linvel();
        c.body.setLinvel({ x: lv.x * (1 - 0.6 * dt), y: lv.y * (1 - 0.6 * dt), z: lv.z * (1 - 0.6 * dt) }, true);
      } else {
        // 회오리: 접선 + 상승 + 약한 구심
        const f = 1 - dh / r;
        const tx = -dz / (dh + 0.01), tz = dx / (dh + 0.01);
        const s = o.strength * m * dt;
        const height = c.y - y;
        const up = height < o.height ? 1.25 : -0.2;
        c.body.applyImpulse({ x: (tx * 1.2 + dx / (dh + 0.1) * 0.55) * s * f, y: up * s * (0.4 + f), z: (tz * 1.2 + dz / (dh + 0.1) * 0.55) * s * f }, true);
        if (height > o.height) { // 위쪽에서 바깥으로 던짐
          c.body.applyImpulse({ x: -dx / (dh + 0.1) * s * 0.8, y: 0, z: -dz / (dh + 0.1) * s * 0.8 }, true);
        }
      }
    }
    return consumed;
  }

  // 지진: 반경 내 건물에 무작위 손상 + 진동
  quake(x, z, r, intensity, dt) {
    const blds = this.buildingsNear(x, z, r);
    for (const b of blds) {
      const d = Math.hypot(b.cx - x, b.cz - z);
      const f = Math.max(0, 1 - d / r) * intensity;
      const tall = Math.min(1.6, b.height / 25);
      if (b.state === 'intact') {
        if (Math.random() < dt * f * 0.5 * (0.5 + tall)) this.fracture(b, d < r * 0.4 ? 0 : 1);
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
  addBall(pos, vel, radius, mesh) {
    const R = this.R;
    const body = this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z).setLinvel(vel.x, vel.y, vel.z).setCcdEnabled(true).setAngularDamping(0.3));
    this.world.createCollider(R.ColliderDesc.ball(radius).setDensity(7.8).setFriction(0.6).setRestitution(0.25), body);
    const ball = { body, radius, mesh, age: 0 };
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
          if (b.state === 'intact') { this.fracture(b, 0); this.hooks.onImpact && this.hooks.onImpact(t, sp); }
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
      if (ball.age > 40 || t.y < -300) {
        this.world.removeRigidBody(ball.body);
        ball.mesh.parent && ball.mesh.parent.remove(ball.mesh);
        this.balls.splice(i, 1);
      }
    }
  }

  // ---------- 레이캐스트 ----------
  raycast(origin, dir, maxDist = 6000) {
    const ray = new this.R.Ray(origin, dir);
    const hit = this.world.castRay(ray, maxDist, true);
    if (!hit) return null;
    const t = hit.timeOfImpact;
    const p = { x: origin.x + dir.x * t, y: origin.y + dir.y * t, z: origin.z + dir.z * t };
    const body = hit.collider.parent();
    const info = body ? this.bodyMap.get(body.handle) : null;
    return { point: p, dist: t, info };
  }

  // ---------- 매 프레임 ----------
  update(dt) {
    this._acc += Math.min(dt, 0.1) * this.timeScale;
    const step = 1 / 60;
    let steps = 0;
    while (this._acc >= step && steps < 3) { this.world.step(); this._acc -= step; steps++; }
    if (this._acc > step * 3) this._acc = 0;
    const simDt = steps * step;

    const m = this._m, q = this._q, v = this._v, s = this._s;
    const budget = this.quality.maxDynamic;
    let oldest = null;
    this._dustBudget = Math.min(6, this._dustBudget + dt * 30);
    for (const c of this.dynamic) {
      const t = c.body.translation(), r = c.body.rotation();
      c.x = t.x; c.y = t.y; c.z = t.z;
      m.compose(v.set(t.x, t.y, t.z), q.set(r.x, r.y, r.z, r.w), s);
      c.batch.setMatrixAt(c.inst, m);
      c.age += simDt;
      if (t.y < -150) { this.removeChunk(c); continue; }
      const lv = c.body.linvel();
      // 지면 충돌 먼지
      if (c.pvy < -7 && lv.y > -2.5 && this._dustBudget > 1 && c.size > 1.2) {
        this._dustBudget -= 1;
        this.hooks.onDust && this.hooks.onDust(t, c.size);
      }
      c.pvy = lv.y;
      const slow = lv.x * lv.x + lv.y * lv.y + lv.z * lv.z < 0.25;
      if (c.body.isSleeping() || (c.age > 9 && slow) || c.age > 28) this._freeze(c);
      else if (!oldest || c.age > oldest.age) oldest = c;
    }
    // 예산 초과: 오래된 것부터 고정
    if (this.dynamic.size > budget) {
      const arr = [...this.dynamic].sort((a, b) => b.age - a.age);
      for (let i = 0; i < arr.length - budget; i++) this._freeze(arr[i]);
    }
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
    // 구조 계산 (프레임당 제한)
    let n = 0;
    for (const b of this._dirty) { this._dirty.delete(b); this._support(b); if (++n >= 8) break; }
  }

  stats() {
    return {
      score: this.score, destroyed: this.destroyed, total: this.buildings.length,
      pct: this.totalVol ? this.releasedVol / this.totalVol : 0,
      dynamic: this.dynamic.size, loose: this.loose.size,
    };
  }

  dispose() {
    this.pool.dispose();
    this.intact.dispose();
    this.material.dispose();
    this.scene.remove(this.group);
    this.world.free();
  }
}

export const CHUNK_STATE = { FIXED, DYN, FROZEN, GONE };
