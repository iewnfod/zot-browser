import { app, shell, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import icon from '../../resources/icon.png?asset';
import * as http from 'node:http';
import * as https from 'node:https';
import { Buffer } from 'node:buffer';

const Store = require('electron-store').default;
const store = new Store();

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
      spellcheck: false
    }
  });

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

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.iewnfod.zot-browser');

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  ipcMain.on('ping', () => console.log('pong'));

  ipcMain.handle('get-favicon', async (_event, url: string) => {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      protocol.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to fetch favicon. HTTP status code ${response.statusCode}`));
          return;
        }
        const chunks: any[] = [];
        response.on('data', (chunk) => {chunks.push(chunk);});
        response.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const contentType = response.headers['content-type'] || 'image/x-icon';
          const dataUrl = `data:${contentType};base64,${buffer.toString('base64')}`;
          resolve(dataUrl);
        });
      }).on('error', (err) => {
        reject(err);
      });
    });
  });

  ipcMain.handle('store-get', async (_, key) => {
    return store.get(key);
  });

  ipcMain.handle('store-set', async (_, key, value) => {
    store.set(key, value);
    return true;
  });

  ipcMain.handle('store-has', async (_, key) => {
    return store.has(key);
  });

  ipcMain.handle('store-delete', async (_, key) => {
    return store.delete(key);
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
