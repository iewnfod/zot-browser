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
