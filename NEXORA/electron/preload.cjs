'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nexoraDesktop', {
  invoke: (command, args = {}) => ipcRenderer.invoke('nexora:invoke', command, args),
  ready: () => ipcRenderer.send('nexora:renderer-ready'),
  onEvent: (listener) => {
    const wrapped = (_event, value) => listener(value);
    ipcRenderer.on('nexora:event', wrapped);
    return () => ipcRenderer.removeListener('nexora:event', wrapped);
  },
});
