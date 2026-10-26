// 정적 월드: 지형 메시 + 토지피복 텍스처 + 물 + 나무
import * as THREE from 'three';
import earcut from 'earcut';
import { makeTerrainMaterial } from './materials.js';
import { pointInPoly } from './geo.js';

function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function edge0(g) { let e = Infinity; for (let i = 0; i < g.n; i++) e = Math.min(e, g.h[i], g.h[(g.n - 1) * g.n + i], g.h[i * g.n], g.h[i * g.n + g.n - 1]); return e; }

const AREA_COLORS = {
  residential: '#9c968b', commercial: '#a39892', industrial: '#97949b', campus: '#a59e8b', construction: '#94856a',
  farm: '#8d8c5f', grass: '#5f8040', park: '#557e3b', forest: '#3a5a2c', pitch: '#4b7a37', track: '#8f4d3c',
  parking: '#5f6065', sand: '#c4b483', rock: '#7f7a73', wetland: '#557359', water: '#2f5875',
};
const AREA_ORDER = ['residential', 'commercial', 'industrial', 'campus', 'construction', 'farm', 'grass', 'park', 'wetland', 'forest', 'sand', 'rock', 'pitch', 'track', 'parking', 'water'];

function roadStyle(kind) {
  if (['motorway', 'trunk', 'primary', 'motorway_link', 'trunk_link', 'primary_link'].includes(kind)) return { fill: '#3b3d42', casing: '#26272a', line: '#e8c35a', dash: null };
  if (['secondary', 'tertiary', 'secondary_link', 'tertiary_link', 'construction'].includes(kind)) return { fill: '#44464b', casing: '#2c2d30', line: '#f2f2f2', dash: [6, 7] };
  if (['footway', 'path', 'cycleway', 'steps', 'pedestrian', 'track'].includes(kind)) return { fill: kind === 'cycleway' ? '#86605b' : '#ada594', casing: null, line: null };
  return { fill: '#4b4d51', casing: '#333437', line: null };
}

export class World {
  constructor({ scene, grid, data, radius, quality }) {
    this.scene = scene; this.grid = grid; this.data = data; this.radius = radius; this.quality = quality;
    this.group = new THREE.Group();
    scene.add(this.group);
    this._buildLandcover();
    this._buildTerrain();
    this._buildWater();
    this._buildTrees();
  }

  // ---- 토지피복 캔버스 ----
  _buildLandcover() {
    const g = this.grid;
    const S = this.quality.texSize;
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const ctx = cv.getContext('2d');
    const k = S / g.span, off = g.span / 2;
    this._k = k; this._off = off;
    const P = (x, z) => [(x + off) * k, (z + off) * k];
    // 지역 밖: 자연(초록) / 안쪽: 도시 바닥
    ctx.fillStyle = '#566e3e'; ctx.fillRect(0, 0, S, S);
    const R = this.radius;
    const [ax, az] = P(-R, -R), [bx, bz] = P(R, R);
    const grad = ctx.createRadialGradient(S / 2, S / 2, (bx - ax) * 0.45, S / 2, S / 2, (bx - ax) * 0.78);
    grad.addColorStop(0, '#948f84'); grad.addColorStop(1, 'rgba(148,143,132,0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, S, S);
    // 바다 (지형 해수면 이하)
    if (g.seaLevel !== undefined) {
      const st = Math.max(1, Math.round(S / 1024));
      ctx.fillStyle = '#2f5875';
      for (let py = 0; py < S; py += st) for (let px = 0; px < S; px += st) {
        const x = (px + st / 2) / k - off, z = (py + st / 2) / k - off;
        if (g.sample(x, z) < g.seaLevel + 0.6) ctx.fillRect(px, py, st, st);
      }
    }
    const poly = (ring) => { ring.forEach((p, i) => { const [x, y] = P(p[0], p[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); };
    for (const kind of AREA_ORDER) {
      for (const a of this.data.areas) {
        if (a.kind !== kind) continue;
        ctx.beginPath(); poly(a.outer); for (const h of a.holes) poly(h);
        ctx.fillStyle = AREA_COLORS[kind]; ctx.fill('evenodd');
        if (kind === 'pitch') { ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = Math.max(1, 0.6 * k); ctx.stroke(); }
        if (kind === 'forest' || kind === 'park') { ctx.strokeStyle = 'rgba(40,60,30,0.25)'; ctx.lineWidth = 1.5 * k; ctx.stroke(); }
      }
    }
    // 물길
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const w of this.data.waterLines) {
      ctx.beginPath(); w.pts.forEach((p, i) => { const [x, y] = P(p[0], p[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.strokeStyle = AREA_COLORS.water; ctx.lineWidth = w.width * k; ctx.stroke();
    }
    // 건물 바닥 (콘크리트 슬래브) - 건물이 무너지면 보임
    ctx.fillStyle = '#76736d';
    for (const b of this.data.buildings) { ctx.beginPath(); poly(b.pts); ctx.fill(); }
    // 도로
    const roads = this.data.roads.filter(r => !r.tunnel).sort((a, b) => a.width - b.width);
    const stroke = (r, w, col, dash) => {
      ctx.beginPath(); r.pts.forEach((p, i) => { const [x, y] = P(p[0], p[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.setLineDash(dash ? dash.map(d => d * k) : []); ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, w * k); ctx.stroke();
    };
    for (const r of roads) { const s = roadStyle(r.kind); if (s.casing) stroke(r, r.width + 1.6, s.casing); }
    for (const r of roads) { const s = roadStyle(r.kind); stroke(r, r.width, s.fill); }
    for (const r of roads) {
      const s = roadStyle(r.kind);
      if (s.line && r.width >= 9) stroke(r, 0.35, s.line, s.dash);
    }
    ctx.setLineDash([]);
    for (const rl of this.data.rails) {
      stroke(rl, 3.2, '#6f645c'); stroke(rl, 1.6, '#8c8580'); stroke(rl, 2.6, 'rgba(60,50,45,0.6)', [0.4, 0.9]);
    }
    ctx.setLineDash([]);
    this.landCanvas = cv;
    this.landTex = new THREE.CanvasTexture(cv);
    this.landTex.colorSpace = THREE.SRGBColorSpace;
    this.landTex.anisotropy = this.quality.anisotropy;
    this.landTex.generateMipmaps = true;
    this.landTex.minFilter = THREE.LinearMipmapLinearFilter;

    // 그을림 레이어
    const SS = 1024;
    const sc = document.createElement('canvas'); sc.width = sc.height = SS;
    this.scorchCanvas = sc; this.scorchCtx = sc.getContext('2d'); this._sk = SS / g.span;
    this.scorchTex = new THREE.CanvasTexture(sc);
    this.scorchTex.colorSpace = THREE.NoColorSpace;
    this._scorchDirty = false; this._scorchT = 0;

    // 나무 배치용 점유 마스크 (1px = 2m)
    const M = Math.min(2048, Math.ceil(g.span / 2));
    const mc = document.createElement('canvas'); mc.width = mc.height = M;
    const m = mc.getContext('2d');
    const mk = M / g.span;
    const MP = (x, z) => [(x + off) * mk, (z + off) * mk];
    m.fillStyle = '#000'; m.fillRect(0, 0, M, M);
    m.fillStyle = '#fff'; m.strokeStyle = '#fff'; m.lineCap = 'round';
    const mpoly = ring => { ring.forEach((p, i) => { const [x, y] = MP(p[0], p[1]); i ? m.lineTo(x, y) : m.moveTo(x, y); }); m.closePath(); };
    for (const b of this.data.buildings) { m.beginPath(); mpoly(b.pts); m.fill(); m.lineWidth = 3 * mk; m.stroke(); }
    for (const a of this.data.areas) if (['water', 'pitch', 'parking', 'track', 'sand'].includes(a.kind)) { m.beginPath(); mpoly(a.outer); m.fill(); }
    for (const r of this.data.roads) { m.beginPath(); r.pts.forEach((p, i) => { const [x, y] = MP(p[0], p[1]); i ? m.lineTo(x, y) : m.moveTo(x, y); }); m.lineWidth = (r.width + 3) * mk; m.stroke(); }
    for (const w of this.data.waterLines) { m.beginPath(); w.pts.forEach((p, i) => { const [x, y] = MP(p[0], p[1]); i ? m.lineTo(x, y) : m.moveTo(x, y); }); m.lineWidth = (w.width + 2) * mk; m.stroke(); }
    const md = m.getImageData(0, 0, M, M).data;
    this._occ = (x, z) => {
      const px = Math.floor((x + off) * mk), py = Math.floor((z + off) * mk);
      if (px < 0 || py < 0 || px >= M || py >= M) return true;
      return md[(py * M + px) * 4] > 100;
    };
  }

  _buildTerrain() {
    const g = this.grid;
    const geo = new THREE.PlaneGeometry(g.span, g.span, g.n - 1, g.n - 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute('position');
    for (let k = 0; k < pos.count; k++) pos.setY(k, g.h[k]);
    geo.computeVertexNormals();
    const mat = makeTerrainMaterial(this.landTex);
    const scorch = this.scorchTex;
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      prev(sh, r);
      sh.uniforms.uScorch = { value: scorch };
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uScorch;')
        .replace('#include <map_fragment>', `#include <map_fragment>
{ vec4 s = texture2D(uScorch, vMapUv); float fr = clamp(s.r * 1.2, 0.0, 1.0); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06,0.05,0.045), s.a * 0.92 * (1.0 - fr)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8,0.88,0.96), s.a * 0.92 * fr); }`);
    };
    mat.customProgramCacheKey = () => 'sw-terrain-v3';
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.receiveShadow = true;
    this.group.add(this.terrain);
    this._buildOuter(edge0(g));
  }

  // ---------- 지도 바깥 세계: 지평선까지 이어지는 산과 먼 도시들 ----------
  // 높이: 지도 가장자리 높이에서 시작해 멀어질수록 산이 높아짐
  outerHeight(x, z) {
    const r = Math.hypot(x, z), r0 = this._outerR0 || 0;
    const k = Math.max(0, Math.min(1, (r - r0 * 1.5) / 6000));
    const n = Math.sin(x * 0.00031 + 1.7) * Math.cos(z * 0.00027 - 0.6) * 0.6 + Math.sin(x * 0.0011 + z * 0.0009) * 0.25 + Math.sin(x * 0.0041 - z * 0.0033) * 0.08;
    const far = Math.max(0, Math.min(1, (r - 9000) / 30000));
    const mount = (this._outerBase || 0) - 2 + k * (120 + 260 * Math.max(0, n)) * (0.35 + 0.65 * k) + far * 900 * Math.max(0, n + 0.3);
    // 지도 가장자리 근처는 지도 끝 높이를 이어받아 절벽 없이
    const b = Math.max(0, Math.min(1, (r - r0 * 1.02) / (r0 * 0.9)));
    const edgeH = this.grid.sample(x, z) - 1.5;
    return edgeH + (mount - edgeH) * b * b * (3 - 2 * b);
  }
  _buildOuter(edge) {
    const g = this.grid;
    const r0 = g.span * 0.5, r1 = 90000;
    this._outerR0 = r0; this._outerBase = edge;
    const NR = 56, NS = 192;
    const pos = [], col = [], idx = [];
    const c = new THREE.Color(), cGreen = new THREE.Color(0x4f5a3d), cDry = new THREE.Color(0x6b6248), cRock = new THREE.Color(0x5d5852), cSnow = new THREE.Color(0xe8ecf0);
    for (let i = 0; i < NR; i++) {
      const r = r0 * Math.pow(r1 / r0, i / (NR - 1));
      for (let j = 0; j < NS; j++) {
        const a = j / NS * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r;
        const h = this.outerHeight(x, z);
        pos.push(x, h - edge, z);
        const up = h - edge;
        c.copy(cGreen).lerp(cDry, Math.min(1, Math.max(0, Math.sin(x * 0.0007) * 0.5 + 0.3)));
        if (up > 200) c.lerp(cRock, Math.min(1, (up - 200) / 300));
        if (up > 650) c.lerp(cSnow, Math.min(1, (up - 650) / 300));
        col.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < NR - 1; i++) for (let j = 0; j < NS; j++) {
      const a = i * NS + j, b = i * NS + (j + 1) % NS, d = (i + 1) * NS + j, e = (i + 1) * NS + (j + 1) % NS;
      idx.push(a, b, d, b, e, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    const outer = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }));
    outer.position.y = edge; outer.receiveShadow = false; outer.frustumCulled = false;
    this.outer = outer; this.group.add(outer);
    // 먼 도시들: 지도 밖 곳곳에 단순한 건물 덩어리
    const rnd = mulberry(1234);
    const boxes = [];
    const nTown = 34;
    for (let t = 0; t < nTown; t++) {
      const a = rnd() * Math.PI * 2, d = r0 + 600 + Math.pow(rnd(), 0.7) * 16000;
      const tx = Math.cos(a) * d, tz = Math.sin(a) * d;
      const big = rnd() < 0.3, tr = big ? 900 + rnd() * 900 : 300 + rnd() * 500;
      const n = Math.round((big ? 260 : 90) * (0.6 + rnd() * 0.6));
      for (let k = 0; k < n; k++) {
        const u = Math.sqrt(rnd()) * tr, v = rnd() * Math.PI * 2;
        const x = tx + Math.cos(v) * u, z = tz + Math.sin(v) * u;
        if (Math.abs(x) < r0 + 60 && Math.abs(z) < r0 + 60) continue;
        const core = 1 - u / tr;
        const h = 8 + rnd() * 25 + (big ? core * core * (60 + rnd() * 140) : core * 20);
        const w = 14 + rnd() * 26;
        boxes.push([x, z, w, h, w * (0.6 + rnd() * 0.8), rnd() * 3.14]);
      }
    }
    const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
    const im = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.05 }), boxes.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    this._towns = boxes.map((b, i) => {
      const [x, z, w, h, dd, rot] = b;
      const y = this.outerHeight(x, z) - 1;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
      m.compose(p.set(x, y, z), q, sc.set(w, h, dd));
      im.setMatrixAt(i, m);
      const g0 = 0.32 + rnd() * 0.2; c.setRGB(g0, g0 * 0.98, g0 * 0.95); im.setColorAt(i, c);
      return { x, z, y, w, h, d: dd, rot, hit: 0, col: g0 };
    });
    im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
    im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false;
    this.townMesh = im; this.group.add(im);
  }
  // 바깥 도시 파괴: 중심에서 r0~r1 띠 안의 건물을 무너뜨림 (sev 0~1)
  ravageOuter(cx, cz, r0, r1, sev = 1) {
    if (!this._towns) return 0;
    const im = this.townMesh, m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    let n = 0;
    this._towns.forEach((t, i) => {
      const d = Math.hypot(t.x - cx, t.z - cz);
      if (d < r0 || d > r1 || t.hit >= sev) return;
      t.hit = sev;
      const ang = Math.atan2(t.z - cz, t.x - cx);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rot);
      const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.sin(ang), 0, -Math.cos(ang)), -0.5 * sev * Math.random());
      q.premultiply(tilt);
      const hs = Math.max(0.04, 1 - sev * (0.75 + Math.random() * 0.2));
      im.setMatrixAt(i, m.compose(p.set(t.x, t.y, t.z), q, sc.set(t.w, t.h * hs, t.d)));
      const g = t.col * (1 - 0.8 * sev); im.setColorAt(i, c.setRGB(g, g * 0.9, g * 0.85));
      n++;
    });
    if (n) { im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; }
    return n;
  }
  restoreOuter() {
    if (!this._towns) return;
    const im = this.townMesh, m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    this._towns.forEach((t, i) => { t.hit = 0; q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rot); im.setMatrixAt(i, m.compose(p.set(t.x, t.y, t.z), q, sc.set(t.w, t.h, t.d))); im.setColorAt(i, c.setRGB(t.col, t.col * 0.98, t.col * 0.95)); });
    im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
  }

  // 바뀐 격자 범위만 위치·법선 갱신
  updateTerrainMesh(range) {
    const g = this.grid, n = g.n, geo = this.terrain.geometry;
    const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal');
    let [i0, i1, j0, j1] = range || [0, n - 1, 0, n - 1];
    i0 = Math.max(0, i0 - 1); j0 = Math.max(0, j0 - 1); i1 = Math.min(n - 1, i1 + 1); j1 = Math.min(n - 1, j1 + 1);
    const c2 = 2 * g.cell, h = g.h;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * n + i;
      pos.array[k * 3 + 1] = h[k];
      const hl = h[j * n + Math.max(0, i - 1)], hr = h[j * n + Math.min(n - 1, i + 1)];
      const hd = h[Math.max(0, j - 1) * n + i], hu = h[Math.min(n - 1, j + 1) * n + i];
      let nx = hl - hr, ny = c2, nz = hd - hu;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      nor.array[k * 3] = nx; nor.array[k * 3 + 1] = ny; nor.array[k * 3 + 2] = nz;
    }
    const a = (j0 * n) * 3, b = ((j1 * n) + n) * 3;
    pos.clearUpdateRanges(); nor.clearUpdateRanges();
    pos.addUpdateRange(a, b - a); nor.addUpdateRange(a, b - a);
    pos.needsUpdate = true; nor.needsUpdate = true;
  }

  paintScorch(x, z, r, strength = 0.8) {
    const ctx = this.scorchCtx, k = this._sk, off = this._off;
    const px = (x + off) * k, py = (z + off) * k, pr = Math.max(2, r * k);
    const gr = ctx.createRadialGradient(px, py, 0, px, py, pr);
    gr.addColorStop(0, `rgba(0,0,0,${strength})`);
    gr.addColorStop(0.6, `rgba(0,0,0,${strength * 0.6})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
    this._scorchDirty = true;
  }

  // 서리·얼음 (흰색으로 칠함)
  paintFrost(x, z, r, strength = 0.8) {
    const ctx = this.scorchCtx, k = this._sk, off = this._off;
    const px = (x + off) * k, py = (z + off) * k, pr = Math.max(2, r * k);
    const gr = ctx.createRadialGradient(px, py, 0, px, py, pr);
    gr.addColorStop(0, `rgba(255,255,255,${strength})`);
    gr.addColorStop(0.7, `rgba(255,255,255,${strength * 0.7})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
    this._scorchDirty = true;
  }

  update(dt) {
    this._scorchT -= dt;
    if (this._scorchDirty && this._scorchT <= 0) { this.scorchTex.needsUpdate = true; this._scorchDirty = false; this._scorchT = 0.25; }
  }

  _buildWater() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x2c5873, roughness: 0.06, metalness: 0.35, transparent: true, opacity: 0.88 });
    this.waterMat = mat;
    const g = this.grid;
    const pos = [], idx = [];
    for (const a of this.data.areas) {
      if (a.kind !== 'water') continue;
      let lvl = a.level;
      if (lvl === undefined) { lvl = Infinity; for (const p of a.outer) lvl = Math.min(lvl, g.sample(p[0], p[1])); }
      const flat = [], holes = [], all = [];
      for (const p of a.outer) { flat.push(p[0], p[1]); all.push(p); }
      for (const h of a.holes) { holes.push(all.length); for (const p of h) { flat.push(p[0], p[1]); all.push(p); } }
      const tri = earcut(flat, holes.length ? holes : null, 2);
      const base = pos.length / 3;
      for (const p of all) pos.push(p[0], lvl, p[1]);
      for (let t = 0; t < tri.length; t += 3) idx.push(base + tri[t], base + tri[t + 2], base + tri[t + 1]);
    }
    if (g.seaLevel !== undefined) {
      const s = g.span / 2, base = pos.length / 3, y = g.seaLevel + 0.25;
      pos.push(-s, y, -s, s, y, -s, s, y, s, -s, y, s);
      idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
    if (!pos.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    // 법선이 위를 향하도록 보정
    const n = geo.getAttribute('normal');
    if (n.count && n.getY(0) < 0) { geo.setIndex(idx.map((v, i) => (i % 3 === 1 ? idx[i + 1] : i % 3 === 2 ? idx[i - 1] : v))); geo.computeVertexNormals(); }
    this.water = new THREE.Mesh(geo, mat);
    this.water.receiveShadow = true;
    this.group.add(this.water);
  }

  _buildTrees() {
    const g = this.grid, R = this.radius * 1.05;
    const max = this.quality.trees;
    const pts = [];
    let seed = 12345;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const density = { forest: 1 / 55, park: 1 / 160, grass: 1 / 500, campus: 1 / 900, residential: 1 / 1600, wetland: 1 / 300 };
    for (const a of this.data.areas) {
      const d = density[a.kind]; if (!d) continue;
      let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
      for (const p of a.outer) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); minz = Math.min(minz, p[1]); maxz = Math.max(maxz, p[1]); }
      minx = Math.max(minx, -R); maxx = Math.min(maxx, R); minz = Math.max(minz, -R); maxz = Math.min(maxz, R);
      if (maxx <= minx || maxz <= minz) continue;
      const cnt = Math.min(4000, Math.round((maxx - minx) * (maxz - minz) * d));
      for (let i = 0; i < cnt; i++) {
        const x = minx + rnd() * (maxx - minx), z = minz + rnd() * (maxz - minz);
        if (!pointInPoly([x, z], a.outer) || a.holes.some(h => pointInPoly([x, z], h)) || this._occ(x, z)) continue;
        pts.push([x, z, a.kind === 'forest' ? 0 : 1]);
      }
    }
    // 지역 밖 자연림
    const outer = this.grid.span / 2 * 0.95;
    for (let i = 0; i < max * 0.35; i++) {
      const x = (rnd() * 2 - 1) * outer, z = (rnd() * 2 - 1) * outer;
      if (Math.max(Math.abs(x), Math.abs(z)) < this.radius * 1.12) continue;
      if (g.seaLevel !== undefined && g.sample(x, z) < g.seaLevel + 1) continue;
      pts.push([x, z, 0]);
    }
    // 무작위로 줄이기
    while (pts.length > max) pts.splice(Math.floor(rnd() * pts.length), 1);
    const n = pts.length;
    this.trees = [];
    if (!n) return;
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 3.2, 5); trunkGeo.translate(0, 1.6, 0);
    const crownGeo = new THREE.IcosahedronGeometry(2.1, 1); crownGeo.translate(0, 4.4, 0);
    const coneGeo = new THREE.ConeGeometry(2.0, 6.5, 7); coneGeo.translate(0, 5.6, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5b4636, roughness: 1 });
    const crownMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, n);
    const crownsA = new THREE.InstancedMesh(crownGeo, crownMat, n);
    const crownsB = new THREE.InstancedMesh(coneGeo, crownMat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    let ia = 0, ib = 0;
    for (let i = 0; i < n; i++) {
      const [x, z, kind] = pts[i];
      const y = g.sample(x, z) - 0.2;
      const sc = 0.7 + rnd() * 0.8;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28);
      m.compose(p.set(x, y, z), q, s.set(sc, sc * (0.85 + rnd() * 0.4), sc));
      trunks.setMatrixAt(i, m);
      const conifer = kind === 0 && rnd() < 0.45;
      c.setHSL(0.24 + rnd() * 0.08, 0.38 + rnd() * 0.2, 0.22 + rnd() * 0.12);
      const t = { x, y, z, sc, m: m.clone(), col: c.clone(), alive: true, burnt: false, conifer, idx: conifer ? ib : ia };
      if (conifer) { crownsB.setMatrixAt(ib, m); crownsB.setColorAt(ib, c); ib++; }
      else { crownsA.setMatrixAt(ia, m); crownsA.setColorAt(ia, c); ia++; }
      this.trees.push(t);
    }
    crownsA.count = ia; crownsB.count = ib;
    for (const im of [trunks, crownsA, crownsB]) { im.castShadow = true; im.receiveShadow = true; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.computeBoundingSphere(); this.group.add(im); }
    this.treeMeshes = { trunks, crownsA, crownsB, zero };
    // 공간 해시
    this._treeHash = new Map();
    this.trees.forEach((t, i) => {
      const key = Math.floor(t.x / 40) + ',' + Math.floor(t.z / 40);
      if (!this._treeHash.has(key)) this._treeHash.set(key, []);
      this._treeHash.get(key).push(i);
    });
  }

  // 반경 내 나무: 안쪽은 소멸, 바깥은 그을림
  blastTrees(x, z, r, rInner) {
    if (!this.treeMeshes) return 0;
    const { trunks, crownsA, crownsB, zero } = this.treeMeshes;
    const black = new THREE.Color(0x1a1612);
    let changed = 0;
    const c0 = Math.floor((x - r) / 40), c1 = Math.floor((x + r) / 40), d0 = Math.floor((z - r) / 40), d1 = Math.floor((z + r) / 40);
    for (let cx = c0; cx <= c1; cx++) for (let cz = d0; cz <= d1; cz++) {
      const list = this._treeHash.get(cx + ',' + cz); if (!list) continue;
      for (const i of list) {
        const t = this.trees[i]; if (!t.alive) continue;
        const d = Math.hypot(t.x - x, t.z - z);
        if (d > r) continue;
        const cm = t.conifer ? crownsB : crownsA;
        if (d < rInner) {
          t.alive = false; trunks.setMatrixAt(i, zero); cm.setMatrixAt(t.idx, zero);
        } else if (!t.burnt) {
          t.burnt = true; cm.setColorAt(t.idx, black);
          // 바깥쪽으로 기울이기
          const ang = Math.atan2(t.z - z, t.x - x);
          const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.sin(ang), 0, -Math.cos(ang)), -0.5 * (1 - d / r));
          const mm = new THREE.Matrix4().compose(new THREE.Vector3(t.x, t.y, t.z), tilt, new THREE.Vector3(t.sc, t.sc, t.sc));
          trunks.setMatrixAt(i, mm); cm.setMatrixAt(t.idx, mm);
        }
        changed++;
      }
    }
    if (changed) {
      for (const im of [trunks, crownsA, crownsB]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    }
    return changed;
  }

  // 시간 역행: 나무와 그을음 되돌리기 (k: 0~1 진행)
  restoreTrees() {
    if (!this.treeMeshes) return;
    const { trunks, crownsA, crownsB } = this.treeMeshes;
    this.trees.forEach((t, i) => {
      if (t.alive && !t.burnt) return;
      const cm = t.conifer ? crownsB : crownsA;
      trunks.setMatrixAt(i, t.m); cm.setMatrixAt(t.idx, t.m); cm.setColorAt(t.idx, t.col);
      t.alive = true; t.burnt = false;
    });
    for (const im of [trunks, crownsA, crownsB]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
  }
  fadeScorch(k) {
    const ctx = this.scorchCtx, c = this.scorchCanvas;
    ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = `rgba(0,0,0,${k})`; ctx.fillRect(0, 0, c.width, c.height); ctx.restore();
    this._scorchDirty = true;
  }

  dispose() {
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose?.(); });
    this.landTex.dispose(); this.scorchTex.dispose();
    this.scene.remove(this.group);
  }
}
