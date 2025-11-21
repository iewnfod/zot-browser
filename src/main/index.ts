import { app, shell, BrowserWindow, ipcMain, screen, dialog } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import icon from '../../resources/icon.png?asset';
import { MenuTemplate } from './menu';
import { Menu } from 'electron';
import { getFaviconBase64 } from './favicon';

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

  const menu = Menu.buildFromTemplate(MenuTemplate(mainWindow));
  Menu.setApplicationMenu(menu);
  // mainWindow.setMenu(menu);

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
    const url = details.url;
    try {
      if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        try {
          mainWindow.webContents.send('open-url-in-new-tab', url);
          console.info('[setWindowOpenHandler] Forwarded url to renderer to open in new tab:', url);
        } catch (sendErr) {
          console.error('[setWindowOpenHandler] Failed to send IPC to renderer, opening externally:', sendErr);
          shell.openExternal(url);
        }
      } else {
        // For non-http(s) schemes (mailto:, tel:, etc.), open externally
        shell.openExternal(url);
      }
    } catch (e) {
      console.error('[setWindowOpenHandler] Error handling new-window request:', e);
      try {
        shell.openExternal(url);
      } catch (_) {}
    }

    return { action: 'deny' };
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.iewnfod.zot-browser');

  const promptingFingerprints = new Set<string>();
  const lastKnownURL = new Map<number, string>();

  app.on('web-contents-created', (_event, contents) => {
    contents.on('did-navigate', (_event, url) => {
      try {
        lastKnownURL.set(contents.id, url);
      } catch (e) {
        console.error('Error saving lastKnownURL in did-navigate:', e);
      }
    });

    contents.on('did-navigate-in-page', (_event, url) => {
      try {
        lastKnownURL.set(contents.id, url);
      } catch (e) {
        console.error('Error saving lastKnownURL in did-navigate-in-page:', e);
      }
    });
    contents.on('destroyed', () => {
      lastKnownURL.delete(contents.id);
    });

    try {
      contents.setWindowOpenHandler((details) => {
        const url = details.url;
        try {
          const hostWC = (contents as any).hostWebContents as Electron.WebContents | undefined;
          const targetHost = hostWC || contents;
          const parentWindow = BrowserWindow.fromWebContents(targetHost) || BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];

          if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
            if (parentWindow && !parentWindow.isDestroyed()) {
              try {
                parentWindow.webContents.send('open-url-in-new-tab', url);
                console.info('[web-contents-created.setWindowOpenHandler] Forwarded url to renderer to open in new tab:', url);
              } catch (sendErr) {
                console.error('[web-contents-created.setWindowOpenHandler] Failed to send IPC to renderer, opening externally:', sendErr);
                shell.openExternal(url).catch(() => {});
              }
            } else {
              shell.openExternal(url).catch(() => {});
            }
          } else {
            shell.openExternal(url).catch(() => {});
          }
        } catch (e) {
          console.error('[web-contents-created.setWindowOpenHandler] Error handling new-window request:', e);
          try { shell.openExternal(details.url).catch(() => {}); } catch (_) {}
        }

        return { action: 'deny' };
      });
    } catch (e) {
      // eslint-disable-next-line no-empty
    }
  });

  app.on('certificate-error', async (event, webContents, url, error, certificate, callback) => {
    event.preventDefault();
    try {
      const allowList: string[] = store.get('allowedCertificates', []) || [];
      const fp = certificate.fingerprint;
      console.warn('[certificate-error] 捕获到证书错误', { url, error, fingerprint: fp, subject: certificate.subjectName });

      if (allowList.includes(fp)) {
        console.info('[certificate-error] 指纹已在允许列表中，直接放行:', fp);
        callback(true);
        return;
      }

      if (promptingFingerprints.has(fp)) {
        console.info('[certificate-error] 已有弹窗等待用户操作，暂时阻止加载并保持当前内容:', fp);
        callback(false);
        return;
      }

      promptingFingerprints.add(fp);

      const expiry = certificate.validExpiry ? new Date(certificate.validExpiry * 1000).toLocaleString() : '未知';
      const start = certificate.validStart ? new Date(certificate.validStart * 1000).toLocaleString() : '未知';

      const focusedWindow = BrowserWindow.getFocusedWindow();

      const dialogOptions: Electron.MessageBoxOptions = {
        type: 'warning',
        title: '不安全的 HTTPS 证书',
        message: '无法验证该网站的安全证书，可能存在安全风险。',
        detail: `URL: ${url}\n错误: ${error}\n\n主题: ${certificate.subjectName}\n颁发者: ${certificate.issuerName}\n有效期: ${start} - ${expiry}\n指纹: ${fp}\n\n如果你信任该站点，可以选择继续访问。否则请返回。`,
        buttons: ['继续访问 (信任并记住)', '返回'],
        defaultId: 1,
        cancelId: 1,
        noLink: true
      };

      const { response } = focusedWindow
        ? await dialog.showMessageBox(focusedWindow, dialogOptions)
        : await dialog.showMessageBox(dialogOptions);

      promptingFingerprints.delete(fp);

      if (response === 0) {
        console.info('[certificate-error] 用户选择继续访问, 记录指纹:', fp);
        allowList.push(fp);
        store.set('allowedCertificates', allowList);
        callback(true);
      } else {
        console.info('[certificate-error] 用户选择返回，取消加载并尝试后退或恢复到上一个已知页面:', fp);
        callback(false);

        setTimeout(() => {
          try {
            if (webContents && !webContents.isDestroyed()) {
              if (webContents.canGoBack()) {
                webContents.goBack();
              } else {
                const lastUrl = lastKnownURL.get(webContents.id);
                if (lastUrl && lastUrl !== 'about:blank') {
                  webContents.loadURL(lastUrl).catch((loadErr) => {
                    console.error('[certificate-error] 加载上一个已知页面失败:', loadErr);
                  });
                } else {
                  console.info('[certificate-error] 无可用的上一个 URL，保持当前页面状态');
                }
              }
            }
          } catch (navErr) {
            console.error('[certificate-error] 处理返回导航时出错:', navErr);
          }
        }, 10);
      }
    } catch (e) {
      console.error('处理证书错误时出错:', e);
      callback(false);
    }
  });

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  ipcMain.on('ping', () => console.log('pong'));

  ipcMain.handle('get-favicon', async (_event, url: string) => {
    return getFaviconBase64(url);
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
