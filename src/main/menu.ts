import MenuItemConstructorOptions = Electron.MenuItemConstructorOptions;
import MenuItem = Electron.MenuItem;
import { BrowserWindow } from 'electron';

function emitEvent(window: BrowserWindow, eventName: string) {
  console.log(`Emit ${eventName}`);
  window.webContents.send(eventName);
}

export function MenuTemplate(mainWindow: BrowserWindow) {
  const MenuTemplate: (MenuItemConstructorOptions | MenuItem)[] = [
    {
      label: 'Edit',
      submenu: [
        { label: 'Copy', role: 'copy' },
        { label: 'Paste', role: 'paste' },
        { label: 'Undo', role: 'undo' },
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
      ]
    }
  ];

  return MenuTemplate;
}
