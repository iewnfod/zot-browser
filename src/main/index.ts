import { app, BrowserWindow, ipcMain, screen, WebContentsView } from 'electron';
import { electronApp, is } from '@electron-toolkit/utils';
import { join } from 'path';
import { execSync } from 'child_process';
import icon from '../../resources/icon.png?asset';
import { MenuTemplate, currentMenuLocale } from './menu';
import { Menu } from 'electron';
import { loadFaviconEvents } from './favicon';
import { loadWebContentEvents } from './webcontent';
import { loadStoreEvents } from './storage';
import { initViewManager, setUiView } from './viewManager';
import { loadDownloadEvents } from './download';
import { loadExtensionEvents, loadAllEnabledOnBoot, initExtensionHost } from './extensions';
import { localeFromTag, type Locale } from '../renderer/src/lib/i18n';

// Linux 下强制 X11（XWayland），保证透明窗口可用。
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('ozone-platform-hint', 'x11');
}

// 应用显示名设为 "Zot Browser"（覆盖 package.json 的 npm 包名 zot-browser）。
// 影响：User-Agent 末尾的 <app>/<version>、系统里的应用显示名、错误对话框标题等。
// 注意：app.setName 会改变默认 userData 目录（基于 name），故先记下原路径，setName 后
// 立刻把 userData 钉回原处，避免用户已有数据（扩展 / 设置 / 下载历史）因改名而丢失。
// 三步都必须在 app.whenReady() 之前完成。
const originalUserData = app.getPath('userData');
app.setName('Zot Browser');
app.setPath('userData', originalUserData);

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

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.iewnfod.zot-browser');

  loadWebContentEvents();

  ipcMain.on('ping', () => console.log('pong'));

  loadFaviconEvents();
  loadStoreEvents();
  // 下载管理：监听网页触发的下载（partition 级）+ 暴露控制 IPC
  loadDownloadEvents();

  // 扩展系统：注册 IPC，并在首个网页 view 创建前加载已启用扩展，
  // 使其 content_scripts 能注入到 partition 下后续创建的所有网页 view。
  loadExtensionEvents();
  await loadAllEnabledOnBoot();

  ipcMain.handle('scale-factor', () => {
    return screen.getPrimaryDisplay().scaleFactor;
  });

  ipcMain.handle('get-natural-scroll', () => {
    return detectNaturalScroll();
  });

  // 读取系统语言并归一化为受支持的 Locale（zh* → 'zh-CN'，否则 'en'）。
  ipcMain.handle('get-system-locale', (): Locale => {
    return localeFromTag(app.getLocale());
  });

  const mainWindow = createMainWindow();
  initViewManager(mainWindow);

  const uiView = createUiView(mainWindow);
  ipcMain.on('menu-open-ui-developer', () => {
    uiView.webContents.openDevTools({ mode: 'detach' });
  });
  setUiView(uiView);

  // 初始化扩展宿主（提供 chrome.* API 兼容层）。必须在 UI view 就绪后、
  // 首张网页 view 创建前，以便 addTab 注册与 preload 注入都生效。
  await initExtensionHost();

  // 用当前生效语言构建应用菜单。
  const buildMenu = (): void => {
    const menu = Menu.buildFromTemplate(MenuTemplate(mainWindow, currentMenuLocale()));
    Menu.setApplicationMenu(menu);
  };
  buildMenu();

  // 语言切换时（settings 写入触发）重建应用菜单。
  // storage.ts 在 store-set('settings') 时会 ipcMain.emit 本事件。
  ipcMain.on('rebuild-application-menu', () => {
    if (!mainWindow.isDestroyed()) {
      buildMenu();
    }
  });

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      const mw = createMainWindow();
      initViewManager(mw);
      const uv = createUiView(mw);
      setUiView(uv);
      const m = Menu.buildFromTemplate(MenuTemplate(mw, currentMenuLocale()));
      Menu.setApplicationMenu(m);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
