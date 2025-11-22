import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import icon from '../../resources/icon.png?asset';
import { MenuTemplate } from './menu';
import { Menu } from 'electron';
import { loadFaviconEvents } from './favicon';
import { loadWebContentEvents } from './webcontent';
import { loadStoreEvents } from './storage';

function createWindow(): void {
  const isMac = process.platform === 'darwin';

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 720,
    show: false,
    ...(isMac ? {
      titleBarStyle: 'hidden',
      trafficLightPosition: { x: 17, y: 17 }
    } : {
      frame: false
    }),
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webviewTag: true,
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
      partition: 'persist:shared-partition'
    }
  });

  const menu = Menu.buildFromTemplate(MenuTemplate(mainWindow));
  Menu.setApplicationMenu(menu);

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  ipcMain.handle('is-maximized', () => {
    return mainWindow.isMaximized();
  });

  ipcMain.handle('maximize', () => {
    mainWindow.maximize();
  });

  ipcMain.handle('minimize', () => {
    mainWindow.minimize();
  });

  ipcMain.handle('unmaximize', () => {
    mainWindow.unmaximize();
  });

  ipcMain.handle('close', () => {
    mainWindow.close();
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
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

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
