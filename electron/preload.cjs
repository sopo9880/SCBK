// 렌더러에 안전하게 노출하는 API
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  desktop: true,
  overpass: async (query) => JSON.parse(await ipcRenderer.invoke('overpass', query)),
  tile: (z, x, y) => ipcRenderer.invoke('tile', z, x, y),
  geocode: (q) => ipcRenderer.invoke('geocode', q),
  saveScreenshot: (dataUrl) => ipcRenderer.invoke('saveShot', dataUrl),
  openShotFolder: () => ipcRenderer.invoke('openShotFolder'),
  toggleFullscreen: () => ipcRenderer.invoke('fullscreen'),
  cacheInfo: () => ipcRenderer.invoke('cacheInfo'),
  clearCache: () => ipcRenderer.invoke('clearCache'),
});
