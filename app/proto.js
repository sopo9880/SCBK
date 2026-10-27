(() => {
  // src/physics/gpu.wgsl.js
  var MAXP = 27;
  var SLOTS = 16;
  var CMD_V4 = 10;
  var BODY_V4 = 11;
  var WGSL = (
    /* wgsl */
    `
struct Body {
  pos: vec4f,    // xyz, \uC9C8\uB7C9 \uC5ED\uC218 (0 \uC774\uBA74 \uACE0\uC815)
  quat: vec4f,
  vel: vec4f,    // xyz, \uC911\uB825 \uBC30\uC728
  ang: vec4f,    // xyz, \uB290\uB9B0 \uC0C1\uD0DC\uB85C \uC9C0\uB0B8 \uC2DC\uAC04
  half: vec4f,   // \uCDA9\uB3CC \uC0C1\uC790 \uBC18\uD3ED xyz, \uC785\uC790 \uBC18\uC9C0\uB984
  off: vec4f,    // \uCDA9\uB3CC \uC0C1\uC790 \uC911\uC2EC (body \uAE30\uC900), \uC785\uC790 \uC218
  lrot: vec4f,   // \uCDA9\uB3CC \uC0C1\uC790 y \uD68C\uC804 (qy, qw), \uC0C1\uD0DC(0 \uBE48\uCE78 1 \uACE0\uC815 2 \uC6C0\uC9C1\uC784), \uC7A0 (1 \uB9C9 \uC7A0\uB4E6, 2 \uC54C\uB9BC \uB05D)
  invI: vec4f,   // (\uC548 \uC500) xyz, \uCE78 \uC218 nx ny nz \uB97C \uBB36\uC740 \uAC12
  anc: vec4f,    // \uC7A0\uB4E4\uAE30 \uD310\uC815 \uAE30\uC900 \uC704\uCE58 xyz, \uAC70\uC758 \uC548 \uC6C0\uC9C1\uC778 \uC2DC\uAC04
  ppos: vec4f,   // \uD558\uC704 \uB2E8\uACC4 \uC2DC\uC791 \uC704\uCE58
  pq: vec4f,     // \uD558\uC704 \uB2E8\uACC4 \uC2DC\uC791 \uD68C\uC804
};
struct Params {
  dt: f32, nBody: u32, hashSize: u32, cell: f32,
  grav: vec4f,
  hf: vec4f,        // \uC9C0\uD615 x0 z0 \uCE78 \uD06C\uAE30, n
  bg: vec4f,        // \uAC74\uBB3C \uACA9\uC790 x0 z0 \uCE78 \uD06C\uAE30, \uAC00\uB85C \uCE78 \uC218
  k: vec4f,         // \uC774\uC644 \uACC4\uC218, \uC815\uC9C0 \uB9C8\uCC30, \uC6B4\uB3D9 \uB9C8\uCC30, \uBA85\uB839 \uC218
  misc: vec4f,      // \uB9C8\uC9C0\uB9C9 \uD558\uC704 \uB2E8\uACC4(1)\uBA74 \uACB0\uACFC \uAE30\uB85D, \uC120\uD615 \uAC10\uC1E0, \uAC01 \uAC10\uC1E0, \uCD5C\uB300 \uC18D\uB3C4
  so: vec4u,        // ST \uC548\uC758 \uC2DC\uC791 \uC704\uCE58: \uB192\uC774, \uB2E4\uAC01\uD615, \uAC74\uBB3C \uC815\uBCF4, \uC0B4\uC544\uC788\uC74C
  so2: vec4u,       // \uACA9\uC790 \uCE78, \uCE78\uBCC4 \uAC74\uBB3C \uBC88\uD638, body \uC6A9\uB7C9(N), 0
};
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read_write> B: array<Body>;
@group(0) @binding(2) var<storage, read_write> PT: array<vec4f>;      // \uC785\uC790\uB9C8\uB2E4 vec4 4\uAC1C: \uD604\uC7AC x+\uBC18\uC9C0\uB984, \uC2DC\uC791 x0+body, \uB2E4\uC74C xn, \uBAB8 \uAE30\uC900 \uC704\uCE58
@group(0) @binding(3) var<storage, read_write> AT: array<atomic<u32>>; // [0..3] \uACB0\uACFC \uAC1C\uC218, [4..4+N) \uAE68\uC6B0\uAE30, \uADF8 \uB4A4 \uACA9\uC790 \uCE78 \uAC1C\uC218
@group(0) @binding(4) var<storage, read_write> gIds: array<u32>;
@group(0) @binding(5) var<storage, read> ST: array<u32>;
@group(0) @binding(6) var<storage, read> cmds: array<vec4f>;
@group(0) @binding(7) var<storage, read_write> outBuf: array<vec4f>;  // body \uB9C8\uB2E4 vec4 3\uAC1C

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

// 0) \uBA85\uB839: \uC0DD\uC131\xB7\uC0AD\uC81C\xB7\uC18D\uB3C4\xB7\uCDA9\uACA9\uB7C9 \uB4F1 (body \uD558\uB098\uB2F9 \uD558\uB098\uB85C \uD569\uCCD0\uC11C \uC634)
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
    // \uD68C\uC804 \uCDA9\uACA9\uB7C9: \uC0C1\uC790 \uD06C\uAE30\uB85C \uAD00\uC131\uC744 \uC5B4\uB9BC
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

// 1) \uC608\uCE21: \uAE68\uC5B4 \uC788\uB294 \uC870\uAC01\uB9CC \uC18D\uB3C4\uB300\uB85C \uC62E\uAE40
@compute @workgroup_size(64) fn predict(@builtin(global_invocation_id) id: vec3u) {
  let s = id.x; if (s >= P.nBody) { return; }
  var b = B[s];
  if (b.lrot.z < 1.5) { return; }
  let woke = atomicExchange(&AT[wakeI(s)], 0u);
  if (b.lrot.w > 0.5) {
    if (woke == 0u) {
      // \uB9C9 \uC7A0\uB4E0 \uC870\uAC01\uC740 \uD55C \uBC88\uB9CC \uC54C\uB824 \uC90C
      if (P.misc.x > 0.5 && (b.lrot.w < 1.5 || P.misc.x > 1.5)) {   // 2 \uBA74 \uB193\uCE5C \uC54C\uB9BC\uC744 \uB2E4\uC2DC \uB9DE\uCD94\uB824\uACE0 \uC7A0\uB4E0 \uC870\uAC01\uB3C4 \uBAA8\uB450
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

// 2) \uC785\uC790 \uC704\uCE58: \uC608\uCE21 \uC704\uCE58(x)\uC640 \uC2DC\uC791 \uC704\uCE58(x0)
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

// \uB9C8\uCC30: \uC811\uCD09\uBA74 \uBC29\uD5A5\uC73C\uB85C \uBBF8\uB044\uB7EC\uC9C4 \uB9CC\uD07C\uC744 \uB418\uB3CC\uB9BC (\uC815\uC9C0 \uB9C8\uCC30\uC774\uBA74 \uC804\uBD80, \uC6B4\uB3D9 \uB9C8\uCC30\uC774\uBA74 \uC77C\uBD80)
fn friction(dxRel: vec3f, n: vec3f, pen: f32) -> vec3f {
  let t = dxRel - dot(dxRel, n) * n; let lt = length(t);
  if (lt < 1e-6) { return vec3f(0.0); }
  if (lt < P.k.y * pen) { return -t; }
  return -t * min(1.0, P.k.z * pen / lt);
}

// 3) \uACB9\uCE68 \uD480\uAE30 (\uC57C\uCF54\uBE44: \uBAA8\uB4E0 \uC785\uC790\uAC00 \uC774\uC804 \uAC12\uC744 \uC77D\uACE0 \uB2E4\uC74C \uAC12\uC744 \uC500)
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
      // \uC7A0\uB4E0 \uC870\uAC01\uC744 \uBE60\uB974\uAC8C \uCE58\uBA74 \uAE68\uC6C0
      if (bj.lrot.z > 1.5 && bj.lrot.w > 0.5 && length(xi - x0i) > P.dt * 2.0) { atomicStore(&AT[wakeI(sj)], 1u); }
    }
  }}}
  // \uC9C0\uD615
  let th = terrain(xi.x, xi.z);
  let tpen = th + ri - xi.y;
  if (tpen > 0.0) {
    let e = 1.0;
    let n = normalize(vec3f(terrain(xi.x - e, xi.z) - terrain(xi.x + e, xi.z), 2.0 * e, terrain(xi.x, xi.z - e) - terrain(xi.x, xi.z + e)));
    let pen = tpen * n.y;
    D += n * pen + friction(xi - x0i, n, pen); cntC += 1.0;
  }
  // \uC11C \uC788\uB294 \uAC74\uBB3C (\uBC14\uB2E5 \uBAA8\uC591 \uB2E4\uAC01\uD615 \uAE30\uB465)
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
  if (cntC > 0.0) { xn = xi + D * P.k.x / cntC; }
  PT[pi * 4u + 2u] = vec4f(xn, cntC);
}
@compute @workgroup_size(64) fn commit(@builtin(global_invocation_id) id: vec3u) {
  let pi = id.x; if (pi >= P.nBody * ${MAXP}u) { return; }
  let p = PT[pi * 4u]; if (p.w <= 0.0) { return; }
  PT[pi * 4u] = vec4f(PT[pi * 4u + 2u].xyz, p.w);
}

// 4) \uBAA8\uC591 \uB9DE\uCD94\uAE30: \uBC00\uB824\uB09C \uC785\uC790\uB4E4\uC5D0 \uAC00\uC7A5 \uC798 \uB9DE\uB294 \uAC15\uCCB4 \uC704\uCE58\xB7\uD68C\uC804 \u2192 \uC18D\uB3C4
@compute @workgroup_size(64) fn shapeMatch(@builtin(global_invocation_id) id: vec3u) {
  let s = id.x; if (s >= P.nBody) { return; }
  var b = B[s];
  if (!awake(b)) { return; }
  let cnt = min(u32(b.off.w), ${MAXP}u);
  var c = vec3f(0.0); var lr = vec3f(0.0); var touching = 0.0;
  for (var k = 0u; k < cnt; k++) { let pi = s * ${MAXP}u + k; c += PT[pi * 4u].xyz; lr += PT[pi * 4u + 3u].xyz; touching += PT[pi * 4u + 2u].w; }
  c /= f32(cnt); lr /= f32(cnt);
  var q = b.quat;
  if (cnt > 1u) {
    // A = \u03A3 (x - c)(l - lr)\u1D40 \uC758 \uD68C\uC804 \uBD80\uBD84\uC744 \uC0AC\uC6D0\uC218 \uBC18\uBCF5\uC73C\uB85C (M\xFCller 2016)
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
  var pos = c - qrot(q, lr);
  let dt = P.dt;
  var v = (pos - b.ppos.xyz) / dt;
  // \uACB9\uCE68\uC744 \uD55C \uBC88\uC5D0 \uD480\uBA70 \uD295\uACA8 \uB098\uAC00\uC9C0 \uC54A\uAC8C: \uC774\uBC88 \uB2E8\uACC4\uC5D0\uC11C \uBC14\uB00C\uB294 \uC18D\uB3C4\uB97C \uC81C\uD55C (\uCD5C\uB300 \uBC00\uC5B4\uB0B4\uAE30 \uC18D\uB3C4)
  let dv = v - b.vel.xyz; let dvl = length(dv);
  if (dvl > 12.0) { v = b.vel.xyz + dv * (12.0 / dvl); pos = b.ppos.xyz + v * dt; }
  var dq = qmul(q, vec4f(-b.pq.xyz, b.pq.w));
  if (dq.w < 0.0) { dq = -dq; }
  var w = 2.0 * dq.xyz / dt;
  let dw = w - b.ang.xyz; let dwl = length(dw);
  if (dwl > 8.0) { w = b.ang.xyz + dw * (8.0 / dwl); let ha = w * dt * 0.5; q = normalize(b.pq + qmul(vec4f(ha, 0.0), b.pq)); pos = c - qrot(q, lr); if (dvl > 12.0) { pos = b.ppos.xyz + v * dt; } }
  // \uB545\uC774\uB098 \uB2E4\uB978 \uC870\uAC01\uC5D0 \uB2FF\uC544 \uC788\uC73C\uBA74 \uAD6C\uB974\uAE30\xB7\uBBF8\uB044\uB7FC\uC744 \uC870\uAE08 \uB354 \uC904\uC784 (\uAD6C \uC785\uC790\uB77C \uBAA8\uC11C\uB9AC\uAC00 \uB465\uAE00\uC5B4\uC11C)
  if (touching > 0.5) { w *= exp(-2.5 * dt); v = vec3f(v.x * exp(-0.4 * dt), v.y, v.z * exp(-0.4 * dt)); }
  // \uC7A0\uB4E4\uAE30: \uB290\uB9B0 \uC0C1\uD0DC\uAC00 0.5\uCD08 \uC774\uC5B4\uC9C0\uAC70\uB098, \uB5A8\uAE30\uB9CC \uD558\uACE0 0.6\uCD08 \uB3D9\uC548 \uAC70\uC758 \uC81C\uC790\uB9AC\uBA74
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
`
  );

  // src/physics/gpucore.js
  var BODY_F = BODY_V4 * 4;
  var ITERS = 3;
  var GPUCore = class _GPUCore {
    static async create(capacity = 32768) {
      if (typeof navigator === "undefined" || !navigator.gpu) return null;
      let adapter = null;
      try {
        adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
      } catch (e) {
        return null;
      }
      if (!adapter) return null;
      const lim = adapter.limits;
      const device = await adapter.requestDevice({ requiredLimits: { maxStorageBufferBindingSize: lim.maxStorageBufferBindingSize, maxBufferSize: lim.maxBufferSize } });
      capacity = Math.max(1024, Math.min(capacity, Math.floor(lim.maxStorageBufferBindingSize / (MAXP * 64))));
      const core = new _GPUCore(device, capacity, adapter);
      await core._init();
      return core;
    }
    constructor(device, capacity, adapter) {
      this.device = device;
      this.N = capacity;
      this.adapterInfo = adapter.info || {};
      this.hashSize = 1 << Math.ceil(Math.log2(capacity * MAXP / 2));
      this.slots = /* @__PURE__ */ new Map();
      this.ids = new Int32Array(capacity).fill(-1);
      this.free = [];
      this.top = 0;
      this.pending = /* @__PURE__ */ new Map();
      this.dyn = /* @__PURE__ */ new Set();
      this.stepMs = 0;
      this.gravity = [0, -9.81, 0];
      this.substeps = 4;
      this._acc = 0;
      this.lost = false;
      device.lost.then((i) => {
        this.lost = true;
        console.warn("GPU \uBB3C\uB9AC \uC7A5\uCE58 \uC783\uC74C:", i.message);
      });
    }
    async _init() {
      const d = this.device, N = this.N, NP = N * MAXP;
      const buf = (size, usage) => d.createBuffer({ size: Math.max(16, size), usage });
      const S = GPUBufferUsage.STORAGE, CD = GPUBufferUsage.COPY_DST, CS = GPUBufferUsage.COPY_SRC;
      this.uni = buf(128, GPUBufferUsage.UNIFORM | CD);
      this.bodies = buf(N * BODY_F * 4, S | CD | CS);
      this.pt = buf(NP * 64, S);
      this.at = buf((4 + N + this.hashSize) * 4, S | CD | CS);
      this.gIds = buf(this.hashSize * SLOTS * 4, S);
      this.st = buf(16, S | CD);
      this.cmdCap = 4096;
      this.cmds = buf(this.cmdCap * CMD_V4 * 16, S | CD);
      this.out = buf(N * 3 * 16, S | CS);
      this.staging = [0, 1, 2].map(() => ({ b: d.createBuffer({ size: N * 3 * 16 + 16, usage: GPUBufferUsage.MAP_READ | CD }), busy: false }));
      this.hData = new Float32Array(0);
      this.so = [0, 0, 0, 0, 0, 0];
      d.queue.writeBuffer(this.bodies, 0, new Float32Array(N * BODY_F));
      const mod = d.createShaderModule({ code: WGSL });
      const info = await mod.getCompilationInfo();
      const errs = info.messages.filter((m) => m.type === "error");
      if (errs.length) throw new Error("WGSL: " + errs.map((m) => `${m.lineNum}:${m.message}`).join(" | "));
      this.layout = d.createBindGroupLayout({ entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
        ...[1, 2, 3, 4].map((b) => ({ binding: b, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } })),
        ...[5, 6].map((b) => ({ binding: b, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } })),
        { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } }
      ] });
      const pl = d.createPipelineLayout({ bindGroupLayouts: [this.layout] });
      this.pipes = {};
      for (const e of ["applyCmds", "predict", "particles", "clearGrid", "insert", "contacts", "commit", "shapeMatch"]) this.pipes[e] = d.createComputePipeline({ layout: pl, compute: { module: mod, entryPoint: e } });
      this._bind();
      this.params = new ArrayBuffer(128);
      this.terrain = { x0: 0, z0: 0, cell: 1, n: 0 };
      this.bgrid = { x0: 0, z0: 0, cell: 32, w: 0 };
      this.buildings = [];
      this.bldIndex = /* @__PURE__ */ new Map();
      this._bldDirty = false;
      this._aliveDirty = false;
    }
    _bind() {
      const d = this.device;
      const B = [this.uni, this.bodies, this.pt, this.at, this.gIds, this.st, this.cmds, this.out];
      this.group = d.createBindGroup({ layout: this.layout, entries: B.map((b, i) => ({ binding: i, resource: { buffer: b } })) });
    }
    // 지형 높이 + 건물 자료를 한 버퍼(ST)에 묶어 올림
    _uploadStatic() {
      const parts = [this.hData, this.bPolyD || new Float32Array(0), this.bInfoD || new Float32Array(0), this.bAliveD || new Uint32Array(0), this.bCellD || new Uint32Array(0), this.bIdxD || new Uint32Array(0)];
      let n = 0;
      const off = [];
      for (const a of parts) {
        off.push(n);
        n += a.length;
      }
      const u = new Uint32Array(Math.max(4, n));
      parts.forEach((a, i) => {
        if (a.length) u.set(a instanceof Float32Array ? new Uint32Array(a.buffer, a.byteOffset, a.length) : a, off[i]);
      });
      this.so = off;
      const size = u.byteLength;
      if (this.st.size < size) {
        this.st.destroy();
        this.st = this.device.createBuffer({ size: Math.ceil(size / 16) * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        this._bind();
      }
      this.device.queue.writeBuffer(this.st, 0, u);
    }
    // ---- 칸 관리 ----
    _alloc(id) {
      if (!this.free.length && this.top >= this.N) this._grow();
      let s = this.free.length ? this.free.pop() : this.top < this.N ? this.top++ : -1;
      if (s < 0) return -1;
      this.slots.set(id, s);
      this.ids[s] = id;
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
      const e = d.createCommandEncoder();
      e.copyBufferToBuffer(this.bodies, 0, nb, 0, N0 * BODY_F * 4);
      d.queue.submit([e.finish()]);
      this.bodies.destroy();
      this.bodies = nb;
      this.hashSize = 1 << Math.ceil(Math.log2(N * MAXP / 2));
      for (const k of ["pt", "at", "gIds", "out"]) this[k].destroy();
      this.pt = d.createBuffer({ size: N * MAXP * 64, usage: S });
      this.at = d.createBuffer({ size: (4 + N + this.hashSize) * 4, usage: S | CD | CS });
      this.gIds = d.createBuffer({ size: this.hashSize * SLOTS * 4, usage: S });
      this.out = d.createBuffer({ size: N * 3 * 16, usage: S | CS });
      for (const st of this.staging) if (!st.busy) st.b.destroy();
      this.staging = this.staging.filter((st) => st.busy).map((st) => ({ ...st, old: true }));
      for (let i = 0; i < 3; i++) this.staging.push({ b: d.createBuffer({ size: N * 3 * 16 + 16, usage: GPUBufferUsage.MAP_READ | CD }), busy: false });
      const ids = new Int32Array(N).fill(-1);
      ids.set(this.ids);
      this.ids = ids;
      this.N = N;
      this._bind();
      console.info(`GPU \uBB3C\uB9AC \uCE78\uC744 ${N} \uAC1C\uB85C \uB298\uB9BC`);
    }
    _rec(s) {
      let r = this.pending.get(s);
      if (!r) {
        r = new Float32Array(CMD_V4 * 4);
        r[0] = s;
        this.pending.set(s, r);
      }
      return r;
    }
    // 충돌 상자 → 입자 배치 (축마다 1~4개, 모두 16개 이하)
    _shape(r, hu, hy, hv, ox, oy, oz, qy, qw, mass, sphere = 0) {
      hu = Math.max(0.15, hu);
      hy = Math.max(0.15, hy);
      hv = Math.max(0.15, hv);
      const mn = Math.min(hu, hy, hv);
      let nx = 2, ny = 2, nz = 2, rad;
      if (sphere) {
        nx = ny = nz = 1;
        rad = sphere;
      } else {
        nx = Math.min(4, Math.max(2, Math.round(2 * hu / mn)));
        ny = Math.min(4, Math.max(2, Math.round(2 * hy / mn)));
        nz = Math.min(4, Math.max(2, Math.round(2 * hv / mn)));
        while (nx * ny * nz > MAXP) {
          if (nx >= ny && nx >= nz) nx--;
          else if (ny >= nz) ny--;
          else nz--;
        }
        rad = Math.min(hu / nx, hy / ny, hv / nz);
      }
      this.maxRad = Math.max(this.maxRad || 0, rad);
      r[1] = 1;
      r[2] = mass > 0 ? 1 / mass : 0;
      r[5 * 4 + 0] = hu;
      r[5 * 4 + 1] = hy;
      r[5 * 4 + 2] = hv;
      r[5 * 4 + 3] = rad;
      r[6 * 4 + 0] = ox;
      r[6 * 4 + 1] = oy;
      r[6 * 4 + 2] = oz;
      r[6 * 4 + 3] = nx * ny * nz;
      r[7 * 4 + 0] = qy;
      r[7 * 4 + 1] = qw;
      r[7 * 4 + 2] = 1;
      r[7 * 4 + 3] = 0;
      const m = Math.max(1e-3, mass);
      const ix = m / 3 * (hy * hy + hv * hv), iy = m / 3 * (hu * hu + hv * hv), iz = m / 3 * (hu * hu + hy * hy);
      r[8 * 4 + 0] = 1 / ix;
      r[8 * 4 + 1] = 1 / iy;
      r[8 * 4 + 2] = 1 / iz;
      r[8 * 4 + 3] = nx | ny << 4 | nz << 8;
    }
    exec(cmd) {
      const id = cmd[1];
      switch (cmd[0]) {
        case "hf": {
          const n = cmd[2], h = cmd[3], span = cmd[4];
          const out = new Float32Array(n * n);
          for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out[j * n + i] = h[j + i * n];
          this.hData = out;
          this._staticDirty = true;
          this.terrain = { x0: -span / 2, z0: -span / 2, cell: span / (n - 1), n };
          break;
        }
        case "tri": {
          const meta = cmd[4];
          if (!meta || !meta.pts) break;
          let k = this.bldIndex.get(id);
          if (k === void 0) {
            k = this.buildings.length;
            this.buildings.push(null);
            this.bldIndex.set(id, k);
          }
          this.buildings[k] = { pts: meta.pts, base: meta.baseY, top: meta.top, alive: 1 };
          this._bldDirty = true;
          break;
        }
        case "chunk": {
          const [, , x, y, z, kind, data, density] = cmd;
          const s = this._alloc(id);
          if (s < 0) break;
          const r = this._rec(s);
          let hu, hy, hv, ox = 0, oy = 0, oz = 0, qy = 0, qw = 1;
          if (kind === 0) {
            [hu, hy, hv, ox, oz, qy, qw] = data;
          } else {
            let a = [1e9, 1e9, 1e9], b = [-1e9, -1e9, -1e9];
            for (let i = 0; i < data.length; i += 3) for (let k = 0; k < 3; k++) {
              a[k] = Math.min(a[k], data[i + k]);
              b[k] = Math.max(b[k], data[i + k]);
            }
            hu = (b[0] - a[0]) / 2;
            hy = (b[1] - a[1]) / 2;
            hv = (b[2] - a[2]) / 2;
            ox = (a[0] + b[0]) / 2;
            oy = (a[1] + b[1]) / 2;
            oz = (a[2] + b[2]) / 2;
          }
          const mass = 8 * Math.max(0.15, hu) * Math.max(0.15, hy) * Math.max(0.15, hv) * density;
          this._shape(r, hu, hy, hv, ox, oy, oz, qy, qw, mass);
          r[4] = x;
          r[5] = y;
          r[6] = z;
          r[8] = 0;
          r[9] = 0;
          r[10] = 0;
          r[11] = 1;
          r[3] = 1;
          r[1] |= 4;
          r[9 * 4] = 1;
          break;
        }
        case "ball":
        case "lball": {
          const [, , x, y, z, vx, vy, vz, rad, mass0] = cmd;
          const s = this._alloc(id);
          if (s < 0) break;
          const r = this._rec(s);
          const mass = mass0 || 7.8 * (4 / 3) * Math.PI * rad ** 3;
          this._shape(r, rad, rad, rad, 0, 0, 0, 0, 1, mass, rad);
          r[4] = x;
          r[5] = y;
          r[6] = z;
          r[8] = 0;
          r[9] = 0;
          r[10] = 0;
          r[11] = 1;
          r[3] = 1;
          if (cmd[0] === "ball") {
            r[1] |= 4 | 8;
            r[9 * 4] = 2;
            r[12] = vx;
            r[13] = vy;
            r[14] = vz;
            this.dyn.add(id);
          } else {
            r[1] |= 4;
            r[9 * 4] = 1;
          }
          break;
        }
        case "rm": {
          const s = this.slots.get(id);
          if (s !== void 0) {
            const r = this._rec(s);
            r[1] |= 2;
            this.slots.delete(id);
            this.ids[s] = -1;
            this.free.push(s);
            this.dyn.delete(id);
          }
          const k = this.bldIndex.get(id);
          if (k !== void 0 && this.buildings[k]) {
            this.buildings[k].alive = 0;
            this._aliveDirty = true;
          }
          break;
        }
        case "iter":
          this.substeps = Math.max(2, Math.min(8, (cmd[1] | 0) * 2));
          break;
        case "dyn": {
          const s = this.slots.get(id);
          if (s === void 0) break;
          const r = this._rec(s);
          r[1] |= 4;
          r[9 * 4] = cmd[2] ? 2 : 1;
          if (cmd[2]) this.dyn.add(id);
          else this.dyn.delete(id);
          break;
        }
        case "imp":
        case "tor":
        case "vel":
        case "ang":
        case "mulvel":
        case "grav": {
          const s = this.slots.get(id);
          if (s === void 0) break;
          const r = this._rec(s);
          if (cmd[0] === "imp") {
            r[1] |= 32;
            r[12] += cmd[2];
            r[13] += cmd[3];
            r[14] += cmd[4];
          } else if (cmd[0] === "vel") {
            r[1] = r[1] & ~32 | 8;
            r[12] = cmd[2];
            r[13] = cmd[3];
            r[14] = cmd[4];
          } else if (cmd[0] === "tor") {
            r[1] |= 64;
            r[16] += cmd[2];
            r[17] += cmd[3];
            r[18] += cmd[4];
          } else if (cmd[0] === "ang") {
            r[1] = r[1] & ~64 | 16;
            r[16] = cmd[2];
            r[17] = cmd[3];
            r[18] = cmd[4];
          } else if (cmd[0] === "mulvel") {
            if (!(r[1] & 128)) {
              r[37] = 1;
              r[38] = 1;
              r[39] = 1;
            }
            r[1] |= 128;
            r[37] *= cmd[2];
            r[38] *= cmd[3];
            r[39] *= cmd[4];
          } else if (cmd[0] === "grav") {
            r[1] |= 256;
            r[3] = cmd[2];
          }
          break;
        }
        case "wgrav":
          this.gravity = [cmd[1], cmd[2], cmd[3]];
          this._wakeAll = true;
          break;
        case "ccd":
          break;
      }
    }
    _uploadBuildings() {
      const list = this.buildings;
      const cell = 32;
      let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
      for (const b of list) if (b) for (const [x, z] of b.pts) {
        x0 = Math.min(x0, x);
        z0 = Math.min(z0, z);
        x1 = Math.max(x1, x);
        z1 = Math.max(z1, z);
      }
      if (x0 > x1) {
        this.bgrid.w = 0;
        return;
      }
      x0 -= cell;
      z0 -= cell;
      const w = Math.ceil(Math.max(x1 - x0, z1 - z0) / cell) + 2;
      const cells = Array.from({ length: w * w }, () => []);
      const poly = [], info = new Float32Array(list.length * 4), alive = new Uint32Array(list.length);
      list.forEach((b, k) => {
        if (!b) return;
        info[k * 4] = poly.length / 2;
        info[k * 4 + 1] = b.pts.length;
        info[k * 4 + 2] = b.base;
        info[k * 4 + 3] = b.top;
        alive[k] = b.alive;
        let a = [1e9, 1e9], c = [-1e9, -1e9];
        for (const [x, z] of b.pts) {
          poly.push(x, z);
          a[0] = Math.min(a[0], x);
          a[1] = Math.min(a[1], z);
          c[0] = Math.max(c[0], x);
          c[1] = Math.max(c[1], z);
        }
        const pad = 4;
        for (let j = Math.floor((a[1] - pad - z0) / cell); j <= Math.floor((c[1] + pad - z0) / cell); j++) for (let i = Math.floor((a[0] - pad - x0) / cell); i <= Math.floor((c[0] + pad - x0) / cell); i++) if (i >= 0 && j >= 0 && i < w && j < w) cells[j * w + i].push(k);
      });
      const start = new Uint32Array(w * w * 2), idx = [];
      cells.forEach((l, i) => {
        start[i * 2] = idx.length;
        start[i * 2 + 1] = l.length;
        for (const k of l) idx.push(k);
      });
      this.bPolyD = new Float32Array(poly);
      this.bInfoD = info;
      this.bAliveD = alive;
      this.bCellD = start;
      this.bIdxD = new Uint32Array(idx.length ? idx : [0]);
      this.bgrid = { x0, z0, cell, w };
    }
    _writeParams(dt, last) {
      const f = new Float32Array(this.params), u = new Uint32Array(this.params);
      f[0] = dt;
      u[1] = this.top;
      u[2] = this.hashSize;
      f[3] = this._cell || 8;
      f[4] = this.gravity[0];
      f[5] = this.gravity[1];
      f[6] = this.gravity[2];
      f[8] = this.terrain.x0;
      f[9] = this.terrain.z0;
      f[10] = this.terrain.cell;
      f[11] = this.terrain.n;
      f[12] = this.bgrid.x0;
      f[13] = this.bgrid.z0;
      f[14] = this.bgrid.cell;
      f[15] = this.bgrid.w;
      f[16] = 1.25;
      f[17] = 0.6;
      f[18] = 0.45;
      f[19] = this._ncmd || 0;
      f[20] = last ? this._resync ? 2 : 1 : 0;
      f[21] = 0.05;
      f[22] = 0.3;
      f[23] = 300;
      const so = this.so;
      u[24] = so[0];
      u[25] = so[1];
      u[26] = so[2];
      u[27] = so[3];
      u[28] = so[4];
      u[29] = so[5];
      u[30] = this.N;
      u[31] = 0;
      this.device.queue.writeBuffer(this.uni, 0, this.params);
    }
    // dt 만큼 진행. 결과는 readback() 으로 비동기
    step(dt, maxSteps = 2) {
      if (this.lost) return { steps: 0 };
      const t0 = performance.now();
      const d = this.device;
      if (this._bldDirty) {
        this._bldDirty = false;
        this._aliveDirty = false;
        this._uploadBuildings();
        this._staticDirty = true;
      }
      if (this._staticDirty) {
        this._staticDirty = false;
        this._aliveDirty = false;
        this._uploadStatic();
      }
      if (this._aliveDirty && this.bAliveD) {
        this._aliveDirty = false;
        const al = new Uint32Array(this.buildings.map((b) => b ? b.alive : 0));
        if (al.length === this.bAliveD.length) {
          this.bAliveD = al;
          this.device.queue.writeBuffer(this.st, this.so[3] * 4, al);
        } else {
          this._uploadBuildings();
          this._uploadStatic();
        }
      }
      const enc = d.createCommandEncoder();
      let nc = this.pending.size;
      if (this._wakeAll) {
        this._wakeAll = false;
        d.queue.writeBuffer(this.at, 16, new Uint32Array(this.N).fill(1));
      }
      if (nc) {
        if (nc > this.cmdCap) {
          this.cmds.destroy();
          this.cmdCap = 1 << Math.ceil(Math.log2(nc));
          this.cmds = d.createBuffer({ size: this.cmdCap * CMD_V4 * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
          this._bind();
        }
        const all = new Float32Array(nc * CMD_V4 * 4);
        let k = 0;
        for (const r of this.pending.values()) {
          all.set(r, k * CMD_V4 * 4);
          k++;
        }
        d.queue.writeBuffer(this.cmds, 0, all);
        this.pending.clear();
      }
      this._ncmd = nc;
      this._cell = Math.max(6, 2 * (this.maxRad || 3) + 0.5);
      this._acc = Math.min(this._acc + Math.min(dt, 0.1), 1 / 60 * maxSteps);
      const frameStep = 1 / 60;
      let frames = 0;
      while (this._acc >= frameStep - 1e-6 && frames < maxSteps) {
        this._acc -= frameStep;
        frames++;
      }
      const nsub = frames * this.substeps;
      const wg = (n) => Math.ceil(n / 64);
      const run = (pass, name, n) => {
        pass.setPipeline(this.pipes[name]);
        pass.setBindGroup(0, this.group);
        pass.dispatchWorkgroups(Math.max(1, wg(n)));
      };
      const subDt = 1 / 60 / this.substeps;
      if (nc) {
        this._writeParams(subDt, false);
        const p = enc.beginComputePass();
        run(p, "applyCmds", nc);
        p.end();
      }
      d.queue.submit([enc.finish()]);
      this._ncmd = 0;
      const NB = this.top, NP = NB * MAXP;
      if (nsub > 0 && NB > 0) {
        d.queue.writeBuffer(this.at, 0, new Uint32Array(4));
        if (this._missed && this.staging.some((x) => !x.busy && !x.old)) {
          this._missed = false;
          this._resync = true;
        }
        for (let i = 0; i < nsub; i++) {
          const last = i === nsub - 1;
          this._writeParams(subDt, last);
          const e2 = d.createCommandEncoder();
          const p = e2.beginComputePass();
          run(p, "predict", NB);
          run(p, "particles", NP);
          run(p, "clearGrid", this.hashSize);
          run(p, "insert", NP);
          for (let it = 0; it < ITERS; it++) {
            run(p, "contacts", NP);
            run(p, "commit", NP);
          }
          run(p, "shapeMatch", NB);
          p.end();
          d.queue.submit([e2.finish()]);
        }
        this._readback();
        this._resync = false;
        if (!this._timing) {
          this._timing = true;
          const t1 = performance.now();
          d.queue.onSubmittedWorkDone().then(() => {
            this.gpuMs = (this.gpuMs || 0) * 0.8 + (performance.now() - t1) * 0.2;
            this._timing = false;
          });
        }
      }
      const ms = performance.now() - t0;
      this.stepMs = this.stepMs * 0.8 + ms * 0.2;
      return { steps: frames, ms };
    }
    _readback() {
      let st = this.staging.find((s) => !s.busy && !s.old);
      if (!st) {
        if (this.staging.length >= 12) {
          this._missed = true;
          return;
        }
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
        st.b.unmap();
        st.busy = false;
        if (st.old) {
          st.b.destroy();
          this.staging = this.staging.filter((x) => x !== st);
        }
        if (this.onState) this.onState(n, f);
      }).catch(() => {
        st.busy = false;
      });
    }
    free() {
      try {
        this.device.destroy();
      } catch (e) {
      }
    }
  };

  // src/proto/main.js
  window.__proto = async (o = {}) => {
    const core = await GPUCore.create(o.cap || 4096);
    if (!core) return "no gpu";
    if (o.k) core._k = o.k;
    const n = 65, span = 256;
    const h = new Float32Array(n * n);
    core.exec(["hf", 1, n, h, span]);
    let id = 10;
    const ids = [];
    const box = (x, y, z, hx, hy, hz, dyn = true) => {
      const i = id++;
      core.exec(["chunk", i, x, y, z, 0, [hx, hy, hz, 0, 0, 0, 1], 2.4, 0]);
      if (dyn) core.exec(["dyn", i, 1]);
      ids.push(i);
      return i;
    };
    for (let k = 0; k < (o.tower ?? 10); k++) box(0, 0.75 + k * 1.5, 0, 0.75, 0.75, 0.75);
    for (let a = 0; a < (o.wall ?? 6); a++) for (let b = 0; b < 4; b++) box(10 + b * 3, 0.5 + a * 1, 0, 1.5, 0.5, 0.75);
    for (let k = 0; k < (o.pile ?? 200); k++) box(-15 + k % 3 * 3.2, 3 + Math.floor(k / 9) * 3.2, Math.floor(k / 3) % 3 * 3.2, 0.4 + Math.random(), 0.3 + Math.random() * 0.6, 0.4 + Math.random() * 0.8);
    const state = /* @__PURE__ */ new Map();
    core.onState = (cnt, f) => {
      for (let k = 0; k < cnt; k++) {
        const s = f[k * 12 + 3] | 0;
        state.set(core.ids[s], { y: f[k * 12 + 1], x: f[k * 12], v: Math.hypot(f[k * 12 + 8], f[k * 12 + 9], f[k * 12 + 10]), sl: f[k * 12 + 11] });
      }
    };
    const log = [];
    const T = o.secs || 6;
    for (let f = 0; f < T * 60; f++) {
      if (o.push && f === 120) core.exec(["vel", ids[0] + 2, 12, 0, 0]);
      core.step(1 / 60, 1);
      if (f % (o.every || 30) === (o.every || 30) - 1) {
        await core.device.queue.onSubmittedWorkDone();
        await new Promise((r) => setTimeout(r, 0));
        let tw = [];
        for (const k of o.watch || [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]) {
          const s = state.get(k);
          tw.push(s ? [+s.x.toFixed(2), +s.y.toFixed(2), +s.v.toFixed(2), s.sl] : null);
        }
        let maxv = 0, slept = 0, moving = 0, fast = null, miny = 1e9;
        for (const [i, s] of state) {
          if (s.v > maxv) {
            maxv = s.v;
            fast = [i, +s.x.toFixed(1), +s.y.toFixed(1)];
          }
          miny = Math.min(miny, s.y);
          if (s.sl > 0.5) slept++;
          else moving++;
        }
        log.push(JSON.stringify({ t: ((f + 1) / 60).toFixed(1), tower: tw, maxv: +maxv.toFixed(2), fast, miny: +miny.toFixed(1), slept, moving }));
      }
    }
    return log.join("\n");
  };
})();
