const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onState: (fn) => ipcRenderer.on('STATE', (_, s) => fn(s)),
  onScroll: (fn) => ipcRenderer.on('SCROLL', (_, dy) => fn(dy)),
  setState: (patch) => ipcRenderer.invoke('SET_STATE', patch),
  getState: () => ipcRenderer.invoke('GET_STATE'),
  setClickThrough: (on) => ipcRenderer.invoke('SET_CLICK_THROUGH', !!on),
  closeOverlay: () => ipcRenderer.invoke('CLOSE_OVERLAY'),
});
