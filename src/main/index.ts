import { app, BrowserWindow, ipcMain, screen, WebContentsView } from 'electron';
import { electronApp, is } from '@electron-toolkit/utils';
import { join } from 'path';
import { execSync } from 'child_process';
import icon from '../../resources/icon.png?asset';
import { MenuTemplate } from './menu';
import { Menu } from 'electron';
import { loadFaviconEvents } from './favicon';
import { loadWebContentEvents } from './webcontent';
import { loadStoreEvents } from './storage';
import { initViewManager, setUiView } from './viewManager';

// Linux 下强制 X11（XWayland），保证透明窗口可用。
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('ozone-platform-hint', 'x11');
}

/** 检测系统自然滚动偏好。macOS 下读取系统设置，其他平台返回 false。 */
function detectNaturalScroll(): boolean {
  if (process.platform === 'darwin') {
    try {
      const result = execSync('defaults read -g com.apple.swipescrolldirection', { encoding: 'utf8' }).trim();
      return result === '1' || result === 'true';
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * 创建透明 BrowserWindow，作为唯一窗口承载所有 WebContentsView。
 * UI view 在最上层（全窗口），网页 view 在下层（仅内容区域）。
 * 点击穿透由 viewManager 的 input-event 转发机制处理。
 */
function createMainWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin';

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 720,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    ...(isMac
      ? {
          titleBarStyle: 'hidden',
          trafficLightPosition: { x: 17, y: 17 }
        }
      : {}),
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false
    }
  });

  mainWindow.show();

  // 窗口控制 IPC
  ipcMain.handle('is-maximized', () => mainWindow.isMaximized());
  ipcMain.handle('maximize', () => mainWindow.maximize());
  ipcMain.handle('minimize', () => mainWindow.minimize());
  ipcMain.handle('unmaximize', () => mainWindow.unmaximize());
  ipcMain.handle('close', () => mainWindow.close());
  ipcMain.handle('focus', () => mainWindow.focus());

  return mainWindow;
}

/**
 * 创建 UI WebContentsView（React 前端），加载到最上层。
 * 输入事件转发由 setUiView → setupInputForwarding 处理。
 */
function createUiView(mainWindow: BrowserWindow): WebContentsView {
  const uiView = new WebContentsView({
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false
    }
  });

  // view 级别背景透明，让下层网页 view 透过来
  uiView.setBackgroundColor('#00000000');

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    uiView.webContents.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    uiView.webContents.loadFile(join(__dirname, '../renderer/index.html'));
  }

  const syncBounds = (): void => {
    if (mainWindow.isDestroyed()) return;
    const bounds = mainWindow.getBounds();
    uiView.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height });
  };
  syncBounds();
  mainWindow.on('resize', syncBounds);

  // 最后添加 = 最上层
  mainWindow.contentView.addChildView(uiView);

  return uiView;
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.iewnfod.zot-browser');

  loadWebContentEvents();

  ipcMain.on('ping', () => console.log('pong'));

  loadFaviconEvents();
  loadStoreEvents();

  ipcMain.handle('scale-factor', () => {
    return screen.getPrimaryDisplay().scaleFactor;
  });

  ipcMain.handle('get-natural-scroll', () => {
    return detectNaturalScroll();
  });

  const mainWindow = createMainWindow();
  initViewManager(mainWindow);

  const uiView = createUiView(mainWindow);
  ipcMain.on('menu-open-ui-developer', () => {
    uiView.webContents.openDevTools({ mode: 'detach' });
  });
  setUiView(uiView);

  const menu = Menu.buildFromTemplate(MenuTemplate(mainWindow));
  Menu.setApplicationMenu(menu);

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      const mw = createMainWindow();
      initViewManager(mw);
      const uv = createUiView(mw);
      setUiView(uv);
      const m = Menu.buildFromTemplate(MenuTemplate(mw));
      Menu.setApplicationMenu(m);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
