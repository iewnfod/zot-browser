import { BrowserWindow, ipcMain, Rectangle, WebContentsView } from 'electron';

const PARTITION = 'persist:shared-partition';
const ZERO_RECT: Rectangle = { x: 0, y: 0, width: 0, height: 0 };

interface ManagedView {
  view: WebContentsView;
  loadedSrc: string;
}

let mainWindow: BrowserWindow | null = null;
let uiView: WebContentsView | null = null;
const views = new Map<string, ManagedView>();

let currentTabId: string | null = null;
let pageRect: Rectangle | null = null;
let modalOpen = false;

/** 设置 UI view（React 前端所在，位于最上层）。 */
export function setUiView(view: WebContentsView): void {
  uiView = view;
  setupInputForwarding(view);
}

/** 获取 UI view，供其它模块发送事件。 */
export function getUiView(): WebContentsView | null {
  return uiView && !uiView.webContents.isDestroyed() ? uiView : null;
}

/**
 * 输入事件转发：UI view 在最上层默认接收所有事件。
 * 事件坐标在 pageRect 内且无模态框 → 阻止 UI 处理，坐标转换后 sendInputEvent 到网页 view。
 * 事件坐标在 pageRect 外（侧栏/导航栏）→ UI 自己处理。
 */
function setupInputForwarding(view: WebContentsView): void {
  // Electron 类型未声明 input-event，需要用 any
  (view.webContents as any).on('input-event', (event: any, inputEvent: any) => {
    // 模态框打开 → 不转发，UI 处理一切
    if (modalOpen) return;

    if (!currentTabId || !pageRect) return;

    const entry = views.get(currentTabId);
    if (!entry || entry.view.webContents.isDestroyed()) return;

    const { x, y, type } = inputEvent;

    // 在 pageRect 外（侧栏、导航栏等）→ UI 自己处理
    if (
      x < pageRect.x || x > pageRect.x + pageRect.width ||
      y < pageRect.y || y > pageRect.y + pageRect.height
    ) {
      return;
    }

    // 在内容区域内 → 阻止 UI 处理
    event.preventDefault();

    // 鼠标按下时聚焦网页 view（让键盘事件路由到网页）
    if (type === 'mouseDown') {
      try { entry.view.webContents.focus(); } catch (_) {}
    }

    // 坐标转换 + 转发
    try {
      entry.view.webContents.sendInputEvent({
        ...inputEvent,
        x: x - pageRect.x,
        y: y - pageRect.y
      });
    } catch (_) {}
  });
}

function relayout(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (uiView && !uiView.webContents.isDestroyed()) {
    const winBounds = mainWindow.getBounds();
    try {
      uiView.setBounds({ x: 0, y: 0, width: winBounds.width, height: winBounds.height });
    } catch (e) {
      console.warn('[viewManager] setBounds for uiView failed', e);
    }
  }

  for (const [tabId, entry] of views) {
    const bounds = tabId === currentTabId && pageRect ? pageRect : ZERO_RECT;
    try { entry.view.setBounds(bounds); } catch (e) {
      console.warn('[viewManager] setBounds failed for', tabId, e);
    }
  }
}

/** 网页视图置顶，然后 UI view 重新置顶（保证 UI 始终在最上层）。 */
function bringToFront(tabId: string): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const entry = views.get(tabId);
  if (!entry) return;
  try {
    mainWindow.contentView.addChildView(entry.view);
    if (uiView && !uiView.webContents.isDestroyed()) {
      mainWindow.contentView.addChildView(uiView);
    }
  } catch (e) {
    console.warn('[viewManager] bringToFront failed for', tabId, e);
  }
}

function emitNavState(tabId: string, wc: Electron.WebContents): void {
  if (!uiView || uiView.webContents.isDestroyed()) return;
  let canGoBack = false;
  let canGoForward = false;
  try {
    canGoBack = wc.navigationHistory.canGoBack();
    canGoForward = wc.navigationHistory.canGoForward();
  } catch (e) { console.warn('[viewManager] read nav history failed for', tabId, e); }
  uiView.webContents.send('view-nav-state', tabId, { canGoBack, canGoForward });
}

function attachForwarders(tabId: string, wc: Electron.WebContents): void {
  const send = (channel: string, ...args: unknown[]): void => {
    if (uiView && !uiView.webContents.isDestroyed()) {
      uiView.webContents.send(channel, ...args);
    }
  };

  wc.on('did-navigate', (_e, url) => { send('view-did-navigate', tabId, url, true); emitNavState(tabId, wc); });
  wc.on('did-navigate-in-page', (_e, url, isMainFrame) => { send('view-did-navigate', tabId, url, isMainFrame); emitNavState(tabId, wc); });
  wc.on('page-title-updated', (_e, title) => send('view-page-title-updated', tabId, title));
  wc.on('page-favicon-updated', (_e, favicons) => send('view-page-favicon-updated', tabId, favicons));
  wc.on('did-start-loading', () => send('view-did-start-loading', tabId));
  wc.on('did-stop-loading', () => { send('view-did-stop-loading', tabId); emitNavState(tabId, wc); });
  wc.on('media-started-playing', () => send('view-media-started-playing', tabId));
  wc.on('media-paused', () => send('view-media-paused', tabId));
  (wc as unknown as { on: (e: string, l: () => void) => void }).on('close', () => send('view-close', tabId));
}

function createView(tabId: string, src: string, userAgent?: string): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (views.has(tabId)) return;

  const view = new WebContentsView({
    webPreferences: {
      partition: PARTITION, contextIsolation: true, nodeIntegration: false, spellcheck: false, sandbox: true
    }
  });

  if (userAgent) {
    try { view.webContents.setUserAgent(userAgent); } catch (e) {
      console.warn('[viewManager] setUserAgent failed for', tabId, e);
    }
  }

  mainWindow.contentView.addChildView(view);
  // 确保 UI view 始终在最上层
  if (uiView && !uiView.webContents.isDestroyed()) {
    mainWindow.contentView.addChildView(uiView);
  }
  attachForwarders(tabId, view.webContents);
  views.set(tabId, { view, loadedSrc: src });

  try {
    if (src) { view.webContents.loadURL(src).catch((e) => { console.warn('[viewManager] loadURL failed for', tabId, src, e); }); }
  } catch (e) { console.warn('[viewManager] loadURL threw for', tabId, src, e); }

  relayout();
}

function destroyView(tabId: string): void {
  const entry = views.get(tabId);
  if (!entry) return;
  if (mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.contentView.removeChildView(entry.view); } catch (e) {
      console.warn('[viewManager] removeChildView failed for', tabId, e);
    }
  }
  try {
    const wc = entry.view.webContents as Electron.WebContents & { destroy?: () => void };
    if (!wc.isDestroyed() && wc.destroy) wc.destroy();
  } catch (e) { console.warn('[viewManager] destroy failed for', tabId, e); }
  views.delete(tabId);
}

export function initViewManager(win: BrowserWindow): void {
  mainWindow = win;
  win.on('resize', () => relayout());

  ipcMain.handle('view-ensure', (_e, tabId: string, opts?: { src?: string; ua?: string }) => {
    const src = opts?.src ?? '';
    const ua = opts?.ua;
    const entry = views.get(tabId);
    if (entry) {
      if (src && src !== entry.loadedSrc) {
        entry.loadedSrc = src;
        try {
          if (!entry.view.webContents.isDestroyed())
            entry.view.webContents.loadURL(src).catch((err) => { console.warn('[viewManager] reload on ensure failed for', tabId, err); });
        } catch (err) { console.warn('[viewManager] reload on ensure threw for', tabId, err); }
      }
      if (ua) { try { entry.view.webContents.setUserAgent(ua); } catch (_) {} }
      return;
    }
    createView(tabId, src, ua);
  });

  ipcMain.handle('view-destroy', (_e, tabId: string) => {
    destroyView(tabId);
    if (currentTabId === tabId) currentTabId = null;
  });

  const withWc = (tabId: string, fn: (wc: Electron.WebContents) => void): void => {
    const entry = views.get(tabId);
    if (!entry) return;
    try { if (!entry.view.webContents.isDestroyed()) fn(entry.view.webContents); } catch (e) {
      console.warn('[viewManager] nav op failed for', tabId, e);
    }
  };

  ipcMain.handle('view-go-back', (_e, tabId: string) => withWc(tabId, (wc) => wc.navigationHistory.goBack()));
  ipcMain.handle('view-go-forward', (_e, tabId: string) => withWc(tabId, (wc) => wc.navigationHistory.goForward()));
  ipcMain.handle('view-reload', (_e, tabId: string) => withWc(tabId, (wc) => wc.reload()));
  ipcMain.handle('view-stop', (_e, tabId: string) => withWc(tabId, (wc) => wc.stop()));
  ipcMain.handle('view-set-muted', (_e, tabId: string, muted: boolean) => withWc(tabId, (wc) => wc.setAudioMuted(muted)));

  ipcMain.handle('view-set-user-agent', (_e, ua: string) => {
    for (const entry of views.values()) {
      try { if (!entry.view.webContents.isDestroyed()) entry.view.webContents.setUserAgent(ua); } catch (_) {}
    }
  });

  ipcMain.handle('set-current-tab', (_e, tabId: string | null) => {
    currentTabId = tabId;
    if (tabId) bringToFront(tabId);
    relayout();
  });

  ipcMain.handle('set-page-rect', (_e, rect: Rectangle) => {
    pageRect = rect;
    relayout();
  });

  ipcMain.handle('set-modal-open', (_e, open: boolean) => {
    modalOpen = open;
  });

  // 滚轮事件转发：renderer 侧 DOM wheel 事件 → 主进程 → sendInputEvent 到网页 view
  ipcMain.handle('forward-wheel', (_e, event: { deltaX: number; deltaY: number; deltaMode: number; x: number; y: number }) => {
    if (modalOpen || !currentTabId || !pageRect) return;
    const entry = views.get(currentTabId);
    if (!entry || entry.view.webContents.isDestroyed()) return;
    try {
      entry.view.webContents.sendInputEvent({
        type: 'mouseWheel',
        x: event.x - pageRect.x,
        y: event.y - pageRect.y,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        canScroll: true
      });
    } catch (_) {}
  });
}
