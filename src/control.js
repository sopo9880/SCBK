// 발사 관제실: 전술 지도에서 표적을 찍고, 무기를 고르고, 덮개·열쇠·발사 버튼으로 쏘는 화면
// (게임용 연출. 버튼과 화면은 모두 자체 디자인)
import { WEAPONS, weaponIcon } from './weapons/defs.js';

const LAUNCHABLE = ['missile', 'guided', 'cruise', 'hypersonic', 'mlrs', 'pgm', 'naval', 'rod', 'bomber', 'icbm', 'nuke', 'tsar', 'antimatter', 'asteroid'];
const $ = (root, s) => root.querySelector(s);

function build() {
  const el = document.createElement('div');
  el.id = 'control'; el.hidden = true;
  el.innerHTML = `
    <div class="cr-map"><div class="cr-head"><b>전술 지도</b><span id="crCoord">표적 없음</span></div><canvas id="crCanvas" width="720" height="720"></canvas><div class="cr-hint">지도를 눌러 표적 지정</div></div>
    <div class="cr-live"><div class="cr-head"><b>실시간 화면</b><span class="cr-rec">● LIVE</span></div></div>
    <div class="cr-panel">
      <div class="cr-head"><b>발사 관제실</b><button class="cr-x" id="crClose" title="닫기 (Esc)">✕</button></div>
      <div class="cr-sec"><span>무기</span><div class="cr-weps" id="crWeps"></div></div>
      <div class="cr-sec"><span>위력</span><div class="cr-pow" id="crPow"></div></div>
      <div class="cr-sec cr-arm">
        <span>발사 준비</span>
        <button class="cr-step" id="crCover"><i></i><em>1</em>안전 덮개 열기</button>
        <button class="cr-step" id="crKey" disabled><i class="key"></i><em>2</em>발사 열쇠 돌리기</button>
        <button class="cr-fire" id="crFire" disabled><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" class="bg"/><circle cx="50" cy="50" r="44" class="pr" id="crRing"/></svg><span>발사</span><small>길게 누르기</small></button>
      </div>
      <div class="cr-status" id="crStatus">표적을 지정하세요</div>
    </div>`;
  document.body.appendChild(el);
  return el;
}

export function openControl(game, { power = 3, onLaunch, onClose } = {}) {
  const el = document.getElementById('control') || build();
  const cv = $(el, '#crCanvas'), g2 = cv.getContext('2d');
  const D = game.D, grid = game.grid, data = game.data;
  const span = grid.span, N = cv.width;
  const toC = (x, z) => [(x / span + 0.5) * N, (z / span + 0.5) * N];
  const toW = (cx, cy) => [(cx / N - 0.5) * span, (cy / N - 0.5) * span];
  const st = { wep: LAUNCHABLE.includes(game.arsenal.current) ? game.arsenal.current : 'missile', tgt: null, cover: false, key: false, hold: 0, holding: false, raf: 0, t: 0 };

  // 고정된 바탕 (지형 음영, 물, 공원, 도로)
  const base = document.createElement('canvas'); base.width = base.height = N;
  {
    const b = base.getContext('2d');
    b.fillStyle = '#0b1a14'; b.fillRect(0, 0, N, N);
    let lo = Infinity, hi = -Infinity; for (const h of grid.h) { lo = Math.min(lo, h); hi = Math.max(hi, h); }
    const step = 8;
    for (let y = 0; y < N; y += step) for (let x = 0; x < N; x += step) {
      const [wx, wz] = toW(x + step / 2, y + step / 2);
      const k = (grid.sample(wx, wz) - lo) / Math.max(1, hi - lo);
      b.fillStyle = `rgba(80,200,140,${0.04 + k * 0.16})`; b.fillRect(x, y, step, step);
    }
    const poly = (ring) => { ring.forEach((p, i) => { const [x, y] = toC(p[0], p[1]); i ? b.lineTo(x, y) : b.moveTo(x, y); }); b.closePath(); };
    for (const a of data.areas || []) {
      if (a.kind !== 'water' && a.kind !== 'park' && a.kind !== 'forest') continue;
      b.beginPath(); poly(a.outer); b.fillStyle = a.kind === 'water' ? 'rgba(60,140,220,0.45)' : 'rgba(70,160,90,0.18)'; b.fill();
    }
    b.lineCap = 'round';
    for (const w of data.waterLines || []) { b.beginPath(); w.pts.forEach((p, i) => { const [x, y] = toC(p[0], p[1]); i ? b.lineTo(x, y) : b.moveTo(x, y); }); b.strokeStyle = 'rgba(60,140,220,0.5)'; b.lineWidth = Math.max(1.5, w.width / span * N); b.stroke(); }
    for (const r of data.roads || []) { b.beginPath(); r.pts.forEach((p, i) => { const [x, y] = toC(p[0], p[1]); i ? b.lineTo(x, y) : b.moveTo(x, y); }); b.strokeStyle = 'rgba(150,230,190,0.22)'; b.lineWidth = Math.max(0.8, r.width / span * N); b.stroke(); }
    // 격자와 좌표
    b.strokeStyle = 'rgba(120,255,180,0.12)'; b.lineWidth = 1; b.font = '11px monospace'; b.fillStyle = 'rgba(160,255,200,0.45)';
    for (let i = 0; i <= 10; i++) { const p = (i / 10) * N; b.beginPath(); b.moveTo(p, 0); b.lineTo(p, N); b.moveTo(0, p); b.lineTo(N, p); b.stroke(); if (i < 10) { b.fillText(String.fromCharCode(65 + i), p + 4, 12); b.fillText(String(i + 1), 3, p + 24); } }
  }
  const radius = () => {
    const P = power;
    if (['nuke', 'tsar', 'antimatter', 'icbm', 'bomber'].includes(st.wep)) return Math.min(span, 1650 * Math.cbrt(15 * P ** 1.75 / 15) * (st.wep === 'antimatter' ? 2.9 : st.wep === 'tsar' ? 2.2 : 1));
    return 40 * (0.75 * P ** 0.38) * (st.wep === 'mlrs' || st.wep === 'pgm' ? 3 : st.wep === 'asteroid' || st.wep === 'rod' ? 3.5 : 1);
  };
  function draw() {
    g2.drawImage(base, 0, 0);
    // 건물 (상태별 색)
    for (const b of D.buildings) {
      const pts = b.pts; if (!pts || !pts.length) continue;
      g2.beginPath(); pts.forEach((p, i) => { const [x, y] = toC(p[0], p[1]); i ? g2.lineTo(x, y) : g2.moveTo(x, y); }); g2.closePath();
      g2.fillStyle = b.state === 'intact' ? 'rgba(170,255,210,0.55)' : b.state === 'gone' ? 'rgba(255,90,60,0.12)' : 'rgba(255,140,80,0.5)';
      g2.fill();
    }
    // 카메라 위치·방향
    const cp = game.camera.position, [cx, cy] = toC(cp.x, cp.z);
    const tg = game.controls.target, [tx, ty] = toC(tg.x, tg.z);
    const a = Math.atan2(ty - cy, tx - cx);
    g2.fillStyle = 'rgba(255,255,255,0.8)'; g2.beginPath(); g2.moveTo(cx + Math.cos(a) * 9, cy + Math.sin(a) * 9); g2.lineTo(cx + Math.cos(a + 2.5) * 6, cy + Math.sin(a + 2.5) * 6); g2.lineTo(cx + Math.cos(a - 2.5) * 6, cy + Math.sin(a - 2.5) * 6); g2.fill();
    // 표적
    if (st.tgt) {
      const [x, y] = toC(st.tgt.x, st.tgt.z);
      const blink = 0.6 + 0.4 * Math.sin(st.t * 6);
      g2.strokeStyle = `rgba(255,90,60,${blink})`; g2.lineWidth = 2;
      g2.beginPath(); g2.arc(x, y, 10, 0, 6.3); g2.moveTo(x - 18, y); g2.lineTo(x + 18, y); g2.moveTo(x, y - 18); g2.lineTo(x, y + 18); g2.stroke();
      const rr = radius() / span * N;
      g2.strokeStyle = 'rgba(255,120,80,0.5)'; g2.setLineDash([6, 5]); g2.beginPath(); g2.arc(x, y, Math.max(12, rr), 0, 6.3); g2.stroke(); g2.setLineDash([]);
    }
  }
  function status() {
    const s = $(el, '#crStatus');
    const def = WEAPONS.find(w => w.id === st.wep);
    $(el, '#crPow').textContent = `×${power}  ·  ${def ? def.name : ''}`;
    $(el, '#crCover').classList.toggle('done', st.cover);
    $(el, '#crKey').disabled = !st.cover || !st.tgt; $(el, '#crKey').classList.toggle('done', st.key);
    $(el, '#crFire').disabled = !st.key || !st.tgt;
    s.textContent = !st.tgt ? '표적을 지정하세요' : !st.cover ? '안전 덮개를 여세요' : !st.key ? '발사 열쇠를 돌리세요' : '발사 버튼을 길게 누르세요';
    s.className = 'cr-status' + (st.key && st.tgt ? ' ready' : '');
  }
  // 무기 목록
  const wb = $(el, '#crWeps'); wb.innerHTML = '';
  for (const id of LAUNCHABLE) {
    const w = WEAPONS.find(x => x.id === id); if (!w) continue;
    const b = document.createElement('button'); b.className = 'cr-wep' + (id === st.wep ? ' on' : ''); b.innerHTML = `${weaponIcon(id)}<span>${w.name}</span>`; b.title = w.desc;
    b.onclick = () => { st.wep = id; for (const x of wb.children) x.classList.toggle('on', x === b); st.key = false; status(); };
    wb.appendChild(b);
  }
  cv.onpointerdown = (e) => {
    const r = cv.getBoundingClientRect();
    const [x, z] = toW((e.clientX - r.left) / r.width * N, (e.clientY - r.top) / r.height * N);
    const h = span / 2 * 0.95;
    st.tgt = { x: Math.max(-h, Math.min(h, x)), z: Math.max(-h, Math.min(h, z)) };
    const col = String.fromCharCode(65 + Math.min(9, Math.floor((st.tgt.x / span + 0.5) * 10))), row = Math.min(10, Math.floor((st.tgt.z / span + 0.5) * 10) + 1);
    $(el, '#crCoord').textContent = `표적 ${col}-${row}  (${Math.round(st.tgt.x)}, ${Math.round(st.tgt.z)})`;
    // 실시간 화면도 표적 쪽을 바라보게
    const gy = grid.sample(st.tgt.x, st.tgt.z);
    const back = game.camera.position.clone().sub(game.controls.target); back.y = 0; if (back.lengthSq() < 1) back.set(1, 0, 0);
    back.normalize().multiplyScalar(Math.min(700, Math.max(300, radius() * 2.2)));
    game.controls.target.set(st.tgt.x, gy, st.tgt.z);
    game.camera.position.set(st.tgt.x + back.x, gy + back.length() * 0.6, st.tgt.z + back.z);
    game.controls.update();
    status();
    game.audio.resume(); game.audio.crack && game.audio.buzz(0.08);
  };
  $(el, '#crCover').onclick = () => { st.cover = !st.cover; if (!st.cover) st.key = false; game.audio.thud(); status(); };
  $(el, '#crKey').onclick = () => { if (!st.cover || !st.tgt) return; st.key = !st.key; game.audio.crack(); status(); };
  const fireBtn = $(el, '#crFire'), ring = $(el, '#crRing');
  const C = 2 * Math.PI * 44;
  ring.style.strokeDasharray = `${C}`; ring.style.strokeDashoffset = `${C}`;
  fireBtn.onpointerdown = () => { if (fireBtn.disabled) return; st.holding = true; st.h0 = performance.now(); game.audio.charge(1.2); };
  const release = () => { st.holding = false; };
  fireBtn.onpointerup = release; fireBtn.onpointerleave = release;
  const close = (launched) => {
    cancelAnimationFrame(st.raf);
    el.hidden = true; document.body.classList.remove('control');
    window.removeEventListener('keydown', onKey, true);
    if (!launched && onClose) onClose();
  };
  const onKey = (e) => { if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); } };
  window.addEventListener('keydown', onKey, true);
  $(el, '#crClose').onclick = () => close(false);
  let last = performance.now();
  const tick = () => {
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    st.t += dt;
    // 실제 시간 기준 (화면이 느려도 1.2초 누르면 발사)
    if (st.holding && !fireBtn.disabled) st.hold = Math.min(1, (now - st.h0) / 1200); else st.hold = Math.max(0, st.hold - dt * 2);
    ring.style.strokeDashoffset = `${C * (1 - st.hold)}`;
    if (st.hold >= 1) { close(true); if (onLaunch) onLaunch(st.wep, st.tgt); return; }
    draw();
    st.raf = requestAnimationFrame(tick);
  };
  el.hidden = false; document.body.classList.add('control');
  status(); draw();
  st.raf = requestAnimationFrame(tick);
  return { close, state: st };
}
