const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wisper', {
  // Renderer → main: the captured audio (Float32 16 kHz mono).
  submitSamples: (samples) => ipcRenderer.invoke('floating:submit-samples', samples),

  // Renderer → main: read settings (used to pick the right mic device).
  getSettings: () => ipcRenderer.invoke('settings:get'),

  // Main → renderer: state transitions ('idle' | 'recording' | 'transcribing').
  onState: (cb) => {
    ipcRenderer.on('floating:state', (_e, state) => cb(state));
  },
});
