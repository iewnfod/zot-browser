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
  focus: () => ipcRenderer.invoke('focus'),
  scaleFactor: () => ipcRenderer.invoke('scale-factor'),
  // WebContentsView 生命周期命令
  viewEnsure: (tabId: string, opts?: { src?: string; ua?: string }) =>
    ipcRenderer.invoke('view-ensure', tabId, opts),
  viewDestroy: (tabId: string) => ipcRenderer.invoke('view-destroy', tabId),
  viewGoBack: (tabId: string) => ipcRenderer.invoke('view-go-back', tabId),
  viewGoForward: (tabId: string) => ipcRenderer.invoke('view-go-forward', tabId),
  viewReload: (tabId: string) => ipcRenderer.invoke('view-reload', tabId),
  viewStop: (tabId: string) => ipcRenderer.invoke('view-stop', tabId),
  viewSetMuted: (tabId: string, muted: boolean) =>
    ipcRenderer.invoke('view-set-muted', tabId, muted),
  viewSetUserAgent: (ua: string) => ipcRenderer.invoke('view-set-user-agent', ua),
  setCurrentTab: (tabId: string | null) => ipcRenderer.invoke('set-current-tab', tabId),
  setPageRect: (rect: { x: number; y: number; width: number; height: number }) =>
    ipcRenderer.invoke('set-page-rect', rect),
  // 点击穿透：上报需要接收点击的 UI 区域（侧栏/顶部条等）
  setUiRects: (rects: Array<{ x: number; y: number; width: number; height: number }>) =>
    ipcRenderer.invoke('set-ui-rects', rects),
  // 点击穿透：模态框开关
  setModalOpen: (open: boolean) => ipcRenderer.invoke('set-modal-open', open)
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
