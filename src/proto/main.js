// GPU 물리 단독 시험: 상자 쌓기·무너뜨리기 (화면 없이 수치만)
import { GPUCore } from '../physics/gpucore.js';
window.__proto = async (o = {}) => {
  const core = await GPUCore.create(o.cap || 4096);
  if (!core) return 'no gpu';
  if (o.k) core._k = o.k;
  // 평평한 땅 (높이 0)
  const n = 65, span = 256; const h = new Float32Array(n * n);
  core.exec(['hf', 1, n, h, span]);
  let id = 10; const ids = [];
  const box = (x, y, z, hx, hy, hz, dyn = true) => { const i = id++; core.exec(['chunk', i, x, y, z, 0, [hx, hy, hz, 0, 0, 0, 1], 2.4, 0]); if (dyn) core.exec(['dyn', i, 1]); ids.push(i); return i; };
  // 탑: 1.5m 정육면체 10층, 벽: 4x6 판, 무작위 더미
  for (let k = 0; k < (o.tower ?? 10); k++) box(0, 0.75 + k * 1.5, 0, 0.75, 0.75, 0.75);
  for (let a = 0; a < (o.wall ?? 6); a++) for (let b = 0; b < 4; b++) box(10 + b * 3.0, 0.5 + a * 1.0, 0, 1.5, 0.5, 0.75);
  for (let k = 0; k < (o.pile ?? 200); k++) box(-15 + (k % 3) * 3.2, 3 + Math.floor(k / 9) * 3.2, (Math.floor(k / 3) % 3) * 3.2, 0.4 + Math.random(), 0.3 + Math.random() * 0.6, 0.4 + Math.random() * 0.8);
  const state = new Map();
  core.onState = (cnt, f) => { for (let k = 0; k < cnt; k++) { const s = f[k * 12 + 3] | 0; state.set(core.ids[s], { y: f[k * 12 + 1], x: f[k * 12], v: Math.hypot(f[k * 12 + 8], f[k * 12 + 9], f[k * 12 + 10]), sl: f[k * 12 + 11] }); } };
  const log = [];
  const T = o.secs || 6;
  for (let f = 0; f < T * 60; f++) {
    if (o.push && f === 120) core.exec(['vel', ids[0] + 2, 12, 0, 0]);
    core.step(1 / 60, 1);
    if (f % (o.every || 30) === (o.every || 30) - 1) {
      await core.device.queue.onSubmittedWorkDone(); await new Promise(r => setTimeout(r, 0));
      let tw = []; for (const k of (o.watch || [10, 11, 12, 13, 14, 15, 16, 17, 18, 19])) { const s = state.get(k); tw.push(s ? [+s.x.toFixed(2), +s.y.toFixed(2), +s.v.toFixed(2), s.sl] : null); }
      let maxv = 0, slept = 0, moving = 0, fast = null, miny = 1e9; for (const [i, s] of state) { if (s.v > maxv) { maxv = s.v; fast = [i, +s.x.toFixed(1), +s.y.toFixed(1)]; } miny = Math.min(miny, s.y); if (s.sl > 0.5) slept++; else moving++; }
      log.push(JSON.stringify({ t: ((f + 1) / 60).toFixed(1), tower: tw, maxv: +maxv.toFixed(2), fast, miny: +miny.toFixed(1), slept, moving }));
    }
  }
  return log.join('\n');
};
