const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wisper', {
  getSettings:    () => ipcRenderer.invoke('settings:get'),
  saveSettings:   (partial) => ipcRenderer.invoke('settings:save', partial),
  pickFile:       (filters) => ipcRenderer.invoke('settings:pick-file', filters),
  whisperCliStatus: (path) => ipcRenderer.invoke('whisper-cli:status', path),

  getHistory:     () => ipcRenderer.invoke('history:get'),
  getHistoryStats:() => ipcRenderer.invoke('history:stats'),
  removeHistory:  (id) => ipcRenderer.invoke('history:remove', id),
  clearHistory:   () => ipcRenderer.invoke('history:clear'),

  copyText:       (text) => ipcRenderer.invoke('clipboard:write', text),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  getUpdateStatus: () => ipcRenderer.invoke('update:status'),
  onUpdateStatus: (cb) => ipcRenderer.on('update:status', (_e, status) => cb(status)),
  openLogs:       () => ipcRenderer.invoke('support:open-logs'),
  diagnostics:    () => ipcRenderer.invoke('support:diagnostics'),
  exportData:     () => ipcRenderer.invoke('data:export'),
  deleteData:     () => ipcRenderer.invoke('data:delete'),
  openLegal:      (name) => ipcRenderer.invoke('legal:open', name),
  openAppMenu:    (name) => ipcRenderer.invoke('app-menu:open', name),
  permissionsStatus: () => ipcRenderer.invoke('permissions:status'),
  permissionsOpen:   (kind) => ipcRenderer.invoke('permissions:open', kind),

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

  // Templates
  templatesList:   () => ipcRenderer.invoke('templates:list'),
  templatesSave:   (t) => ipcRenderer.invoke('templates:save', t),
  templatesRevert: (id) => ipcRenderer.invoke('templates:revert', id),

  // AI Notes
  aiNotesProviders: () => ipcRenderer.invoke('ai-notes:providers'),
  aiNotesGenerateFromRecording: (payload) => ipcRenderer.invoke('ai-notes:generate-from-recording', payload),

  // Calendar
  calendarSnapshot:   () => ipcRenderer.invoke('calendar:snapshot'),
  calendarRefresh:    () => ipcRenderer.invoke('calendar:refresh'),
  calendarAddFeed:    (payload) => ipcRenderer.invoke('calendar:add-feed', payload),
  calendarUpdateFeed: (payload) => ipcRenderer.invoke('calendar:update-feed', payload),
  calendarRemoveFeed: (id) => ipcRenderer.invoke('calendar:remove-feed', id),
  onCalendarChanged: (cb) => {
    ipcRenderer.on('calendar:changed', (_e, snap) => cb(snap));
  },

  // Meetings
  meetingsList:           () => ipcRenderer.invoke('meetings:list'),
  meetingsGet:            (id) => ipcRenderer.invoke('meetings:get', id),
  meetingsBeginRecording: () => ipcRenderer.invoke('meetings:begin-recording'),
  meetingsUpdate:         (id, partial) => ipcRenderer.invoke('meetings:update', { id, partial }),
  meetingsDelete:         (id) => ipcRenderer.invoke('meetings:delete', id),
  meetingsReveal:         (id) => ipcRenderer.invoke('meetings:reveal', id),
  meetingsAudioUsage:     () => ipcRenderer.invoke('meetings:audio-usage'),
  meetingsCleanupAudio:   (policy) => ipcRenderer.invoke('meetings:cleanup-audio', policy),
  meetingsDeleteAllAudio: () => ipcRenderer.invoke('meetings:delete-all-audio'),
  meetingsAppendAudio:    (id, samples) => ipcRenderer.send('meetings:audio-chunk', { id, samples }),
  meetingsBeginSystemAudio:(id) => ipcRenderer.invoke('meetings:begin-system-audio', id),
  meetingsAppendSystemAudio:(id, samples) => ipcRenderer.send('meetings:system-audio-chunk', { id, samples }),
  meetingsFinishRecording:(id) => ipcRenderer.invoke('meetings:finish-recording', id),
  meetingsAbortRecording: (id) => ipcRenderer.invoke('meetings:abort-recording', id),
  meetingsTranscribe:     (id) => ipcRenderer.invoke('meetings:transcribe', id),
  meetingsCancelTranscription:(id) => ipcRenderer.invoke('meetings:cancel-transcription', id),
  meetingsGenerateAINotes:(id, templateId) => ipcRenderer.invoke('meetings:generate-ai-notes', { id, templateId }),
  meetingsSendToNotes:    (id, folder) => ipcRenderer.invoke('meetings:send-to-notes', { id, folder }),
  meetingsPillStart:      (payload) => ipcRenderer.invoke('meetings:pill-start', payload),
  onMeetingsChanged: (cb) => {
    ipcRenderer.on('meetings:changed', (_e, list) => cb(list));
  },
  onMeetingTranscriptionProgress: (cb) => {
    ipcRenderer.on('meetings:transcription-progress', (_e, progress) => cb(progress));
  },
  onPillRequestStopMeeting: (cb) => {
    ipcRenderer.on('main:request-stop-meeting', () => cb());
  },
});
