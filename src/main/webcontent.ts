import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { store } from './storage';
import { asyncCheck } from './time';

export function loadWebContentEvents() {
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

    contents.setWindowOpenHandler((details) => {
      const url = details.url;
      try {
        const hostWC = (contents as any).hostWebContents as Electron.WebContents | undefined;
        const targetHost = hostWC || contents;
        const parentWindow = BrowserWindow.fromWebContents(targetHost) || BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];

        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
          if (parentWindow && !parentWindow.isDestroyed()) {
            parentWindow.webContents.send('open-url-in-new-tab', url);
            console.info('[web-contents-created.setWindowOpenHandler] Forwarded url to renderer to open in new tab:', url);
          }
        } else {
          shell.openExternal(url).catch(() => {});
          console.info('[web-contents-created.setWindowOpenHandler] Not a webpage, use shell open:', url);
        }
      } catch (e) {
        console.error('[web-contents-created.setWindowOpenHandler] Error handling new window request:', e);
        try { shell.openExternal(details.url).catch(() => {}); } catch (_) {}
      }

      return { action: 'deny' };
    });
  });

  app.on('certificate-error', async (event, webContents, url, error, certificate, callback) => {
    event.preventDefault();
    try {
      const allowList: string[] = store.get('allowedCertificates', []) || [];
      const fp = certificate.fingerprint;
      console.warn('[certificate-error] catch certificate error', { url, error, fingerprint: fp, subject: certificate.subjectName });

      if (allowList.includes(fp)) {
        console.info('[certificate-error] fingerprint in allow list, continue:', fp);
        callback(true);
        return;
      }

      if (promptingFingerprints.has(fp)) {
        console.info('[certificate-error] dialog window for user, stop to load new contents:', fp);
        callback(false);
        return;
      }

      promptingFingerprints.add(fp);

      const expiry = certificate.validExpiry ? new Date(certificate.validExpiry * 1000).toLocaleString() : 'Unknown';
      const start = certificate.validStart ? new Date(certificate.validStart * 1000).toLocaleString() : 'Unknown';

      const mainWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];

      console.log('[certificate-error] request frontend to open insecure https certificate error modal');
      mainWindow.webContents.send('open-insecure-https-certificate-modal', {
        url, error,
        subjectName: certificate.subjectName,
        issuerName: certificate.issuerName,
        expiry: `${start} - ${expiry}`,
        fingerPrint: fp
      });

      let response = -1;
      ipcMain.once("insecure-https-certificate-modal-response", (_e, res) => {
        response = res;
      });

      asyncCheck(
        () => response === -1,
        () => {
          promptingFingerprints.delete(fp);

          if (response === 0) {
            console.info('[certificate-error] continue access, record fingerprint:', fp);
            allowList.push(fp);
            store.set('allowedCertificates', allowList);
            callback(true);
          } else {
            console.info('[certificate-error] return，load back to last known page:', fp);
            callback(false);

            setTimeout(() => {
              try {
                if (webContents && !webContents.isDestroyed()) {
                  if (webContents.navigationHistory.canGoBack()) {
                    webContents.navigationHistory.goBack();
                  } else {
                    const lastUrl = lastKnownURL.get(webContents.id);
                    if (lastUrl && lastUrl !== 'about:blank') {
                      webContents.loadURL(lastUrl).catch((loadErr) => {
                        console.error('[certificate-error] failed to load last page:', loadErr);
                      });
                    } else {
                      console.info('[certificate-error] no last known URL, keep in current page');
                    }
                  }
                }
              } catch (navErr) {
                console.error('[certificate-error] navigation error:', navErr);
              }
            }, 10);
          }
        },
      );
    } catch (e) {
      console.error('failed to solve certificate:', e);
      callback(false);
    }
  });
}
