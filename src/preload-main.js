const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wisper', {
  getSettings:    () => ipcRenderer.invoke('settings:get'),
  saveSettings:   (partial) => ipcRenderer.invoke('settings:save', partial),
  pickFile:       (filters) => ipcRenderer.invoke('settings:pick-file', filters),

  getHistory:     () => ipcRenderer.invoke('history:get'),
  removeHistory:  (id) => ipcRenderer.invoke('history:remove', id),
  clearHistory:   () => ipcRenderer.invoke('history:clear'),

  copyText:       (text) => ipcRenderer.invoke('clipboard:write', text),

  // Models
  modelsCatalog:   () => ipcRenderer.invoke('models:catalog'),
  modelsInstalled: () => ipcRenderer.invoke('models:installed'),
  modelsDir:       () => ipcRenderer.invoke('models:dir'),
  modelsOpenDir:   () => ipcRenderer.invoke('models:open-dir'),
  modelsDownload:  (id) => ipcRenderer.invoke('models:download', id),
  modelsCancel:    (id) => ipcRenderer.invoke('models:cancel', id),
  modelsRemove:    (id) => ipcRenderer.invoke('models:remove', id),
  onModelProgress: (cb) => {
    ipcRenderer.on('models:progress', (_e, p) => cb(p));
  },
  onModelsChanged: (cb) => {
    ipcRenderer.on('models:installed-changed', (_e, list) => cb(list));
  },

  onHistoryChanged: (cb) => {
    ipcRenderer.on('history:changed', (_e, entries) => cb(entries));
  },
});
