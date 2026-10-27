// 물리 전용 워커: 화면 프레임과 상관없이 실제 시간 기준으로 스스로 진행하고,
// 메인 스레드에서 오는 명령을 받아 실행하며, 진행할 때마다 동적 body 상태를 돌려준다
import RAPIER from '@dimforge/rapier3d-simd-compat';
import { PhysCore } from './core.js';

let core = null, ts = 1, last = 0, err = null, running = false;
const ready = RAPIER.init().then(() => { core = new PhysCore(RAPIER); });

function loop() {
  if (!core) return;
  const t0 = performance.now();
  const dt = Math.min(0.1, (t0 - last) / 1000);
  last = t0;
  const maxSteps = (core.stepMs > 14 ? 1 : core.stepMs > 8 ? 2 : 3) * Math.max(1, Math.ceil(ts));
  let st = { steps: 0 };
  try { st = core.step(dt * ts, maxSteps); } catch (e) { err = err || 'step: ' + (e && e.message || e); }
  if (st.steps > 0 || err) {
    const snap = core.snapshot();
    self.postMessage({ type: 'state', ids: snap.ids, f: snap.f, stepMs: core.stepMs, steps: st.steps, simDt: st.steps / 60, err }, [snap.ids.buffer, snap.f.buffer]);
    err = null;
  }
  const spent = performance.now() - t0;
  setTimeout(loop, Math.max(0, 1000 / 60 - spent));
}

self.onmessage = async (e) => {
  const m = e.data;
  await ready;
  if (m.type === 'cmds') {
    if (m.ts !== undefined) ts = m.ts;
    for (const c of m.cmds) { try { core.exec(c); } catch (ex) { if (!err) err = c[0] + ': ' + (ex && ex.message || ex); } }
    if (!running) { running = true; last = performance.now(); loop(); }
  } else if (m.type === 'dispose') {
    const c = core; core = null;
    if (c) c.free();
    self.close();
  }
};
ready.then(() => self.postMessage({ type: 'ready' }));
