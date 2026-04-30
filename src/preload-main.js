const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wisper', {
  getSettings:    () => ipcRenderer.invoke('settings:get'),
  saveSettings:   (partial) => ipcRenderer.invoke('settings:save', partial),
  pickFile:       (filters) => ipcRenderer.invoke('settings:pick-file', filters),

  getHistory:     () => ipcRenderer.invoke('history:get'),
  removeHistory:  (id) => ipcRenderer.invoke('history:remove', id),
  clearHistory:   () => ipcRenderer.invoke('history:clear'),

  copyText:       (text) => ipcRenderer.invoke('clipboard:write', text),

  onHistoryChanged: (cb) => {
    ipcRenderer.on('history:changed', (_e, entries) => cb(entries));
  },
});
