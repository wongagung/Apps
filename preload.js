const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aircastAPI', {
  getServerInfo: () => ipcRenderer.invoke('get-server-info'),
  regenerateSession: () => ipcRenderer.invoke('regenerate-session'),
  getNetworkInterfaces: () => ipcRenderer.invoke('get-network-interfaces'),
  selectNetworkInterface: (ip) => ipcRenderer.invoke('select-network-interface', ip),
  saveScreenshot: (base64Data) => ipcRenderer.invoke('save-screenshot', base64Data),
  saveRecording: (arrayBuffer, filename) => ipcRenderer.invoke('save-recording', arrayBuffer, filename),
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  togglePip: () => ipcRenderer.invoke('toggle-pip'),
  saveReplayDirect: (arrayBuffer) => ipcRenderer.invoke('save-replay-direct', arrayBuffer),
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
  readClipboard: () => ipcRenderer.invoke('read-clipboard'),
  saveReceivedFile: (arrayBuffer, filename) => ipcRenderer.invoke('save-received-file', arrayBuffer, filename),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  sendDesktopSignal: (msg) => ipcRenderer.send('desktop-signal', msg),
  onMobileSignal: (callback) => ipcRenderer.on('mobile-signal', (event, msg) => callback(msg)),
  onServerState: (callback) => ipcRenderer.on('server-state', (event, data) => callback(data))
});

