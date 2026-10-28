// 앱 진입점: 메뉴 → 로딩 → 게임
import { Physics } from './physics/physics.js';
import { makeProjection, bboxFor, overpassQuery, parseOSM } from './geo.js';
import { buildTerrainFromTiles, buildProceduralTerrain, buildFlatTerrain, carveWater } from './terrain.js';
import { generateDemoCity, demoTerrainFn } from './demo.js';
import { Game, QUALITY, TIMES } from './game.js';
import { WEAPONS, CATEGORIES, DEFAULT_OPTS, weaponIcon, sliderToPower, powerToSlider, nukeYield, fmtYield } from './weapons.js';

// 핵·충돌 계열은 설명 옆에 TNT 환산 위력 표시
const YIELD_MUL = { nuke: 1, bomber: 1, icbm: 1, asteroid: 3, antimatter: 25 };
function descFor(wp, P) {
  if (wp.id === 'tsar') return `${wp.desc} · 지금 TNT ${fmtYield(50000 * Math.max(0.1, P / 10))}`;
  if (YIELD_MUL[wp.id]) return `${wp.desc} · 지금 TNT ${fmtYield(nukeYield(P) * YIELD_MUL[wp.id])}`;
  return wp.desc;
}
import { Audio } from './audio.js';
import { PROF } from './prof.js';
import { openSettings, defaultCfg } from './settings.js';
import { openControl } from './control.js';
import { startVehicle, openVehiclePicker } from './vehicles.js';
import { showCountdown, hideCountdown } from './weapons/apocalypse.js';
window.__PROF = PROF;

const $ = (s) => document.querySelector(s);
const tick = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

// ---------- 네트워크 API (Electron 메인 프로세스 또는 브라우저 fetch) ----------
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
const browserApi = {
  async overpass(query) {
    let last;
    for (const url of OVERPASS) {
      try {
        const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(query), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return await r.json();
      } catch (e) { last = e; }
    }
    throw last;
  },
  async tile(z, x, y) {
    const r = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`);
    if (!r.ok) throw new Error('tile ' + r.status);
    return await r.arrayBuffer();
  },
  async geocode(q) {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&accept-language=ko&q=${encodeURIComponent(q)}`);
    return await r.json();
  },
  async saveScreenshot(dataUrl) {
    const a = document.createElement('a'); a.href = dataUrl; a.download = `wreck-earth-${Date.now()}.png`; a.click();
    return '다운로드 폴더';
  },
  toggleFullscreen() { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); },
};
const api = window.api || browserApi;

// 큰 반경은 구역을 나눠 받은 뒤 합침 (지도 서버 시간 초과 방지)
async function fetchOSMTiled(place, radius, onProgress) {
  const R = radius * 1.08;
  const n = R <= 1300 ? 1 : R <= 2300 ? 2 : 3;
  if (n === 1) { onProgress(1, 1); return api.overpass(overpassQuery(bboxFor(place.lat, place.lon, R))); }
  const full = bboxFor(place.lat, place.lon, R);
  const dLat = (full.n - full.s) / n, dLon = (full.e - full.w) / n;
  const seen = new Set(), elements = [];
  let k = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    k++; onProgress(k, n * n);
    const bb = { s: full.s + i * dLat, n: full.s + (i + 1) * dLat, w: full.w + j * dLon, e: full.w + (j + 1) * dLon };
    const json = await api.overpass(overpassQuery(bb));
    for (const e of json.elements || []) {
      const key = e.type + e.id;
      if (seen.has(key)) continue;
      seen.add(key); elements.push(e);
    }
  }
  return { elements };
}

// ---------- 저장 ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('we.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('we.' + k, JSON.stringify(v)); } catch (e) { /* 무시 */ } },
};

const PRESETS = [
  { name: '부산대학교', lat: 35.2335, lon: 129.0805, sub: '부산 금정구' },
  { name: '동아대학교 승학캠퍼스', lat: 35.1160, lon: 128.9675, sub: '부산 사하구' },
  { name: '연세대학교 신촌캠퍼스', lat: 37.5658, lon: 126.9386, sub: '서울 서대문구' },
  { name: '서울대학교', lat: 37.4600, lon: 126.9520, sub: '서울 관악구' },
  { name: 'KAIST', lat: 36.3720, lon: 127.3620, sub: '대전 유성구' },
  { name: '광화문', lat: 37.5740, lon: 126.9770, sub: '서울 종로구' },
  { name: '해운대', lat: 35.1600, lon: 129.1600, sub: '부산 해운대구' },
  { name: '롯데월드타워', lat: 37.5126, lon: 127.1025, sub: '서울 송파구' },
  { name: '강남역', lat: 37.4979, lon: 127.0276, sub: '서울 강남구' },
  { name: '타임스 스퀘어', lat: 40.7580, lon: -73.9855, sub: '뉴욕' },
  { name: '시부야', lat: 35.6595, lon: 139.7005, sub: '도쿄' },
  { name: '에펠탑', lat: 48.8584, lon: 2.2945, sub: '파리' },
];

export function formatScore(n) {
  if (n >= 1e8) return (n / 1e8).toFixed(n >= 1e9 ? 1 : 2).replace(/\.0+$/, '') + '억';
  if (n >= 1e4) return (n / 1e4).toFixed(n >= 1e6 ? 0 : 1).replace(/\.0$/, '') + '만';
  return Math.round(n).toLocaleString('ko-KR');
}

const settings = Object.assign({ radius: 600, quality: 'high', time: 'noon', volume: 0.7, power: 3, wopts: {} }, store.get('settings', {}));
settings.wopts = Object.assign({}, DEFAULT_OPTS, settings.wopts);
settings.cfg = Object.assign(defaultCfg(), settings.cfg || {});
if (settings.physWorker === false) settings.cfg.physWorker = false;
const CFG_OPTS = ['cinematic', 'autoPull', 'soundDelay', 'planet', 'strobe', 'worldEnd', 'endTrigger', 'endPct'];
const audio = new Audio(); audio.setVolume(settings.volume);
let game = null, current = null, cachedData = null;

// ---------- 메뉴 ----------
function initMenu() {
  const pres = $('#presets');
  for (const p of PRESETS) {
    const b = document.createElement('button'); b.className = 'chip';
    b.innerHTML = `${p.name}<small>${p.sub}</small>`;
    b.onclick = () => start({ name: p.name, sub: p.sub, lat: p.lat, lon: p.lon });
    pres.appendChild(b);
  }
  const demo = document.createElement('button'); demo.className = 'chip demo';
  demo.innerHTML = '데모 시티<small>오프라인</small>';
  demo.onclick = () => start({ demo: true, name: '데모 시티', sub: '오프라인 · 절차 생성' });
  pres.appendChild(demo);
  const mega = document.createElement('button'); mega.className = 'chip demo';
  mega.innerHTML = '메가 시티 8×8km<small>오프라인 · 고사양</small>';
  mega.onclick = () => start({ demo: true, mega: true, name: '메가 시티', sub: '오프라인 · 8×8km 절차 생성' });
  pres.appendChild(mega);

  const r = $('#radius'); r.value = settings.radius;
  const showR = () => {
    const v = +r.value; $('#radiusVal').textContent = v >= 1000 ? (v / 1000).toFixed(1) + ' km' : v + ' m';
    $('#radiusHint').textContent = v <= 500 ? '가볍고 빠름 · 캠퍼스 하나 정도' : v <= 900 ? '균형 · 동네 전체' : v <= 1500 ? '도심 전체 · 사양 높은 PC 권장' : '구 단위 초대형 · 첫 로딩이 1~3분 걸릴 수 있고 고사양 PC 필요';
  };
  r.oninput = () => { showR(); settings.radius = +r.value; store.set('settings', settings); };
  showR();
  const seg = (el, obj, key) => {
    el.innerHTML = '';
    for (const [k, v] of Object.entries(obj)) {
      const b = document.createElement('button'); b.textContent = v.name; b.className = settings[key] === k ? 'on' : '';
      b.onclick = () => { settings[key] = k; store.set('settings', settings); seg(el, obj, key); };
      el.appendChild(b);
    }
  };
  seg($('#quality'), QUALITY, 'quality');
  seg($('#timeSeg'), TIMES, 'time');

  // 검색
  const q = $('#q'), list = $('#results');
  let sel = -1, items = [];
  const search = async () => {
    const text = q.value.trim(); if (!text) return;
    const m = text.match(/^\s*(-?\d+(\.\d+)?)\s*[, ]\s*(-?\d+(\.\d+)?)\s*$/);
    if (m) { start({ name: `${(+m[1]).toFixed(4)}, ${(+m[3]).toFixed(4)}`, sub: '좌표', lat: +m[1], lon: +m[3] }); return; }
    list.hidden = false; list.innerHTML = '<li class="muted">검색 중…</li>';
    try {
      const res = await api.geocode(text);
      items = (res || []).map(x => ({ name: x.name || (x.display_name || '').split(',')[0], sub: x.display_name, lat: +x.lat, lon: +x.lon }));
      if (!items.length) { list.innerHTML = '<li class="muted">결과가 없어요. 다른 이름이나 좌표로 해 보세요.</li>'; return; }
      list.innerHTML = '';
      items.forEach((it, i) => {
        const li = document.createElement('li');
        li.innerHTML = `<div><div class="rn"></div><div class="rd"></div></div><span class="go">부수러 가기 →</span>`;
        li.querySelector('.rn').textContent = it.name; li.querySelector('.rd').textContent = it.sub;
        li.onclick = () => start(it);
        list.appendChild(li);
      });
      sel = -1;
    } catch (e) {
      list.innerHTML = '<li class="muted">검색 서버에 연결하지 못했어요. 인터넷 연결을 확인하거나 좌표를 직접 넣어 주세요.</li>';
    }
  };
  $('#qbtn').onclick = search;
  q.addEventListener('keydown', (e) => {
    const lis = [...list.querySelectorAll('li')];
    if (e.key === 'Enter') { if (sel >= 0 && items[sel]) start(items[sel]); else search(); }
    else if (e.key === 'ArrowDown' && lis.length) { sel = Math.min(lis.length - 1, sel + 1); lis.forEach((l, i) => l.classList.toggle('sel', i === sel)); e.preventDefault(); }
    else if (e.key === 'ArrowUp' && lis.length) { sel = Math.max(0, sel - 1); lis.forEach((l, i) => l.classList.toggle('sel', i === sel)); e.preventDefault(); }
    else if (e.key === 'Escape') list.hidden = true;
  });
  $('#goCoord').onclick = () => {
    const lat = parseFloat($('#lat').value), lon = parseFloat($('#lon').value);
    if (isFinite(lat) && isFinite(lon) && Math.abs(lat) < 85 && Math.abs(lon) <= 180) start({ name: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, sub: '좌표', lat, lon });
  };
  renderRecent();
  q.focus();
  if (api.desktop) {
    $('#footActions').hidden = false;
    $('#shotDir').onclick = () => api.openShotFolder();
    const btn = $('#cacheBtn');
    const refresh = async () => { try { const c = await api.cacheInfo(); btn.textContent = `지도 캐시 비우기 (${(c.bytes / 1048576).toFixed(0)} MB)`; } catch (e) { /* 무시 */ } };
    btn.onclick = async () => { await api.clearCache(); refresh(); };
    refresh();
  }
}

function placeKey(p) { return p.demo ? (p.mega ? 'demo-mega' : 'demo') : `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`; }

function renderRecent() {
  const recs = Object.values(store.get('records', {})).sort((a, b) => b.when - a.when).slice(0, 12);
  const ul = $('#recent');
  if (!recs.length) { ul.innerHTML = '<li class="muted">아직 기록이 없어요</li>'; return; }
  ul.innerHTML = '';
  for (const r of recs) {
    const li = document.createElement('li');
    li.innerHTML = '<span class="rp"></span><span class="rs"></span>';
    li.querySelector('.rp').textContent = r.place.name;
    li.querySelector('.rs').textContent = formatScore(r.best);
    li.onclick = () => start(r.place);
    ul.appendChild(li);
  }
}

function saveRecord() {
  if (!game || !current) return;
  const s = game.D.stats();
  if (s.score <= 0) return;
  const recs = store.get('records', {});
  const k = placeKey(current);
  const prev = recs[k];
  recs[k] = { place: { name: current.name, sub: current.sub, lat: current.lat, lon: current.lon, demo: current.demo, mega: current.mega }, best: Math.max(prev ? prev.best : 0, s.score), when: Date.now() };
  store.set('records', recs);
}

// ---------- 로딩 ----------
const STEPS = ['물리 엔진 준비', '건물·도로 지도 받기', '지형 높이 받기', '도시 짓기', '파괴 준비'];
function setStep(i, state, note) {
  const li = $('#steps').children[i];
  li.className = state; li.querySelector('small').textContent = note || '';
  $('#bar').style.width = Math.round(((i + (state === 'done' ? 1 : 0.5)) / STEPS.length) * 100) + '%';
}

async function start(place) {
  saveRecord();
  if (game) { try { game.dispose(); } catch (e) { console.error('정리 중 오류:', e); } game = null; }
  current = place;
  cachedData = null;
  $('#menu').hidden = true; $('#hud').hidden = true; $('#loading').hidden = false;
  $('#results').hidden = true;
  await loadAndRun(place);
}

async function loadAndRun(place, reuse) {
  $('#loadTitle').textContent = place.name;
  $('#steps').innerHTML = STEPS.map(s => `<li>${s}<small></small></li>`).join('');
  $('#loadErr').hidden = true; $('#loadActions').hidden = true;
  const radius = place.mega ? 4000 : settings.radius;
  let i = 0;
  try {
    setStep(i, 'run');
    const phys = await Physics.create({ useWorker: settings.cfg.physWorker !== false && settings.physWorker !== false, gpu: settings.cfg.physEngine === 'gpu', capacity: +settings.cfg.gpuBodies || 32768 });
    setStep(i++, 'done', phys.mode === 'gpu' ? 'GPU' : phys.mode === 'worker' ? '별도 스레드' : '같은 스레드');

    let data, grid, proj;
    if (reuse && cachedData) {
      ({ data, grid, proj } = cachedData);
      setStep(i++, 'done', '캐시'); setStep(i++, 'done', '캐시');
      // 데이터는 재사용하되 지형/건물 상태는 새로
      grid = cachedData.makeGrid();
      data = cachedData.makeData();
    } else if (place.demo) {
      setStep(i, 'run');
      const demo = generateDemoCity(radius, 7, { square: !!place.mega });
      proj = makeProjection(demo.center.lat, demo.center.lon);
      const json = demo.json;
      setStep(i++, 'done', '오프라인');
      setStep(i, 'run');
      const makeGrid = () => buildProceduralTerrain(radius, demoTerrainFn);
      grid = makeGrid();
      setStep(i++, 'done', '절차 생성');
      const makeData = () => parseOSM(json, proj, radius);
      data = makeData();
      cachedData = { data, grid, proj, makeGrid, makeData };
    } else {
      proj = makeProjection(place.lat, place.lon);
      setStep(i, 'run', '서버 응답 대기…');
      const json = await fetchOSMTiled(place, radius, (k, n) => setStep(i, 'run', n > 1 ? `구역 ${k}/${n} 받는 중…` : '서버 응답 대기…'));
      const nEl = (json.elements || []).length;
      setStep(i++, 'done', `${nEl.toLocaleString()}개 요소`);
      setStep(i, 'run');
      let tiles;
      try {
        grid = await buildTerrainFromTiles(proj, radius, (z, x, y) => api.tile(z, x, y), (f) => setStep(i, 'run', Math.round(f * 100) + '%'));
        setStep(i++, 'done');
      } catch (e) {
        grid = buildFlatTerrain(radius);
        setStep(i++, 'done', '평지로 대체');
      }
      const raw = grid.h.slice(), seaLevel = grid.seaLevel;
      const makeGrid = () => { const g = buildFlatTerrain(radius); g.h.set(raw); g.seaLevel = seaLevel; return g; };
      const makeData = () => parseOSM(json, proj, radius);
      data = makeData();
      cachedData = { data, grid, proj, makeGrid, makeData };
    }
    setStep(i, 'run', `건물 ${data.buildings.length.toLocaleString()}동`);
    carveWater(grid, data.areas, data.waterLines);
    await tick();
    if (!data.buildings.length) {
      throw new Error('이 범위 안에 지도에 등록된 건물이 없어요. 범위를 넓히거나 다른 장소를 골라 보세요.');
    }
    const host = $('#stage'); host.innerHTML = '';
    const canvas = document.createElement('canvas'); host.appendChild(canvas);
    game = new Game({ canvas, phys, grid, data, radius, place, quality: settings.quality, time: settings.time, audio, hud, cfg: settings.cfg });
    setStep(i++, 'done', `건물 ${data.buildings.length.toLocaleString()}동`);
    setStep(i, 'run'); await tick();
    setStep(i++, 'done');
    hud.enter(place, data);
    $('#loading').hidden = true; $('#hud').hidden = false;
    window.__game = game;
    document.dispatchEvent(new Event('we-newgame'));
  } catch (e) {
    console.error(e);
    setStep(Math.min(i, STEPS.length - 1), 'fail');
    const msg = String(e && e.message || e).replace(/Error invoking remote method '[^']+': (Error: )?/, '');
    $('#loadErr').hidden = false;
    $('#loadErr').textContent = /HTTP|fetch|Failed|network|net::|ENOTFOUND|timeout|429|504/i.test(msg)
      ? `지도 서버에 연결하지 못했어요 (${msg}). 인터넷 연결을 확인하거나 잠시 뒤 다시 시도해 주세요. 지도 서버가 붐빌 때는 범위를 줄이면 잘 받아져요.`
      : msg;
    $('#loadActions').hidden = false;
  }
}

// ---------- HUD ----------
const hud = {
  _toastT: 0, _lastScore: 0,
  enter(place, data) {
    $('#placeName').textContent = place.name;
    $('#placeSub').textContent = `건물 ${data.buildings.length.toLocaleString()}동 · ${place.mega ? '8×8km' : '반경 ' + (game.radius >= 1000 ? (game.radius / 1000).toFixed(1) + 'km' : game.radius + 'm')} · ${QUALITY[settings.quality].name}`;
    const rec = store.get('records', {})[placeKey(place)];
    $('#best').textContent = rec ? `이 장소 최고 ${formatScore(rec.best)}` : '';
    game.arsenal.opts = Object.assign({}, settings.wopts);
    for (const k of CFG_OPTS) game.arsenal.opts[k] = settings.cfg[k];
    game.arsenal.power = settings.power;
    this.buildWeapons();
    this.select(settings.weapon && WEAPONS.find(w => w.id === settings.weapon) ? settings.weapon : game.arsenal.current);
    this.toast(`${place.name} 도착 — 마음껏 부수세요`, 'info');
    $('#tTime').title = `시간대: ${TIMES[settings.time].name} (N)`;
  },
  cat: null,
  buildWeapons() {
    this.cat = null;
    const cats = $('#wcats'); cats.innerHTML = '';
    for (const c of CATEGORIES) {
      const b = document.createElement('button');
      b.className = 'wcat'; b.dataset.cat = c.id;
      b.innerHTML = `${c.name}<small>${WEAPONS.filter(w => w.cat === c.id).length}</small>`;
      b.onclick = () => this.showCat(c.id);
      cats.appendChild(b);
    }
    // 위력 슬라이더 (로그 스케일 1~100)
    const pw = $('#power');
    pw.value = powerToSlider(settings.power);
    pw.oninput();
  },
  showCat(cat) {
    this.cat = cat;
    for (const b of document.querySelectorAll('.wcat')) b.classList.toggle('on', b.dataset.cat === cat);
    const w = $('#weapons'); w.innerHTML = '';
    WEAPONS.filter(x => x.cat === cat).forEach((wp, i) => {
      const b = document.createElement('button');
      b.className = 'wbtn ' + wp.id; b.dataset.id = wp.id; b.title = `${wp.name} — ${wp.desc}`;
      const key = i < 9 ? String(i + 1) : i === 9 ? '0' : i === 19 ? '⇧0' : '⇧' + (i - 9);
      b.innerHTML = `<kbd>${key}</kbd>${weaponIcon(wp.id)}<span>${wp.name}</span>`;
      b.onclick = () => this.select(wp.id);
      w.appendChild(b);
    });
    if (game) for (const b of document.querySelectorAll('.wbtn')) b.classList.toggle('on', b.dataset.id === game.arsenal.current);
  },
  select(id) {
    if (!game) return;
    game.arsenal.holdEnd();
    game.arsenal.current = id;
    settings.weapon = id; store.set('settings', settings);
    const wp = WEAPONS.find(w => w.id === id);
    if (wp.cat !== this.cat) this.showCat(wp.cat);
    for (const b of document.querySelectorAll('.wbtn')) b.classList.toggle('on', b.dataset.id === id);
    $('#wdesc').textContent = descFor(wp, settings.power);
    // 옵션 칩
    const box = $('#wopts'); box.innerHTML = '';
    for (const o of wp.opts || []) {
      const b = document.createElement('button');
      b.className = 'wopt' + (settings.wopts[o.key] ? ' on' : '');
      b.textContent = o.label;
      b.onclick = () => {
        settings.wopts[o.key] = !settings.wopts[o.key];
        if (CFG_OPTS.includes(o.key)) settings.cfg[o.key] = settings.wopts[o.key];
        store.set('settings', settings);
        game.arsenal.opts[o.key] = settings.wopts[o.key];
        b.classList.toggle('on', settings.wopts[o.key]);
      };
      box.appendChild(b);
    }
    box.hidden = !(wp.opts && wp.opts.length);
  },
  cycleCat(d) {
    const i = CATEGORIES.findIndex(c => c.id === this.cat);
    const c = CATEGORIES[(i + d + CATEGORIES.length) % CATEGORIES.length];
    this.showCat(c.id);
    const first = WEAPONS.find(w => w.cat === c.id);
    if (first) this.select(first.id);
  },
  fired(id) {
    const b = document.querySelector(`.wbtn[data-id="${id}"]`);
    if (b) { b.classList.remove('fired'); void b.offsetWidth; b.classList.add('fired'); }
  },
  stats(s, fps) {
    const el = $('#score');
    el.textContent = formatScore(s.score);
    if (s.score > this._lastScore + 5000) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    this._lastScore = s.score;
    $('#destroyed').textContent = `${s.destroyed.toLocaleString()} / ${s.total.toLocaleString()}동 붕괴`;
    const pct = Math.min(100, s.pct * 100);
    $('#pct').textContent = pct < 10 ? pct.toFixed(1) + '%' : Math.round(pct) + '%';
    $('#pctBar').style.width = pct + '%';
    $('#perf').textContent = `${Math.round(fps)} FPS · 움직이는 조각 ${s.dynamic.toLocaleString()}`;
    const po = $('#perfOverlay');
    if (!po.hidden) {
      const a = PROF.avg, pk = PROF.peak, f = (k) => `${(a[k] || 0).toFixed(1).padStart(5)}  (최대 ${(pk[k] || 0).toFixed(0)})`;
      const info = game ? game.renderer.info.render : { calls: 0, triangles: 0 };
      po.textContent = `FPS        ${fps.toFixed(0)}\n렌더       ${f('render')} ms\n물리 전체  ${f('physics')} ms\n 스텝      ${f('step')} ms\n 조각화    ${f('fracture')} ms\n 폭발      ${f('explode')} ms\n무기       ${f('weapons')} ms\n연출       ${f('fx')} ms\n움직이는 조각 ${s.dynamic} / 상한 ${s.budget}\n흩어진 조각   ${s.loose}\n드로우콜     ${info.calls}` + (game && game.phys.mode === 'gpu' ? `\n물리 엔진    GPU (WebGPU)\n GPU 시간    ${(game.phys.gpu.gpuMs || 0).toFixed(1)} ms\n 조각 칸     ${game.phys.gpu.top - game.phys.gpu.free.length} / ${game.phys.gpu.N}` : `\n물리 엔진    CPU (Rapier)`);
    }
  },
  hover(b, x, y) {
    const tip = $('#tip');
    if (!b || !b.name || x === undefined) { tip.hidden = true; return; }
    tip.hidden = false;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
    const st = b.state === 'intact' ? '온전함' : b.destroyedFlag ? '붕괴' : `손상 ${Math.round(b.released / Math.max(1, b.total) * 100)}%`;
    tip.innerHTML = '<b></b><span class="tm"></span>';
    tip.querySelector('b').textContent = b.name;
    tip.querySelector('.tm').textContent = `높이 ${Math.round(b.height)}m · ${st}`;
  },
  toast(msg, kind) {
    if (!msg) return;
    const now = performance.now();
    if (kind !== 'info' && now - this._toastT < 350) return;
    this._toastT = now;
    const box = $('#toasts');
    while (box.children.length > 3) box.firstChild.remove();
    const d = document.createElement('div'); d.className = 'toast ' + (kind || ''); d.textContent = msg;
    box.appendChild(d);
    setTimeout(() => d.remove(), 2800);
  },
};

function initHud() {
  $('#back').onclick = toMenu;
  $('#power').oninput = () => {
    const v = sliderToPower(+$('#power').value);
    settings.power = v; store.set('settings', settings);
    $('#powerVal').textContent = '×' + (v >= 10 ? Math.round(v) : v.toFixed(1));
    $('#powerTag').textContent = v < 3 ? '약함' : v < 10 ? '보통' : v < 35 ? '강함' : v < 75 ? '매우 강함' : '세계 멸망';
    if (game) { const wp = WEAPONS.find(w => w.id === game.arsenal.current); if (wp) $('#wdesc').textContent = descFor(wp, v); }
    $('#powerTag').dataset.lv = v < 3 ? 0 : v < 10 ? 1 : v < 35 ? 2 : v < 75 ? 3 : 4;
    if (game) game.arsenal.power = v;
  };
  let slow = false;
  let fast = 1;
  const showFast = () => { $('#tFast').classList.toggle('on', fast > 1); $('#fastBadge').hidden = fast <= 1; $('#fastBadge').textContent = `▶▶ ×${fast}`; };
  const toggleSlow = () => { slow = !slow; if (slow) { fast = 1; showFast(); } game && game.setSlowMo(slow); $('#tSlow').classList.toggle('on', slow); $('#slowBadge').hidden = !slow; };
  // 빨리 감기: ×1 → ×2 → ×4 → ×1 (슬로모션과는 같이 못 켬)
  const cycleFast = () => {
    fast = fast === 1 ? 2 : fast === 2 ? 4 : 1;
    if (fast > 1 && slow) { slow = false; $('#tSlow').classList.remove('on'); $('#slowBadge').hidden = true; }
    if (game) { if (fast > 1) game.setTimeRate(fast); else game.setSlowMo(slow); }
    showFast();
  };
  $('#tFast').onclick = cycleFast;
  // 새 도시를 열면 슬로모션·빨리 감기 상태를 다시 적용
  document.addEventListener('we-newgame', () => { if (!game) return; if (fast > 1) game.setTimeRate(fast); else game.setSlowMo(slow); });
  $('#tSlow').onclick = toggleSlow;
  const cycleTime = () => {
    const keys = Object.keys(TIMES); settings.time = keys[(keys.indexOf(settings.time) + 1) % keys.length]; store.set('settings', settings);
    if (game) game.setTime(settings.time);
    hud.toast(`시간대: ${TIMES[settings.time].name}`, 'info');
    $('#tTime').title = `시간대: ${TIMES[settings.time].name} (N)`;
  };
  $('#tTime').onclick = cycleTime;
  const shot = async () => {
    if (!game) return;
    const url = game.screenshot();
    try { const p = await api.saveScreenshot(url); hud.toast(`스크린샷 저장: ${p}`, 'info'); } catch (e) { hud.toast('스크린샷 저장 실패', 'info'); }
  };
  $('#tShot').onclick = shot;
  let resetting = false;
  const reset = async () => {
    if (!game || !current) return;
    if (resetting) return; resetting = true;
    try {
      try { saveRecord(); } catch (e) { console.error(e); }
      // 정리 중 오류가 나도 새 도시는 불러오게 함
      try { game.dispose(); } catch (e) { console.error('정리 중 오류:', e); }
      game = null;
      $('#hud').hidden = true; $('#loading').hidden = false;
      await loadAndRun(current, true);
    } finally { resetting = false; }
  };
  $('#tReset').onclick = reset;
  const mute = () => { const m = audio.toggleMute(); $('#tMute').classList.toggle('on', m); $('#muteWave').style.display = m ? 'none' : ''; };
  $('#tMute').onclick = mute;
  const help = () => { $('#help').hidden = !$('#help').hidden; };
  $('#tHelp').onclick = help; $('#helpClose').onclick = help;
  // 설정 페이지
  const showSettings = (inGame) => openSettings({
    settings, inGame,
    save: () => store.set('settings', settings),
    apply: (key) => {
      if (key === 'volume') audio.setVolume(settings.volume);
      if (CFG_OPTS.includes(key)) settings.wopts[key] = settings.cfg[key];
      if (game) { game.setCfg(settings.cfg, key); if (CFG_OPTS.includes(key)) game.arsenal.opts[key] = settings.cfg[key]; }
    },
    extras: {
      cacheInfo: api.desktop ? () => api.cacheInfo() : null,
      clearCache: api.desktop ? () => api.clearCache() : null,
      resetRecords: () => store.set('records', {}),
    },
  });
  $('#tSettings').onclick = () => showSettings(true);
  $('#tControl').onclick = () => openControlRoom();
  $('#tVehicle').onclick = () => openVehicles();
  $('#menuSettings').onclick = () => showSettings(false);
  $('#retry').onclick = () => start(current);
  $('#toDemo').onclick = () => start({ demo: true, name: '데모 시티', sub: '오프라인 · 절차 생성' });
  $('#toMenu').onclick = toMenu;

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' && e.target.type === 'text') return;
    if (e.code === 'F11') { e.preventDefault(); api.toggleFullscreen(); return; }
    { const st = document.getElementById('settings'); if (st && !st.hidden) { if (e.code === 'Escape') document.getElementById('setClose')?.click(); return; } }
    if (!game || $('#hud').hidden) return;
    if (game.planetFX) { if (e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); game.endPlanet(); } return; }
    if (game.pilot) { if (e.code === 'Tab') e.preventDefault(); if (e.code === 'Escape') { e.preventDefault(); if (game.pilot.abort) game.pilot.abort(); else game.endPilot(true); } return; }
    if (game.arsenal._qte && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); game.arsenal._qte(); return; }
    if (e.code === 'Escape' && game.arsenal.cancelEnding()) { e.preventDefault(); return; }
    if (game.cine && game.cine.active) { if (e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); game.cine.skip(); } return; }
    if (/^Digit[0-9]$/.test(e.code)) {
      // 1~9, 0 = 10번째, Shift+1~9 = 11번째부터
      // 21번째부터는 Alt+1~9
      const d = +e.code.slice(5), idx = e.altKey ? (d === 0 ? 29 : 19 + d) : e.shiftKey ? (d === 0 ? 19 : 9 + d) : d === 0 ? 9 : d - 1;
      if (e.altKey) e.preventDefault();
      const list = WEAPONS.filter(w => w.cat === hud.cat), wp = list[idx];
      if (wp) hud.select(wp.id);
      return;
    }
    if (e.code === 'Tab') { e.preventDefault(); hud.cycleCat(e.shiftKey ? -1 : 1); return; }
    const K = settings.cfg;
    const acts = { [K.k_slow]: toggleSlow, [K.k_fast]: cycleFast, [K.k_time]: cycleTime, [K.k_shot]: shot, [K.k_mute]: mute, [K.k_help]: help, [K.k_ui]: () => $('#hud').classList.toggle('hide-ui'), [K.k_settings]: () => showSettings(true), [K.k_control]: () => openControlRoom(), [K.k_vehicle]: () => openVehicles(),
      [K.k_powDown]: () => { const p = $('#power'); p.value = Math.max(0, +p.value - 0.05); p.oninput(); }, [K.k_powUp]: () => { const p = $('#power'); p.value = Math.min(1, +p.value + 0.05); p.oninput(); } };
    delete acts[''];
    if (acts[e.code]) { e.preventDefault(); acts[e.code](); return; }
    switch (e.code) {
      case 'F3': e.preventDefault(); $('#perfOverlay').hidden = !$('#perfOverlay').hidden; break;
      case 'Escape': if (!$('#help').hidden) help(); else toMenu(); break;
      case 'KeyR': if (e.ctrlKey) { e.preventDefault(); reset(); } break;
    }
  });
  window.addEventListener('beforeunload', saveRecord);
}

// ---------- 탈것 ----------
function openVehicles() {
  if (!game || game.pilot || game.planetFX || document.getElementById('control')?.hidden === false) return;
  if (game.cine.active) game.cine.skip();
  openVehiclePicker((id, o) => { if (game && !game.pilot) { game.audio.resume(); startVehicle(game.arsenal, id, o); } });
}

// ---------- 발사 관제실 ----------
function openControlRoom() {
  if (!game || game.pilot || game.planetFX || document.getElementById('control')?.hidden === false) return;
  if (game.cine.active) game.cine.skip();
  openControl(game, { power: settings.power, onLaunch: launchFromControl });
}
function launchFromControl(wep, tgt) {
  if (!game) return;
  hud.select(wep);
  const g = game;
  let t0 = performance.now(), shown = -1;
  const step = () => {
    if (game !== g) { hideCountdown(); return; }
    const el = document.getElementById('endCount');
    const left = 3 - (performance.now() - t0) / 1000;
    if (shown >= 0 && el && el.hidden) { hud.toast('발사 취소', 'info'); return; }
    if (left > 0) { const n = Math.ceil(left); if (n !== shown) { shown = n; showCountdown('발사', n); g.audio.alarm(0.35); } requestAnimationFrame(step); return; }
    hideCountdown();
    const top = g.grid.sample(tgt.x, tgt.z) + 3000;
    const hit = g.D.raycast({ x: tgt.x, y: top, z: tgt.z }, { x: 0, y: -1, z: 0 }, 9000) || { point: { x: tgt.x, y: g.grid.sample(tgt.x, tgt.z), z: tgt.z }, info: null };
    g.aim = hit.point;
    g.audio.launch();
    g.arsenal.fire(hit, g.camera.position);
    hud.fired(wep);
  };
  requestAnimationFrame(step);
}

function toMenu() {
  saveRecord();
  if (game) { try { game.dispose(); } catch (e) { console.error('정리 중 오류:', e); } game = null; }
  $('#stage').innerHTML = '';
  $('#hud').hidden = true; $('#loading').hidden = true; $('#menu').hidden = false;
  renderRecent();
}

initMenu();
initHud();
window.__start = start;
