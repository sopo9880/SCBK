// 오프라인 데모 도시: Overpass 와 같은 형식의 JSON 을 절차적으로 생성
import { makeProjection } from './geo.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export const DEMO_CENTER = { lat: 37.5, lon: 127.0, name: '데모 시티 (오프라인)' };

export function demoTerrainFn(x, z) {
  // 완만한 언덕 + 강 계곡(z ≈ 260 부근)
  const hills = 18 * Math.sin(x * 0.0042 + 1.3) * Math.cos(z * 0.0037) + 9 * Math.sin(x * 0.011 + z * 0.007);
  const ridge = Math.max(0, -z - 250) * 0.09; // 북쪽은 산
  const valley = -14 * Math.exp(-(((z - 260) / 70) ** 2));
  return hills + ridge + valley + 30;
}

export function generateDemoCity(radius = 600, seed = 7) {
  const R = rng(seed);
  const proj = makeProjection(DEMO_CENTER.lat, DEMO_CENTER.lon);
  const els = [];
  let id = 1;
  const geom = pts => pts.map(([x, z]) => { const [lat, lon] = proj.toLatLon(x, z); return { lat, lon }; });
  const way = (tags, pts, close) => {
    const p = close ? pts.concat([pts[0]]) : pts;
    els.push({ type: 'way', id: id++, tags, geometry: geom(p) });
  };
  const block = 110, street = 14;
  const N = Math.ceil(radius / block) + 1;
  // 도로 격자
  for (let k = -N; k <= N; k++) {
    const c = k * block;
    const kind = k % 4 === 0 ? 'primary' : k % 2 === 0 ? 'secondary' : 'residential';
    way({ highway: kind, name: `데모로 ${k}` }, [[c, -N * block], [c, N * block]]);
    if (Math.abs(c - 260) > 60) way({ highway: kind, name: `중앙대로 ${k}` }, [[-N * block, c], [N * block, c]]);
  }
  // 강
  const river = [];
  for (let x = -N * block; x <= N * block; x += 40) river.push([x, 260 + Math.sin(x / 140) * 18 - 34]);
  const river2 = [];
  for (let x = N * block; x >= -N * block; x -= 40) river2.push([x, 260 + Math.sin(x / 140) * 18 + 34]);
  way({ natural: 'water', name: '데모강' }, river.concat(river2), true);
  // 다리
  way({ highway: 'primary', bridge: 'yes', name: '데모대교' }, [[0, 200], [0, 320]]);

  for (let bx = -N; bx < N; bx++) for (let bz = -N; bz < N; bz++) {
    const x0 = bx * block + street / 2, z0 = bz * block + street / 2;
    const x1 = x0 + block - street, z1 = z0 + block - street;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (Math.hypot(cx, cz) > radius * 1.05) continue;
    if (z1 > 200 && z0 < 320) continue; // 강
    const dist = Math.hypot(cx, cz);
    const r = R();
    if (r < 0.08) { // 공원
      way({ leisure: 'park', name: '데모공원' }, [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], true);
      continue;
    }
    if (cz < -250 && r < 0.5) { // 북쪽 숲
      way({ landuse: 'forest' }, [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], true);
      continue;
    }
    if (r < 0.13) {
      way({ leisure: 'pitch' }, [[x0 + 8, z0 + 8], [x1 - 8, z0 + 8], [x1 - 8, z1 - 8], [x0 + 8, z1 - 8]], true);
      continue;
    }
    const downtown = Math.max(0, 1 - dist / 380);
    if (downtown > 0.35 && R() < 0.6) { // 고층 타워
      const w = 22 + R() * 18, d = 22 + R() * 18;
      const h = 60 + downtown * 140 * R() + 30;
      const pts = R() < 0.3
        ? Array.from({ length: 10 }, (_, i) => [cx + Math.cos(i / 10 * Math.PI * 2) * w * 0.55, cz + Math.sin(i / 10 * Math.PI * 2) * w * 0.55])
        : [[cx - w / 2, cz - d / 2], [cx + w / 2, cz - d / 2], [cx + w / 2, cz + d / 2], [cx - w / 2, cz + d / 2]];
      way({ building: 'commercial', height: String(Math.round(h)), name: `데모타워 ${bx},${bz}` }, pts, true);
      way({ amenity: 'parking' }, [[x0, z1 - 18], [x1, z1 - 18], [x1, z1], [x0, z1]], true);
      continue;
    }
    if (R() < 0.35) { // L자/ㄷ자 건물
      const lv = 3 + Math.floor(R() * 6 + downtown * 8);
      const t = 16;
      const pts = R() < 0.5
        ? [[x0, z0], [x1, z0], [x1, z0 + t], [x0 + t, z0 + t], [x0 + t, z1], [x0, z1]]
        : [[x0, z0], [x1, z0], [x1, z1], [x1 - t, z1], [x1 - t, z0 + t], [x0 + t, z0 + t], [x0 + t, z1], [x0, z1]];
      way({ building: R() < 0.5 ? 'university' : 'office', 'building:levels': String(lv), name: `데모관 ${bx}${bz}` }, pts, true);
      continue;
    }
    // 작은 건물 여러 개
    const cols = 2 + Math.floor(R() * 2), rows = 2 + Math.floor(R() * 2);
    const cw = (x1 - x0) / cols, ch = (z1 - z0) / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      if (R() < 0.15) continue;
      const m = 2 + R() * 3;
      const ax = x0 + i * cw + m, az = z0 + j * ch + m, bx2 = x0 + (i + 1) * cw - m, bz2 = z0 + (j + 1) * ch - m;
      const types = ['residential', 'apartments', 'house', 'retail', 'yes'];
      const ty = types[Math.floor(R() * types.length)];
      const tags = { building: ty };
      if (ty === 'apartments') tags['building:levels'] = String(8 + Math.floor(R() * 15));
      way(tags, [[ax, az], [bx2, az], [bx2, bz2], [ax, bz2]], true);
    }
  }
  return { center: DEMO_CENTER, json: { elements: els } };
}
