import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const { ipcRenderer } = require('electron');

const api = {
  getFavicon: (url: string) => ipcRenderer.invoke('get-favicon', url),
};

const storeApi = {
  get: (key) => ipcRenderer.invoke('store-get', key),
  set: (key, value) => ipcRenderer.invoke('store-set', key, value),
  has: (key) => ipcRenderer.invoke('store-has', key),
  delete: (key) => ipcRenderer.invoke('store-delete', key),
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('api', api);
    contextBridge.exposeInMainWorld('store', storeApi);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.api = api;
  // @ts-ignore (define in dts)
  window.store = storeApi;
}
