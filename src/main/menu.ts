import MenuItemConstructorOptions = Electron.MenuItemConstructorOptions;
import MenuItem = Electron.MenuItem;
import {BrowserWindow, dialog, ipcMain} from 'electron';
import { getUiView } from './viewManager';

const Store = require('electron-store').default;
const menuStore = new Store();

function emitEvent(eventName: string, ...args: unknown[]) {
  console.log(`Emit ${eventName}`);
  const uv = getUiView();
  if (uv && !uv.webContents.isDestroyed()) {
    uv.webContents.send(eventName, ...args);
  }
}

function emitMainEvent(eventName: string, ...args: unknown[]) {
  console.log(`Emit Main ${eventName}`);
  ipcMain.emit(eventName, args);
}

export function MenuTemplate(mainWindow: BrowserWindow) {
  const MenuTemplate: (MenuItemConstructorOptions | MenuItem)[] = [
    {
      label: 'Zot Browser',
      role: 'appMenu'
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Copy', role: 'copy' },
        { label: 'Paste', role: 'paste' },
        { label: 'Undo', role: 'undo' },
        { label: 'Redo', role: 'redo' },
        { label: 'Select All', role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle SideBar',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => emitEvent('menu-toggle-sidebar')
        },
      ]
    },
    {
      label: 'Tab',
      submenu: [
        {
          label: 'New Tab',
          accelerator: 'CmdOrCtrl+T',
          click: () => emitEvent('menu-new-tab')
        },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => emitEvent('menu-close-tab')
        },
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => emitEvent('menu-reload-tab')
        },
        {
          label: 'Go Back',
          accelerator: 'CmdOrCtrl+[',
          click: () => emitEvent('menu-tab-go-back')
        },
        {
          label: 'Go Forward',
          accelerator: 'CmdOrCtrl+]',
          click: () => emitEvent('menu-tab-go-forward')
        },
        {
          label: 'Select',
          submenu: Array(9).map((i) => {
            if (i == 8) {
              return {
                label: 'Last Tab',
                accelerator: 'CmdOrCtrl+9',
                click: () => emitEvent('menu-select-last-tab')
              };
            } else {
              return {
                label: `Tab ${i+1}`,
                accelerator: `CmdORCtrl+${i+1}`,
                click: () => emitEvent('menu-select-tab', i)
              };
            }
          })
        }
      ]
    },
    {
      label: 'Develop',
      submenu: [
        { label: 'Developer Tools', accelerator: 'F12' },
        {
          label: 'Electron Developer Tools',
          accelerator: 'Shift+F12',
          click: () => emitEvent('menu-open-electron-developer')
        },
        {
          label: 'UI Developer Tools',
          accelerator: 'Shift+CmdOrCtrl+I',
          click: () => emitMainEvent('menu-open-ui-developer')
        },
        { type: 'separator' },
        {
          label: 'Clear Trusted Certificates',
          click: async () => {
            // 对话框挂载到主窗口
            const { response } = await dialog.showMessageBox(mainWindow, {
              type: 'question',
              title: '清除已信任证书',
              message: '确定要清除所有已信任的证书吗？',
              buttons: ['清除', '取消'],
              defaultId: 1,
              cancelId: 1,
              noLink: true,
            });
            if (response === 0) {
              menuStore.delete('allowedCertificates');
              await dialog.showMessageBox(mainWindow, {
                type: 'info',
                message: '已清除已信任的证书。',
                buttons: ['确定']
              });
            }
          }
        }
      ]
    }
  ];

  return MenuTemplate;
}
