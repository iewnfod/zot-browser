import { ElectronAPI } from '@electron-toolkit/preload'

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
    },
    store: {
      get: (key: string) => Promise<any>,
      set: (key: string, value: any) => Promise<boolean>,
      has: (key: string) => Promise<boolean>,
      delete: (key: string) => Promise<any>,
    }
  }
}
