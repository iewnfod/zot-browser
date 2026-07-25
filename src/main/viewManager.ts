import { BrowserWindow, ipcMain, Rectangle, WebContentsView } from 'electron';
import { join } from 'path';
import { isInternalPageURL, isZotURL, resolveZotURL } from './zotProtocol';

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

  // zot:// 内部页：底层加载的是本地 file:// 或 dev URL，但对 UI 报告的地址
  // 始终应为原始的 zot:// URL（保持标签栏 / 地址栏显示不变）。
  const displayURL = (realURL: string): string => {
    const entry = views.get(tabId);
    return entry && isZotURL(entry.loadedSrc) ? entry.loadedSrc : realURL;
  };

  wc.on('did-navigate', (_e, url) => { send('view-did-navigate', tabId, displayURL(url), true); emitNavState(tabId, wc); });
  wc.on('did-navigate-in-page', (_e, url, isMainFrame) => { send('view-did-navigate', tabId, displayURL(url), isMainFrame); emitNavState(tabId, wc); });
  wc.on('page-title-updated', (_e, title) => send('view-page-title-updated', tabId, title));
  wc.on('page-favicon-updated', (_e, favicons) => send('view-page-favicon-updated', tabId, favicons));
  wc.on('did-start-loading', () => send('view-did-start-loading', tabId));
  wc.on('did-stop-loading', () => { send('view-did-stop-loading', tabId); emitNavState(tabId, wc); });
  wc.on('media-started-playing', () => send('view-media-started-playing', tabId));
  wc.on('media-paused', () => send('view-media-paused', tabId));
  (wc as unknown as { on: (e: string, l: () => void) => void }).on('close', () => send('view-close', tabId));

  // —— 网页端 → UI 同步事件（仅当前标签转发，避免后台标签干扰）——
  // 光标变化（悬停链接/文本/可拖拽元素时光标类型改变）
  wc.on('cursor-changed', (_e, type) => {
    if (tabId !== currentTabId) return;
    send('view-cursor-changed', tabId, type);
  });
  // 悬停链接目标 URL（鼠标移到 <a> 上时触发）
  wc.on('update-target-url', (_e, url) => {
    if (tabId !== currentTabId) return;
    send('view-target-url', tabId, url);
  });
  // 网页内右键菜单。params.x/y 是网页 view 内坐标，需偏移到 UI 层坐标系。
  wc.on('context-menu', (_e, params) => {
    if (tabId !== currentTabId) return;
    const rect = pageRect ?? ZERO_RECT;
    send('view-context-menu', tabId, {
      x: (params.x ?? 0) + rect.x,
      y: (params.y ?? 0) + rect.y,
      linkURL: params.linkURL,
      linkText: params.linkText,
      pageURL: params.pageURL,
      srcURL: params.srcURL,
      mediaType: params.mediaType,
      hasImageContents: params.hasImageContents,
      isEditable: params.isEditable,
      selectionText: params.selectionText,
      editFlags: params.editFlags
    });
  });
}

/**
 * 根据要加载的 src 决定 WebContentsView 的 webPreferences。
 *
 * - 普通网页：严格隔离（sandbox:true，无 preload）
 * - zot:// 内部页（settings/extensions）：和 UI view 同款——注入 preload、关闭 sandbox，
 *   使 window.store / window.api 可用（内部页需要读写设置）
 */
function webPrefsForSrc(src: string): Electron.WebPreferences {
  const base = {
    partition: PARTITION,
    contextIsolation: true,
    nodeIntegration: false,
    spellcheck: false,
  };
  if (isInternalPageURL(src)) {
    return {
      ...base,
      sandbox: false,
      preload: join(__dirname, '../preload/index.js'),
    };
  }
  return { ...base, sandbox: true };
}

function createView(tabId: string, src: string, userAgent?: string): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (views.has(tabId)) return;

  const view = new WebContentsView({ webPreferences: webPrefsForSrc(src) });

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
    // zot:// 内部页：加载解析后的真实本地 URL，但 loadedSrc 保留 zot:// 原样（标签栏显示用）
    const realURL = resolveZotURL(src) ?? src;
    if (realURL) { view.webContents.loadURL(realURL).catch((e) => { console.warn('[viewManager] loadURL failed for', tabId, realURL, e); }); }
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
        // zot:// 内部页：加载解析后的真实 URL，loadedSrc 仍保留 zot:// 原值
        const realURL = resolveZotURL(src) ?? src;
        try {
          if (!entry.view.webContents.isDestroyed())
            entry.view.webContents.loadURL(realURL).catch((err) => { console.warn('[viewManager] reload on ensure failed for', tabId, realURL, err); });
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

  // 编辑操作（右键菜单触发），统一走 withWc 模式
  ipcMain.handle('view-cut', (_e, tabId: string) => withWc(tabId, (wc) => wc.cut()));
  ipcMain.handle('view-copy', (_e, tabId: string) => withWc(tabId, (wc) => wc.copy()));
  ipcMain.handle('view-paste', (_e, tabId: string) => withWc(tabId, (wc) => wc.paste()));
  ipcMain.handle('view-delete', (_e, tabId: string) => withWc(tabId, (wc) => wc.delete()));
  ipcMain.handle('view-select-all', (_e, tabId: string) => withWc(tabId, (wc) => wc.selectAll()));
  ipcMain.handle('view-undo', (_e, tabId: string) => withWc(tabId, (wc) => wc.undo()));
  ipcMain.handle('view-redo', (_e, tabId: string) => withWc(tabId, (wc) => wc.redo()));
  // 开发者工具 / 检查元素。x,y 为 UI 层坐标，需转回网页 view 坐标系。
  ipcMain.handle('view-inspect', (_e, tabId: string, x: number, y: number) => {
    withWc(tabId, (wc) => {
      const rect = pageRect ?? ZERO_RECT;
      wc.openDevTools({ mode: 'detach' });
      // inspectElement 坐标在网页 view 内
      wc.inspectElement(Math.round(x - rect.x), Math.round(y - rect.y));
    });
  });
  ipcMain.handle('view-open-devtools', (_e, tabId: string) =>
    withWc(tabId, (wc) => wc.openDevTools({ mode: 'detach' })));
  // 查看页面源码
  ipcMain.handle('view-view-source', (_e, tabId: string) => {
    withWc(tabId, (wc) => {
      const url = wc.getURL();
      wc.loadURL('view-source:' + url).catch((err) => console.warn('[viewManager] view-source failed', tabId, err));
    });
  });

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
