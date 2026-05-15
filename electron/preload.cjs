const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getScreens: () => ipcRenderer.invoke('get-screens'),
  openProjector: (outputId, displayLabel) => ipcRenderer.invoke('open-projector', outputId, displayLabel),
  closeProjectors: () => ipcRenderer.invoke('close-projectors')
});
