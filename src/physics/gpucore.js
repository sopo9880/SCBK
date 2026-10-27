// GPU 물리 본체 (WebGPU 계산 셰이더). Rapier 쪽 PhysCore 와 같은 명령(cmd)을 받는다.
// 위치·속도는 GPU 에 있고, 매 프레임 움직이는 조각만 골라 CPU 로 비동기로 읽어 온다 (한 프레임쯤 늦음).
import { WGSL, MAXP, SCAN, CMD_V4, BODY_V4 } from './gpu.wgsl.js';

const BODY_F = BODY_V4 * 4;  // Body 구조체 float 수
const ITERS = 3;             // 하위 단계마다 겹침 풀기 반복

export class GPUCore {
  static async create(capacity = 32768) {
    if (typeof navigator === 'undefined' || !navigator.gpu) return null;
    let adapter = null;
    try { adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }); } catch (e) { return null; }
    if (!adapter) return null;
    const lim = adapter.limits;
    // 칸을 나중에 늘릴 수 있게 장치가 허락하는 만큼 큰 버퍼를 요청
    const device = await adapter.requestDevice({ requiredLimits: { maxStorageBufferBindingSize: lim.maxStorageBufferBindingSize, maxBufferSize: lim.maxBufferSize } });
    capacity = Math.max(1024, Math.min(capacity, Math.floor(lim.maxStorageBufferBindingSize / (MAXP * 64))));
    const core = new GPUCore(device, capacity, adapter);
    await core._init();
    return core;
  }

  constructor(device, capacity, adapter) {
    this.device = device; this.N = capacity; this.adapterInfo = adapter.info || {};
    this.hashSize = 1 << Math.ceil(Math.log2(capacity * MAXP / 2));
    this.slots = new Map();       // id → 칸
    this.ids = new Int32Array(capacity).fill(-1);
    this.free = []; this.top = 0;
    this.pending = new Map();     // 칸 → 이번 프레임 명령 (Float32Array CMD_V4*4)
    this.dyn = new Set();
    this.stepMs = 0; this.gravity = [0, -9.81, 0];
    this.substeps = 4; this._acc = 0;
    this.lost = false;
    device.lost.then((i) => { this.lost = true; console.warn('GPU 물리 장치 잃음:', i.message); });
  }

  async _init() {
    const d = this.device, N = this.N, NP = N * MAXP;
    const buf = (size, usage) => d.createBuffer({ size: Math.max(16, size), usage });
    const S = GPUBufferUsage.STORAGE, CD = GPUBufferUsage.COPY_DST, CS = GPUBufferUsage.COPY_SRC;
    this.uni = buf(128, GPUBufferUsage.UNIFORM | CD);
    this.bodies = buf(N * BODY_F * 4, S | CD | CS);
    this.pt = buf(NP * 64, S);
    this.at = buf((4 + N + this.hashSize) * 4, S | CD | CS);
    this.gIds = buf((this.hashSize + this.hashSize / SCAN + NP) * 4, S);
    this.st = buf(16, S | CD);
    this.cmdCap = 4096; this.cmds = buf(this.cmdCap * CMD_V4 * 16, S | CD);
    this.out = buf(N * 3 * 16, S | CS);
    this.staging = [0, 1, 2].map(() => ({ b: d.createBuffer({ size: N * 3 * 16 + 16, usage: GPUBufferUsage.MAP_READ | CD }), busy: false }));
    this.hData = new Float32Array(0); this.so = [0, 0, 0, 0, 0, 0];
    // 빈 칸은 상태 0 으로 초기화
    d.queue.writeBuffer(this.bodies, 0, new Float32Array(N * BODY_F));
    const mod = d.createShaderModule({ code: WGSL });
    const info = await mod.getCompilationInfo();
    const errs = info.messages.filter(m => m.type === 'error');
    if (errs.length) throw new Error('WGSL: ' + errs.map(m => `${m.lineNum}:${m.message}`).join(' | '));
    this.layout = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      ...[1, 2, 3, 4].map(b => ({ binding: b, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } })),
      ...[5, 6].map(b => ({ binding: b, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } })),
      { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ] });
    const pl = d.createPipelineLayout({ bindGroupLayouts: [this.layout] });
    this.pipes = {};
    for (const e of ['applyCmds', 'predict', 'particles', 'clearGrid', 'insert', 'scanBlocks', 'scanSums', 'addSums', 'fill', 'contacts', 'commit', 'shapeMatch']) this.pipes[e] = d.createComputePipeline({ layout: pl, compute: { module: mod, entryPoint: e } });
    this._bind();
    this.params = new ArrayBuffer(128);
    this.terrain = { x0: 0, z0: 0, cell: 1, n: 0 };
    this.bgrid = { x0: 0, z0: 0, cell: 32, w: 0 };
    this.buildings = [];          // id → { idx, pts, base, top }
    this.bldIndex = new Map();    // trimesh id → 건물 번호
    this._bldDirty = false; this._aliveDirty = false;
  }
  _bind() {
    const d = this.device;
    const B = [this.uni, this.bodies, this.pt, this.at, this.gIds, this.st, this.cmds, this.out];
    this.group = d.createBindGroup({ layout: this.layout, entries: B.map((b, i) => ({ binding: i, resource: { buffer: b } })) });
  }
  // 지형 높이 + 건물 자료를 한 버퍼(ST)에 묶어 올림
  _uploadStatic() {
    const parts = [this.hData, this.bPolyD || new Float32Array(0), this.bInfoD || new Float32Array(0), this.bAliveD || new Uint32Array(0), this.bCellD || new Uint32Array(0), this.bIdxD || new Uint32Array(0)];
    let n = 0; const off = [];
    for (const a of parts) { off.push(n); n += a.length; }
    const u = new Uint32Array(Math.max(4, n));
    parts.forEach((a, i) => { if (a.length) u.set(a instanceof Float32Array ? new Uint32Array(a.buffer, a.byteOffset, a.length) : a, off[i]); });
    this.so = off;
    const size = u.byteLength;
    if (this.st.size < size) { this.st.destroy(); this.st = this.device.createBuffer({ size: Math.ceil(size / 16) * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST }); this._bind(); }
    this.device.queue.writeBuffer(this.st, 0, u);
  }
  // ---- 칸 관리 ----
  _alloc(id) {
    if (!this.free.length && this.top >= this.N) this._grow();
    let s = this.free.length ? this.free.pop() : (this.top < this.N ? this.top++ : -1);
    if (s < 0) return -1;
    this.slots.set(id, s); this.ids[s] = id;
    return s;
  }
  // 칸이 모자라면 두 배로 늘림 (장치 한도 안에서). 지금까지의 body 는 GPU 안에서 복사
  _grow() {
    const d = this.device, N0 = this.N, N = N0 * 2;
    const lim = d.limits.maxStorageBufferBindingSize;
    if (N * MAXP * 64 > lim || N * 3 * 16 > lim) return;
    const S = GPUBufferUsage.STORAGE, CD = GPUBufferUsage.COPY_DST, CS = GPUBufferUsage.COPY_SRC;
    const nb = d.createBuffer({ size: N * BODY_F * 4, usage: S | CD | CS });
    d.queue.writeBuffer(nb, N0 * BODY_F * 4, new Float32Array(N0 * BODY_F));
    const e = d.createCommandEncoder(); e.copyBufferToBuffer(this.bodies, 0, nb, 0, N0 * BODY_F * 4); d.queue.submit([e.finish()]);
    this.bodies.destroy(); this.bodies = nb;
    this.hashSize = 1 << Math.ceil(Math.log2(N * MAXP / 2));
    for (const k of ['pt', 'at', 'gIds', 'out']) this[k].destroy();
    this.pt = d.createBuffer({ size: N * MAXP * 64, usage: S });
    this.at = d.createBuffer({ size: (4 + N + this.hashSize) * 4, usage: S | CD | CS });
    this.gIds = d.createBuffer({ size: (this.hashSize + this.hashSize / SCAN + N * MAXP) * 4, usage: S });
    this.out = d.createBuffer({ size: N * 3 * 16, usage: S | CS });
    for (const st of this.staging) if (!st.busy) st.b.destroy();
    this.staging = this.staging.filter(st => st.busy).map(st => ({ ...st, old: true }));
    for (let i = 0; i < 3; i++) this.staging.push({ b: d.createBuffer({ size: N * 3 * 16 + 16, usage: GPUBufferUsage.MAP_READ | CD }), busy: false });
    const ids = new Int32Array(N).fill(-1); ids.set(this.ids); this.ids = ids;
    this.N = N; this._bind();
    console.info(`GPU 물리 칸을 ${N} 개로 늘림`);
  }
  _rec(s) {
    let r = this.pending.get(s);
    if (!r) { r = new Float32Array(CMD_V4 * 4); r[0] = s; this.pending.set(s, r); }
    return r;
  }
  // 충돌 상자 → 입자 배치 (축마다 1~4개, 모두 16개 이하)
  _shape(r, hu, hy, hv, ox, oy, oz, qy, qw, mass, sphere = 0) {
    hu = Math.max(0.15, hu); hy = Math.max(0.15, hy); hv = Math.max(0.15, hv);
    const mn = Math.min(hu, hy, hv);
    // 상자는 축마다 2~4개 (정육면체도 8개로 모서리를 덮어 굴러가지 않게), 공은 1개
    let nx = 2, ny = 2, nz = 2, rad;
    if (sphere) { nx = ny = nz = 1; rad = sphere; }
    else {
      // 구가 상자 밖으로 튀어나오지 않으면서(반지름 ≤ 반폭/개수) 빈틈 없이 촘촘하게.
      // 가장 얇은 축에 2개(모서리가 덜 둥글게)를 먼저 시도하고, 27개를 넘으면 1개로
      let best = null;
      for (const nm of [2, 1]) {
        const r0 = mn / nm;
        const n = [hu, hy, hv].map(h => Math.min(15, Math.max(1, Math.ceil(h / r0 - 1e-6))));
        if (n[0] * n[1] * n[2] <= MAXP) { best = n; break; }
        best = n;
      }
      while (best[0] * best[1] * best[2] > MAXP) { const k = best.indexOf(Math.max(...best)); best[k]--; }
      [nx, ny, nz] = best;
      rad = Math.min(hu / nx, hy / ny, hv / nz);
    }
    this.maxRad = Math.max(this.maxRad || 0, rad);
    r[1] = 1; r[2] = mass > 0 ? 1 / mass : 0;
    r[5 * 4 + 0] = hu; r[5 * 4 + 1] = hy; r[5 * 4 + 2] = hv; r[5 * 4 + 3] = rad;
    r[6 * 4 + 0] = ox; r[6 * 4 + 1] = oy; r[6 * 4 + 2] = oz; r[6 * 4 + 3] = nx * ny * nz;
    r[7 * 4 + 0] = qy; r[7 * 4 + 1] = qw; r[7 * 4 + 2] = 1; r[7 * 4 + 3] = 0;
    const m = Math.max(1e-3, mass);
    const ix = m / 3 * (hy * hy + hv * hv), iy = m / 3 * (hu * hu + hv * hv), iz = m / 3 * (hu * hu + hy * hy);
    r[8 * 4 + 0] = 1 / ix; r[8 * 4 + 1] = 1 / iy; r[8 * 4 + 2] = 1 / iz; r[8 * 4 + 3] = nx | (ny << 4) | (nz << 8);
  }

  exec(cmd) {
    const id = cmd[1];
    switch (cmd[0]) {
      case 'hf': {
        const n = cmd[2], h = cmd[3], span = cmd[4];
        // rapier 열 우선 → 행 우선 (j * n + i), 칸 = span/(n-1)
        const out = new Float32Array(n * n);
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out[j * n + i] = h[j + i * n];
        this.hData = out; this._staticDirty = true;
        this.terrain = { x0: -span / 2, z0: -span / 2, cell: span / (n - 1), n };
        break;
      }
      case 'tri': {
        const meta = cmd[4];
        if (!meta || !meta.pts) break;
        let k = this.bldIndex.get(id);
        if (k === undefined) { k = this.buildings.length; this.buildings.push(null); this.bldIndex.set(id, k); }
        this.buildings[k] = { pts: meta.pts, base: meta.baseY, top: meta.top, alive: 1 };
        this._bldDirty = true;
        break;
      }
      case 'chunk': {
        const [, , x, y, z, kind, data, density] = cmd;
        const s = this._alloc(id); if (s < 0) break;
        const r = this._rec(s);
        let hu, hy, hv, ox = 0, oy = 0, oz = 0, qy = 0, qw = 1;
        if (kind === 0) { [hu, hy, hv, ox, oz, qy, qw] = data; }
        else {
          let a = [1e9, 1e9, 1e9], b = [-1e9, -1e9, -1e9];
          for (let i = 0; i < data.length; i += 3) for (let k = 0; k < 3; k++) { a[k] = Math.min(a[k], data[i + k]); b[k] = Math.max(b[k], data[i + k]); }
          hu = (b[0] - a[0]) / 2; hy = (b[1] - a[1]) / 2; hv = (b[2] - a[2]) / 2; ox = (a[0] + b[0]) / 2; oy = (a[1] + b[1]) / 2; oz = (a[2] + b[2]) / 2;
        }
        const mass = 8 * Math.max(0.15, hu) * Math.max(0.15, hy) * Math.max(0.15, hv) * density;
        this._shape(r, hu, hy, hv, ox, oy, oz, qy, qw, mass);
        r[4] = x; r[5] = y; r[6] = z; r[8] = 0; r[9] = 0; r[10] = 0; r[11] = 1;
        r[3] = 1;   // 중력 배율
        // 처음엔 고정 상태 (Rapier 와 같음)
        r[1] |= 4; r[9 * 4] = 1;
        break;
      }
      case 'ball': case 'lball': {
        const [, , x, y, z, vx, vy, vz, rad, mass0] = cmd;
        const s = this._alloc(id); if (s < 0) break;
        const r = this._rec(s);
        const mass = mass0 || 7.8 * (4 / 3) * Math.PI * rad ** 3;
        this._shape(r, rad, rad, rad, 0, 0, 0, 0, 1, mass, rad);
        r[4] = x; r[5] = y; r[6] = z; r[8] = 0; r[9] = 0; r[10] = 0; r[11] = 1; r[3] = 1;
        if (cmd[0] === 'ball') { r[1] |= 4 | 8; r[9 * 4] = 2; r[12] = vx; r[13] = vy; r[14] = vz; this.dyn.add(id); }
        else { r[1] |= 4; r[9 * 4] = 1; }   // 가벼운 파편: 처음엔 고정
        break;
      }
      case 'rm': {
        const s = this.slots.get(id);
        if (s !== undefined) { const r = this._rec(s); r[1] |= 2; this.slots.delete(id); this.ids[s] = -1; this.free.push(s); this.dyn.delete(id); }
        const k = this.bldIndex.get(id);
        if (k !== undefined && this.buildings[k]) { this.buildings[k].alive = 0; this._aliveDirty = true; }
        break;
      }
      case 'iter': this.substeps = Math.max(2, Math.min(8, (cmd[1] | 0) * 2)); break;
      case 'dyn': {
        const s = this.slots.get(id); if (s === undefined) break;
        const r = this._rec(s); r[1] |= 4; r[9 * 4] = cmd[2] ? 2 : 1;
        if (cmd[2]) this.dyn.add(id); else this.dyn.delete(id);
        break;
      }
      case 'imp': case 'tor': case 'vel': case 'ang': case 'mulvel': case 'grav': {
        const s = this.slots.get(id); if (s === undefined) break;
        const r = this._rec(s);
        if (cmd[0] === 'imp') { r[1] |= 32; r[12] += cmd[2]; r[13] += cmd[3]; r[14] += cmd[4]; }
        else if (cmd[0] === 'vel') { r[1] = (r[1] & ~32) | 8; r[12] = cmd[2]; r[13] = cmd[3]; r[14] = cmd[4]; }
        else if (cmd[0] === 'tor') { r[1] |= 64; r[16] += cmd[2]; r[17] += cmd[3]; r[18] += cmd[4]; }
        else if (cmd[0] === 'ang') { r[1] = (r[1] & ~64) | 16; r[16] = cmd[2]; r[17] = cmd[3]; r[18] = cmd[4]; }
        else if (cmd[0] === 'mulvel') { if (!(r[1] & 128)) { r[37] = 1; r[38] = 1; r[39] = 1; } r[1] |= 128; r[37] *= cmd[2]; r[38] *= cmd[3]; r[39] *= cmd[4]; }
        else if (cmd[0] === 'grav') { r[1] |= 256; r[3] = cmd[2]; }
        break;
      }
      case 'wgrav': this.gravity = [cmd[1], cmd[2], cmd[3]]; this._wakeAll = true; break;
      case 'ccd': break;
    }
  }

  _uploadBuildings() {
    const list = this.buildings;
    const cell = 32;
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    for (const b of list) if (b) for (const [x, z] of b.pts) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
    if (x0 > x1) { this.bgrid.w = 0; return; }
    x0 -= cell; z0 -= cell;
    const w = Math.ceil(Math.max(x1 - x0, z1 - z0) / cell) + 2;
    const cells = Array.from({ length: w * w }, () => []);
    const poly = [], info = new Float32Array(list.length * 4), alive = new Uint32Array(list.length);
    list.forEach((b, k) => {
      if (!b) return;
      info[k * 4] = poly.length / 2; info[k * 4 + 1] = b.pts.length; info[k * 4 + 2] = b.base; info[k * 4 + 3] = b.top; alive[k] = b.alive;
      let a = [1e9, 1e9], c = [-1e9, -1e9];
      for (const [x, z] of b.pts) { poly.push(x, z); a[0] = Math.min(a[0], x); a[1] = Math.min(a[1], z); c[0] = Math.max(c[0], x); c[1] = Math.max(c[1], z); }
      const pad = 4;
      for (let j = Math.floor((a[1] - pad - z0) / cell); j <= Math.floor((c[1] + pad - z0) / cell); j++) for (let i = Math.floor((a[0] - pad - x0) / cell); i <= Math.floor((c[0] + pad - x0) / cell); i++) if (i >= 0 && j >= 0 && i < w && j < w) cells[j * w + i].push(k);
    });
    const start = new Uint32Array(w * w * 2), idx = [];
    cells.forEach((l, i) => { start[i * 2] = idx.length; start[i * 2 + 1] = l.length; for (const k of l) idx.push(k); });
    this.bPolyD = new Float32Array(poly); this.bInfoD = info; this.bAliveD = alive; this.bCellD = start; this.bIdxD = new Uint32Array(idx.length ? idx : [0]);
    this.bgrid = { x0, z0, cell, w };
  }

  _writeParams(dt, last) {
    const f = new Float32Array(this.params), u = new Uint32Array(this.params);
    f[0] = dt; u[1] = this.top; u[2] = this.hashSize; f[3] = this._cell || 8;
    f[4] = this.gravity[0]; f[5] = this.gravity[1]; f[6] = this.gravity[2];
    f[8] = this.terrain.x0; f[9] = this.terrain.z0; f[10] = this.terrain.cell; f[11] = this.terrain.n;
    f[12] = this.bgrid.x0; f[13] = this.bgrid.z0; f[14] = this.bgrid.cell; f[15] = this.bgrid.w;
    f[16] = 1.25; f[17] = 0.6; f[18] = 0.45; f[19] = this._ncmd || 0;
    f[20] = last ? (this._resync ? 2 : 1) : 0; f[21] = 0.05; f[22] = 0.3; f[23] = 300;
    const so = this.so; u[24] = so[0]; u[25] = so[1]; u[26] = so[2]; u[27] = so[3]; u[28] = so[4]; u[29] = so[5]; u[30] = this.N; u[31] = 0;
    this.device.queue.writeBuffer(this.uni, 0, this.params);
  }

  // dt 만큼 진행. 결과는 readback() 으로 비동기
  step(dt, maxSteps = 2) {
    if (this.lost) return { steps: 0 };
    const t0 = performance.now();
    const d = this.device;
    if (this._bldDirty) { this._bldDirty = false; this._aliveDirty = false; this._uploadBuildings(); this._staticDirty = true; }
    if (this._staticDirty) { this._staticDirty = false; this._aliveDirty = false; this._uploadStatic(); }
    if (this._aliveDirty && this.bAliveD) {
      this._aliveDirty = false;
      const al = new Uint32Array(this.buildings.map(b => (b ? b.alive : 0)));
      if (al.length === this.bAliveD.length) { this.bAliveD = al; this.device.queue.writeBuffer(this.st, this.so[3] * 4, al); } else { this._uploadBuildings(); this._uploadStatic(); }
    }
    // 명령 올리기
    const enc = d.createCommandEncoder();
    let nc = this.pending.size;
    if (this._wakeAll) { this._wakeAll = false; d.queue.writeBuffer(this.at, 16, new Uint32Array(this.N).fill(1)); }
    if (nc) {
      if (nc > this.cmdCap) { this.cmds.destroy(); this.cmdCap = 1 << Math.ceil(Math.log2(nc)); this.cmds = d.createBuffer({ size: this.cmdCap * CMD_V4 * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST }); this._bind(); }
      const all = new Float32Array(nc * CMD_V4 * 4); let k = 0;
      for (const r of this.pending.values()) { all.set(r, k * CMD_V4 * 4); k++; }
      d.queue.writeBuffer(this.cmds, 0, all);
      this.pending.clear();
    }
    this._ncmd = nc;
    this._cell = Math.max(1.5, 2 * (this.maxRad || 1.5) + 0.1);
    // 진행할 하위 단계 수
    this._acc = Math.min(this._acc + Math.min(dt, 0.1), (1 / 60) * maxSteps);
    const frameStep = 1 / 60;
    let frames = 0;
    while (this._acc >= frameStep - 1e-6 && frames < maxSteps) { this._acc -= frameStep; frames++; }
    const nsub = frames * this.substeps;
    const wg = (n) => Math.ceil(n / 64);
    const run = (pass, name, n) => { pass.setPipeline(this.pipes[name]); pass.setBindGroup(0, this.group); pass.dispatchWorkgroups(Math.max(1, wg(n))); };
    const subDt = 1 / 60 / this.substeps;
    if (nc) { this._writeParams(subDt, false); const p = enc.beginComputePass(); run(p, 'applyCmds', nc); p.end(); }
    d.queue.submit([enc.finish()]);
    this._ncmd = 0;
    const NB = this.top, NP = NB * MAXP;
    if (nsub > 0 && NB > 0) {
      d.queue.writeBuffer(this.at, 0, new Uint32Array(4));
      // 지난번에 결과를 못 읽었으면 이번엔 잠든 조각까지 모두 다시 알려 받음
      if (this._missed && this.staging.some(x => !x.busy && !x.old)) { this._missed = false; this._resync = true; }
      for (let i = 0; i < nsub; i++) {
        const last = i === nsub - 1;
        this._writeParams(subDt, last);
        const e2 = d.createCommandEncoder();
        const p = e2.beginComputePass();
        run(p, 'predict', NB); run(p, 'particles', NP); run(p, 'clearGrid', this.hashSize); run(p, 'insert', NP);
        p.setPipeline(this.pipes.scanBlocks); p.setBindGroup(0, this.group); p.dispatchWorkgroups(this.hashSize / SCAN);
        p.setPipeline(this.pipes.scanSums); p.dispatchWorkgroups(1);
        run(p, 'addSums', this.hashSize); run(p, 'fill', NP);
        for (let it = 0; it < ITERS; it++) { run(p, 'contacts', NP); run(p, 'commit', NP); }
        run(p, 'shapeMatch', NB);
        p.end();
        d.queue.submit([e2.finish()]);
      }
      this._readback();
      this._resync = false;
      // GPU 가 이번 일을 끝내는 데 걸린 시간 (대략)
      if (!this._timing) { this._timing = true; const t1 = performance.now(); d.queue.onSubmittedWorkDone().then(() => { this.gpuMs = (this.gpuMs || 0) * 0.8 + (performance.now() - t1) * 0.2; this._timing = false; }); }
    }
    const ms = performance.now() - t0;
    this.stepMs = this.stepMs * 0.8 + ms * 0.2;
    return { steps: frames, ms };
  }

  _readback() {
    // 잠든 순간 같은 한 번뿐인 알림을 놓치지 않게, 비어 있는 읽기 버퍼가 없으면 새로 만듦
    let st = this.staging.find(s => !s.busy && !s.old);
    if (!st) {
      if (this.staging.length >= 12) { this._missed = true; return; }
      st = { b: this.device.createBuffer({ size: this.N * 3 * 16 + 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }), busy: false };
      this.staging.push(st);
    }
    st.busy = true;
    const d = this.device, enc = d.createCommandEncoder();
    const size = (1 + this.top * 3) * 16;
    enc.copyBufferToBuffer(this.at, 0, st.b, 0, 16);
    enc.copyBufferToBuffer(this.out, 0, st.b, 16, Math.max(16, size - 16));
    d.queue.submit([enc.finish()]);
    st.b.mapAsync(GPUMapMode.READ, 0, size).then(() => {
      const a = st.b.getMappedRange(0, size);
      const n = new Uint32Array(a, 0, 4)[0];
      const f = new Float32Array(a, 16, n * 12).slice();
      st.b.unmap(); st.busy = false; if (st.old) { st.b.destroy(); this.staging = this.staging.filter(x => x !== st); }
      if (this.onState) this.onState(n, f);
    }).catch(() => { st.busy = false; });
  }

  free() { try { this.device.destroy(); } catch (e) { /* 무시 */ } }
}
