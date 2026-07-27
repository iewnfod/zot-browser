import { BrowserWindow, ipcMain, Rectangle, WebContentsView } from 'electron';
import { join } from 'path';
import { isInternalPageURL, isZotURL, resolveZotURL } from './zotProtocol';

export const PARTITION = 'persist:shared-partition';
const ZERO_RECT: Rectangle = { x: 0, y: 0, width: 0, height: 0 };

// —— 扩展 popup 浮层的尺寸约束（Chromium preferredSize 回报后 clamp 到此区间）——
const POPUP_MIN_W = 240;
const POPUP_MAX_W = 800;
const POPUP_MIN_H = 120;
const POPUP_MAX_H = 600;

// —— 扩展宿主生命周期钩子（由 extensions.ts 注册，避免循环依赖）——
// viewManager 不直接 import extensions（那会成环），改为回调注入。
interface ViewLifecycleHooks {
  onViewCreated?: (tabId: string) => void;   // view 创建并加入 Map 后
  onViewDestroyed?: (tabId: string) => void; // view 从 Map 移除前/后
  onCurrentTabChanged?: (tabId: string) => void; // 当前标签切换
  /** 扩展 popup 打开前（loadURL 之前）调用：确保 MV3 service worker 已就绪。
   *  返回 Promise，openPopup 会 await 它再加载 popup 内容，避免首条消息踩空窗口。 */
  onPopupOpened?: (extId: string) => Promise<void>;
}
let lifecycleHooks: ViewLifecycleHooks = {};
/** 由 extensions.ts 调用，注入扩展宿主对 view 生命周期的监听。 */
export function setViewLifecycleHooks(hooks: ViewLifecycleHooks): void {
  lifecycleHooks = hooks;
}

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

// —— 扩展 popup 浮层 ——
// popup 是独立 WebContentsView，渲染 chrome-extension://<id>/popup.html。
// 它浮在 UI view 之上（addChildView 顺序保证最上层），只占图标下方一小块矩形。
// popup 打开期间 modalOpen=true，setupInputForwarding 把 popupRect 内的事件转发给 popup view。
let popupView: WebContentsView | null = null;
let popupRect: Rectangle | null = null;
// popup 是否被「钉住」（「检查 popup」调试模式）：钉住后主窗口 blur 不会自动关闭它，
// 否则 devtools 窗口一弹出就触发主窗口失焦 → popup 被销毁，无法调试。
let popupPinned = false;

/** 设置 UI view（React 前端所在，位于最上层）。 */
export function setUiView(view: WebContentsView): void {
  uiView = view;
  setupInputForwarding(view);
}

/** 获取 UI view，供其它模块发送事件。 */
export function getUiView(): WebContentsView | null {
  return uiView && !uiView.webContents.isDestroyed() ? uiView : null;
}

/** 获取主窗口（供扩展宿主等模块引用）。 */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

/**
 * 按 tabId 取该标签对应的 webContents（已销毁则返回 null）。
 * 供扩展宿主等需要在主进程拿到网页 view 的 webContents 的模块使用。
 */
export function getWebContents(tabId: string): Electron.WebContents | null {
  const entry = views.get(tabId);
  if (!entry) return null;
  try {
    if (!entry.view.webContents.isDestroyed()) return entry.view.webContents;
  } catch (_) {}
  return null;
}

/**
 * 反向查找：由 webContents.id 找 tabId。
 * 扩展宿主的 selectTab/removeTab 回调收到的是 webContents，需反查 tabId
 * 才能发 IPC 给 renderer 操作标签状态。
 */
export function getTabIdByWebContentsId(wcId: number): string | null {
  for (const [tabId, entry] of views) {
    try {
      if (!entry.view.webContents.isDestroyed() && entry.view.webContents.id === wcId) {
        return tabId;
      }
    } catch (_) {}
  }
  return null;
}

/** view 就绪等待表：tabId → resolver 列表。createView 完成时逐个 resolve。 */
const viewWaiters = new Map<string, Array<(wc: Electron.WebContents) => void>>();

/**
 * 等待某个 tabId 的 webContents 就绪。
 * 扩展宿主的 createTab 回调需要它：renderer 异步 createTab → shouldRender → viewEnsure
 * 经过几个 React 渲染周期，view 才会出现在 views Map 里，故需等待。
 * 超时（默认 5s）则 reject，避免永久挂起。
 */
export function waitForView(tabId: string, timeoutMs = 5000): Promise<Electron.WebContents> {
  const existing = getWebContents(tabId);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      remove();
      reject(new Error(`waitForView timeout for ${tabId}`));
    }, timeoutMs);
    const onReady = (wc: Electron.WebContents): void => {
      clearTimeout(timer);
      resolve(wc);
    };
    const remove = (): void => {
      const arr = viewWaiters.get(tabId);
      if (arr) {
        const i = arr.indexOf(onReady);
        if (i >= 0) arr.splice(i, 1);
        if (arr.length === 0) viewWaiters.delete(tabId);
      }
    };
    const arr = viewWaiters.get(tabId) ?? [];
    arr.push(onReady);
    viewWaiters.set(tabId, arr);
  });
}

/**
 * 向主 UI + 所有 zot:// 内部页 view 广播事件。
 * 用于下载进度等「主 UI 与内部页都需要感知」的事件：
 * 主 UI（SideBar 进度圈 / Dropdown）和 zot://downloads 页面各自独立订阅，
 * 只发给主 UI 会导致已打开的下载页收不到更新。
 */
export function broadcastToUiViews(channel: string, ...args: unknown[]): void {
  const targets: WebContentsView[] = [];
  if (uiView && !uiView.webContents.isDestroyed()) targets.push(uiView);
  for (const { view, loadedSrc } of views.values()) {
    // 仅 zot:// 内部页接收（普通网页不该收到下载进度等内部事件）
    if (isZotURL(loadedSrc) && !view.webContents.isDestroyed()) {
      targets.push(view);
    }
  }
  for (const t of targets) {
    try { t.webContents.send(channel, ...args); } catch (_) {}
  }
}

/** 判断点 (x,y) 是否落在 rect 内（含边界）。 */
function pointInRect(x: number, y: number, rect: Rectangle): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

/**
 * 输入事件转发：UI view 在最上层默认接收所有事件。
 * 事件坐标在 pageRect 内且无模态框 → 阻止 UI 处理，坐标转换后 sendInputEvent 到网页 view。
 * 事件坐标在 pageRect 外（侧栏/导航栏）→ UI 自己处理。
 *
 * 扩展 popup 打开时（modalOpen=true 且 popupView 存在）：popupRect 内的事件转发给 popup view，
 * 其余留给 UI（点击 popup 外部 → 遮罩层关闭 popup）。
 */
function setupInputForwarding(view: WebContentsView): void {
  // Electron 类型未声明 input-event，需要用 any
  (view.webContents as any).on('input-event', (event: any, inputEvent: any) => {
    // 模态框打开：默认留给 UI 处理；但若 popup 浮层打开且事件落在 popup 矩形内，转发给 popup view。
    if (modalOpen) {
      if (popupView && popupRect && !popupView.webContents.isDestroyed() &&
        pointInRect(inputEvent.x, inputEvent.y, popupRect)) {
        event.preventDefault();
        if (inputEvent.type === 'mouseDown') {
          try { popupView.webContents.focus(); } catch (_) {}
        }
        try {
          popupView.webContents.sendInputEvent({
            ...inputEvent,
            x: inputEvent.x - popupRect.x,
            y: inputEvent.y - popupRect.y
          });
        } catch (_) {}
      }
      return;
    }

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

  // popup 浮层始终保持在最上层（窗口尺寸变化后 z-order 不变，但保险处理）
  if (popupView && !popupView.webContents.isDestroyed()) {
    try { mainWindow.contentView.addChildView(popupView); } catch (_) {}
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

  // 通知任何在等待该 tabId view 就绪的调用方（如扩展宿主 createTab 回调）。
  const waiters = viewWaiters.get(tabId);
  if (waiters) {
    viewWaiters.delete(tabId);
    for (const fn of waiters) {
      try { fn(view.webContents); } catch (_) {}
    }
  }

  try {
    // zot:// 内部页：加载解析后的真实本地 URL，但 loadedSrc 保留 zot:// 原样（标签栏显示用）
    const realURL = resolveZotURL(src) ?? src;
    if (realURL) { view.webContents.loadURL(realURL).catch((e) => { console.warn('[viewManager] loadURL failed for', tabId, realURL, e); }); }
  } catch (e) { console.warn('[viewManager] loadURL threw for', tabId, src, e); }

  relayout();

  // 通知扩展宿主：新 view 已就绪（扩展的 tabs 等 API 依赖此注册）
  lifecycleHooks.onViewCreated?.(tabId);
}

function destroyView(tabId: string): void {
  const entry = views.get(tabId);
  if (!entry) return;
  // 通知扩展宿主：view 即将销毁（需在 webContents destroy 前调用，宿主 removeTab 才能引用它）
  lifecycleHooks.onViewDestroyed?.(tabId);
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

/**
 * 打开扩展 popup 浮层。
 * 创建独立 WebContentsView（与普通网页同款 prefs：同 partition、sandbox），加载
 * chrome-extension://<id>/<popup>。初始用最小尺寸定位到锚点下方并置顶；内容布局确定后，
 * Chromium 经 preferred-size-changed 事件回报「容纳文档无需滚动的最小尺寸」，clamp 到
 * [min,max] 区间重新 setBounds 并通知 UI（字体/异步内容变化会持续触发，天然收敛）。
 *
 * 锚点 anchor 是 UI 层坐标系（CSS 像素），通常为图标按钮的 {left, bottom}。
 * openDevTools=true 时（扩展管理页「检查 popup」触发），在 did-finish-load 后以独立窗口
 * 打开 devtools，方便调试 popup（Chrome 行为）。
 * 会先关闭已存在的 popup（切换不同扩展时）。
 */
async function openPopup(extId: string, url: string, anchor: { x: number; y: number }, openDevTools = false): Promise<void> {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  // 切换扩展 / 重复打开：先关掉旧的
  if (popupView) closePopup();

  // popup 用普通网页同款 prefs（同 partition、sandbox），但额外开启 enablePreferredSizeMode：
  // 让 Chromium 计算「容纳文档布局无需滚动的最小尺寸」（preferredSize），并通过
  // preferred-size-changed 事件回报。这是扩展 popup 内容自适应的正确语义——
  // 不受响应式布局（body width:100%）撑满视口的干扰。
  const view = new WebContentsView({
    webPreferences: { ...webPrefsForSrc(url), enablePreferredSizeMode: true }
  });
  popupView = view;

  const winBounds = mainWindow.getBounds();

  // 按宽高计算定位（右溢出贴右边 / 下溢出贴下边），返回完整 Rectangle。
  const layoutFor = (nw: number, nh: number): Rectangle => {
    let x = Math.round(anchor.x);
    let y = Math.round(anchor.y);
    if (x + nw > winBounds.width) x = Math.max(0, winBounds.width - nw);
    if (y + nh > winBounds.height) y = Math.max(0, winBounds.height - nh);
    return { x, y, width: nw, height: nh };
  };

  // 初始尺寸用最小值：给内容一个能容纳最小尺寸的初始视口，Chromium 才会正确算出首选尺寸
  // （参考 electron-browser-shell：「Set small initial size so the preferred size grows to what's needed」）。
  // 这样 popup 一开始就小，不会先撑满再收缩出现大块空白。
  popupRect = layoutFor(POPUP_MIN_W, POPUP_MIN_H);
  try { view.setBounds(popupRect); } catch (e) { console.warn('[viewManager] popup setBounds failed', e); }

  // 加入窗口并置顶（最后 addChildView → 位于 UI view 之上）
  try {
    mainWindow.contentView.addChildView(view);
  } catch (e) {
    console.warn('[viewManager] popup addChildView failed', e);
  }

  // Chromium 在内容布局确定/变化时（含字体加载、异步 DOM、JS 动态注入）持续触发此事件，
  // 天然实现多帧收敛，无需手写定时器轮询。
  view.webContents.on('preferred-size-changed', (_e, preferredSize: Electron.Size) => {
    if (popupView !== view || popupView.webContents.isDestroyed()) return;
    const nw = Math.min(POPUP_MAX_W, Math.max(POPUP_MIN_W, Math.round(preferredSize.width) || POPUP_MIN_W));
    // 高度加 1px 容差：preferredSize 偶尔少算边界像素，导致内容刚好溢出触发不必要的滚动条
    const nh = Math.min(POPUP_MAX_H, Math.max(POPUP_MIN_H, Math.round(preferredSize.height) + 1 || POPUP_MIN_H));
    popupRect = layoutFor(nw, nh);
    try { view.setBounds(popupRect); } catch (e) { console.warn('[viewManager] popup preferred setBounds failed', e); }
    // 通知 UI 实测尺寸（UI 据此绘制阴影装饰）
    if (uiView && !uiView.webContents.isDestroyed()) {
      try { uiView.webContents.send('popup-measured', popupRect); } catch (_) {}
    }
  });

  // 注入 CSS 让 popup 滚动条不占布局空间（overlay 风格，贴近 Chrome 真实 popup 行为）。
  // 经典滚动条会占 ~15px 宽度，在尺寸卡的极限的 popup 上会导致内容换行 → 高度增加 → 出现
  // 不必要的垂直滚动条 → 「去掉滚动条就不能滚」的现象。隐藏滚动条后 Chromium 计算 preferredSize
  // 时也不再计入滚动条宽度，从根上消除恶性循环（滚动能力保留，仅不显示）。
  const injectPopupScrollbarCSS = (): void => {
    if (popupView !== view || popupView.webContents.isDestroyed()) return;
    const css = `
      html, body { scrollbar-width: none !important; -ms-overflow-style: none !important; }
      html::-webkit-scrollbar, body::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }
      *::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
    `;
    view.webContents.insertCSS(css).catch((e) => {
      console.warn('[viewManager] popup insertCSS failed', extId, e);
    });
  };
  view.webContents.on('dom-ready', injectPopupScrollbarCSS);
  view.webContents.on('did-finish-load', injectPopupScrollbarCSS);

  // 扩展管理页「检查 popup」：内容加载完成后以独立窗口打开 devtools（Chrome 行为）。
  if (openDevTools) {
    view.webContents.once('did-finish-load', () => {
      try { view.webContents.openDevTools({ mode: 'detach' }); } catch (e) {
        console.warn('[viewManager] popup openDevTools failed', extId, e);
      }
    });
  }

  // 加载 popup 内容前，先确保 MV3 service worker 已就绪（避免 popup 首条 sendMessage 踩空 →
  // "Receiving end does not exist"）。由 extensions.ts 经 lifecycleHooks 注入，解环。
  if (lifecycleHooks.onPopupOpened) {
    try { await lifecycleHooks.onPopupOpened(extId); } catch (_) { /* 失败不阻塞 */ }
  }

  try {
    view.webContents.loadURL(url).catch((e) => {
      console.warn('[viewManager] popup loadURL failed', extId, url, e);
      closePopup();
    });
  } catch (e) {
    console.warn('[viewManager] popup loadURL threw', extId, url, e);
    closePopup();
  }
}

/** 关闭扩展 popup 浮层：销毁 view、清空状态、通知 UI。 */
function closePopup(): void {
  popupPinned = false;
  if (popupView) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      try { mainWindow.contentView.removeChildView(popupView); } catch (_) {}
    }
    try {
      const wc = popupView.webContents as Electron.WebContents & { destroy?: () => void };
      if (!wc.isDestroyed() && wc.destroy) wc.destroy();
    } catch (_) {}
    popupView = null;
  }
  popupRect = null;
  if (uiView && !uiView.webContents.isDestroyed()) {
    try { uiView.webContents.send('popup-closed'); } catch (_) {}
  }
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
    // 通知扩展宿主：活动标签变化（扩展的 tabs.onActiveChanged 等依赖此）
    if (tabId) lifecycleHooks.onCurrentTabChanged?.(tabId);
  });

  ipcMain.handle('set-page-rect', (_e, rect: Rectangle) => {
    pageRect = rect;
    relayout();
  });

  ipcMain.handle('set-modal-open', (_e, open: boolean) => {
    modalOpen = open;
  });

  // —— 扩展 popup 浮层生命周期 ——
  // popup 打开期间 modalOpen 必须为 true（UI 侧负责设置），否则输入会被转发到下层网页。
  ipcMain.handle('popup-open', (_e, extId: string, url: string, anchor: { x: number; y: number }) => {
    if (typeof extId !== 'string' || typeof url !== 'string' || !anchor) return;
    openPopup(extId, url, anchor);
  });
  ipcMain.handle('popup-close', () => {
    closePopup();
  });
  // 扩展管理页「检查 popup」：弹出 popup + 立即开 devtools。
  // 从管理页触发没有图标坐标，用窗口左上角作为默认锚点（popup 出现在可见区域即可，
  // devtools 为独立窗口，位置不影响调试）。openDevTools 模式下 popup 被「钉住」，
  // 主窗口 blur 不会自动关闭它（否则 devtools 窗口出现即触发失焦 → popup 被销毁）。
  ipcMain.handle('popup-open-devtools', (_e, extId: string, url: string) => {
    if (typeof extId !== 'string' || typeof url !== 'string') return;
    const winBounds = win.getBounds();
    openPopup(extId, url, { x: 16, y: Math.min(80, Math.max(16, winBounds.height - POPUP_MAX_H - 16)) }, true);
    popupPinned = true;
  });

  // 主窗口失焦时关闭 popup（贴近 Chrome 行为：切到其它应用 popup 消失）。
  // 但「检查 popup」模式（popupPinned）下不关闭，否则 devtools 窗口出现会立即销毁 popup。
  win.on('blur', () => { if (!popupPinned) closePopup(); });

  // 滚轮事件转发：renderer 侧 DOM wheel 事件 → 主进程 → sendInputEvent 到网页 view。
  // popup 打开时：坐标在 popup 矩形内 → 转发给 popup view（不应用自然滚动反转，popup 跟随系统）；
  //              其余坐标忽略（modalOpen 阻断，且 popup 外部滚轮应被遮罩吸收不触达下层网页）。
  ipcMain.handle('forward-wheel', (_e, event: { deltaX: number; deltaY: number; deltaMode: number; x: number; y: number }) => {
    if (popupView && popupRect && !popupView.webContents.isDestroyed() &&
      pointInRect(event.x, event.y, popupRect)) {
      try {
        popupView.webContents.sendInputEvent({
          type: 'mouseWheel',
          x: event.x - popupRect.x,
          y: event.y - popupRect.y,
          deltaX: event.deltaX,
          deltaY: event.deltaY,
          canScroll: true
        });
      } catch (_) {}
      return;
    }
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
