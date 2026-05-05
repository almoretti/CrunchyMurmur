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

  // Notes
  notesSnapshot:     () => ipcRenderer.invoke('notes:snapshot'),
  notesRead:         (folder, filename) => ipcRenderer.invoke('notes:read', { folder, filename }),
  notesCreateFolder: (name) => ipcRenderer.invoke('notes:create-folder', name),
  notesRenameFolder: (oldName, newName) => ipcRenderer.invoke('notes:rename-folder', { oldName, newName }),
  notesDeleteFolder: (name) => ipcRenderer.invoke('notes:delete-folder', name),
  notesRevealFolder: (name) => ipcRenderer.invoke('notes:reveal-folder', name),
  notesCreate:       (payload) => ipcRenderer.invoke('notes:create', payload),
  notesUpdate:       (payload) => ipcRenderer.invoke('notes:update', payload),
  notesDelete:       (payload) => ipcRenderer.invoke('notes:delete', payload),
  notesRename:       (payload) => ipcRenderer.invoke('notes:rename', payload),
  notesMove:         (payload) => ipcRenderer.invoke('notes:move', payload),
  notesOpenRoot:     () => ipcRenderer.invoke('notes:open-root'),
  onNotesChanged:    (cb) => {
    ipcRenderer.on('notes:changed', (_e, snapshot) => cb(snapshot));
  },
});
