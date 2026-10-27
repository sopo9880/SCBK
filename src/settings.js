// 설정 페이지: 항목 정의(스키마) + 화면 + 저장
// 값은 settings.cfg 에 저장되고, 게임 중이면 game.applyCfg 로 바로 반영된다.

export const TABS = [
  { id: 'gfx', name: '그래픽' },
  { id: 'post', name: '빛·색감' },
  { id: 'phys', name: '물리' },
  { id: 'cam', name: '카메라' },
  { id: 'audio', name: '소리' },
  { id: 'safety', name: '화면 안전' },
  { id: 'keys', name: '조작 키' },
  { id: 'data', name: '데이터' },
];

const onoff = (v) => (v ? '켜짐' : '꺼짐');
const pct = (v) => Math.round(v * 100) + '%';
const mul = (v) => '×' + (+v).toFixed(2).replace(/\.?0+$/, '');

// type: range | select | toggle | key
// restart: 'city' = 도시를 다시 불러와야 반영, 'live' = 바로 반영(기본)
export const SCHEMA = [
  // ---- 그래픽 ----
  { tab: 'gfx', key: 'renderScale', label: '렌더 해상도', type: 'range', min: 0.5, max: 2, step: 0.05, def: 1, fmt: pct, desc: '낮추면 빨라지고 흐려져요. 고해상도 모니터에서 100% 이상은 매우 무거워요.' },
  { tab: 'gfx', key: 'fpsCap', label: '프레임 제한', type: 'select', def: 0, options: [[0, '제한 없음'], [30, '30'], [60, '60'], [120, '120'], [144, '144']] },
  { tab: 'gfx', key: 'shadows', label: '그림자 품질', type: 'select', def: -1, options: [[-1, '품질 설정 따름'], [0, '끄기'], [1024, '낮음 (1024)'], [2048, '보통 (2048)'], [4096, '높음 (4096)'], [8192, '최고 (8192)']] },
  { tab: 'gfx', key: 'shadowDist', label: '그림자 거리', type: 'range', min: 0.5, max: 3, step: 0.1, def: 1, fmt: mul, desc: '멀리까지 그림자를 그리면 가까운 그림자가 흐려져요.' },
  { tab: 'gfx', key: 'ao', label: '앰비언트 오클루전', type: 'select', def: -1, options: [[-1, '품질 설정 따름'], [0, '끄기'], [1, '켜기']], desc: '건물 틈과 모서리를 어둡게 해 입체감을 더해요.' },
  { tab: 'gfx', key: 'aoStrength', label: '오클루전 세기', type: 'range', min: 0, max: 1.5, step: 0.05, def: 0.85, fmt: pct },
  { tab: 'gfx', key: 'aa', label: '계단 현상 제거', type: 'select', def: 'msaa', options: [['off', '끄기'], ['fxaa', 'FXAA (가벼움)'], ['smaa', 'SMAA (선명)'], ['msaa', 'MSAA 4× (정확)']] },
  { tab: 'gfx', key: 'anisotropy', label: '지면 텍스처 선명도', type: 'select', def: -1, options: [[-1, '품질 설정 따름'], [1, '끄기'], [4, '4×'], [8, '8×'], [16, '16×']] },
  { tab: 'gfx', key: 'clouds', label: '하늘 구름', type: 'toggle', def: true },
  { tab: 'gfx', key: 'fogMul', label: '안개 짙기', type: 'range', min: 0, max: 3, step: 0.05, def: 1, fmt: mul },
  { tab: 'gfx', key: 'treeMul', label: '나무 밀도', type: 'range', min: 0, max: 2, step: 0.1, def: 1, fmt: mul, restart: 'city' },
  { tab: 'gfx', key: 'particleMul', label: '파티클 양', type: 'range', min: 0.25, max: 3, step: 0.05, def: 1, fmt: mul, restart: 'city', desc: '연기·불꽃·먼지 입자의 최대 개수' },
  { tab: 'gfx', key: 'fxMul', label: '효과 밀도', type: 'range', min: 0.25, max: 2, step: 0.05, def: 1, fmt: mul, desc: '폭발 한 번에 뿜는 입자 수' },
  // ---- 빛·색감 ----
  { tab: 'post', key: 'ssr', label: '화면 공간 반사 (SSR)', type: 'toggle', def: false, desc: '유리창과 물에 주변 건물·폭발이 실제로 비쳐요. 무거운 효과예요.' },
  { tab: 'post', key: 'ssrStrength', label: 'SSR 세기', type: 'range', min: 0, max: 1, step: 0.05, def: 0.5, fmt: pct },
  { tab: 'post', key: 'ssrDist', label: 'SSR 거리', type: 'range', min: 40, max: 800, step: 10, def: 260, fmt: (v) => v + ' m' },
  { tab: 'post', key: 'glass', label: '유리창 반사', type: 'range', min: 0, max: 2, step: 0.05, def: 1, fmt: mul, desc: '창문이 하늘과 해를 비추는 정도' },
  { tab: 'post', key: 'water', label: '물 반사', type: 'range', min: 0, max: 1, step: 0.05, def: 0.7, fmt: pct },
  { tab: 'post', key: 'bloom', label: '빛번짐', type: 'select', def: -1, options: [[-1, '품질 설정 따름'], [0, '끄기'], [1, '켜기']] },
  { tab: 'post', key: 'bloomStrength', label: '빛번짐 세기', type: 'range', min: 0, max: 2, step: 0.05, def: 0.55, fmt: pct },
  { tab: 'post', key: 'bloomThreshold', label: '빛번짐 시작 밝기', type: 'range', min: 0.3, max: 3, step: 0.05, def: 1.35, fmt: (v) => (+v).toFixed(2) },
  { tab: 'post', key: 'bloomRadius', label: '빛번짐 퍼짐', type: 'range', min: 0, max: 1, step: 0.05, def: 0.45, fmt: pct },
  { tab: 'post', key: 'exposure', label: '노출', type: 'range', min: 0.4, max: 2.5, step: 0.05, def: 1, fmt: mul },
  { tab: 'post', key: 'toneMap', label: '톤 매핑', type: 'select', def: 'aces', options: [['aces', 'ACES (영화풍)'], ['agx', 'AgX (자연스러움)'], ['neutral', '뉴트럴'], ['reinhard', '라인하르트']] },
  { tab: 'post', key: 'saturation', label: '채도', type: 'range', min: -1, max: 1, step: 0.05, def: 0, fmt: (v) => (v > 0 ? '+' : '') + Math.round(v * 100) },
  { tab: 'post', key: 'contrast', label: '대비', type: 'range', min: -0.5, max: 0.5, step: 0.02, def: 0, fmt: (v) => (v > 0 ? '+' : '') + Math.round(v * 100) },
  { tab: 'post', key: 'brightness', label: '밝기', type: 'range', min: -0.3, max: 0.3, step: 0.01, def: 0, fmt: (v) => (v > 0 ? '+' : '') + Math.round(v * 100) },
  { tab: 'post', key: 'vignette', label: '비네트', type: 'range', min: 0, max: 1, step: 0.05, def: 0, fmt: pct, desc: '화면 가장자리를 어둡게' },
  { tab: 'post', key: 'dof', label: '연출 중 초점 흐림', type: 'toggle', def: true, desc: '카메라 연출 때 배경을 영화처럼 흐리게' },
  // ---- 물리 ----
  { tab: 'phys', key: 'physWorker', label: '물리 별도 스레드', type: 'toggle', def: true, restart: 'city', desc: '물리 계산을 화면 그리기와 다른 스레드에서 해요. 끄면 큰 폭발 뒤 화면이 멈칫해요.' },
  { tab: 'phys', key: 'maxDynamic', label: '정식 물리 조각 수', type: 'range', min: 500, max: 10000, step: 100, def: -1, fmt: (v) => v < 0 ? '품질 설정 따름' : v.toLocaleString() + '개', desc: '서로 부딪히고 쌓이는 큰 조각의 최대 개수. CPU 성능에 맞춰 자동으로 줄어들 수 있어요.' },
  { tab: 'phys', key: 'maxLight', label: '가벼운 파편 수', type: 'range', min: 2000, max: 80000, step: 1000, def: -1, fmt: (v) => v < 0 ? '품질 설정 따름' : v.toLocaleString() + '개', desc: '땅과 건물에만 부딪히는 작은 파편의 최대 개수' },
  { tab: 'phys', key: 'maxLoose', label: '쌓아 둘 잔해 수', type: 'range', min: 4000, max: 100000, step: 1000, def: -1, fmt: (v) => v < 0 ? '품질 설정 따름' : v.toLocaleString() + '개', desc: '넘치면 오래된 작은 잔해부터 정리해요.' },
  { tab: 'phys', key: 'lightVol', label: '가벼운 파편 기준 크기', type: 'range', min: 0, max: 200, step: 5, def: 30, fmt: (v) => v + ' m³', desc: '이보다 작은 조각은 가벼운 파편으로 계산해요. 0이면 모두 정식 물리.' },
  { tab: 'phys', key: 'chunkDetail', label: '조각 세밀도', type: 'range', min: 0.4, max: 2.5, step: 0.05, def: 1, fmt: mul, desc: '건물 하나를 나누는 조각 수' },
  { tab: 'phys', key: 'solverIter', label: '물리 정확도', type: 'range', min: 1, max: 8, step: 1, def: 2, fmt: (v) => v + '회', desc: '높을수록 쌓인 잔해가 덜 흔들리고 느려져요.' },
  // ---- 카메라 ----
  { tab: 'cam', key: 'fov', label: '시야각 (FOV)', type: 'range', min: 35, max: 95, step: 1, def: 50, fmt: (v) => v + '°' },
  { tab: 'cam', key: 'rotSens', label: '회전 감도', type: 'range', min: 0.2, max: 3, step: 0.05, def: 1, fmt: mul },
  { tab: 'cam', key: 'zoomSens', label: '확대 감도', type: 'range', min: 0.2, max: 3, step: 0.05, def: 1, fmt: mul },
  { tab: 'cam', key: 'moveSpeed', label: '키보드 이동 속도', type: 'range', min: 0.2, max: 3, step: 0.05, def: 1, fmt: mul },
  { tab: 'cam', key: 'cinematic', label: '카메라 연출', type: 'toggle', def: true, desc: '큰 무기의 발사·착탄 장면 연출' },
  { tab: 'cam', key: 'autoPull', label: '거대 폭발 때 자동으로 물러나기', type: 'toggle', def: true },
  { tab: 'cam', key: 'worldEnd', label: '세계 멸망 결말', type: 'toggle', def: true, desc: '끄면 ×100 이어도 무기 자체의 연출과 파괴만 나와요.' },
  { tab: 'cam', key: 'endTrigger', label: '세계 멸망 시작 조건', type: 'select', def: 'power', options: [['power', '위력 ×75 이상으로 쏠 때'], ['destroy', '파괴율이 기준을 넘을 때'], ['both', '둘 중 먼저 되는 쪽']] },
  { tab: 'cam', key: 'endPct', label: '세계 멸망 파괴율 기준', type: 'range', min: 30, max: 100, step: 5, def: 90, fmt: (v) => v + '%', desc: '시작 조건이 파괴율일 때만 쓰여요.' },
  { tab: 'cam', key: 'planet', label: '행성 시점 마무리', type: 'toggle', def: true, desc: '세계 멸망 결말 끝에 카메라가 우주까지 빠져 행성을 보여줘요.' },
  // ---- 소리 ----
  { tab: 'audio', key: 'volume', label: '전체 볼륨', type: 'range', min: 0, max: 1, step: 0.01, def: 0.7, fmt: pct, root: true },
  { tab: 'audio', key: 'soundDelay', label: '거리만큼 늦게 오는 소리', type: 'toggle', def: true, desc: '멀리서 터지면 음속(343m/s)만큼 늦게 들려요.' },
  // ---- 화면 안전 ----
  { tab: 'safety', key: 'flash', label: '섬광 세기', type: 'range', min: 0, max: 1, step: 0.05, def: 1, fmt: pct, desc: '빛에 민감하다면 낮춰 주세요. 핵·번개의 하얀 섬광이 약해져요.' },
  { tab: 'safety', key: 'shake', label: '화면 흔들림', type: 'range', min: 0, max: 2, step: 0.05, def: 1, fmt: pct },
  { tab: 'safety', key: 'strobe', label: '번개 깜빡임', type: 'toggle', def: true, desc: '끄면 번개가 깜빡이지 않고 한 번만 보여요.' },
  // ---- 조작 키 ----
  { tab: 'keys', key: 'k_slow', label: '슬로모션', type: 'key', def: 'KeyT' },
  { tab: 'keys', key: 'k_time', label: '시간대 바꾸기', type: 'key', def: 'KeyN' },
  { tab: 'keys', key: 'k_shot', label: '스크린샷', type: 'key', def: 'KeyP' },
  { tab: 'keys', key: 'k_mute', label: '소리 끄기', type: 'key', def: 'KeyM' },
  { tab: 'keys', key: 'k_help', label: '도움말', type: 'key', def: 'KeyH' },
  { tab: 'keys', key: 'k_ui', label: 'UI 숨기기', type: 'key', def: 'KeyU' },
  { tab: 'keys', key: 'k_settings', label: '설정 열기', type: 'key', def: 'KeyO' },
  { tab: 'keys', key: 'k_control', label: '발사 관제실', type: 'key', def: 'KeyL' },
  { tab: 'keys', key: 'k_powDown', label: '위력 낮추기', type: 'key', def: 'BracketLeft' },
  { tab: 'keys', key: 'k_powUp', label: '위력 높이기', type: 'key', def: 'BracketRight' },
  { tab: 'keys', key: 'k_fwd', label: '앞으로', type: 'key', def: 'KeyW' },
  { tab: 'keys', key: 'k_back', label: '뒤로', type: 'key', def: 'KeyS' },
  { tab: 'keys', key: 'k_left', label: '왼쪽', type: 'key', def: 'KeyA' },
  { tab: 'keys', key: 'k_right', label: '오른쪽', type: 'key', def: 'KeyD' },
  { tab: 'keys', key: 'k_rotL', label: '왼쪽으로 돌기', type: 'key', def: 'KeyQ' },
  { tab: 'keys', key: 'k_rotR', label: '오른쪽으로 돌기', type: 'key', def: 'KeyE' },
  { tab: 'keys', key: 'k_zoomIn', label: '확대', type: 'key', def: 'KeyR' },
  { tab: 'keys', key: 'k_zoomOut', label: '축소', type: 'key', def: 'KeyF' },
];

export function defaultCfg() {
  const c = {};
  for (const s of SCHEMA) if (!s.root) c[s.key] = s.def;
  return c;
}

export function keyName(code) {
  if (!code) return '없음';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map = { BracketLeft: '[', BracketRight: ']', Space: 'Space', ShiftLeft: '왼쪽 Shift', ShiftRight: '오른쪽 Shift', ControlLeft: 'Ctrl', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", Minus: '-', Equal: '=', Backquote: '`' };
  return map[code] || code;
}

/**
 * 설정 페이지 열기
 * opts: { settings, save(), apply(key), inGame, extras: { cacheInfo, clearCache, resetRecords } }
 */
export function openSettings(opts) {
  const { settings } = opts;
  settings.cfg = Object.assign(defaultCfg(), settings.cfg || {});
  const cfg = settings.cfg;
  let root = document.getElementById('settings');
  if (!root) { root = document.createElement('section'); root.id = 'settings'; root.className = 'settings'; document.body.appendChild(root); }
  root.hidden = false;
  let tab = opts.tab || root.dataset.tab || 'gfx';
  let restartNote = false;
  const render = () => {
    root.dataset.tab = tab;
    root.innerHTML = `
      <div class="set-panel" role="dialog" aria-label="설정">
        <header class="set-head"><h2>설정</h2>
          <span class="set-note" ${restartNote ? '' : 'hidden'}>일부 항목은 도시를 다시 불러오면 적용돼요</span>
          <button class="btn ghost" id="setReset">이 탭 기본값</button>
          <button class="btn" id="setClose">닫기</button></header>
        <div class="set-body">
          <nav class="set-tabs">${TABS.map(t => `<button data-tab="${t.id}" class="${t.id === tab ? 'on' : ''}">${t.name}</button>`).join('')}</nav>
          <div class="set-list" id="setList"></div>
        </div>
      </div>`;
    const list = root.querySelector('#setList');
    if (tab === 'data') renderData(list, opts);
    for (const s of SCHEMA.filter(x => x.tab === tab)) list.appendChild(row(s));
    root.querySelectorAll('.set-tabs button').forEach(b => { b.onclick = () => { tab = b.dataset.tab; render(); }; });
    root.querySelector('#setClose').onclick = close;
    root.querySelector('#setReset').onclick = () => {
      for (const s of SCHEMA.filter(x => x.tab === tab)) { if (s.root) settings[s.key] = s.def; else cfg[s.key] = s.def; opts.apply && opts.apply(s.key); }
      opts.save(); render();
    };
  };
  const get = (s) => (s.root ? settings[s.key] : cfg[s.key]);
  const set = (s, v) => {
    if (s.root) settings[s.key] = v; else cfg[s.key] = v;
    opts.save();
    if (s.restart === 'city' && opts.inGame) { restartNote = true; const n = root.querySelector('.set-note'); if (n) n.hidden = false; }
    opts.apply && opts.apply(s.key);
  };
  const row = (s) => {
    const el = document.createElement('div');
    el.className = 'set-row';
    const v = get(s);
    const badge = s.restart === 'city' ? '<span class="set-badge">다시 불러오면 적용</span>' : '';
    let ctl = '';
    if (s.type === 'range') {
      const val = v < 0 && s.def < 0 ? s.min : v;
      ctl = `<input type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${val}"><output>${s.fmt ? s.fmt(v) : v}</output>${s.def < 0 ? '<button class="link set-auto">자동</button>' : ''}`;
    } else if (s.type === 'select') {
      ctl = `<select>${s.options.map(([k, n]) => `<option value="${k}" ${String(k) === String(v) ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
    } else if (s.type === 'toggle') {
      ctl = `<button class="set-toggle ${v ? 'on' : ''}" aria-pressed="${!!v}"><i></i><span>${onoff(v)}</span></button>`;
    } else if (s.type === 'key') {
      ctl = `<button class="set-key">${keyName(v)}</button>`;
    }
    el.innerHTML = `<div class="set-lbl"><b>${s.label}</b>${badge}${s.desc ? `<small>${s.desc}</small>` : ''}</div><div class="set-ctl">${ctl}</div>`;
    if (s.type === 'range') {
      const inp = el.querySelector('input'), out = el.querySelector('output');
      inp.oninput = () => { const x = +inp.value; out.textContent = s.fmt ? s.fmt(x) : x; set(s, x); };
      const auto = el.querySelector('.set-auto');
      if (auto) auto.onclick = () => { set(s, s.def); out.textContent = s.fmt(s.def); };
    } else if (s.type === 'select') {
      const sel = el.querySelector('select');
      sel.onchange = () => { const raw = sel.value; set(s, typeof s.def === 'number' ? +raw : raw); };
    } else if (s.type === 'toggle') {
      const b = el.querySelector('button');
      b.onclick = () => { const x = !get(s); set(s, x); b.classList.toggle('on', x); b.setAttribute('aria-pressed', x); b.querySelector('span').textContent = onoff(x); };
    } else if (s.type === 'key') {
      const b = el.querySelector('button');
      b.onclick = () => {
        b.textContent = '키를 누르세요…'; b.classList.add('wait');
        const h = (e) => {
          e.preventDefault(); e.stopPropagation();
          window.removeEventListener('keydown', h, true);
          if (e.code !== 'Escape') {
            // 같은 키를 쓰던 다른 동작은 비움
            for (const o of SCHEMA) if (o.type === 'key' && o !== s && cfg[o.key] === e.code) cfg[o.key] = '';
            set(s, e.code);
          }
          render();
        };
        window.addEventListener('keydown', h, true);
      };
    }
    return el;
  };
  const close = () => { root.hidden = true; opts.onClose && opts.onClose(); };
  render();
  return { close };
}

function renderData(list, opts) {
  const ex = opts.extras || {};
  const el = document.createElement('div');
  el.className = 'set-data';
  el.innerHTML = `
    <div class="set-row"><div class="set-lbl"><b>지도·지형 캐시</b><small id="cacheTxt">확인 중…</small></div><div class="set-ctl"><button class="btn ghost" id="cacheClr">캐시 지우기</button></div></div>
    <div class="set-row"><div class="set-lbl"><b>장소별 최고 기록</b><small>기록을 모두 지워요.</small></div><div class="set-ctl"><button class="btn ghost" id="recClr">기록 지우기</button></div></div>
    <div class="set-row"><div class="set-lbl"><b>모든 설정 초기화</b><small>그래픽·물리·키 설정을 처음 상태로</small></div><div class="set-ctl"><button class="btn ghost" id="allReset">초기화</button></div></div>`;
  list.appendChild(el);
  const txt = el.querySelector('#cacheTxt');
  if (ex.cacheInfo) ex.cacheInfo().then(i => { txt.textContent = i ? `${i.files.toLocaleString()}개 · ${(i.bytes / 1048576).toFixed(1)} MB` : '데스크톱 앱에서만 쓸 수 있어요'; }).catch(() => { txt.textContent = '확인할 수 없어요'; });
  else txt.textContent = '데스크톱 앱에서만 쓸 수 있어요';
  el.querySelector('#cacheClr').onclick = async () => { if (ex.clearCache) { await ex.clearCache(); txt.textContent = '지웠어요'; } };
  el.querySelector('#recClr').onclick = () => { ex.resetRecords && ex.resetRecords(); el.querySelector('#recClr').textContent = '지웠어요'; };
  el.querySelector('#allReset').onclick = () => {
    opts.settings.cfg = defaultCfg();
    opts.save();
    for (const s of SCHEMA) opts.apply && opts.apply(s.key);
    el.querySelector('#allReset').textContent = '초기화했어요';
  };
}
