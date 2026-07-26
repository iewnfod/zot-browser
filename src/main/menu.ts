import MenuItemConstructorOptions = Electron.MenuItemConstructorOptions;
import MenuItem = Electron.MenuItem;
import {app, BrowserWindow, dialog, ipcMain} from 'electron';
import { getUiView } from './viewManager';
import { localeFromTag, resolveLocale, translate, type Locale } from '../renderer/src/lib/i18n';

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

/**
 * 计算主进程（应用菜单 / 原生对话框）当前生效的语言。
 * 优先读 settings.locale；为 undefined（跟随系统）时用 app.getLocale() 探测。
 * 菜单只在构建时读取一次，故语言切换需重建菜单（见 index.ts 的 rebuild-application-menu）。
 */
export function currentMenuLocale(): Locale {
  const settings = menuStore.get('settings') as { locale?: unknown } | undefined;
  return resolveLocale(settings?.locale, localeFromTag(app.getLocale()));
}

export function MenuTemplate(mainWindow: BrowserWindow, locale: Locale) {
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
    translate(locale, key, params);

  const MenuTemplate: (MenuItemConstructorOptions | MenuItem)[] = [
    {
      label: t('app.name'),
      role: 'appMenu'
    },
    {
      label: t('menu.edit'),
      submenu: [
        { label: t('menu.copy'), role: 'copy' },
        { label: t('menu.paste'), role: 'paste' },
        { label: t('menu.undo'), role: 'undo' },
        { label: t('menu.redo'), role: 'redo' },
        { label: t('menu.selectAll'), role: 'selectAll' }
      ]
    },
    {
      label: t('menu.view'),
      submenu: [
        {
          label: t('menu.toggleSidebar'),
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => emitEvent('menu-toggle-sidebar')
        },
      ]
    },
    {
      label: t('menu.window'),
      submenu: [
        {
          label: t('menu.settings'),
          accelerator: 'CmdOrCtrl+,',
          click: () => emitEvent('menu-open-settings')
        },
        {
          label: t('menu.extensions'),
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => emitEvent('menu-open-extensions')
        },
      ]
    },
    {
      label: t('menu.tab'),
      submenu: [
        {
          label: t('menu.newTab'),
          accelerator: 'CmdOrCtrl+T',
          click: () => emitEvent('menu-new-tab')
        },
        {
          label: t('menu.closeTab'),
          accelerator: 'CmdOrCtrl+W',
          click: () => emitEvent('menu-close-tab')
        },
        {
          label: t('menu.reload'),
          accelerator: 'CmdOrCtrl+R',
          click: () => emitEvent('menu-reload-tab')
        },
        {
          label: t('menu.goBack'),
          accelerator: 'CmdOrCtrl+[',
          click: () => emitEvent('menu-tab-go-back')
        },
        {
          label: t('menu.goForward'),
          accelerator: 'CmdOrCtrl+]',
          click: () => emitEvent('menu-tab-go-forward')
        },
        {
          label: t('menu.select'),
          submenu: Array(9).map((i) => {
            if (i == 8) {
              return {
                label: t('menu.lastTab'),
                accelerator: 'CmdOrCtrl+9',
                click: () => emitEvent('menu-select-last-tab')
              };
            } else {
              return {
                label: t('menu.tabN', { n: i + 1 }),
                accelerator: `CmdORCtrl+${i+1}`,
                click: () => emitEvent('menu-select-tab', i)
              };
            }
          })
        }
      ]
    },
    {
      label: t('menu.develop'),
      submenu: [
        { label: t('menu.developerTools'), accelerator: 'F12' },
        {
          label: t('menu.electronDevTools'),
          accelerator: 'Shift+F12',
          click: () => emitEvent('menu-open-electron-developer')
        },
        {
          label: t('menu.uiDevTools'),
          accelerator: 'Shift+CmdOrCtrl+I',
          click: () => emitMainEvent('menu-open-ui-developer')
        },
        { type: 'separator' },
        {
          label: t('menu.clearTrustedCerts'),
          click: async () => {
            // 对话框挂载到主窗口
            const { response } = await dialog.showMessageBox(mainWindow, {
              type: 'question',
              title: t('dialog.clearCerts.title'),
              message: t('dialog.clearCerts.message'),
              buttons: [t('dialog.clearCerts.confirm'), t('dialog.clearCerts.cancel')],
              defaultId: 1,
              cancelId: 1,
              noLink: true,
            });
            if (response === 0) {
              menuStore.delete('allowedCertificates');
              await dialog.showMessageBox(mainWindow, {
                type: 'info',
                message: t('dialog.clearCerts.success'),
                buttons: [t('dialog.clearCerts.ok')]
              });
            }
          }
        }
      ]
    }
  ];

  return MenuTemplate;
}
