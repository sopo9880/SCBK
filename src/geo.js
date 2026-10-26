// 지리 좌표 ↔ 로컬 미터 좌표, OSM(Overpass) 응답 파싱
// 좌표계: x = 동쪽(m), z = 남쪽(m)  (three.js 에서 -z 가 북쪽), y = 위

export function makeProjection(lat0, lon0) {
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110540;
  return {
    lat0, lon0, kx, ky,
    toXZ(lat, lon) { return [(lon - lon0) * kx, -(lat - lat0) * ky]; },
    toLatLon(x, z) { return [lat0 - z / ky, lon0 + x / kx]; },
  };
}

export function bboxFor(lat0, lon0, radius) {
  const dLat = radius / 110540;
  const dLon = radius / (111320 * Math.cos((lat0 * Math.PI) / 180));
  return { s: lat0 - dLat, w: lon0 - dLon, n: lat0 + dLat, e: lon0 + dLon };
}

export function overpassQuery(b) {
  const bb = `${b.s.toFixed(6)},${b.w.toFixed(6)},${b.n.toFixed(6)},${b.e.toFixed(6)}`;
  return `[out:json][timeout:120][maxsize:536870912];
(
  way["building"](${bb});
  relation["building"]["type"="multipolygon"](${bb});
  way["highway"](${bb});
  way["railway"~"rail|subway|light_rail|tram"](${bb});
  way["landuse"](${bb});
  way["leisure"](${bb});
  way["natural"~"water|wood|scrub|grassland|beach|sand|bare_rock|wetland|heath"](${bb});
  relation["natural"="water"](${bb});
  relation["landuse"](${bb});
  relation["leisure"="park"](${bb});
  way["waterway"~"riverbank|river|stream|canal"](${bb});
  way["water"](${bb});
  way["amenity"~"parking|school|university"](${bb});
);
out geom qt;`;
}

// ---------- 유틸 ----------
export function polyArea(pts) { // signed (x,z)
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

function dedupe(pts) {
  const out = [];
  for (const p of pts) {
    const l = out[out.length - 1];
    if (!l || Math.hypot(l[0] - p[0], l[1] - p[1]) > 0.05) out.push(p);
  }
  if (out.length > 1) {
    const f = out[0], l = out[out.length - 1];
    if (Math.hypot(f[0] - l[0], f[1] - l[1]) < 0.05) out.pop();
  }
  return out;
}

export function hash01(n) {
  let x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function parseLen(v) {
  if (v == null) return NaN;
  const s = String(v).replace(',', '.').trim();
  const m = s.match(/-?\d+(\.\d+)?/);
  if (!m) return NaN;
  let n = parseFloat(m[0]);
  if (/ft|'/.test(s)) n *= 0.3048;
  return n;
}

// 여러 조각난 way 를 링으로 이어붙이기 (멀티폴리곤 relation 용)
function assembleRings(segments) {
  const segs = segments.filter(s => s.length >= 2).map(s => s.slice());
  const rings = [];
  const key = p => p[0].toFixed(2) + ',' + p[1].toFixed(2);
  while (segs.length) {
    let ring = segs.shift();
    let guard = 0;
    while (key(ring[0]) !== key(ring[ring.length - 1]) && guard++ < 5000) {
      const end = key(ring[ring.length - 1]);
      let idx = segs.findIndex(s => key(s[0]) === end);
      if (idx >= 0) { ring = ring.concat(segs.splice(idx, 1)[0].slice(1)); continue; }
      idx = segs.findIndex(s => key(s[s.length - 1]) === end);
      if (idx >= 0) { ring = ring.concat(segs.splice(idx, 1)[0].reverse().slice(1)); continue; }
      break;
    }
    if (ring.length >= 4 && key(ring[0]) === key(ring[ring.length - 1])) rings.push(ring);
  }
  return rings;
}

const LANDCOVER = {
  water: 'water', reservoir: 'water', basin: 'water', riverbank: 'water',
  park: 'park', garden: 'park', playground: 'park', recreation_ground: 'park', village_green: 'park', common: 'park', dog_park: 'park',
  grass: 'grass', meadow: 'grass', grassland: 'grass', heath: 'grass', allotments: 'grass', cemetery: 'grass', orchard: 'grass', vineyard: 'grass', farmland: 'farm',
  forest: 'forest', wood: 'forest', scrub: 'forest', nature_reserve: 'forest',
  pitch: 'pitch', sports_centre: 'pitch', stadium: 'pitch', track: 'track', golf_course: 'grass',
  parking: 'parking',
  beach: 'sand', sand: 'sand', bare_rock: 'rock', wetland: 'wetland',
  residential: 'residential', commercial: 'commercial', retail: 'commercial', industrial: 'industrial', construction: 'construction',
  university: 'campus', school: 'campus', college: 'campus',
};

function classifyArea(t) {
  if (t.natural === 'water' || t.water || t.waterway === 'riverbank' || t.landuse === 'reservoir' || t.landuse === 'basin') return 'water';
  if (t.amenity === 'parking') return 'parking';
  if (t.amenity === 'university' || t.amenity === 'school') return 'campus';
  for (const k of ['leisure', 'natural', 'landuse']) {
    if (t[k] && LANDCOVER[t[k]]) return LANDCOVER[t[k]];
  }
  return null;
}

const ROAD_W = {
  motorway: 22, trunk: 18, primary: 16, secondary: 13, tertiary: 11,
  motorway_link: 9, trunk_link: 9, primary_link: 8, secondary_link: 8, tertiary_link: 7,
  residential: 7.5, unclassified: 7, living_street: 6, service: 5, pedestrian: 6,
  track: 3.5, footway: 2.4, path: 2, cycleway: 2.5, steps: 2.5, corridor: 0, construction: 8, road: 7,
};

export function buildingHeight(t, area, id) {
  let h = parseLen(t.height);
  if (!isFinite(h)) {
    const lv = parseLen(t['building:levels']);
    if (isFinite(lv) && lv > 0) h = lv * 3.4 + (t['roof:levels'] ? parseLen(t['roof:levels']) * 2.5 || 0 : 0) + 1;
  }
  if (!isFinite(h) || h <= 0) {
    const r = hash01(id);
    switch (t.building) {
      case 'house': case 'detached': case 'semidetached_house': case 'bungalow': case 'hut': h = 6 + r * 3; break;
      case 'garage': case 'garages': case 'shed': case 'kiosk': case 'roof': case 'carport': h = 3 + r; break;
      case 'apartments': h = 30 + r * 30; break;
      case 'industrial': case 'warehouse': h = 9 + r * 5; break;
      case 'church': case 'cathedral': h = 16 + r * 10; break;
      case 'commercial': case 'office': case 'retail': h = 14 + r * 22; break;
      case 'university': case 'school': case 'college': case 'hospital': h = 14 + r * 10; break;
      default:
        h = 7 + r * 7 + Math.min(18, Math.sqrt(Math.max(0, area)) * 0.12);
    }
  }
  return Math.max(2.5, Math.min(h, 650));
}

function minHeight(t) {
  let m = parseLen(t.min_height);
  if (!isFinite(m)) { const ml = parseLen(t['building:min_level']); if (isFinite(ml)) m = ml * 3.4; }
  return isFinite(m) ? Math.max(0, m) : 0;
}

// Overpass JSON → 월드 데이터
export function parseOSM(json, proj, radius) {
  const buildings = [], roads = [], areas = [], rails = [], waterLines = [];
  const lim = radius * 1.08;
  const conv = g => dedupe(g.map(p => proj.toXZ(p.lat, p.lon)));
  const inside = pts => {
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    for (const p of pts) { a = Math.min(a, p[0]); b = Math.max(b, p[0]); c = Math.min(c, p[1]); d = Math.max(d, p[1]); }
    return b > -lim && a < lim && d > -lim && c < lim;
  };
  let id = 0;

  for (const el of json.elements || []) {
    const t = el.tags || {};
    if (el.type === 'way' && el.geometry) {
      const pts = conv(el.geometry);
      if (pts.length < 2 || !inside(pts)) continue;
      const closed = el.geometry.length > 3 && el.geometry[0].lat === el.geometry[el.geometry.length - 1].lat && el.geometry[0].lon === el.geometry[el.geometry.length - 1].lon;
      if (t.building && t.building !== 'no' && closed && pts.length >= 3) {
        pushBuilding(buildings, pts, [], t, el.id || ++id);
      } else if (t.highway && ROAD_W[t.highway] !== undefined) {
        if (t.highway === 'corridor' || t.area === 'yes') continue;
        let w = parseLen(t.width);
        if (!isFinite(w)) { const ln = parseLen(t.lanes); w = isFinite(ln) ? Math.max(ROAD_W[t.highway], ln * 3.3) : ROAD_W[t.highway]; }
        roads.push({ pts, width: w, kind: t.highway, bridge: t.bridge === 'yes' || t.bridge === 'viaduct', tunnel: t.tunnel === 'yes', name: t.name || '' });
      } else if (t.railway) {
        if (t.tunnel === 'yes') continue;
        rails.push({ pts, bridge: !!t.bridge });
      } else if (t.waterway && !closed && t.waterway !== 'riverbank') {
        waterLines.push({ pts, width: t.waterway === 'river' ? 25 : t.waterway === 'canal' ? 12 : 4 });
      } else if (closed && pts.length >= 3) {
        const kind = classifyArea(t);
        if (kind) areas.push({ kind, outer: pts, holes: [], name: t.name || '' });
      }
    } else if (el.type === 'relation' && el.members) {
      const outers = [], inners = [];
      for (const m of el.members) {
        if (m.type !== 'way' || !m.geometry) continue;
        const seg = m.geometry.map(p => proj.toXZ(p.lat, p.lon));
        (m.role === 'inner' ? inners : outers).push(seg);
      }
      const oRings = assembleRings(outers).map(dedupe).filter(r => r.length >= 3 && inside(r));
      const iRings = assembleRings(inners).map(dedupe).filter(r => r.length >= 3);
      if (!oRings.length) continue;
      if (t.building) {
        for (const o of oRings) {
          const holes = iRings.filter(h => pointInPoly(h[0], o));
          pushBuilding(buildings, o, holes, t, (el.id || ++id) * 7 + 3);
        }
      } else {
        const kind = classifyArea(t);
        if (kind) for (const o of oRings) areas.push({ kind, outer: o, holes: iRings.filter(h => pointInPoly(h[0], o)), name: t.name || '' });
      }
    }
  }
  // 겹치는 중복 건물(같은 중심) 제거
  const seen = new Set();
  const uniq = [];
  for (const b of buildings) {
    const k = Math.round(b.cx * 2) + ':' + Math.round(b.cz * 2) + ':' + Math.round(b.area);
    if (seen.has(k)) continue;
    seen.add(k); uniq.push(b);
  }
  return { buildings: uniq, roads, areas, rails, waterLines };
}

function pushBuilding(list, outer, holes, t, id) {
  let pts = outer;
  let a = polyArea(pts);
  if (Math.abs(a) < 6) return;
  if (a < 0) { pts = pts.slice().reverse(); a = -a; } // CCW (x,z 평면 기준 양수)
  holes = holes.map(h => (polyArea(h) > 0 ? h.slice().reverse() : h));
  let cx = 0, cz = 0, minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
  for (const p of pts) {
    cx += p[0]; cz += p[1];
    minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); minz = Math.min(minz, p[1]); maxz = Math.max(maxz, p[1]);
  }
  cx /= pts.length; cz /= pts.length;
  const height = buildingHeight(t, a, id);
  const minH = Math.min(minHeight(t), height - 1);
  list.push({
    id, pts, holes, area: a, cx, cz, minx, maxx, minz, maxz,
    height, minH,
    type: t.building, name: t.name || t['name:ko'] || t['name:en'] || '',
    levels: parseLen(t['building:levels']),
    color: t['building:colour'] || t['building:color'] || null,
  });
}

export function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if ((zi > p[1]) !== (zj > p[1]) && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// ---------- 지형 (Terrarium) ----------
export function lonLatToTile(lon, lat, z) {
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const r = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  return [x, y];
}
export function tileToLonLat(x, y, z) {
  const n = 2 ** z;
  const lon = (x / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return [lon, lat];
}
