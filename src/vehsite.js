// 탈것 출발 자리: 지도 밖 활주로, 옥상·지상 헬리패드, 건물 충돌 판정 도우미
import * as THREE from 'three';
import { glow } from './weapons/models4.js';
import { pointInPoly } from './geo.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- 물 ----------
export function waterTest(data) {
  const polys = [], lines = [];
  for (const a of (data && data.areas) || []) if (a.kind === 'water' && a.outer && a.outer.length > 2) {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of a.outer) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    polys.push({ pts: a.outer, x0, x1, z0, z1 });
  }
  for (const w of (data && data.waterLines) || []) for (let i = 0; i + 1 < w.pts.length; i++) lines.push([w.pts[i], w.pts[i + 1], (w.width || 8) / 2 + 4]);
  return (x, z) => {
    for (const p of polys) if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1 && pointInPoly([x, z], p.pts)) return true;
    for (const [[ax, az], [bx, bz], r] of lines) {
      const ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez || 1, u = clamp(((x - ax) * ex + (z - az) * ez) / L2, 0, 1);
      if ((ax + ex * u - x) ** 2 + (az + ez * u - z) ** 2 < r * r) return true;
    }
    return false;
  };
}

// ---------- 건물 판정 ----------
// 건물 꼭대기 높이 (서 있거나 주저앉은 건물만)
export const topOf = (b) => b.baseY + (b.state === 'flat' ? b.flatH : b.height);
const solid = (b) => b.state === 'intact' || b.state === 'flat';
// 점이 건물 안인지 (실제 바닥 모양 기준)
export function pointInBuilding(D, p, pad = 0) {
  for (const b of D.buildingsNear(p.x, p.z, pad + 1)) {
    if (!solid(b)) continue;
    if (p.y > topOf(b) || p.y < b.baseY - 2) continue;
    if (p.x < b.minx - pad || p.x > b.maxx + pad || p.z < b.minz - pad || p.z > b.maxz + pad) continue;
    if (pointInPoly([p.x, p.z], b.pts)) return b;
  }
  return null;
}
// 바로 아래 지붕 높이 (없으면 null)
export function roofUnder(D, x, z) {
  let top = null;
  for (const b of D.buildingsNear(x, z, 1)) {
    if (!solid(b)) continue;
    if (x < b.minx || x > b.maxx || z < b.minz || z > b.maxz || !pointInPoly([x, z], b.pts)) continue;
    const t = topOf(b); if (top === null || t > top) top = t;
  }
  return top;
}
const segX = (ax, az, bx, bz, cx, cz, dx, dz) => {
  const d = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx); if (Math.abs(d) < 1e-9) return null;
  const u = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / d, v = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / d;
  return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? [ax + (bx - ax) * u, az + (bz - az) * u] : null;
};
// 회전한 상자(차체)가 건물 바닥 모양과 겹치는지. 겹치면 { b, x, z } (닿은 지점)
export function boxHitsBuilding(D, cx, cz, y, fx, fz, hl, hw) {
  const sx = -fz, sz = fx;
  const C = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, c]) => [cx + fx * hl * a + sx * hw * c, cz + fz * hl * a + sz * hw * c]);
  for (const b of D.buildingsNear(cx, cz, hl + 1)) {
    if (!solid(b) || y > topOf(b) - 0.3 || y + 1.5 < b.baseY) continue;
    for (const [x, z] of C) if (x >= b.minx && x <= b.maxx && z >= b.minz && z <= b.maxz && pointInPoly([x, z], b.pts)) return { b, x, z };
    const P = b.pts;
    for (let i = 0; i < P.length; i++) {
      const [px, pz] = P[i];
      const lx = (px - cx) * fx + (pz - cz) * fz, lz = (px - cx) * sx + (pz - cz) * sz;
      if (Math.abs(lx) <= hl && Math.abs(lz) <= hw) return { b, x: px, z: pz };
      const [qx, qz] = P[(i + 1) % P.length];
      for (let k = 0; k < 4; k++) { const [ax, az] = C[k], [bx, bz] = C[(k + 1) % 4]; const h = segX(ax, az, bx, bz, px, pz, qx, qz); if (h) return { b, x: h[0], z: h[1] }; }
    }
  }
  return null;
}

// ---------- 활주로 (지도 밖) ----------
function townsNear(world, x, z, r) {
  if (!world || !world._towns) return false;
  for (const t of world._towns) { const rr = r + Math.max(t.w, t.d) * 0.75; if ((t.x - x) ** 2 + (t.z - z) ** 2 < rr * rr) return true; }
  return false;
}
// 지도 가장자리 바깥에서, 도시를 향해 놓을 수 있는 가장 평평한 자리
function findRunway(game, L, W, near) {
  const half = game.grid.span / 2, world = game.world;
  let best = null, bc = 1e18;
  for (let a = 0; a < 48; a++) {
    const ang = a / 48 * Math.PI * 2, ux = Math.cos(ang), uz = Math.sin(ang);
    // 정사각형 지도 경계에서 이 방향으로 나가는 거리
    const edge = half / Math.max(Math.abs(ux), Math.abs(uz));
    for (const m of [60, 160, 320]) {
      const d0 = edge + m;                                   // 도시 쪽 끝
      let cost = Math.hypot(ux * d0 - near.x, uz * d0 - near.z) * 0.02 + m * 0.05;
      let hmin = 1e9, hmax = -1e9, ph = null, bad = false;
      for (let s = 0; s <= L + 1; s += 25) {
        const cx = ux * (d0 + s), cz = uz * (d0 + s);
        for (const k of [-0.5, 0, 0.5]) {
          const x = cx - uz * W * k, z = cz + ux * W * k;
          if (Math.abs(x) < half + 15 && Math.abs(z) < half + 15) { bad = true; break; }
          const h = game.groundAt(x, z); hmin = Math.min(hmin, h); hmax = Math.max(hmax, h);
          if (k === 0) { if (ph !== null) cost += Math.max(0, Math.abs(h - ph) - 0.8) * 6; ph = h; }
        }
        if (bad) break;
        if (townsNear(world, cx, cz, W * 0.6 + 10)) cost += 400;
        if (cost > bc) break;
      }
      if (bad) continue;
      cost += (hmax - hmin) * 3;
      if (cost < bc) { bc = cost; best = { ux, uz, d0 }; }
    }
  }
  return best;
}
function runwayTexture(L, W) {
  const cw = 128, ch = Math.min(4096, Math.round(cw * L / W));
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const x = cv.getContext('2d');
  x.fillStyle = '#3b3e43'; x.fillRect(0, 0, cw, ch);
  for (let i = 0; i < 2500; i++) { const v = 50 + Math.random() * 25; x.fillStyle = `rgba(${v},${v},${v + 3},0.5)`; x.fillRect(Math.random() * cw, Math.random() * ch, 2, 2); }
  const ppm = ch / L;
  x.fillStyle = '#e8e8e2';
  x.fillRect(5, 0, 3, ch); x.fillRect(cw - 8, 0, 3, ch);
  for (let y = 70 * ppm; y < ch - 70 * ppm; y += 50 * ppm) x.fillRect(cw / 2 - 1.5, y, 3, 30 * ppm);
  for (const end of [0, 1]) {
    const y0 = end ? ch - 14 * ppm : 4 * ppm;
    for (let k = 0; k < 8; k++) { const xx = 14 + k * ((cw - 28) / 8) + (k >= 4 ? 6 : 0); x.fillRect(xx, y0, (cw - 40) / 8 - 3, 10 * ppm); }
    for (const d of [150, 300]) { const yy = end ? ch - d * ppm : d * ppm; if (d < L / 2) { x.fillRect(22, yy, 14, 22 * ppm); x.fillRect(cw - 36, yy, 14, 22 * ppm); } }
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
// a: 출발 끝(바깥쪽), dir: 도시를 향하는 방향
export function buildRunway(A, L, W, near) {
  const { game, scene } = A.ctx;
  const site = findRunway(game, L, W, near);
  if (!site) return null;
  const dir = v3(-site.ux, 0, -site.uz), side = v3(-dir.z, 0, dir.x);
  const a = v3(site.ux * (site.d0 + L), 0, site.uz * (site.d0 + L));
  const n = Math.ceil(L / 10) + 1;
  // 지형보다 항상 위에 오도록 윗면을 감싸며 매끈하게 (둑을 쌓음)
  const h0 = [];
  for (let i = 0; i < n; i++) {
    const c = a.clone().addScaledVector(dir, Math.min(L, i * 10)); let h = -1e9;
    for (const k of [-0.6, -0.3, 0, 0.3, 0.6]) h = Math.max(h, game.groundAt(c.x + side.x * W * k, c.z + side.z * W * k));
    h0.push(h + 0.6);
  }
  const hs = h0.slice();
  for (let it = 0; it < 40; it++) for (let i = 1; i < n - 1; i++) hs[i] = Math.max(h0[i], (hs[i - 1] + hs[i] + hs[i + 1]) / 3);
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < n; i++) {
    const s = Math.min(L, i * 10), c = a.clone().addScaledVector(dir, s);
    for (const k of [-0.5, 0.5]) { pos.push(c.x + side.x * W * k, hs[i], c.z + side.z * W * k); uv.push(k + 0.5, 1 - s / L); }
    if (i) { const b = (i - 1) * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  const g = new THREE.Group();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: runwayTexture(L, W), roughness: 0.92, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  m.receiveShadow = true; g.add(m);
  // 둑 옆면: 활주로 가장자리에서 바깥 지면까지 비스듬히
  const sp = [], si = [];
  for (const sgn of [-1, 1]) {
    const base = sp.length / 3;
    for (let i = 0; i < n; i++) {
      const c = a.clone().addScaledVector(dir, Math.min(L, i * 10));
      const e = c.clone().addScaledVector(side, sgn * W * 0.5), o = c.clone().addScaledVector(side, sgn * (W * 0.5 + 4 + (hs[i] - game.groundAt(e.x, e.z)) * 1.5));
      sp.push(e.x, hs[i] - 0.05, e.z, o.x, game.groundAt(o.x, o.z) - 1.5, o.z);
      if (i) { const b = base + (i - 1) * 2; if (sgn > 0) si.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); else si.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.setIndex(si); sg.computeVertexNormals();
  g.add(new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: 0x6a6650, roughness: 1, metalness: 0 })));
  // 가장자리 등, 양 끝 초록·빨강 등
  const lamp = new THREE.SphereGeometry(0.45, 6, 4);
  const lights = [];
  for (let s = 0; s <= L; s += 30) for (const k of [-0.5, 0.5]) lights.push([s, k, 0xfff6d8]);
  for (let k = -0.5; k <= 0.5001; k += 0.125) { lights.push([0, k, 0x40ff70]); lights.push([L, k, 0xff3a30]); }
  for (const [s, k, col] of lights) {
    const lm = new THREE.Mesh(lamp, glow(col, 1)); const c = a.clone().addScaledVector(dir, s).addScaledVector(side, W * (k * 1.04));
    lm.position.set(c.x, hs[Math.min(n - 1, Math.round(s / 10))] + 0.4, c.z); g.add(lm);
  }
  scene.add(g);
  const hAt = (p) => {
    const s = (p.x - a.x) * dir.x + (p.z - a.z) * dir.z, l = (p.x - a.x) * side.x + (p.z - a.z) * side.z;
    if (s < -5 || s > L + 5 || Math.abs(l) > W / 2 + 6) return null;
    const f = clamp(s, 0, L) / 10, i = Math.min(n - 2, Math.floor(f)), u = f - i;
    return hs[i] * (1 - u) + hs[i + 1] * u;
  };
  const info = (p) => ({ s: (p.x - a.x) * dir.x + (p.z - a.z) * dir.z, l: (p.x - a.x) * side.x + (p.z - a.z) * side.z });
  return { a, dir, side, L, W, hAt, info, dispose() { scene.remove(g); g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); } };
}

// ---------- 헬리패드 ----------
function padTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const x = cv.getContext('2d');
  x.fillStyle = '#41464c'; x.beginPath(); x.arc(128, 128, 126, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#f2c230'; x.lineWidth = 12; x.beginPath(); x.arc(128, 128, 104, 0, Math.PI * 2); x.stroke();
  x.fillStyle = '#f4f4f0'; x.font = 'bold 150px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('H', 128, 136);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
// 가까운 넓은 옥상 → 없으면 가까운 빈 땅
export function buildHelipad(A, near, R0 = 9) {
  const { game, D, scene, world } = A.ctx;
  const wet = waterTest(game.data);
  let best = null, bs = -1e9;
  for (const b of D.buildingsNear(near.x, near.z, 450)) {
    if (b.state !== 'intact' || b.height < 8 || b.height > 160) continue;
    const w = b.maxx - b.minx, d = b.maxz - b.minz;
    if (Math.min(w, d) < R0 * 2.4) continue;
    // 바닥 모양 중심이 실제로 건물 안이고, 패드 둘레가 지붕 위에 있어야 함
    let cx = 0, cz = 0; for (const [x, z] of b.pts) { cx += x; cz += z; } cx /= b.pts.length; cz /= b.pts.length;
    let ok = pointInPoly([cx, cz], b.pts);
    for (let k = 0; ok && k < 8; k++) { const a = k / 8 * Math.PI * 2; ok = pointInPoly([cx + Math.cos(a) * R0 * 1.1, cz + Math.sin(a) * R0 * 1.1], b.pts); }
    if (!ok) continue;
    const sc = b.height * 0.6 + Math.min(w, d) * 0.4 - Math.hypot(cx - near.x, cz - near.z) * 0.12;
    if (sc > bs) { bs = sc; best = { x: cx, z: cz, y: topOf(b), b }; }
  }
  if (!best) {
    for (let k = 0; k < 160 && !best; k++) {
      const a = k * 2.4, d = 20 + k * 6;
      const x = near.x + Math.cos(a) * d, z = near.z + Math.sin(a) * d;
      if (Math.abs(x) > game.grid.span / 2 - 20 || Math.abs(z) > game.grid.span / 2 - 20) continue;
      if (wet(x, z) || D.buildingsNear(x, z, R0 + 8).some(b => solid(b))) continue;
      best = { x, z, y: game.groundAt(x, z) };
    }
  }
  if (!best) return null;
  const g = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.CircleGeometry(R0, 40), new THREE.MeshStandardMaterial({ map: padTexture(), roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  pad.rotation.x = -Math.PI / 2; pad.position.set(best.x, best.y + 0.12, best.z); pad.receiveShadow = true; g.add(pad);
  const lamp = new THREE.SphereGeometry(0.3, 6, 4);
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; const l = new THREE.Mesh(lamp, glow(0x7fe08a, 1)); l.position.set(best.x + Math.cos(a) * (R0 + 0.4), best.y + 0.3, best.z + Math.sin(a) * (R0 + 0.4)); g.add(l); }
  scene.add(g);
  if (!best.b) world.blastTrees(best.x, best.z, R0 + 6, R0 + 6);
  return { x: best.x, y: best.y, z: best.z, r: R0, roof: !!best.b, dispose() { scene.remove(g); g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); } };
}
