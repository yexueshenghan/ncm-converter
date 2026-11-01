'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('ncm', {
  pickFiles: () => ipcRenderer.invoke('pick-files'),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  expand: (paths) => ipcRenderer.invoke('expand', paths),
  convert: (payload) => ipcRenderer.invoke('convert', payload),
  reveal: (target) => ipcRenderer.invoke('reveal', target),
  openFile: (target) => ipcRenderer.invoke('open-file', target),
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return file.path || '';
    }
  },
  onProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('progress', listener);
    return () => ipcRenderer.removeListener('progress', listener);
  },
});
