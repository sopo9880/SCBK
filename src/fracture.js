// 건물 외피 / 조각(chunk) 기하 생성
import * as THREE from 'three';
import earcut from 'earcut';
import { polyArea, hash01 } from './geo.js';

// aKind: 0 = 외벽, 1 = 지붕, 2 = 내부 단면(콘크리트)
class GeoBuilder {
  constructor() { this.pos = []; this.nrm = []; this.org = []; this.kind = []; this.idx = []; this.n = 0; }
  vert(x, y, z, nx, ny, nz, cx, cy, cz, k) {
    this.pos.push(x - cx, y - cy, z - cz); this.nrm.push(nx, ny, nz); this.org.push(x, y, z); this.kind.push(k);
    return this.n++;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('aOrig', new THREE.Float32BufferAttribute(this.org, 3));
    g.setAttribute('aKind', new THREE.Float32BufferAttribute(this.kind, 1));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

// ring: [[x,z]...] (외곽 CCW = 양의 면적, 구멍 CW)
function addWalls(B, ring, y0, y1, c, kinds) {
  const n = ring.length;
  for (let e = 0; e < n; e++) {
    const p = ring[e], q = ring[(e + 1) % n];
    const dx = q[0] - p[0], dz = q[1] - p[1];
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) continue;
    const nx = dz / len, nz = -dx / len;
    const k = kinds ? kinds[e] : 0;
    const a = B.vert(p[0], y0, p[1], nx, 0, nz, c[0], c[1], c[2], k);
    const b = B.vert(q[0], y0, q[1], nx, 0, nz, c[0], c[1], c[2], k);
    const cc = B.vert(q[0], y1, q[1], nx, 0, nz, c[0], c[1], c[2], k);
    const d = B.vert(p[0], y1, p[1], nx, 0, nz, c[0], c[1], c[2], k);
    B.idx.push(a, d, b, b, d, cc);
  }
}

function addCap(B, outer, holes, y, up, c, k) {
  const flat = [], holeIdx = [], all = [];
  for (const p of outer) { flat.push(p[0], p[1]); all.push(p); }
  for (const h of holes) { holeIdx.push(all.length); for (const p of h) { flat.push(p[0], p[1]); all.push(p); } }
  const tri = earcut(flat, holeIdx.length ? holeIdx : null, 2);
  if (!tri.length) return;
  const base = B.n;
  const ny = up ? 1 : -1;
  for (const p of all) B.vert(p[0], y, p[1], 0, ny, 0, c[0], c[1], c[2], k);
  for (let t = 0; t < tri.length; t += 3) {
    const a = all[tri[t]], b = all[tri[t + 1]], d = all[tri[t + 2]];
    // (b-a)×(d-a) 의 y 성분 = u.z*v.x - u.x*v.z
    const cy = (b[1] - a[1]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[1] - a[1]);
    if ((cy > 0) === up) B.idx.push(base + tri[t], base + tri[t + 1], base + tri[t + 2]);
    else B.idx.push(base + tri[t], base + tri[t + 2], base + tri[t + 1]);
  }
}

// 온전한 건물 외피 (월드 좌표 그대로)
export function buildingShell(b, baseY) {
  const B = new GeoBuilder();
  const c = [0, 0, 0];
  const y0 = b.minH > 0.5 ? baseY + b.minH : baseY - 4;
  const y1 = baseY + b.height;
  addWalls(B, b.pts, y0, y1, c, null);
  for (const h of b.holes) addWalls(B, h, y0, y1, c, null);
  addCap(B, b.pts, b.holes, y1, true, c, 1);
  if (b.minH > 0.5) addCap(B, b.pts, b.holes, y0, false, c, 2);
  return B.build();
}

// 충돌용 삼각형 메시 (외피와 동일하되 지면 아래 부분 생략)
export function shellTrimesh(geo) {
  const p = geo.getAttribute('aOrig').array;
  const idx = geo.getIndex().array;
  return { vertices: new Float32Array(p), indices: new Uint32Array(idx) };
}

// Sutherland–Hodgman: 축 정렬 사각형으로 다각형 자르기
function clipRect(poly, u0, v0, u1, v1) {
  const edges = [
    p => p[0] >= u0, (a, b) => { const t = (u0 - a[0]) / (b[0] - a[0]); return [u0, a[1] + t * (b[1] - a[1])]; },
    p => p[0] <= u1, (a, b) => { const t = (u1 - a[0]) / (b[0] - a[0]); return [u1, a[1] + t * (b[1] - a[1])]; },
    p => p[1] >= v0, (a, b) => { const t = (v0 - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), v0]; },
    p => p[1] <= v1, (a, b) => { const t = (v1 - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), v1]; },
  ];
  let out = poly;
  for (let e = 0; e < 8 && out.length; e += 2) {
    const inside = edges[e], inter = edges[e + 1];
    const inp = out; out = [];
    for (let i = 0; i < inp.length; i++) {
      const cur = inp[i], prev = inp[(i + inp.length - 1) % inp.length];
      const ci = inside(cur), pi = inside(prev);
      if (ci) { if (!pi) out.push(inter(prev, cur)); out.push(cur); }
      else if (pi) out.push(inter(prev, cur));
    }
  }
  // 중복점 제거
  const res = [];
  for (const p of out) {
    const l = res[res.length - 1];
    if (!l || Math.abs(l[0] - p[0]) > 1e-3 || Math.abs(l[1] - p[1]) > 1e-3) res.push(p);
  }
  if (res.length > 1) { const f = res[0], l = res[res.length - 1]; if (Math.abs(f[0] - l[0]) < 1e-3 && Math.abs(f[1] - l[1]) < 1e-3) res.pop(); }
  return res;
}

function dominantAngle(pts) {
  let best = 0, bestLen = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (l > bestLen) { bestLen = l; best = Math.atan2(q[1] - p[1], q[0] - p[0]); }
  }
  return best;
}

function inPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if ((zi > p[1]) !== (zj > p[1]) && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * 건물을 조각으로 나눈다.
 * @param b 건물
 * @param baseY 건물 바닥 높이(지형 최저점)
 * @param groundAt (x,z)=>지형높이
 * @param maxChunks 목표 최대 조각 수 (LOD)
 */
export function fractureBuilding(b, baseY, groundAt, maxChunks = 220) {
  const R = (k) => hash01(b.id * 13.17 + k * 7.3);
  const bottom = baseY + (b.minH > 0.5 ? b.minH : 0);
  const top = baseY + b.height;
  const H = top - bottom;
  let floorH = isFinite(b.levels) && b.levels > 0 ? b.height / b.levels : 3.4;
  floorH = Math.min(5, Math.max(2.8, floorH));
  // 조각이 정육면체에 가깝도록: 조각 하나의 부피 → 한 변 길이
  const vPer = (b.area * H) / maxChunks;
  const edge = Math.cbrt(vPer);
  const lf = Math.max(1, Math.round(edge / floorH));
  let nL = Math.max(1, Math.round(H / (lf * floorH)));
  const layerH = H / nL;
  const th = dominantAngle(b.pts);
  const cs = Math.cos(th), sn = Math.sin(th);
  const toUV = p => [p[0] * cs + p[1] * sn, -p[0] * sn + p[1] * cs];
  const toXZ = p => [p[0] * cs - p[1] * sn, p[0] * sn + p[1] * cs];
  const uv = b.pts.map(toUV);
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const p of uv) { u0 = Math.min(u0, p[0]); u1 = Math.max(u1, p[0]); v0 = Math.min(v0, p[1]); v1 = Math.max(v1, p[1]); }

  const minCell = maxChunks >= 150 ? 3.2 : maxChunks >= 60 ? 5 : 8;
  let s = Math.max(minCell, Math.sqrt(vPer / layerH));
  s = Math.min(s, 30);
  let nu = Math.max(1, Math.round((u1 - u0) / s)), nv = Math.max(1, Math.round((v1 - v0) / s));
  while (nu * nv * nL > maxChunks * 1.3 && s < 40) {
    s *= 1.15;
    nu = Math.max(1, Math.round((u1 - u0) / s)); nv = Math.max(1, Math.round((v1 - v0) / s));
  }
  const su = (u1 - u0) / nu, sv = (v1 - v0) / nv;
  // 경계선에 약간의 흔들림
  const ucuts = [u0 - 0.01], vcuts = [v0 - 0.01];
  for (let i = 1; i < nu; i++) ucuts.push(u0 + i * su + (R(i) - 0.5) * su * 0.5);
  for (let j = 1; j < nv; j++) vcuts.push(v0 + j * sv + (R(100 + j) - 0.5) * sv * 0.5);
  ucuts.push(u1 + 0.01); vcuts.push(v1 + 0.01);

  const chunks = [];
  const eps = 1e-3;
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const ru0 = ucuts[i], ru1 = ucuts[i + 1], rv0 = vcuts[j], rv1 = vcuts[j + 1];
    const piece = clipRect(uv, ru0, rv0, ru1, rv1);
    if (piece.length < 3) continue;
    const a = polyArea(piece);
    if (Math.abs(a) < 0.5) continue;
    // 조각 테두리 중 사각형 경계 위에 있는 변 = 잘린 단면
    const kinds = [];
    for (let e = 0; e < piece.length; e++) {
      const p = piece[e], q = piece[(e + 1) % piece.length];
      const onU0 = Math.abs(p[0] - ru0) < eps && Math.abs(q[0] - ru0) < eps;
      const onU1 = Math.abs(p[0] - ru1) < eps && Math.abs(q[0] - ru1) < eps;
      const onV0 = Math.abs(p[1] - rv0) < eps && Math.abs(q[1] - rv0) < eps;
      const onV1 = Math.abs(p[1] - rv1) < eps && Math.abs(q[1] - rv1) < eps;
      const outer = (i === 0 && onU0) || (i === nu - 1 && onU1) || (j === 0 && onV0) || (j === nv - 1 && onV1);
      kinds.push((onU0 || onU1 || onV0 || onV1) && !outer ? 2 : 0);
    }
    let ring = piece.map(toXZ);
    if (polyArea(ring) < 0) { ring.reverse(); kinds.reverse(); kinds.push(kinds.shift()); }
    // 중심
    let cx = 0, cz = 0;
    for (const p of ring) { cx += p[0]; cz += p[1]; }
    cx /= ring.length; cz /= ring.length;
    if (b.holes.length && b.holes.some(h => inPoly([cx, cz], h))) continue;
    // 조각 아래 지면 최고점
    let gmax = groundAt(cx, cz);
    for (const p of ring) gmax = Math.max(gmax, groundAt(p[0], p[1]));
    const areaAbs = Math.abs(a);

    for (let k = 0; k < nL; k++) {
      let y0 = bottom + k * layerH, y1 = bottom + (k + 1) * layerH;
      if (b.minH <= 0.5) y0 = Math.max(y0, gmax + 0.04);
      if (y1 - y0 < 0.7) continue;
      const cy = (y0 + y1) / 2;
      const c = [cx, cy, cz];
      const Bd = new GeoBuilder();
      addWalls(Bd, ring, y0, y1, c, kinds);
      addCap(Bd, ring, [], y1, true, c, k === nL - 1 ? 1 : 2);
      addCap(Bd, ring, [], y0, false, c, 2);
      const hull = new Float32Array(ring.length * 6);
      const sh = 0.96; // 충돌체를 살짝 줄여 서로 끼지 않게
      ring.forEach((p, n) => {
        hull.set([(p[0] - cx) * sh, (y0 - cy) * sh, (p[1] - cz) * sh, (p[0] - cx) * sh, (y1 - cy) * sh, (p[1] - cz) * sh], n * 6);
      });
      chunks.push({
        geo: Bd.build(), center: c, hull,
        vol: areaAbs * (y1 - y0), i, j, k, top: k === nL - 1,
        half: [Math.sqrt(areaAbs) / 2, (y1 - y0) / 2],
      });
    }
  }
  return { chunks, nu, nv, nL };
}
