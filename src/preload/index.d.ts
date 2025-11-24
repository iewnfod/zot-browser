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
    },
    store: {
      get: (key: string) => Promise<any>,
      set: (key: string, value: any) => Promise<boolean>,
      has: (key: string) => Promise<boolean>,
      delete: (key: string) => Promise<any>,
    }
  }
}
