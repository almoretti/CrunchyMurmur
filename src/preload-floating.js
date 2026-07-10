const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wisper', {
  // Renderer → main: the captured audio (Float32 16 kHz mono).
  submitSamples: (samples) => ipcRenderer.invoke('floating:submit-samples', samples),

  // Renderer → main: read settings (used to pick the right mic device).
  getSettings: () => ipcRenderer.invoke('settings:get'),
  captureFailed: (message) => ipcRenderer.send('floating:capture-failed', String(message || '')),

  // Renderer → main: pill clicked while in meeting state. Main forwards to
  // the main window which actually owns the meeting recording.
  requestStopMeeting: () => ipcRenderer.send('floating:request-stop-meeting'),

  // Main → renderer: state transitions ('idle' | 'recording' | 'flushing'
  // | 'transcribing' | 'meeting').
  onState: (cb) => {
    ipcRenderer.on('floating:state', (_e, state) => cb(state));
  },

  // Main → renderer: meeting started — gives the pill the timestamp it
  // needs to drive its own elapsed timer locally.
  onMeetingState: (cb) => {
    ipcRenderer.on('floating:meeting-state', (_e, payload) => cb(payload));
  },
});
