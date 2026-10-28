// Electron 메인 프로세스: 창, 네트워크(지도/지형/검색), 디스크 캐시, 스크린샷
const { app, BrowserWindow, ipcMain, net, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('force_high_performance_gpu');

const UA = `WreckEarth/${app.getVersion()} (offline desktop game; Electron)`;
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

let win = null;
let cacheDir = null;

function key(s) { return crypto.createHash('sha1').update(s).digest('hex'); }
function cachePath(kind, k, ext) { const d = path.join(cacheDir, kind); fs.mkdirSync(d, { recursive: true }); return path.join(d, k + ext); }
function readCache(file, ttlMs) {
  try {
    const st = fs.statSync(file);
    if (ttlMs && Date.now() - st.mtimeMs > ttlMs) return null;
    return fs.readFileSync(file);
  } catch (e) { return null; }
}
function writeCache(file, data) { try { fs.writeFileSync(file, data); } catch (e) { /* 무시 */ } }

async function fetchWithTimeout(url, opts = {}, ms = 120000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await net.fetch(url, { ...opts, signal: ctrl.signal, headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
    return r;
  } finally { clearTimeout(t); }
}

// ---- IPC ----
ipcMain.handle('overpass', async (_e, query) => {
  const file = cachePath('osm', key(query), '.json');
  const hit = readCache(file, 30 * 24 * 3600 * 1000);
  if (hit) return hit.toString('utf8');
  let last = null, netFails = 0;
  for (const url of OVERPASS) {
    try {
      const r = await fetchWithTimeout(url, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      }, 150000);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = await r.text();
      if (!text.trim().startsWith('{')) throw new Error('Overpass 응답 형식 오류');
      const j = JSON.parse(text);
      if (j.remark && /runtime error|timed out|out of memory/i.test(j.remark) && !(j.elements || []).length) throw new Error(j.remark);
      writeCache(file, text);
      return text;
    } catch (e) {
      last = e;
      const m = String(e && e.message || e);
      // 인터넷 자체가 안 되면 다른 서버를 기다릴 필요 없음
      if (/ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_NETWORK_CHANGED|ERR_PROXY|ERR_TUNNEL/i.test(m) && ++netFails >= 2) break;
      if (/aborted|AbortError/i.test(m)) last = new Error('지도 서버 응답 시간 초과 (범위를 줄여 보세요)');
    }
  }
  throw new Error(String(last && last.message || last));
});

ipcMain.handle('tile', async (_e, z, x, y) => {
  const file = cachePath('terrain', `${z}_${x}_${y}`, '.png');
  const hit = readCache(file, 0);
  if (hit) return hit;
  const r = await fetchWithTimeout(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`, {}, 30000);
  if (!r.ok) throw new Error(`tile HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  writeCache(file, buf);
  return buf;
});

let lastGeo = 0;
ipcMain.handle('geocode', async (_e, q) => {
  const file = cachePath('geo', key(q), '.json');
  const hit = readCache(file, 7 * 24 * 3600 * 1000);
  if (hit) return JSON.parse(hit.toString('utf8'));
  // Nominatim 이용 정책: 초당 1회 이하
  const wait = Math.max(0, 1100 - (Date.now() - lastGeo));
  if (wait) await new Promise(r => setTimeout(r, wait));
  lastGeo = Date.now();
  const r = await fetchWithTimeout(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&accept-language=ko,en&q=${encodeURIComponent(q)}`, {}, 20000);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  writeCache(file, JSON.stringify(j));
  return j;
});

ipcMain.handle('saveShot', async (_e, dataUrl) => {
  const dir = path.join(app.getPath('pictures'), 'WreckEarth');
  fs.mkdirSync(dir, { recursive: true });
  const d = new Date(); const p2 = n => String(n).padStart(2, '0');
  const name = `wreck-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}.png`;
  const file = path.join(dir, name);
  fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
  return file;
});

ipcMain.handle('openShotFolder', async () => {
  const dir = path.join(app.getPath('pictures'), 'WreckEarth');
  fs.mkdirSync(dir, { recursive: true });
  shell.openPath(dir);
});

ipcMain.handle('fullscreen', () => { if (win) win.setFullScreen(!win.isFullScreen()); });

ipcMain.handle('cacheInfo', () => {
  let bytes = 0, files = 0;
  const walk = d => { for (const f of fs.existsSync(d) ? fs.readdirSync(d) : []) { const p = path.join(d, f); const st = fs.statSync(p); if (st.isDirectory()) walk(p); else { bytes += st.size; files++; } } };
  walk(cacheDir);
  return { bytes, files, dir: cacheDir };
});
ipcMain.handle('clearCache', () => { try { fs.rmSync(cacheDir, { recursive: true, force: true }); fs.mkdirSync(cacheDir, { recursive: true }); } catch (e) { /* 무시 */ } return true; });

// ---- 창 ----
function createWindow() {
  win = new BrowserWindow({
    width: 1600, height: 940, minWidth: 1100, minHeight: 680,
    backgroundColor: '#0b0d10', show: false, autoHideMenuBar: true,
    title: 'WRECK EARTH',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, sandbox: true, nodeIntegration: false,
      backgroundThrottling: false, spellcheck: false,
    },
  });
  // 윈도우는 메뉴 없이. 맥은 메뉴가 없으면 Cmd+Q·복사·붙여넣기·전체 화면이 안 되므로 최소한만 둠 (새로고침은 넣지 않음)
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { role: 'appMenu', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
      { role: 'editMenu' },
      { label: '보기', submenu: [{ role: 'togglefullscreen' }] },
      { role: 'windowMenu' },
    ]));
  } else Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') { win.webContents.toggleDevTools(); e.preventDefault(); }
  });
  // 외부 링크는 기본 브라우저로
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) e.preventDefault(); });
  win.loadFile(path.join(__dirname, '..', 'app', 'index.html'));
}

if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    cacheDir = path.join(app.getPath('userData'), 'cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
