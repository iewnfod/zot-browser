import { ipcMain } from 'electron';
import { getUiView } from './viewManager';

const Store = require('electron-store').default;
export const store = new Store();

export function loadStoreEvents() {
  ipcMain.handle('store-get', async (_, key) => {
    return store.get(key);
  });

  ipcMain.handle('store-set', async (_, key, value) => {
    store.set(key, value);
    // settings 被任何页面（如 zot://settings）改写后，广播给主 UI 使其即时应用
    if (key === 'settings') {
      const uv = getUiView();
      uv?.webContents.send('settings-changed', value);
      // 语言随 settings 携带：触发主进程重建应用菜单（index.ts 监听）
      ipcMain.emit('rebuild-application-menu');
    }
    return true;
  });

  ipcMain.handle('store-has', async (_, key) => {
    return store.has(key);
  });

  ipcMain.handle('store-delete', async (_, key) => {
    return store.delete(key);
  });
}
