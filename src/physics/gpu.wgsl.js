// GPU 물리 셰이더 (WGSL). 위치 기반 강체 입자 방식 (PBD + 모양 맞추기, NVIDIA Flex 와 같은 계열)
// 조각 하나 = 작은 구(입자) 여러 개. 매 하위 단계:
//   1) 예측: 속도·중력으로 조각을 옮겨 봄   2) 입자 위치 계산   3) 해시 격자에 넣기
//   4) 겹친 입자를 밀어내기(여러 번, 마찰 포함) + 지형·서 있는 건물   5) 입자 모양에 강체를 다시 맞추고 속도 계산
export const MAXP = 27;      // 조각 하나의 최대 입자 수
export const SLOTS = 16;     // 격자 칸 하나에 넣을 수 있는 입자 수
export const CMD_V4 = 10;    // 명령 하나 = vec4 10개
export const BODY_V4 = 11;   // body 하나 = vec4 11개

export const WGSL = /* wgsl */`
struct Body {
  pos: vec4f,    // xyz, 질량 역수 (0 이면 고정)
  quat: vec4f,
  vel: vec4f,    // xyz, 중력 배율
  ang: vec4f,    // xyz, 느린 상태로 지낸 시간
  half: vec4f,   // 충돌 상자 반폭 xyz, 입자 반지름
  off: vec4f,    // 충돌 상자 중심 (body 기준), 입자 수
  lrot: vec4f,   // 충돌 상자 y 회전 (qy, qw), 상태(0 빈칸 1 고정 2 움직임), 잠 (1 막 잠듦, 2 알림 끝)
  invI: vec4f,   // (안 씀) xyz, 칸 수 nx ny nz 를 묶은 값
  anc: vec4f,    // 잠들기 판정 기준 위치 xyz, 거의 안 움직인 시간
  ppos: vec4f,   // 하위 단계 시작 위치
  pq: vec4f,     // 하위 단계 시작 회전
};
struct Params {
  dt: f32, nBody: u32, hashSize: u32, cell: f32,
  grav: vec4f,
  hf: vec4f,        // 지형 x0 z0 칸 크기, n
  bg: vec4f,        // 건물 격자 x0 z0 칸 크기, 가로 칸 수
  k: vec4f,         // 이완 계수, 정지 마찰, 운동 마찰, 명령 수
  misc: vec4f,      // 마지막 하위 단계(1)면 결과 기록, 선형 감쇠, 각 감쇠, 최대 속도
  so: vec4u,        // ST 안의 시작 위치: 높이, 다각형, 건물 정보, 살아있음
  so2: vec4u,       // 격자 칸, 칸별 건물 번호, body 용량(N), 0
};
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read_write> B: array<Body>;
@group(0) @binding(2) var<storage, read_write> PT: array<vec4f>;      // 입자마다 vec4 4개: 현재 x+반지름, 시작 x0+body, 다음 xn, 몸 기준 위치
@group(0) @binding(3) var<storage, read_write> AT: array<atomic<u32>>; // [0..3] 결과 개수, [4..4+N) 깨우기, 그 뒤 격자 칸 개수
@group(0) @binding(4) var<storage, read_write> gIds: array<u32>;
@group(0) @binding(5) var<storage, read> ST: array<u32>;
@group(0) @binding(6) var<storage, read> cmds: array<vec4f>;
@group(0) @binding(7) var<storage, read_write> outBuf: array<vec4f>;  // body 마다 vec4 3개

fn stf(i: u32) -> f32 { return bitcast<f32>(ST[i]); }
fn hgtAt(i: i32) -> f32 { return stf(P.so.x + u32(i)); }
fn bPolyAt(i: u32) -> vec2f { let o = P.so.y + i * 2u; return vec2f(stf(o), stf(o + 1u)); }
fn bInfoAt(i: u32) -> vec4f { let o = P.so.z + i * 4u; return vec4f(stf(o), stf(o + 1u), stf(o + 2u), stf(o + 3u)); }
fn bAliveAt(i: u32) -> u32 { return ST[P.so.w + i]; }
fn bCellAt(i: u32) -> vec2u { let o = P.so2.x + i * 2u; return vec2u(ST[o], ST[o + 1u]); }
fn bIdxAt(i: u32) -> u32 { return ST[P.so2.y + i]; }
fn wakeI(s: u32) -> u32 { return 4u + s; }
fn gcI(h: u32) -> u32 { return 4u + P.so2.z + h; }

fn qrot(q: vec4f, v: vec3f) -> vec3f { let t = 2.0 * cross(q.xyz, v); return v + q.w * t + cross(q.xyz, t); }
fn qmul(a: vec4f, b: vec4f) -> vec4f { return vec4f(a.w * b.xyz + b.w * a.xyz + cross(a.xyz, b.xyz), a.w * b.w - dot(a.xyz, b.xyz)); }
fn hashCell(c: vec3i) -> u32 { return ((u32(c.x) * 73856093u) ^ (u32(c.y) * 19349663u) ^ (u32(c.z) * 83492791u)) & (P.hashSize - 1u); }
fn cellOf(p: vec3f) -> vec3i { return vec3i(floor(p / P.cell)); }
fn awake(b: Body) -> bool { return b.lrot.z > 1.5 && b.lrot.w < 0.5; }

fn terrain(x: f32, z: f32) -> f32 {
  let n = i32(P.hf.w); if (n < 2) { return -1e9; }
  let fx = clamp((x - P.hf.x) / P.hf.z, 0.0, f32(n - 1) - 0.001);
  let fz = clamp((z - P.hf.y) / P.hf.z, 0.0, f32(n - 1) - 0.001);
  let i = i32(fx); let j = i32(fz); let u = fx - f32(i); let v = fz - f32(j);
  let h00 = hgtAt(j * n + i); let h10 = hgtAt(j * n + i + 1); let h01 = hgtAt((j + 1) * n + i); let h11 = hgtAt((j + 1) * n + i + 1);
  return mix(mix(h00, h10, u), mix(h01, h11, u), v);
}

// 0) 명령: 생성·삭제·속도·충격량 등 (body 하나당 하나로 합쳐서 옴)
@compute @workgroup_size(64) fn applyCmds(@builtin(global_invocation_id) id: vec3u) {
  let n = u32(P.k.w); if (id.x >= n) { return; }
  let o = id.x * ${CMD_V4}u;
  let h0 = cmds[o];
  let s = u32(h0.x); let fl = u32(h0.y);
  var b = B[s];
  if ((fl & 1u) != 0u) {
    b.pos = vec4f(cmds[o + 1u].xyz, h0.z); b.quat = cmds[o + 2u];
    b.half = cmds[o + 5u]; b.off = cmds[o + 6u]; b.lrot = cmds[o + 7u]; b.invI = cmds[o + 8u];
    b.vel = vec4f(0.0, 0.0, 0.0, h0.w); b.ang = vec4f(0.0); b.anc = vec4f(b.pos.xyz, 0.0); b.ppos = b.pos; b.pq = b.quat;
  }
  if ((fl & 2u) != 0u) { b.lrot.z = 0.0; }
  if ((fl & 4u) != 0u) { b.lrot.z = cmds[o + 9u].x; b.lrot.w = 0.0; b.ang.w = 0.0; if (b.lrot.z < 1.5) { b.vel = vec4f(0.0, 0.0, 0.0, b.vel.w); b.ang = vec4f(0.0); } }
  if ((fl & 8u) != 0u) { b.vel = vec4f(cmds[o + 3u].xyz, b.vel.w); b.lrot.w = 0.0; b.ang.w = 0.0; }
  if ((fl & 16u) != 0u) { b.ang = vec4f(cmds[o + 4u].xyz, 0.0); b.lrot.w = 0.0; }
  if ((fl & 32u) != 0u) { b.vel = vec4f(b.vel.xyz + cmds[o + 3u].xyz * b.pos.w, b.vel.w); b.lrot.w = 0.0; b.ang.w = 0.0; }
  if ((fl & 64u) != 0u) {
    // 회전 충격량: 상자 크기로 관성을 어림
    let h = b.half.xyz; let m = 1.0 / max(1e-6, b.pos.w);
    let I = m / 3.0 * (dot(h, h) * 0.6667);
    b.ang = vec4f(b.ang.xyz + cmds[o + 4u].xyz / max(1e-6, I), 0.0); b.lrot.w = 0.0;
  }
  if ((fl & 128u) != 0u) { b.vel = vec4f(b.vel.xyz * cmds[o + 9u].yzw, b.vel.w); }
  if ((fl & 256u) != 0u) { b.vel.w = h0.w; b.lrot.w = 0.0; }
  if ((fl & 512u) != 0u) { b.pos = vec4f(cmds[o + 1u].xyz, b.pos.w); b.quat = cmds[o + 2u]; b.lrot.w = 0.0; }
  if ((fl & (4u | 8u | 16u | 32u | 64u | 512u)) != 0u) { b.anc = vec4f(b.pos.xyz, 0.0); }
  B[s] = b;
  if ((fl & (32u | 8u | 512u | 4u | 256u | 16u | 64u)) != 0u) { atomicStore(&AT[wakeI(s)], 1u); }
}

// 1) 예측: 깨어 있는 조각만 속도대로 옮김
@compute @workgroup_size(64) fn predict(@builtin(global_invocation_id) id: vec3u) {
  let s = id.x; if (s >= P.nBody) { return; }
  var b = B[s];
  if (b.lrot.z < 1.5) { return; }
  let woke = atomicExchange(&AT[wakeI(s)], 0u);
  if (b.lrot.w > 0.5) {
    if (woke == 0u) {
      // 막 잠든 조각은 한 번만 알려 줌
      if (P.misc.x > 0.5 && b.lrot.w < 1.5) {
        B[s].lrot.w = 2.0;
        let i = atomicAdd(&AT[0], 1u); let o = i * 3u;
        outBuf[o] = vec4f(b.pos.xyz, f32(s)); outBuf[o + 1u] = b.quat; outBuf[o + 2u] = vec4f(0.0, 0.0, 0.0, 1.0);
      }
      return;
    }
    b.lrot.w = 0.0; b.ang.w = 0.0; b.anc = vec4f(b.pos.xyz, 0.0);
  }
  let dt = P.dt;
  b.ppos = b.pos; b.pq = b.quat;
  var v = b.vel.xyz + P.grav.xyz * b.vel.w * dt;
  v *= exp(-P.misc.y * dt);
  let vm = length(v); if (vm > P.misc.w) { v *= P.misc.w / vm; }
  var w = b.ang.xyz * exp(-P.misc.z * dt);
  let wm = length(w); if (wm > 30.0) { w *= 30.0 / wm; }
  b.vel = vec4f(v, b.vel.w); b.ang = vec4f(w, b.ang.w);
  b.pos = vec4f(b.pos.xyz + v * dt, b.pos.w);
  b.quat = normalize(b.quat + qmul(vec4f(w * dt * 0.5, 0.0), b.quat));
  B[s] = b;
}

// 2) 입자 위치: 예측 위치(x)와 시작 위치(x0)
@compute @workgroup_size(64) fn particles(@builtin(global_invocation_id) id: vec3u) {
  let pi = id.x; let s = pi / ${MAXP}u; let k = pi % ${MAXP}u;
  if (s >= P.nBody) { return; }
  let b = B[s];
  let cnt = u32(b.off.w);
  if (b.lrot.z < 0.5 || k >= cnt) { PT[pi * 4u] = vec4f(0.0); return; }
  let nxyz = u32(b.invI.w); let nx = max(1u, nxyz & 15u); let ny = max(1u, (nxyz >> 4u) & 15u); let nz = max(1u, (nxyz >> 8u) & 15u);
  let ix = k % nx; let iy = (k / nx) % ny; let iz = k / (nx * ny);
  let h = b.half.xyz;
  var l = vec3f(-h.x + h.x / f32(nx) * f32(2u * ix + 1u), -h.y + h.y / f32(ny) * f32(2u * iy + 1u), -h.z + h.z / f32(nz) * f32(2u * iz + 1u));
  l = qrot(vec4f(0.0, b.lrot.x, 0.0, b.lrot.y), l) + b.off.xyz;
  let x = b.pos.xyz + qrot(b.quat, l);
  var x0 = x;
  if (awake(b)) { x0 = b.ppos.xyz + qrot(b.pq, l); }
  PT[pi * 4u] = vec4f(x, b.half.w);
  PT[pi * 4u + 1u] = vec4f(x0, f32(s));
  PT[pi * 4u + 2u] = vec4f(x, 0.0);
  PT[pi * 4u + 3u] = vec4f(l, 0.0);
}

@compute @workgroup_size(64) fn clearGrid(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= P.hashSize) { return; }
  atomicStore(&AT[gcI(id.x)], 0u);
}

@compute @workgroup_size(64) fn insert(@builtin(global_invocation_id) id: vec3u) {
  let pi = id.x; if (pi >= P.nBody * ${MAXP}u) { return; }
  let p = PT[pi * 4u]; if (p.w <= 0.0) { return; }
  let h = hashCell(cellOf(p.xyz));
  let slot = atomicAdd(&AT[gcI(h)], 1u);
  if (slot < ${SLOTS}u) { gIds[h * ${SLOTS}u + slot] = pi; }
}

// 마찰: 접촉면 방향으로 미끄러진 만큼을 되돌림 (정지 마찰이면 전부, 운동 마찰이면 일부)
fn friction(dxRel: vec3f, n: vec3f, pen: f32) -> vec3f {
  let t = dxRel - dot(dxRel, n) * n; let lt = length(t);
  if (lt < 1e-6) { return vec3f(0.0); }
  if (lt < P.k.y * pen) { return -t; }
  return -t * min(1.0, P.k.z * pen / lt);
}

// 3) 겹침 풀기 (야코비: 모든 입자가 이전 값을 읽고 다음 값을 씀)
@compute @workgroup_size(64) fn contacts(@builtin(global_invocation_id) id: vec3u) {
  let pi = id.x; if (pi >= P.nBody * ${MAXP}u) { return; }
  let p4 = PT[pi * 4u]; let ri = p4.w;
  if (ri <= 0.0) { return; }
  let s = pi / ${MAXP}u; let b = B[s];
  if (!awake(b)) { PT[pi * 4u + 2u] = p4; return; }
  let xi = p4.xyz; let x0i = PT[pi * 4u + 1u].xyz;
  let wi = b.pos.w * max(1.0, b.off.w);
  var D = vec3f(0.0); var cntC = 0.0;
  let c0 = cellOf(xi);
  for (var dx = -1; dx <= 1; dx++) { for (var dy = -1; dy <= 1; dy++) { for (var dz = -1; dz <= 1; dz++) {
    let h = hashCell(c0 + vec3i(dx, dy, dz));
    let m = min(atomicLoad(&AT[gcI(h)]), ${SLOTS}u);
    for (var q = 0u; q < m; q++) {
      let pj = gIds[h * ${SLOTS}u + q];
      let sj = pj / ${MAXP}u; if (sj == s) { continue; }
      let p2 = PT[pj * 4u]; let d = xi - p2.xyz; let dist = length(d); let pen = ri + p2.w - dist;
      if (pen <= 0.0 || dist < 1e-6) { continue; }
      let bj = B[sj];
      let n = d / dist;
      let wj = select(0.0, bj.pos.w * max(1.0, bj.off.w), awake(bj));
      let share = wi / (wi + wj);
      let x0j = PT[pj * 4u + 1u].xyz;
      D += (n * pen + friction((xi - x0i) - (p2.xyz - x0j), n, pen)) * share;
      cntC += 1.0;
      // 잠든 조각을 빠르게 치면 깨움
      if (bj.lrot.z > 1.5 && bj.lrot.w > 0.5 && length(xi - x0i) > P.dt * 2.0) { atomicStore(&AT[wakeI(sj)], 1u); }
    }
  }}}
  // 지형
  let th = terrain(xi.x, xi.z);
  let tpen = th + ri - xi.y;
  if (tpen > 0.0) {
    let e = 1.0;
    let n = normalize(vec3f(terrain(xi.x - e, xi.z) - terrain(xi.x + e, xi.z), 2.0 * e, terrain(xi.x, xi.z - e) - terrain(xi.x, xi.z + e)));
    let pen = tpen * n.y;
    D += n * pen + friction(xi - x0i, n, pen); cntC += 1.0;
  }
  // 서 있는 건물 (바닥 모양 다각형 기둥)
  let bc = vec2i(floor((xi.xz - P.bg.xy) / P.bg.z));
  let bw = i32(P.bg.w);
  if (bw > 0 && bc.x >= 0 && bc.y >= 0 && bc.x < bw && bc.y < bw) {
    let cell = bCellAt(u32(bc.y * bw + bc.x));
    for (var q = 0u; q < cell.y; q++) {
      let bi = bIdxAt(cell.x + q);
      if (bAliveAt(bi) == 0u) { continue; }
      let info = bInfoAt(bi);
      if (xi.y > info.w + ri || xi.y < info.z - ri) { continue; }
      let st = u32(info.x); let cn = u32(info.y);
      var inside = false; var best = 1e9; var bn = vec2f(0.0);
      for (var e = 0u; e < cn; e++) {
        let a = bPolyAt(st + e); let c = bPolyAt(st + (e + 1u) % cn);
        if (((a.y > xi.z) != (c.y > xi.z)) && (xi.x < (c.x - a.x) * (xi.z - a.y) / (c.y - a.y + 1e-9) + a.x)) { inside = !inside; }
        let ab = c - a; let t = clamp(dot(xi.xz - a, ab) / max(1e-6, dot(ab, ab)), 0.0, 1.0);
        let dd = xi.xz - (a + ab * t); let dl = length(dd);
        if (dl < best) { best = dl; bn = select(vec2f(ab.y, -ab.x) / max(1e-6, length(ab)), dd / dl, dl > 1e-4); }
      }
      var n = vec3f(0.0); var pen = 0.0;
      if (inside) {
        let up = info.w + ri - xi.y; let side = best + ri;
        if (up < side) { n = vec3f(0.0, 1.0, 0.0); pen = up; } else { n = vec3f(-bn.x, 0.0, -bn.y); pen = side; }
      } else if (best < ri && xi.y < info.w) { n = vec3f(bn.x, 0.0, bn.y); pen = ri - best; }
      if (pen > 0.0) { D += n * pen + friction(xi - x0i, n, pen); cntC += 1.0; }
    }
  }
  var xn = xi;
  if (cntC > 0.0) { xn = xi + D * P.k.x / max(1.0, cntC * 0.5); }
  PT[pi * 4u + 2u] = vec4f(xn, ri);
}
@compute @workgroup_size(64) fn commit(@builtin(global_invocation_id) id: vec3u) {
  let pi = id.x; if (pi >= P.nBody * ${MAXP}u) { return; }
  let p = PT[pi * 4u]; if (p.w <= 0.0) { return; }
  PT[pi * 4u] = vec4f(PT[pi * 4u + 2u].xyz, p.w);
}

// 4) 모양 맞추기: 밀려난 입자들에 가장 잘 맞는 강체 위치·회전 → 속도
@compute @workgroup_size(64) fn shapeMatch(@builtin(global_invocation_id) id: vec3u) {
  let s = id.x; if (s >= P.nBody) { return; }
  var b = B[s];
  if (!awake(b)) { return; }
  let cnt = min(u32(b.off.w), ${MAXP}u);
  var c = vec3f(0.0); var lr = vec3f(0.0);
  for (var k = 0u; k < cnt; k++) { let pi = s * ${MAXP}u + k; c += PT[pi * 4u].xyz; lr += PT[pi * 4u + 3u].xyz; }
  c /= f32(cnt); lr /= f32(cnt);
  var q = b.quat;
  if (cnt > 1u) {
    // A = Σ (x - c)(l - lr)ᵀ 의 회전 부분을 사원수 반복으로 (Müller 2016)
    var a0 = vec3f(0.0); var a1 = vec3f(0.0); var a2 = vec3f(0.0);
    for (var k = 0u; k < cnt; k++) {
      let pi = s * ${MAXP}u + k;
      let p = PT[pi * 4u].xyz - c; let l = PT[pi * 4u + 3u].xyz - lr;
      a0 += p * l.x; a1 += p * l.y; a2 += p * l.z;
    }
    for (var it = 0; it < 6; it++) {
      let r0 = qrot(q, vec3f(1.0, 0.0, 0.0)); let r1 = qrot(q, vec3f(0.0, 1.0, 0.0)); let r2 = qrot(q, vec3f(0.0, 0.0, 1.0));
      let om = (cross(r0, a0) + cross(r1, a1) + cross(r2, a2)) / (abs(dot(r0, a0) + dot(r1, a1) + dot(r2, a2)) + 1e-9);
      let wl = length(om); if (wl < 1e-7) { break; }
      let ax = om / wl; let ha = wl * 0.5;
      q = normalize(qmul(vec4f(ax * sin(ha), cos(ha)), q));
    }
  }
  let pos = c - qrot(q, lr);
  let dt = P.dt;
  let v = (pos - b.ppos.xyz) / dt;
  var dq = qmul(q, vec4f(-b.pq.xyz, b.pq.w));
  if (dq.w < 0.0) { dq = -dq; }
  let w = 2.0 * dq.xyz / dt;
  // 잠들기: 느린 상태가 0.5초 이어지거나, 떨기만 하고 0.6초 동안 거의 제자리면
  var sleepT = b.ang.w;
  if (length(v) < 0.25 && length(w) < 0.35) { sleepT += dt; } else { sleepT = 0.0; }
  var anc = b.anc;
  if (distance(anc.xyz, pos) > 0.05) { anc = vec4f(pos, 0.0); } else { anc.w += dt; }
  if (anc.w > 0.6 && length(v) < 2.0) { sleepT = 1.0; }
  b.anc = anc;
  b.pos = vec4f(pos, b.pos.w); b.quat = q; b.vel = vec4f(v, b.vel.w); b.ang = vec4f(w, sleepT);
  if (sleepT > 0.5) { b.lrot.w = 1.0; b.vel = vec4f(0.0, 0.0, 0.0, b.vel.w); b.ang = vec4f(0.0, 0.0, 0.0, sleepT); }
  B[s] = b;
  if (P.misc.x > 0.5) {
    let i = atomicAdd(&AT[0], 1u);
    let o = i * 3u;
    outBuf[o] = vec4f(b.pos.xyz, f32(s)); outBuf[o + 1u] = b.quat; outBuf[o + 2u] = vec4f(b.vel.xyz, b.lrot.w);
    if (b.lrot.w > 0.5) { B[s].lrot.w = 2.0; }
  }
}
`;
