import { contextBridge } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';

const { ipcRenderer } = require('electron');

const api = {
  getFavicon: (url: string) => ipcRenderer.invoke('get-favicon', url),
  isMaximized: () => ipcRenderer.invoke('is-maximized'),
  maximize: () => ipcRenderer.invoke('maximize'),
  minimize: () => ipcRenderer.invoke('minimize'),
  unmaximize: () => ipcRenderer.invoke('unmaximize'),
  close: () => ipcRenderer.invoke('close'),
  scaleFactor: () => ipcRenderer.invoke('scale-factor')
};

const storeApi = {
  get: (key: string): Promise<any> => ipcRenderer.invoke('store-get', key),
  set: (key: string, value: any): Promise<boolean> => ipcRenderer.invoke('store-set', key, value),
  has: (key: string): Promise<boolean> => ipcRenderer.invoke('store-has', key),
  delete: (key: string): Promise<any> => ipcRenderer.invoke('store-delete', key),
};

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
