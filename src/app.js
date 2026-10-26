// 앱 진입점: 메뉴 → 로딩 → 게임
import RAPIER from '@dimforge/rapier3d-compat';
import { makeProjection, bboxFor, overpassQuery, parseOSM } from './geo.js';
import { buildTerrainFromTiles, buildProceduralTerrain, buildFlatTerrain, carveWater } from './terrain.js';
import { generateDemoCity, demoTerrainFn } from './demo.js';
import { Game, QUALITY, TIMES } from './game.js';
import { WEAPONS, weaponIcon } from './weapons.js';
import { Audio } from './audio.js';

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

// ---------- 저장 ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('we.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('we.' + k, JSON.stringify(v)); } catch (e) { /* 무시 */ } },
};

const PRESETS = [
  { name: '부산대학교', lat: 35.2335, lon: 129.0805, sub: '부산 금정구' },
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

const settings = Object.assign({ radius: 600, quality: 'high', time: 'noon', volume: 0.7 }, store.get('settings', {}));
const audio = new Audio(); audio.setVolume(settings.volume);
let game = null, current = null, rapierReady = null, cachedData = null;

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

  const r = $('#radius'); r.value = settings.radius;
  const showR = () => {
    const v = +r.value; $('#radiusVal').textContent = v >= 1000 ? (v / 1000).toFixed(1) + ' km' : v + ' m';
    $('#radiusHint').textContent = v <= 500 ? '가볍고 빠름 · 캠퍼스 하나 정도' : v <= 900 ? '균형 · 동네 전체' : '도심 전체 · 사양 높은 PC 권장';
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

function placeKey(p) { return p.demo ? 'demo' : `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`; }

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
  recs[k] = { place: { name: current.name, sub: current.sub, lat: current.lat, lon: current.lon, demo: current.demo }, best: Math.max(prev ? prev.best : 0, s.score), when: Date.now() };
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
  if (game) { game.dispose(); game = null; }
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
  const radius = settings.radius;
  let i = 0;
  try {
    setStep(i, 'run');
    if (!rapierReady) rapierReady = RAPIER.init();
    await rapierReady;
    setStep(i++, 'done');

    let data, grid, proj;
    if (reuse && cachedData) {
      ({ data, grid, proj } = cachedData);
      setStep(i++, 'done', '캐시'); setStep(i++, 'done', '캐시');
      // 데이터는 재사용하되 지형/건물 상태는 새로
      grid = cachedData.makeGrid();
      data = cachedData.makeData();
    } else if (place.demo) {
      setStep(i, 'run');
      const demo = generateDemoCity(radius);
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
      const json = await api.overpass(overpassQuery(bboxFor(place.lat, place.lon, radius * 1.08)), placeKey(place) + ':' + radius);
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
    game = new Game({ canvas, RAPIER, grid, data, radius, place, quality: settings.quality, time: settings.time, audio, hud });
    setStep(i++, 'done', `건물 ${data.buildings.length.toLocaleString()}동`);
    setStep(i, 'run'); await tick();
    setStep(i++, 'done');
    hud.enter(place, data);
    $('#loading').hidden = true; $('#hud').hidden = false;
    window.__game = game;
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
    $('#placeSub').textContent = `건물 ${data.buildings.length.toLocaleString()}동 · 반경 ${settings.radius >= 1000 ? (settings.radius / 1000).toFixed(1) + 'km' : settings.radius + 'm'} · ${QUALITY[settings.quality].name}`;
    const rec = store.get('records', {})[placeKey(place)];
    $('#best').textContent = rec ? `이 장소 최고 ${formatScore(rec.best)}` : '';
    this.buildWeapons();
    this.select(game.arsenal.current);
    this.toast(`${place.name} 도착 — 마음껏 부수세요`, 'info');
    $('#tTime').title = `시간대: ${TIMES[settings.time].name} (N)`;
  },
  buildWeapons() {
    const w = $('#weapons'); w.innerHTML = '';
    for (const wp of WEAPONS) {
      const b = document.createElement('button');
      b.className = 'wbtn ' + wp.id; b.dataset.id = wp.id; b.title = `${wp.name} (${wp.key}) — ${wp.desc}`;
      b.innerHTML = `<kbd>${wp.key}</kbd>${weaponIcon(wp.id)}<span>${wp.name}</span>`;
      b.onclick = () => this.select(wp.id);
      w.appendChild(b);
    }
  },
  select(id) {
    if (!game) return;
    game.arsenal.holdEnd();
    game.arsenal.current = id;
    for (const b of document.querySelectorAll('.wbtn')) b.classList.toggle('on', b.dataset.id === id);
    const wp = WEAPONS.find(w => w.id === id);
    $('#wdesc').textContent = wp.desc;
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
  $('#power').oninput = (e) => { const v = +e.target.value; $('#powerVal').textContent = '×' + v.toFixed(1); if (game) game.arsenal.power = v; };
  let slow = false;
  const toggleSlow = () => { slow = !slow; game && game.setSlowMo(slow); $('#tSlow').classList.toggle('on', slow); $('#slowBadge').hidden = !slow; };
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
  const reset = async () => {
    if (!game || !current) return;
    saveRecord();
    game.dispose(); game = null;
    $('#hud').hidden = true; $('#loading').hidden = false;
    await loadAndRun(current, true);
  };
  $('#tReset').onclick = reset;
  const mute = () => { const m = audio.toggleMute(); $('#tMute').classList.toggle('on', m); $('#muteWave').style.display = m ? 'none' : ''; };
  $('#tMute').onclick = mute;
  const help = () => { $('#help').hidden = !$('#help').hidden; };
  $('#tHelp').onclick = help; $('#helpClose').onclick = help;
  $('#retry').onclick = () => start(current);
  $('#toDemo').onclick = () => start({ demo: true, name: '데모 시티', sub: '오프라인 · 절차 생성' });
  $('#toMenu').onclick = toMenu;

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' && e.target.type === 'text') return;
    if (e.code === 'F11') { e.preventDefault(); api.toggleFullscreen(); return; }
    if (!game || $('#hud').hidden) return;
    const wp = WEAPONS.find(w => e.key === w.key);
    if (wp) { hud.select(wp.id); return; }
    switch (e.code) {
      case 'KeyT': toggleSlow(); break;
      case 'KeyN': cycleTime(); break;
      case 'KeyP': shot(); break;
      case 'KeyM': mute(); break;
      case 'KeyH': help(); break;
      case 'KeyU': $('#hud').classList.toggle('hide-ui'); break;
      case 'Escape': if (!$('#help').hidden) help(); else toMenu(); break;
      case 'BracketLeft': case 'BracketRight': {
        const p = $('#power'); p.value = Math.max(0.5, Math.min(3, +p.value + (e.code === 'BracketRight' ? 0.1 : -0.1))); p.oninput({ target: p }); break;
      }
      case 'KeyR': if (e.ctrlKey) { e.preventDefault(); reset(); } break;
    }
  });
  window.addEventListener('beforeunload', saveRecord);
}

function toMenu() {
  saveRecord();
  if (game) { game.dispose(); game = null; }
  $('#stage').innerHTML = '';
  $('#hud').hidden = true; $('#loading').hidden = true; $('#menu').hidden = false;
  renderRecent();
}

initMenu();
initHud();
window.__start = start;
