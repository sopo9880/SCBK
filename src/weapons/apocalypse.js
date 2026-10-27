// 세계 멸망 공통 장치: 지평선 너머까지 퍼지는 파괴, 종말 날씨, 지각 붕괴, 행성 시점 마무리
// 모든 무기가 ×100(정확히는 위력 75 이상)에서 이걸 불러 "진짜 끝났다"는 느낌을 낸다.
import * as THREE from 'three';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const R = Math.random;

// 위력에 따른 멸망 단계: 0 = 없음, 0~1 사이 = 부분, 1 = 세계 멸망
export function doomLevel(P) { return Math.max(0, Math.min(1, (P - 30) / 45)); }
export const isWorldEnd = (A) => A.S.P >= 75;

/**
 * 세계 멸망 연출 묶음
 * kind: 종말 날씨/행성 연출 종류 (nuke, impact, fire, ash, ice, void, anti, dust, water, crack, shatter)
 * opts: { delay: 시작까지(초), wave: 지평선 충격파, crust: 지각 붕괴, finale: 행성 시점, planetKind, finaleDelay, wipe: 지도 전체 붕괴 }
 */
export function worldEnd(A, center, kind = 'nuke', opts = {}) {
  const { game, grid } = A.ctx;
  const lvl = opts.level ?? doomLevel(A.S.P);
  if (lvl <= 0) return;
  const c = v3(center.x, grid.sample(center.x, center.z), center.z);
  const o = Object.assign({ delay: 0, wave: true, crust: false, finale: true, wipe: false, finaleDelay: 14, waveSpeed: 1600 }, opts);
  const weather = { crack: 'ash', shatter: 'fire' }[kind] || kind;
  const planetMap = { fallout: 'ash', space: 'void', data: 'void' };
  A.addActive({
    t: 0, started: false, waveR: 0, finaled: false,
    update(dt) {
      this.t += dt;
      if (this.t < o.delay) return true;
      if (!this.started) {
        this.started = true;
        if (game && o.doom !== false) game.setDoom(Math.min(1, 0.4 + 0.6 * lvl), weather);
        if (o.crust) crustCollapse(A, c, { level: lvl });
        if (o.wipe) wipeMap(A, c, kind);
      }
      const te = this.t - o.delay;
      // 지평선 너머 마을들을 쓸고 가는 충격파
      if (o.wave && A.ctx.world && A.ctx.world.ravageOuter) {
        const prev = this.waveR;
        this.waveR = Math.min(o.waveMax || 40000, te * o.waveSpeed * (0.6 + 0.4 * lvl));
        if (this.waveR > prev) {
          A.ctx.world.ravageOuter(c.x, c.z, prev, this.waveR, lvl);
          // 지평선을 따라 피어오르는 먼지벽
          const n = Math.round(10 * A.ctx.quality.fxScale);
          for (let i = 0; i < n; i++) {
            const a = R() * 6.28, x = c.x + Math.cos(a) * this.waveR, z = c.z + Math.sin(a) * this.waveR;
            const y = game && game.groundAt ? game.groundAt(x, z) : grid.sample(x, z);
            const sz = Math.min(600, 40 + this.waveR * 0.03);
            A.ctx.fx.smoke.emit(x, y + sz * 0.3, z, Math.cos(a) * 60, 20, Math.sin(a) * 60, 10 + R() * 6, sz, sz * 3, [0.4, 0.34, 0.3, 0.7], [0.35, 0.32, 0.3, 0], 0.1, 1.5);
          }
        }
      }
      // 행성 시점 마무리 (연출이 끝난 뒤)
      if (o.finale && !this.finaled && lvl >= 1 && te > o.finaleDelay && game && !game.cine.active && A.opts.planet !== false) {
        this.finaled = true;
        game.playPlanet(o.planetKind || planetMap[kind] || kind);
      }
      return te < Math.max(o.finaleDelay + 2, 30) || (!this.finaled && te < 90 && o.finale && lvl >= 1 && A.opts.planet !== false);
    },
  });
}

// 지각 붕괴: 땅이 갈라지며 협곡이 열리고 틈에서 용암 빛이 솟음, 지도 전체가 가라앉음
export function crustCollapse(A, c, { level = 1, cracks = 0, dur = 9 } = {}) {
  const { grid, world, D, fx, audio } = A.ctx;
  const half = grid.span / 2;
  const nC = cracks || Math.round(5 + 7 * level);
  const lines = [];
  for (let i = 0; i < nC; i++) {
    const a = (i / nC) * Math.PI * 2 + R() * 0.5;
    const pts = [[c.x + (R() - 0.5) * 40, c.z + (R() - 0.5) * 40]];
    let ang = a, x = pts[0][0], z = pts[0][1];
    const len = half * (0.9 + R() * 0.9);
    for (let d = 0; d < len; d += 30) { ang += (R() - 0.5) * 0.35; x += Math.cos(ang) * 30; z += Math.sin(ang) * 30; pts.push([x, z]); }
    lines.push({ pts, k: 0, w: (8 + R() * 10) * (0.6 + level), depth: (10 + R() * 14) * (0.5 + level) });
  }
  audio.rumble(dur + 3);
  A.addActive({
    t: 0, sink: 0, acc: 0,
    update(dt) {
      this.t += dt;
      const u = Math.min(1, this.t / dur);
      // 균열이 중심에서 바깥으로 자라남
      for (const L of lines) {
        const want = Math.floor(u * (L.pts.length - 1));
        while (L.k < want) {
          L.k++;
          const [x, z] = L.pts[L.k];
          if (Math.abs(x) > half * 0.98 || Math.abs(z) > half * 0.98) continue;
          A.crater(x, z, L.w, L.depth);
          if (R() < 0.25) world.paintScorch(x, z, L.w * 1.6, 0.6);
        }
        // 틈 속의 용암 빛
        for (let j = Math.max(1, L.k - 25); j <= L.k; j += 2) {
          if (R() > 0.25) continue;
          const [x, z] = L.pts[j];
          if (Math.abs(x) > half || Math.abs(z) > half) continue;
          const y = grid.sample(x, z);
          fx.fire.emit(x + (R() - 0.5) * L.w * 0.6, y + 1, z + (R() - 0.5) * L.w * 0.6, 0, 6 + R() * 10, 0, 1.5, L.w * 0.8, L.w * 0.3, [1, 0.55, 0.15, 1], [0.6, 0.1, 0.02, 0], 0.4, 2);
        }
      }
      // 지도 전체가 서서히 가라앉음 (몇 번에 나눠)
      this.sink += dt;
      if (!this.sunk && u > 0.6) { this.sunk = true; A.crater(c.x, c.z, half * 1.3, 6 * level); } // 지도 전체가 한 번 크게 가라앉음
      D.quake(c.x, c.z, half * 1.2, 0.8 + level, dt);
      fx.addShake(dt * 1.6);
      return this.t < dur + 6;
    },
  });
}

// 지도 전체를 차례로 무너뜨림 (물리 없이 가볍게): 중심에서 바깥으로
export function wipeMap(A, c, kind = 'nuke', { dur = 6 } = {}) {
  const { D, fx } = A.ctx;
  const list = D.buildings.filter(b => b.state === 'intact').map(b => [Math.hypot(b.cx - c.x, b.cz - c.z), b]).sort((a, b) => a[0] - b[0]);
  if (!list.length) return;
  const maxD = list[list.length - 1][0] + 1;
  let k = 0, dust = Math.round(30 * A.ctx.quality.fxScale);
  A.addActive({
    t: 0,
    update(dt) {
      this.t += dt;
      const cur = maxD * Math.min(1, this.t / dur);
      while (k < list.length && list[k][0] <= cur) {
        const [d, b] = list[k++];
        if (kind === 'void' || kind === 'anti') { D.vaporizeBuilding(b); continue; }
        D.flatten(b, 0.75 + R() * 0.25, (b.cx - c.x) / (d || 1), (b.cz - c.z) / (d || 1), 1.2 + R());
        if (dust > 0 && R() < 0.15) { dust--; fx.collapseDust(b); }
      }
      return k < list.length;
    },
  });
}
