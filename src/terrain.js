// 높이맵 생성 (AWS Terrarium 타일 또는 절차적 함수)
import { lonLatToTile } from './geo.js';

export class HeightGrid {
  constructor(span, n) {
    this.span = span;          // 한 변 길이(m), 원점 중심
    this.n = n;                // 정점 수(한 변)
    this.cell = span / (n - 1);
    this.h = new Float32Array(n * n);
    this.version = 0;
  }
  idx(i, j) { return j * this.n + i; } // i: x 방향, j: z 방향
  // 월드 x,z → 높이 (쌍선형)
  sample(x, z) {
    const n = this.n;
    const fx = (x + this.span / 2) / this.cell;
    const fz = (z + this.span / 2) / this.cell;
    let i = Math.floor(fx), j = Math.floor(fz);
    i = Math.max(0, Math.min(n - 2, i)); j = Math.max(0, Math.min(n - 2, j));
    const tx = Math.max(0, Math.min(1, fx - i)), tz = Math.max(0, Math.min(1, fz - j));
    const h = this.h;
    const a = h[j * n + i], b = h[j * n + i + 1], c = h[(j + 1) * n + i], d = h[(j + 1) * n + i + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  }
  normalAt(x, z) {
    const e = this.cell;
    const dx = this.sample(x + e, z) - this.sample(x - e, z);
    const dz = this.sample(x, z + e) - this.sample(x, z - e);
    const l = Math.hypot(dx, 2 * e, dz);
    return [-dx / l, (2 * e) / l, -dz / l];
  }
  // 크레이터: 반지름 r, 깊이 d (테두리는 약간 솟음)
  crater(x, z, r, d) {
    const n = this.n, c = this.cell;
    const i0 = Math.max(0, Math.floor((x - r * 1.4 + this.span / 2) / c));
    const i1 = Math.min(n - 1, Math.ceil((x + r * 1.4 + this.span / 2) / c));
    const j0 = Math.max(0, Math.floor((z - r * 1.4 + this.span / 2) / c));
    const j1 = Math.min(n - 1, Math.ceil((z + r * 1.4 + this.span / 2) / c));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = -this.span / 2 + i * c, pz = -this.span / 2 + j * c;
      const t = Math.hypot(px - x, pz - z) / r;
      let dh = 0;
      if (t < 1) dh = -d * (1 - t * t) * (1 - t * t) + d * 0.12 * t * t;
      else if (t < 1.4) dh = d * 0.12 * (1 - (t - 1) / 0.4) ** 2;
      this.h[j * n + i] += dh;
    }
    this.version++;
    return [i0, i1, j0, j1];
  }
}

export function chooseTerrainParams(radius) {
  const span = Math.round(radius * 2 * 1.35 + 500);
  const n = Math.min(513, Math.max(257, Math.round(span / 7) | 1));
  return { span, n: n % 2 ? n : n + 1 };
}

// Terrarium 타일 디코드: elev = R*256 + G + B/256 - 32768
async function decodeTile(buf) {
  const blob = new Blob([buf], { type: 'image/png' });
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const cv = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
  const out = new Float32Array(bmp.width * bmp.height);
  for (let k = 0, p = 0; k < out.length; k++, p += 4) out[k] = d[p] * 256 + d[p + 1] + d[p + 2] / 256 - 32768;
  return { w: bmp.width, h: bmp.height, data: out };
}

export async function buildTerrainFromTiles(proj, radius, fetchTile, onProgress) {
  const { span, n } = chooseTerrainParams(radius);
  const grid = new HeightGrid(span, n);
  const z = span > 3200 ? 14 : 15;
  const half = span / 2;
  const [nwLat, nwLon] = proj.toLatLon(-half, -half);
  const [seLat, seLon] = proj.toLatLon(half, half);
  const [tx0, ty0] = lonLatToTile(nwLon, nwLat, z);
  const [tx1, ty1] = lonLatToTile(seLon, seLat, z);
  const tiles = new Map();
  const list = [];
  for (let ty = Math.floor(ty0); ty <= Math.floor(ty1); ty++)
    for (let tx = Math.floor(tx0); tx <= Math.floor(tx1); tx++) list.push([tx, ty]);
  let done = 0, failed = 0;
  await Promise.all(list.map(async ([tx, ty]) => {
    try {
      const buf = await fetchTile(z, tx, ty);
      tiles.set(tx + ',' + ty, await decodeTile(buf));
    } catch (e) { failed++; }
    done++; onProgress && onProgress(done / list.length);
  }));
  if (failed === list.length) throw new Error('지형 타일을 하나도 받지 못했습니다');

  const sampleTile = (fx, fy) => {
    const tx = Math.floor(fx), ty = Math.floor(fy);
    const t = tiles.get(tx + ',' + ty);
    if (!t) return NaN;
    const px = Math.min(t.w - 1.001, (fx - tx) * t.w - 0.5), py = Math.min(t.h - 1.001, (fy - ty) * t.h - 0.5);
    const i = Math.max(0, Math.floor(px)), j = Math.max(0, Math.floor(py));
    const ax = Math.max(0, px - i), ay = Math.max(0, py - j);
    const i1 = Math.min(t.w - 1, i + 1), j1 = Math.min(t.h - 1, j + 1);
    const d = t.data;
    return (d[j * t.w + i] * (1 - ax) + d[j * t.w + i1] * ax) * (1 - ay) + (d[j1 * t.w + i] * (1 - ax) + d[j1 * t.w + i1] * ax) * ay;
  };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -half + i * grid.cell, zz = -half + j * grid.cell;
    const [lat, lon] = proj.toLatLon(x, zz);
    const [fx, fy] = lonLatToTile(lon, lat, z);
    grid.h[j * n + i] = sampleTile(fx, fy);
  }
  fixNaN(grid);
  // 물(바다) 아래 음수 → 0 근처로 (SRTM 바다는 0 또는 음수)
  let seaCells = 0;
  for (let k = 0; k < grid.h.length; k++) { if (grid.h[k] < -1) seaCells++; if (grid.h[k] < -6) grid.h[k] = -6; }
  blur(grid, 2);
  const base = normalize(grid);
  if (seaCells > grid.h.length * 0.002) grid.seaLevel = -base;
  return grid;
}

export function buildProceduralTerrain(radius, fn) {
  const { span, n } = chooseTerrainParams(radius);
  const grid = new HeightGrid(span, n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++)
    grid.h[j * n + i] = fn(-span / 2 + i * grid.cell, -span / 2 + j * grid.cell);
  normalize(grid);
  return grid;
}

export function buildFlatTerrain(radius) {
  return buildProceduralTerrain(radius, () => 0);
}

function fixNaN(g) {
  let s = 0, c = 0;
  for (const v of g.h) if (isFinite(v)) { s += v; c++; }
  const avg = c ? s / c : 0;
  for (let k = 0; k < g.h.length; k++) if (!isFinite(g.h[k])) g.h[k] = avg;
}

function blur(g, passes) {
  const n = g.n; const t = new Float32Array(g.h.length);
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
        const w = di === 0 && dj === 0 ? 4 : di === 0 || dj === 0 ? 2 : 1;
        s += g.h[jj * n + ii] * w; c += w;
      }
      t[j * n + i] = s / c;
    }
    g.h.set(t);
  }
}

// 중앙 부근 최저점을 0 근처로
function normalize(g) {
  const c = g.sample(0, 0);
  let mn = Infinity;
  for (const v of g.h) mn = Math.min(mn, v);
  const base = Math.max(mn, c - 60);
  for (let k = 0; k < g.h.length; k++) g.h[k] -= base;
  return base;
}

// 물 영역 아래 지형을 파서 강/호수 바닥 만들기 (수면 높이를 area.level 에 기록)
import { pointInPoly as _pip } from './geo.js';
export function carveWater(grid, areas, waterLines) {
  const n = grid.n, c = grid.cell, half = grid.span / 2;
  const bank = 22; // 둑 경사 폭(m)
  for (const a of areas) {
    if (a.kind !== 'water') continue;
    const hs = [];
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    for (const p of a.outer) {
      hs.push(grid.sample(p[0], p[1]));
      minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); minz = Math.min(minz, p[1]); maxz = Math.max(maxz, p[1]);
    }
    hs.sort((x, y) => x - y);
    a.level = hs[Math.floor(hs.length * 0.15)] - 0.8;
    const i0 = Math.max(0, Math.floor((minx - bank + half) / c)), i1 = Math.min(n - 1, Math.ceil((maxx + bank + half) / c));
    const j0 = Math.max(0, Math.floor((minz - bank + half) / c)), j1 = Math.min(n - 1, Math.ceil((maxz + bank + half) / c));
    const ring = a.outer;
    const segDist = (x, z) => {
      let best = Infinity;
      for (let k = 0, m = ring.length; k < m; k++) {
        const p = ring[k], q = ring[(k + 1) % m];
        const dx = q[0] - p[0], dz = q[1] - p[1];
        const t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (z - p[1]) * dz) / (dx * dx + dz * dz || 1)));
        best = Math.min(best, Math.hypot(x - p[0] - t * dx, z - p[1] - t * dz));
      }
      return best;
    };
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = -half + i * c, z = -half + j * c;
      const k = j * n + i;
      const inside = _pip([x, z], a.outer) && !a.holes.some(h => _pip([x, z], h));
      if (inside) { grid.h[k] = Math.min(grid.h[k], a.level - 2.2); continue; }
      if (ring.length > 400) continue;
      const d = segDist(x, z);
      if (d < bank) {
        // 둑: 물가에서 원래 지형까지 부드럽게
        const t = d / bank, target = a.level + 0.6;
        if (grid.h[k] > target) grid.h[k] = target + (grid.h[k] - target) * (t * t * (3 - 2 * t));
      }
    }
  }
  grid.version++;
}
