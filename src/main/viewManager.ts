import { BrowserWindow, ipcMain, Rectangle, WebContentsView } from 'electron';

const PARTITION = 'persist:shared-partition';
const ZERO_RECT: Rectangle = { x: 0, y: 0, width: 0, height: 0 };

interface ManagedView {
  view: WebContentsView;
  loadedSrc: string;
}

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
const views = new Map<string, ManagedView>();

let currentTabId: string | null = null;
let pageRect: Rectangle | null = null;

/** 设置覆盖窗口（UI 在此），view-* 事件会转发到它。 */
export function setOverlayWindow(win: BrowserWindow): void {
  overlayWindow = win;
}

/** 获取覆盖窗口（UI 所在），供其它主进程模块发送 UI 事件。 */
export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow && !overlayWindow.isDestroyed() ? overlayWindow : null;
}

/**
 * 重新计算每个视图的 bounds。
 * - 当前视图：填满 pageRect。
 * - 其余视图：一律 zero（保持 webContents 存活，但不显示）。
 */
function relayout(): void {
  for (const [tabId, entry] of views) {
    if (mainWindow?.isDestroyed()) return;
    const bounds = tabId === currentTabId && pageRect ? pageRect : ZERO_RECT;
    try {
      entry.view.setBounds(bounds);
    } catch (e) {
      console.warn('[viewManager] setBounds failed for', tabId, e);
    }
  }
}

/** 把当前视图移到 contentView 栈顶，避免被 zero-sized 视图遮挡。 */
function bringToFront(tabId: string): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const entry = views.get(tabId);
  if (!entry) return;
  try {
    mainWindow.contentView.addChildView(entry.view);
  } catch (e) {
    console.warn('[viewManager] bringToFront failed for', tabId, e);
  }
}

/** 发送导航可用状态（后退/前进）给覆盖窗口 renderer。 */
function emitNavState(tabId: string, wc: Electron.WebContents): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  let canGoBack = false;
  let canGoForward = false;
  try {
    canGoBack = wc.navigationHistory.canGoBack();
    canGoForward = wc.navigationHistory.canGoForward();
  } catch (e) {
    console.warn('[viewManager] read nav history failed for', tabId, e);
  }
  overlayWindow.webContents.send('view-nav-state', tabId, { canGoBack, canGoForward });
}

/** 在新视图的 webContents 上挂载事件转发。 */
function attachForwarders(tabId: string, wc: Electron.WebContents): void {
  const send = (channel: string, ...args: unknown[]): void => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send(channel, ...args);
    }
  };

  wc.on('did-navigate', (_e, url) => {
    send('view-did-navigate', tabId, url, true);
    emitNavState(tabId, wc);
  });
  wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
    send('view-did-navigate', tabId, url, isMainFrame);
    emitNavState(tabId, wc);
  });
  wc.on('page-title-updated', (_e, title) => {
    send('view-page-title-updated', tabId, title);
  });
  wc.on('page-favicon-updated', (_e, favicons) => {
    send('view-page-favicon-updated', tabId, favicons);
  });
  wc.on('did-start-loading', () => {
    send('view-did-start-loading', tabId);
  });
  wc.on('did-stop-loading', () => {
    send('view-did-stop-loading', tabId);
    emitNavState(tabId, wc);
  });
  wc.on('media-started-playing', () => {
    send('view-media-started-playing', tabId);
  });
  wc.on('media-paused', () => {
    send('view-media-paused', tabId);
  });
  // 页面调用 window.close() 时触发。该事件在运行时存在但未在 Electron 类型中声明。
  (wc as unknown as { on: (e: string, l: () => void) => void }).on('close', () => {
    send('view-close', tabId);
  });
}

/** 创建视图并加载 src。 */
function createView(tabId: string, src: string, userAgent?: string): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (views.has(tabId)) return;

  const view = new WebContentsView({
    webPreferences: {
      partition: PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      sandbox: true
    }
  });

  if (userAgent) {
    try {
      view.webContents.setUserAgent(userAgent);
    } catch (e) {
      console.warn('[viewManager] setUserAgent failed for', tabId, e);
    }
  }

  mainWindow.contentView.addChildView(view);
  attachForwarders(tabId, view.webContents);

  views.set(tabId, { view, loadedSrc: src });

  try {
    if (src) {
      view.webContents.loadURL(src).catch((e) => {
        console.warn('[viewManager] loadURL failed for', tabId, src, e);
      });
    }
  } catch (e) {
    console.warn('[viewManager] loadURL threw for', tabId, src, e);
  }

  relayout();
}

/** 销毁视图。 */
function destroyView(tabId: string): void {
  const entry = views.get(tabId);
  if (!entry) return;
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.contentView.removeChildView(entry.view);
    } catch (e) {
      console.warn('[viewManager] removeChildView failed for', tabId, e);
    }
  }
  try {
    const wc = entry.view.webContents as Electron.WebContents & { destroy?: () => void };
    if (!wc.isDestroyed() && wc.destroy) {
      wc.destroy();
    }
  } catch (e) {
    console.warn('[viewManager] destroy failed for', tabId, e);
  }
  views.delete(tabId);
}

export function initViewManager(win: BrowserWindow): void {
  mainWindow = win;

  // 确保视图在窗口尺寸变化时仍跟随（pageRect 由 renderer 主动上报，这里作为兜底）
  win.on('resize', () => relayout());

  // 命令：创建或确保视图存在；若 src 变化则重新加载
  ipcMain.handle('view-ensure', (_e, tabId: string, opts?: { src?: string; ua?: string }) => {
    const src = opts?.src ?? '';
    const ua = opts?.ua;
    const entry = views.get(tabId);
    if (entry) {
      // 已存在：src 不同则重新加载
      if (src && src !== entry.loadedSrc) {
        entry.loadedSrc = src;
        try {
          if (!entry.view.webContents.isDestroyed()) {
            entry.view.webContents.loadURL(src).catch((err) => {
              console.warn('[viewManager] reload on ensure failed for', tabId, err);
            });
          }
        } catch (err) {
          console.warn('[viewManager] reload on ensure threw for', tabId, err);
        }
      }
      if (ua) {
        try {
          entry.view.webContents.setUserAgent(ua);
        } catch (_) {}
      }
      return;
    }
    createView(tabId, src, ua);
  });

  // 命令：销毁视图
  ipcMain.handle('view-destroy', (_e, tabId: string) => {
    destroyView(tabId);
    if (currentTabId === tabId) currentTabId = null;
  });

  // 命令：导航控制
  const withWc = (tabId: string, fn: (wc: Electron.WebContents) => void): void => {
    const entry = views.get(tabId);
    if (!entry) return;
    try {
      if (!entry.view.webContents.isDestroyed()) fn(entry.view.webContents);
    } catch (e) {
      console.warn('[viewManager] nav op failed for', tabId, e);
    }
  };

  ipcMain.handle('view-go-back', (_e, tabId: string) => withWc(tabId, (wc) => wc.navigationHistory.goBack()));
  ipcMain.handle('view-go-forward', (_e, tabId: string) => withWc(tabId, (wc) => wc.navigationHistory.goForward()));
  ipcMain.handle('view-reload', (_e, tabId: string) => withWc(tabId, (wc) => wc.reload()));
  ipcMain.handle('view-stop', (_e, tabId: string) => withWc(tabId, (wc) => wc.stop()));
  ipcMain.handle('view-set-muted', (_e, tabId: string, muted: boolean) => withWc(tabId, (wc) => wc.setAudioMuted(muted)));

  // 命令：全局设置 UA（应用到所有现存视图）
  ipcMain.handle('view-set-user-agent', (_e, ua: string) => {
    for (const entry of views.values()) {
      try {
        if (!entry.view.webContents.isDestroyed()) entry.view.webContents.setUserAgent(ua);
      } catch (_) {}
    }
  });

  // 命令：设置当前标签（置顶 + 给当前视图正确 bounds）
  ipcMain.handle('set-current-tab', (_e, tabId: string | null) => {
    currentTabId = tabId;
    if (tabId) bringToFront(tabId);
    relayout();
  });

  // 命令：设置页面区域（覆盖窗口测量的页面区域矩形）
  ipcMain.handle('set-page-rect', (_e, rect: Rectangle) => {
    pageRect = rect;
    relayout();
  });
}
