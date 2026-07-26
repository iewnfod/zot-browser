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
  // 编辑操作（网页右键菜单触发）
  viewCut: (tabId: string) => ipcRenderer.invoke('view-cut', tabId),
  viewCopy: (tabId: string) => ipcRenderer.invoke('view-copy', tabId),
  viewPaste: (tabId: string) => ipcRenderer.invoke('view-paste', tabId),
  viewDelete: (tabId: string) => ipcRenderer.invoke('view-delete', tabId),
  viewSelectAll: (tabId: string) => ipcRenderer.invoke('view-select-all', tabId),
  viewUndo: (tabId: string) => ipcRenderer.invoke('view-undo', tabId),
  viewRedo: (tabId: string) => ipcRenderer.invoke('view-redo', tabId),
  // 开发者
  viewInspect: (tabId: string, x: number, y: number) => ipcRenderer.invoke('view-inspect', tabId, x, y),
  viewOpenDevTools: (tabId: string) => ipcRenderer.invoke('view-open-devtools', tabId),
  viewViewSource: (tabId: string) => ipcRenderer.invoke('view-view-source', tabId),
  viewSetUserAgent: (ua: string) => ipcRenderer.invoke('view-set-user-agent', ua),
  setCurrentTab: (tabId: string | null) => ipcRenderer.invoke('set-current-tab', tabId),
  setPageRect: (rect: { x: number; y: number; width: number; height: number }) =>
    ipcRenderer.invoke('set-page-rect', rect),
  // 模态框 z-order 控制
  setModalOpen: (open: boolean) => ipcRenderer.invoke('set-modal-open', open),
  // 滚轮事件转发：renderer 侧捕获 wheel 事件 → 主进程 → sendInputEvent 到网页 view
  forwardWheel: (event: { deltaX: number; deltaY: number; deltaMode: number; x: number; y: number }) =>
    ipcRenderer.invoke('forward-wheel', event),
  // 读取系统自然滚动偏好（macOS 检测，其他平台返回 false）
  getNaturalScroll: () => ipcRenderer.invoke('get-natural-scroll'),
  // 读取系统语言（app.getLocale() 归一化为受支持的 Locale，zh* → 'zh-CN'，否则 'en'）
  getSystemLocale: () => ipcRenderer.invoke('get-system-locale'),
  // 下载控制（主进程 download.ts）
  downloadPause: (id: string) => ipcRenderer.invoke('download-pause', id),
  downloadResume: (id: string) => ipcRenderer.invoke('download-resume', id),
  downloadCancel: (id: string) => ipcRenderer.invoke('download-cancel', id),
  downloadShowInFolder: (savePath: string) => ipcRenderer.invoke('download-show-in-folder', savePath),
  downloadOpenFile: (savePath: string) => ipcRenderer.invoke('download-open-file', savePath),
  downloadClearHistory: () => ipcRenderer.invoke('download-clear-history'),
  downloadRemoveHistoryItem: (id: string) => ipcRenderer.invoke('download-remove-history-item', id),
  // 拉取当前进行中的下载快照（页面加载时用，避免错过已开始的下载）
  downloadGetActive: () => ipcRenderer.invoke('download-get-active'),
  // 拉取最近 N 条历史（供 SideBar 下载 Dropdown 用，默认 5）
  downloadGetHistory: (limit?: number) => ipcRenderer.invoke('download-get-history', limit),
  // 批量检查文件是否存在（UI 据此隐藏「打开 / 在文件夹中显示」按钮）
  downloadCheckFiles: (savePaths: string[]) => ipcRenderer.invoke('download-check-files', savePaths),
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
