import MenuItemConstructorOptions = Electron.MenuItemConstructorOptions;
import MenuItem = Electron.MenuItem;
import { BrowserWindow, dialog } from 'electron';

const Store = require('electron-store').default;
const menuStore = new Store();

function emitEvent(window: BrowserWindow, eventName: string, ...args: any[]) {
  console.log(`Emit ${eventName}`);
  window.webContents.send(eventName, ...args);
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
          click: () => emitEvent(mainWindow, 'menu-toggle-sidebar')
        },
      ]
    },
    {
      label: 'Tab',
      submenu: [
        {
          label: 'New Tab',
          accelerator: 'CmdOrCtrl+T',
          click: () => emitEvent(mainWindow, 'menu-new-tab')
        },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => emitEvent(mainWindow, 'menu-close-tab')
        },
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => emitEvent(mainWindow, 'menu-reload-tab')
        },
        {
          label: 'Go Back',
          accelerator: 'CmdOrCtrl+[',
          click: () => emitEvent(mainWindow, 'menu-tab-go-back')
        },
        {
          label: 'Go Forward',
          accelerator: 'CmdOrCtrl+]',
          click: () => emitEvent(mainWindow, 'menu-tab-go-forward')
        },
        {
          label: 'Select',
          submenu: [
            {
              label: 'Tab 1',
              accelerator: 'CmdORCtrl+1',
              click: () => emitEvent(mainWindow, 'menu-select-tab', 0)
            },
            {
              label: 'Tab 2',
              accelerator: 'CmdORCtrl+2',
              click: () => emitEvent(mainWindow, 'menu-select-tab', 1)
            },
            {
              label: 'Tab 3',
              accelerator: 'CmdORCtrl+3',
              click: () => emitEvent(mainWindow, 'menu-select-tab', 2)
            },
            {
              label: 'Tab 4',
              accelerator: 'CmdORCtrl+4',
              click: () => emitEvent(mainWindow, 'menu-select-tab', 3)
            },
            {
              label: 'Tab 5',
              accelerator: 'CmdORCtrl+5',
              click: () => emitEvent(mainWindow, 'menu-select-tab', 4)
            },
            {
              label: 'Tab 6',
              accelerator: 'CmdORCtrl+6',
              click: () => emitEvent(mainWindow, 'menu-select-tab', 5)
            },
            {
              label: 'Tab 7',
              accelerator: 'CmdORCtrl+7',
              click: () => emitEvent(mainWindow, 'menu-select-tab', 6)
            },
            {
              label: 'Tab 8',
              accelerator: 'CmdORCtrl+8',
              click: () => emitEvent(mainWindow, 'menu-select-tab', 7)
            },
            {
              label: 'Last Tab',
              accelerator: 'CmdORCtrl+9',
              click: () => emitEvent(mainWindow, 'menu-select-last-tab')
            },
          ]
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
          click: () => emitEvent(mainWindow, 'menu-open-electron-developer')
        },
        { type: 'separator' },
        {
          label: 'Clear Trusted Certificates',
          click: async () => {
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
