import { ElectronAPI } from '@electron-toolkit/preload'
import type { Locale } from '../renderer/src/lib/i18n'

/** 主进程 → UI 的下载进度推送载荷（与 src/main/download.ts 保持一致）。 */
export interface DownloadProgressPayload {
  id: string;
  filename: string;
  url: string;
  received: number;
  total: number;
  /** interrupted 表示下载被中断（可能在 done 之前短暂出现）。 */
  state: 'progressing' | 'paused' | 'interrupted';
  /** 下载速度（bytes/sec，EMA 平滑后）。paused/interrupted 时为 0。 */
  speed: number;
}

/** 主进程 → UI 的下载完成事件载荷。 */
export interface DownloadDonePayload {
  id: string;
  filename: string;
  url: string;
  savePath: string;
  state: 'completed' | 'cancelled' | 'interrupted';
  total: number;
  mimeType: string;
}

/** 持久化的已完成下载条目（与 src/main/download.ts 的 DownloadHistoryItem 一致）。 */
export interface DownloadHistoryItem {
  id: string;
  filename: string;
  url: string;
  savePath: string;
  total: number;
  mimeType: string;
  completedAt: number;
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      getFavicon: (url: string) => Promise<string>,
      isMaximized: () => Promise<boolean>,
      maximize: () => Promise<void>,
      minimize: () => Promise<void>,
      unmaximize: () => Promise<void>,
      close: () => Promise<void>,
      focus: () => Promise<void>,
      scaleFactor: () => Promise<number>,
      // WebContentsView 生命周期命令
      viewEnsure: (tabId: string, opts?: { src?: string; ua?: string }) => Promise<void>,
      viewDestroy: (tabId: string) => Promise<void>,
      viewGoBack: (tabId: string) => Promise<void>,
      viewGoForward: (tabId: string) => Promise<void>,
      viewReload: (tabId: string) => Promise<void>,
      viewStop: (tabId: string) => Promise<void>,
      viewSetMuted: (tabId: string, muted: boolean) => Promise<void>,
      // 编辑操作（网页右键菜单触发）
      viewCut: (tabId: string) => Promise<void>,
      viewCopy: (tabId: string) => Promise<void>,
      viewPaste: (tabId: string) => Promise<void>,
      viewDelete: (tabId: string) => Promise<void>,
      viewSelectAll: (tabId: string) => Promise<void>,
      viewUndo: (tabId: string) => Promise<void>,
      viewRedo: (tabId: string) => Promise<void>,
      // 开发者
      viewInspect: (tabId: string, x: number, y: number) => Promise<void>,
      viewOpenDevTools: (tabId: string) => Promise<void>,
      viewViewSource: (tabId: string) => Promise<void>,
      viewSetUserAgent: (ua: string) => Promise<void>,
      setCurrentTab: (tabId: string | null) => Promise<void>,
      setPageRect: (rect: { x: number; y: number; width: number; height: number }) => Promise<void>,
      setModalOpen: (open: boolean) => Promise<void>,
      forwardWheel: (event: { deltaX: number; deltaY: number; deltaMode: number; x: number; y: number }) => Promise<void>,
      getNaturalScroll: () => Promise<boolean>,
      getSystemLocale: () => Promise<Locale>,
      // 下载控制（主进程 download.ts）
      downloadPause: (id: string) => Promise<boolean>,
      downloadResume: (id: string) => Promise<boolean>,
      downloadCancel: (id: string) => Promise<boolean>,
      downloadShowInFolder: (savePath: string) => Promise<boolean>,
      downloadOpenFile: (savePath: string) => Promise<boolean>,
      downloadClearHistory: () => Promise<boolean>,
      downloadRemoveHistoryItem: (id: string) => Promise<boolean>,
      downloadGetActive: () => Promise<DownloadProgressPayload[]>,
      downloadGetHistory: (limit?: number) => Promise<DownloadHistoryItem[]>,
      downloadCheckFiles: (savePaths: string[]) => Promise<string[]>,
    },
    store: {
      get: (key: string) => Promise<any>,
      set: (key: string, value: any) => Promise<boolean>,
      has: (key: string) => Promise<boolean>,
      delete: (key: string) => Promise<any>,
    }
  }
}
