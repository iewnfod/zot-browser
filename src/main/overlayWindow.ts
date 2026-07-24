import { BrowserWindow, ipcMain, screen } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';

/**
 * 透明覆盖窗口：承载全部 UI（侧栏、标签、模态框、圆角遮罩、阴影、未来的命令栏）。
 * 精确叠加在底层 page window 之上；点击默认穿透到底层网页，仅在 UI 元素处接收点击。
 */
export function createOverlayWindow(pageWindow: BrowserWindow): BrowserWindow {
  const isMac = process.platform === 'darwin';
  const [x, y] = pageWindow.getPosition();
  const [width, height] = pageWindow.getSize();

  const overlay = new BrowserWindow({
    x,
    y,
    width,
    height,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: true,
    skipTaskbar: true,
    focusable: false,
    fullscreenable: false,
    ...(isMac
      ? {
          hiddenInMissionControl: true,
          visibleOnAllWorkspaces: true
        }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false
    }
  });

  // 默认点击穿透（主进程轮询会持续调整）
  overlay.setIgnoreMouseEvents(true, { forward: true });

  // 加载 UI（与原主窗口相同的 renderer bundle）
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    overlay.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    overlay.loadFile(join(__dirname, '../renderer/index.html'));
  }

  overlay.once('ready-to-show', () => {
    overlay.show();
  });

  syncWithPageWindow(pageWindow, overlay);
  registerInteractiveHandler(overlay, pageWindow);

  return overlay;
}

/** 底层窗口事件镜像到覆盖窗口，保持两窗口位置/大小/可见性同步。 */
function syncWithPageWindow(page: BrowserWindow, overlay: BrowserWindow): void {
  // 同步 bounds（screen 坐标）
  const syncBounds = (): void => {
    if (page.isDestroyed() || overlay.isDestroyed()) return;
    overlay.setBounds(page.getBounds());
  };

  // 位置/尺寸跟随（这两个事件不会引发反馈循环）
  page.on('move', syncBounds);
  page.on('resize', syncBounds);

  // 最小化/恢复跟随
  page.on('minimize', () => {
    if (!overlay.isDestroyed()) overlay.hide();
  });
  page.on('restore', () => {
    if (!overlay.isDestroyed()) {
      overlay.show();
      syncBounds();
    }
  });

  // 最大化/还原/全屏后重新对齐 bounds
  page.on('maximize', () => syncBounds());
  page.on('unmaximize', () => syncBounds());
  page.on('enter-full-screen', () => syncBounds());
  page.on('leave-full-screen', () => syncBounds());

  // 焦点同步：应用聚焦时显示覆盖层；失焦时隐藏，避免浮在别的应用上。
  // 关键：必须用 showInactive（不抢焦点），绝不能用 moveTop（X11 下会抢焦点触发底层 blur 循环）。
  // z-order 靠窗口创建顺序保证（覆盖窗口后创建=在上层）。
  page.on('focus', () => {
    if (!overlay.isDestroyed() && !overlay.isVisible()) {
      overlay.showInactive();
    }
  });
  page.on('blur', () => {
    if (!overlay.isDestroyed() && overlay.isVisible()) {
      overlay.hide();
    }
  });

  // 底层关闭时销毁覆盖窗口
  page.on('closed', () => {
    if (!overlay.isDestroyed()) overlay.destroy();
  });

  // DPI/scaleFactor 变化（切显示器）时重同步
  screen.on('display-metrics-changed', () => syncBounds());
}

/**
 * 点击穿透切换（主进程轮询方案）。
 *
 * 背景：X11 下 setIgnoreMouseEvents(true,{forward:true}) 的 mousemove 转发不可靠，
 * 覆盖窗口 renderer 收不到 mousemove，无法用 elementFromPoint 自行判断。
 *
 * 方案：覆盖窗口 renderer 把"需要接收点击的矩形区域"（侧栏、顶部条等）通过 IPC 上报，
 * 主进程轮询 screen.getCursorScreenPoint()，判断光标是否落在这些区域内：
 *   - 在 UI 区域内 / 有模态框 → setIgnoreMouseEvents(false)（接收）
 *   - 否则 → setIgnoreMouseEvents(true, {forward:true})（穿透到网页）
 */
function registerInteractiveHandler(overlay: BrowserWindow, page: BrowserWindow): void {
  // renderer 上报的 UI 区域（相对窗口左上角的 CSS 像素坐标）
  let uiRects: Array<{ x: number; y: number; width: number; height: number }> = [];
  let modalOpen = false;
  let currentIgnore = true;

  const apply = (ignore: boolean): void => {
    if (overlay.isDestroyed() || ignore === currentIgnore) return;
    currentIgnore = ignore;
    if (ignore) {
      overlay.setIgnoreMouseEvents(true, { forward: true });
    } else {
      overlay.setIgnoreMouseEvents(false);
    }
  };

  // renderer 上报 UI 区域
  ipcMain.handle('set-ui-rects', (_e, rects: Array<{ x: number; y: number; width: number; height: number }>) => {
    uiRects = rects || [];
  });

  // renderer 通知模态框开关
  ipcMain.handle('set-modal-open', (_e, open: boolean) => {
    modalOpen = open;
  });

  // 轮询光标位置，判断是否在 UI 区域内
  setInterval(() => {
    if (overlay.isDestroyed() || page.isDestroyed() || !overlay.isVisible()) return;

    // 模态框打开时始终接收
    if (modalOpen) {
      apply(false);
      return;
    }

    const cursor = screen.getCursorScreenPoint();
    const winBounds = page.getBounds();

    // 光标必须在窗口内
    if (
      cursor.x < winBounds.x || cursor.x > winBounds.x + winBounds.width ||
      cursor.y < winBounds.y || cursor.y > winBounds.y + winBounds.height
    ) {
      apply(true); // 窗口外，保持穿透
      return;
    }

    // 转为窗口内相对坐标
    const relX = cursor.x - winBounds.x;
    const relY = cursor.y - winBounds.y;

    // 检查是否落在任一 UI 区域内
    const inUi = uiRects.some(
      (r) => relX >= r.x && relX <= r.x + r.width && relY >= r.y && relY <= r.y + r.height
    );
    apply(!inUi);
  }, 50);
}
