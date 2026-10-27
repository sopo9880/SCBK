// 밤의 도시 불빛: 가로등(기둥 + 등 + 바닥에 번지는 빛), 도로 위 차들의 전조등·미등, 고층 건물 항공 장애등.
// 바닥 불빛은 지형 셰이더가 읽는 '밤 빛 지도' 텍스처에 그림 → 폭발로 가로등이 부서지면 그 자리 빛도 지움.
import * as THREE from 'three';
import { sharedUniforms } from './materials.js';

const DRIVE = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'service', 'living_street', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link', 'road']);
const BIG = new Set(['motorway', 'trunk', 'primary', 'secondary', 'motorway_link', 'trunk_link', 'primary_link']);
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export class NightLights {
  constructor({ scene, grid, data, quality, ground }) {
    this.scene = scene; this.grid = grid; this.data = data; this.ground = ground;
    const caps = { 2500: 1500, 5000: 4000, 8000: 7000 };
    this.maxLamps = caps[quality.particles] || 10000;
    this.maxCars = Math.round(this.maxLamps * 0.35);
    this.rnd = mulberry(4242);
    this.roads = (data.roads || []).filter(r => !r.tunnel && !r.bridge && DRIVE.has(r.kind) && r.pts.length > 1);
    this._buildMap();
    this._buildLamps();
    this._buildTraffic();
    this._buildBeacons();
  }

  // ---- 바닥에 번지는 빛 지도 ----
  _buildMap() {
    const g = this.grid, S = 2048, k = S / g.span, off = g.span / 2;
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const x = cv.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
    this._k = k; this._off = off; this.canvas = cv; this.ctx = x;
    const P = (px, pz) => [(px + off) * k, (pz + off) * k];
    x.globalCompositeOperation = 'lighter'; x.lineCap = 'round'; x.lineJoin = 'round';
    // 큰 길은 전체가 은은한 주황빛
    for (const r of this.roads) {
      x.beginPath(); r.pts.forEach((p, i) => { const [a, b] = P(p[0], p[1]); i ? x.lineTo(a, b) : x.moveTo(a, b); });
      x.strokeStyle = BIG.has(r.kind) ? 'rgba(255,150,70,0.10)' : 'rgba(255,170,90,0.05)'; x.lineWidth = (r.width + 4) * k; x.stroke();
    }
    // 건물 1층 상가 불빛이 길가로 새어 나옴
    x.strokeStyle = 'rgba(255,205,150,0.06)'; x.lineWidth = 5 * k;
    for (const b of this.data.buildings) { if (b.height < 6) continue; x.beginPath(); b.pts.forEach((p, i) => { const [a, c] = P(p[0], p[1]); i ? x.lineTo(a, c) : x.moveTo(a, c); }); x.closePath(); x.stroke(); }
    x.globalCompositeOperation = 'source-over';
    this.tex = new THREE.CanvasTexture(cv); this.tex.colorSpace = THREE.SRGBColorSpace;
    this._dirty = false; this._dT = 0;
  }
  _pool(px, pz, r, a) {
    const x = this.ctx, k = this._k, off = this._off;
    const cx = (px + off) * k, cz = (pz + off) * k, rr = Math.max(2, r * k);
    const gr = x.createRadialGradient(cx, cz, 0, cx, cz, rr);
    gr.addColorStop(0, `rgba(255,196,128,${a})`); gr.addColorStop(0.5, `rgba(255,170,96,${a * 0.45})`); gr.addColorStop(1, 'rgba(255,150,80,0)');
    x.globalCompositeOperation = 'lighter'; x.fillStyle = gr; x.beginPath(); x.arc(cx, cz, rr, 0, Math.PI * 2); x.fill(); x.globalCompositeOperation = 'source-over';
  }

  // ---- 가로등 ----
  _buildLamps() {
    const pts = [];
    let side = 1;
    for (const r of this.roads) {
      if (r.width < 4.5) continue;
      const gap = BIG.has(r.kind) ? 28 : 36;
      let acc = this.rnd() * gap;
      for (let i = 0; i + 1 < r.pts.length && pts.length < this.maxLamps; i++) {
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
        const L = Math.hypot(bx - ax, bz - az); if (L < 0.1) continue;
        const ux = (bx - ax) / L, uz = (bz - az) / L;
        for (let s = gap - acc; s < L; s += gap) {
          side = BIG.has(r.kind) ? -side : side;   // 큰 길은 양쪽 번갈아, 작은 길은 한쪽
          const o = r.width / 2 + 1.2;
          const x = ax + ux * s - uz * o * side, z = az + uz * s + ux * o * side;
          pts.push({ x, z, ax: uz * side, az: -ux * side, alive: true });
        }
        acc = (acc + L) % gap;
      }
    }
    // 건물 안에 박힌 등은 뺌
    this.lamps = pts;
    const n = pts.length;
    const poleG = new THREE.CylinderGeometry(0.12, 0.16, 8, 6); poleG.translate(0, 4, 0);
    const armG = new THREE.BoxGeometry(0.12, 0.12, 1.8); armG.translate(0, 8, 0.8);
    const headG = new THREE.BoxGeometry(0.5, 0.18, 0.9); headG.translate(0, 7.92, 1.6);
    const pm = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.6, metalness: 0.5 });
    this.lampMat = new THREE.MeshBasicMaterial({ color: 0x5a5a55, toneMapped: false });
    this.poles = new THREE.InstancedMesh(poleG, pm, n); this.arms = new THREE.InstancedMesh(armG, pm, n); this.heads = new THREE.InstancedMesh(headG, this.lampMat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    pts.forEach((l, i) => {
      l.y = this.ground(l.x, l.z);
      q.setFromAxisAngle(Y, Math.atan2(l.ax, l.az)); m.compose(p.set(l.x, l.y, l.z), q, sc); l.m = m.clone();
      for (const im of [this.poles, this.arms, this.heads]) im.setMatrixAt(i, m);
      // 등 아래 바닥에 빛 웅덩이 (팔 끝 쪽)
      this._pool(l.x + l.ax * 1.6, l.z + l.az * 1.6, 13, 0.5);
    });
    for (const im of [this.poles, this.arms, this.heads]) { im.castShadow = false; im.frustumCulled = false; im.instanceMatrix.needsUpdate = true; this.scene.add(im); }
    this.poles.castShadow = true;
    this.tex.needsUpdate = true;
  }

  // ---- 차 불빛 (밤에만) ----
  _buildTraffic() {
    const lanes = [];
    let total = 0;
    for (const r of this.roads) {
      if (r.width < 5) continue;
      const cum = [0];
      for (let i = 1; i < r.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]));
      const L = cum[cum.length - 1]; if (L < 40) continue;
      lanes.push({ r, cum, L, w: r.width, big: BIG.has(r.kind) }); total += L * (BIG.has(r.kind) ? 2 : 1);
    }
    this.lanes = lanes;
    const n = Math.min(this.maxCars, Math.round(total / 55));
    const pick = () => { let t = this.rnd() * total; for (const l of lanes) { t -= l.L * (l.big ? 2 : 1); if (t <= 0) return l; } return lanes[lanes.length - 1]; };
    this.cars = [];
    for (let i = 0; i < n && lanes.length; i++) { const l = pick(); this.cars.push({ l, s: this.rnd() * l.L, d: this.rnd() < 0.5 ? 1 : -1, v: (l.big ? 13 : 8) + this.rnd() * 5, alive: true }); }
    const g = new THREE.SphereGeometry(0.32, 6, 4);
    this.headMat = new THREE.MeshBasicMaterial({ color: 0xfff2d8, toneMapped: false });
    this.tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false });
    this.headIM = new THREE.InstancedMesh(g, this.headMat, Math.max(1, n * 2)); this.tailIM = new THREE.InstancedMesh(g, this.tailMat, Math.max(1, n * 2));
    for (const im of [this.headIM, this.tailIM]) { im.frustumCulled = false; im.castShadow = false; im.count = n * 2; this.scene.add(im); }
    this._pick = pick;
  }
  _at(l, s, out) {
    const { cum, r } = l; s = Math.max(0, Math.min(l.L - 0.01, s));
    let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
    const u = (s - cum[i - 1]) / Math.max(0.01, cum[i] - cum[i - 1]);
    const [ax, az] = r.pts[i - 1], [bx, bz] = r.pts[i];
    const L = Math.hypot(bx - ax, bz - az) || 1;
    out.x = ax + (bx - ax) * u; out.z = az + (bz - az) * u; out.ux = (bx - ax) / L; out.uz = (bz - az) / L;
    return out;
  }

  // ---- 고층 건물 항공 장애등 ----
  _buildBeacons() {
    this.tall = this.data.buildings.filter(b => b.height > 60).slice(0, 600);
    const g = new THREE.SphereGeometry(0.6, 8, 6);
    this.beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2010, toneMapped: false });
    this.beacons = new THREE.InstancedMesh(g, this.beaconMat, Math.max(1, this.tall.length));
    const m = new THREE.Matrix4();
    this.tall.forEach((b, i) => { m.makeTranslation((b.minx + b.maxx) / 2, (b.baseY || 0) + b.height + 0.8, (b.minz + b.maxz) / 2); this.beacons.setMatrixAt(i, m); });
    this.beacons.count = this.tall.length; this.beacons.frustumCulled = false; this.scene.add(this.beacons);
    this._bT = 0;
  }

  // 폭발: 반경 안의 가로등·차·바닥 빛을 없앰
  blast(x, z, r) {
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    let hit = false;
    this.lamps.forEach((l, i) => { if (l.alive && (l.x - x) ** 2 + (l.z - z) ** 2 < r * r) { l.alive = false; for (const im of [this.poles, this.arms, this.heads]) im.setMatrixAt(i, zero); hit = true; } });
    if (hit) for (const im of [this.poles, this.arms, this.heads]) im.instanceMatrix.needsUpdate = true;
    const o = {};
    for (const c of this.cars) if (c.alive) { this._at(c.l, c.s, o); if ((o.x - x) ** 2 + (o.z - z) ** 2 < r * r) c.alive = false; }
    const k = this._k, off = this._off, ctx = this.ctx;
    const cx = (x + off) * k, cz = (z + off) * k, rr = Math.max(2, r * 1.05 * k);
    const gr = ctx.createRadialGradient(cx, cz, rr * 0.6, cx, cz, rr);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cz, rr, 0, Math.PI * 2); ctx.fill();
    this._dirty = true;
  }

  update(dt, buildingsAlive) {
    const night = sharedUniforms.uNight.value, pw = sharedUniforms.uPower.value;
    const on = Math.max(0, Math.min(1, night)) * pw;
    // 가로등 머리: 낮에는 회색 덮개, 밤에는 빛남 (빛번짐 효과에 걸림)
    this.lampMat.color.setRGB(0.35 + on * 2.6, 0.35 + on * 1.9, 0.33 + on * 1.1);
    if (this._dirty) { this._dT -= dt; if (this._dT <= 0) { this.tex.needsUpdate = true; this._dirty = false; this._dT = 0.3; } }
    // 차: 밤에만 보이고 길을 따라 달림 (EMP 면 멈춤)
    const vis = night > 0.2;
    this.headIM.visible = this.tailIM.visible = vis && this.cars.length > 0;
    if (vis && this.cars.length) {
      const m = new THREE.Matrix4(), o = {}, zero = new THREE.Matrix4().makeScale(0, 0, 0);
      this.headMat.color.setRGB(2.2 * pw, 2.0 * pw, 1.7 * pw); this.tailMat.color.setRGB(1.8 * pw, 0.15 * pw, 0.1 * pw);
      this.cars.forEach((c, i) => {
        if (!c.alive) { for (const im of [this.headIM, this.tailIM]) { im.setMatrixAt(i * 2, zero); im.setMatrixAt(i * 2 + 1, zero); } return; }
        if (pw > 0.5) { c.s += c.v * c.d * dt; if (c.s > c.l.L || c.s < 0) { const l = this._pick(); c.l = l; c.d = this.rnd() < 0.5 ? 1 : -1; c.s = c.d > 0 ? 0 : l.L; } }
        this._at(c.l, c.s, o);
        const fx = o.ux * c.d, fz = o.uz * c.d, sx = -fz, sz = fx;
        const lane = Math.min(c.l.w * 0.25, 3) ;
        const px = o.x - sx * lane, pz = o.z - sz * lane, y = this.ground(px, pz) + 0.75;
        for (const s2 of [-0.7, 0.7]) {
          const k = s2 < 0 ? 0 : 1;
          m.makeTranslation(px + fx * 2.1 + sx * s2, y, pz + fz * 2.1 + sz * s2); this.headIM.setMatrixAt(i * 2 + k, m);
          m.makeTranslation(px - fx * 2.1 + sx * s2, y + 0.1, pz - fz * 2.1 + sz * s2); this.tailIM.setMatrixAt(i * 2 + k, m);
        }
      });
      this.headIM.instanceMatrix.needsUpdate = true; this.tailIM.instanceMatrix.needsUpdate = true;
    }
    // 항공 장애등: 1.5초마다 깜빡, 무너진 건물은 끔
    this._bT += dt;
    const blink = (this._bT % 1.5) < 0.25;
    this.beacons.visible = night > 0.2 && blink && pw > 0.5;
    if (this.beacons.visible && buildingsAlive) {
      const m = new THREE.Matrix4(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
      this.tall.forEach((b, i) => { if (b.state === 'intact') { m.makeTranslation((b.minx + b.maxx) / 2, (b.baseY || 0) + b.height + 0.8, (b.minz + b.maxz) / 2); this.beacons.setMatrixAt(i, m); } else this.beacons.setMatrixAt(i, zero); });
      this.beacons.instanceMatrix.needsUpdate = true;
      this.beaconMat.color.setRGB(3, 0.25, 0.1);
    }
  }

  dispose() {
    for (const im of [this.poles, this.arms, this.heads, this.headIM, this.tailIM, this.beacons]) { this.scene.remove(im); im.geometry.dispose(); }
    this.tex.dispose();
  }
}
