import type { Locale } from './i18n';

export interface Settings {
  ua?: string;
  showSideBar: boolean;
  sidebarWidth: number;
  clearTabInterval?: number;
  showFullUrl?: boolean;
  naturalScroll?: boolean;
  /** 全 UI 尺寸档位（sm/md/lg），作用于所有面向用户的控件（见 AGENTS.md §6.4） */
  uiSize?: UISize;
  /**
   * 界面语言。`undefined` 表示「跟随系统」（由 app.getLocale() 探测，zh* → 简体中文，否则英语）。
   * 写入后经现有 settings-changed 广播同步到三个 renderer 入口，并触发主进程重建应用菜单。
   */
  locale?: Locale;
}

/** UI 尺寸档位，映射到 HeroUI 控件的 size 与各类像素/Tailwind 取值。 */
export type UISize = 'sm' | 'md' | 'lg';

export const DEFAULT_UI_SIZE: UISize = 'md';

export const DEFAULT_CLEAR_TAB_INTERVAL = 5 * 60 * 1000;  // default 5 min

/** 档位 → 各类元素尺寸映射。
 *  - button：HeroUI Button 的 size 档
 *  - icon：工具栏图标像素
 *  - spaceIcon：Space 标题行图标像素（比工具栏图标略小）
 *  - text：Space 标题行文字的 Tailwind 字号类
 *  - modalInput：NewTabModal 搜索框 Input 的 size 档
 *  - modalTitle / modalDesc：NewTabModal 选项卡片标题/描述文字的 Tailwind 字号类
 *  - downloadRow：下载页每行内边距（Tailwind 类）
 *  - downloadName：下载页文件名字号（Tailwind 类）
 *  - downloadMeta：下载页辅助信息字号（Tailwind 类）
 */
export const UI_SIZE_MAP: Record<UISize, {
  button: 'sm' | 'md' | 'lg';
  icon: number;
  spaceIcon: number;
  text: string;
  modalInput: 'sm' | 'md' | 'lg';
  modalTitle: string;
  modalDesc: string;
  downloadRow: string;
  downloadName: string;
  downloadMeta: string;
}> = {
  sm: { button: 'sm', icon: 18, spaceIcon: 14, text: 'text-xs', modalInput: 'md', modalTitle: 'text-md', modalDesc: 'text-small', downloadRow: 'p-3', downloadName: 'text-sm', downloadMeta: 'text-xs' },
  md: { button: 'md', icon: 20, spaceIcon: 16, text: 'text-sm', modalInput: 'lg', modalTitle: 'text-lg', modalDesc: 'text-md', downloadRow: 'p-4', downloadName: 'text-base', downloadMeta: 'text-sm' },
  lg: { button: 'lg', icon: 24, spaceIcon: 20, text: 'text-base', modalInput: 'lg', modalTitle: 'text-xl', modalDesc: 'text-lg', downloadRow: 'p-5', downloadName: 'text-lg', downloadMeta: 'text-base' },
};

export function getUISizePrefs(size?: UISize) {
  return UI_SIZE_MAP[size ?? DEFAULT_UI_SIZE];
}

/** 读取 uiSize，并对老版本遗留的 iconSize 字段做兼容（迁移期）。 */
export function resolveUISize(settings?: Partial<Settings> | null): UISize {
  if (!settings) return DEFAULT_UI_SIZE;
  return settings.uiSize ?? (settings as Settings & { iconSize?: UISize }).iconSize ?? DEFAULT_UI_SIZE;
}

export function getDefaultSettings() {
  return {
    ua: undefined,
    showSideBar: true,
    sidebarWidth: 250,
    clearTabInterval: DEFAULT_CLEAR_TAB_INTERVAL,
    showFullUrl: false,
    naturalScroll: false,
    uiSize: DEFAULT_UI_SIZE,
  } as Settings;
}
