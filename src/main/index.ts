import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { electronApp, optimizer } from '@electron-toolkit/utils';
import icon from '../../resources/icon.png?asset';
import { MenuTemplate } from './menu';
import { Menu } from 'electron';
import { loadFaviconEvents } from './favicon';
import { loadWebContentEvents } from './webcontent';
import { loadStoreEvents } from './storage';
import { initViewManager, setOverlayWindow } from './viewManager';
import { createOverlayWindow } from './overlayWindow';

// Linux 下强制 X11（XWayland），保证透明窗口 + 点击穿透 + 置顶可用。
// 必须在 app.whenReady 之前注入。
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('ozone-platform-hint', 'x11');
}

/**
 * 底层窗口：普通不透明窗口，只承载 WebContentsView（网页）。
 * 不加载任何 React/HTML —— UI 全部在覆盖窗口。
 * 注意：底层不能 transparent:true，否则透明窗口下 WebContentsView 渲染不可靠。
 * 需要透明的是覆盖窗口（透过它的透明区域看到底层网页）。
 */
function createPageWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin';

  const pageWindow = new BrowserWindow({
    width: 1200,
    height: 720,
    show: false,
    hasShadow: false,
    ...(isMac
      ? {
          titleBarStyle: 'hidden',
          trafficLightPosition: { x: 17, y: 17 }
        }
      : {
          frame: false
        }),
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      // 底层不加载 UI，无需 preload；用最小配置
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false
    }
  });

  // 底层窗口不加载任何 URL（about:blank），ready-to-show 不会触发，
  // 所以直接 show，不依赖首次绘制完成。
  pageWindow.show();

  // 窗口控制 IPC（操作底层窗口）
  ipcMain.handle('is-maximized', () => {
    return pageWindow.isMaximized();
  });

  ipcMain.handle('maximize', () => {
    pageWindow.maximize();
  });

  ipcMain.handle('minimize', () => {
    pageWindow.minimize();
  });

  ipcMain.handle('unmaximize', () => {
    pageWindow.unmaximize();
  });

  ipcMain.handle('close', () => {
    pageWindow.close();
  });

  ipcMain.handle('focus', () => {
    pageWindow.focus();
  });

  // 注意：底层窗口不 loadURL/loadFile —— 它只是 WebContentsView 的透明宿主。

  return pageWindow;
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.iewnfod.zot-browser');

  loadWebContentEvents();

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  ipcMain.on('ping', () => console.log('pong'));

  loadFaviconEvents();

  loadStoreEvents();

  ipcMain.handle('scale-factor', () => {
    return screen.getPrimaryDisplay().scaleFactor;
  });

  const pageWindow = createPageWindow();
  initViewManager(pageWindow);

  const overlayWindow = createOverlayWindow(pageWindow);
  // viewManager 把 view-* 事件发往覆盖窗口；菜单/新标签等 UI 事件也发往覆盖窗口
  // 覆盖窗口加载完 UI 后会主动与底层同步
  setOverlayWindow(overlayWindow);

  // 菜单事件发往覆盖窗口（所有 UI 都在那）；对话框挂载到可聚焦的底层窗口
  const menu = Menu.buildFromTemplate(MenuTemplate(overlayWindow, pageWindow));
  Menu.setApplicationMenu(menu);

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      const pw = createPageWindow();
      initViewManager(pw);
      const ow = createOverlayWindow(pw);
      setOverlayWindow(ow);
      const m = Menu.buildFromTemplate(MenuTemplate(ow, pw));
      Menu.setApplicationMenu(m);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
