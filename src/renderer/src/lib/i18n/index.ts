import { enMessages } from './en';
import { zhCNMessages } from './zh-CN';

/**
 * i18n 共享核心（无 React / Electron 依赖）。
 *
 * 设计要点：
 * - 字典是纯 TS 数据，主进程（menu.ts）与三个 renderer 入口共用同一份。
 * - 翻译 key 由英文字典 `enMessages` 反推为联合类型，确保 `zh-CN.ts` 漏译会在编译期报错。
 * - 语言偏好存在 `Settings.locale`，`undefined` 表示「跟随系统」。
 *
 * 数据流（与 settings 同步机制一致，见 AGENTS.md §2.4）：
 *   settings 页改 locale → store.set('settings') → 主进程广播 settings-changed
 *     → 三个 renderer 入口即时换语言；同时主进程 ipcMain.emit('rebuild-application-menu')
 *     → Menu.setApplicationMenu 重建应用菜单。
 */
export type Locale = 'en' | 'zh-CN';

/** 当 locale 为 undefined（跟随系统）且系统语言也无法判定时的兜底语言。 */
export const DEFAULT_LOCALE: Locale = 'en';

/** 支持的语言列表（用于设置页 Select 等）。 */
export const SUPPORTED_LOCALES: Locale[] = ['en', 'zh-CN'];

const MESSAGES: Record<Locale, Record<MessageKey, string>> = {
  en: enMessages,
  'zh-CN': zhCNMessages,
};

/** 所有翻译 key 的联合类型（以英文字典为真相源）。 */
export type MessageKey = keyof typeof enMessages;

/** 翻译函数类型，便于组件/模块标注 props。 */
export type TFunction = (key: MessageKey, params?: Record<string, string | number>) => string;

/** 校验/规整输入值（来自 store、`app.getLocale()` 等不可信来源）为受支持的 Locale。 */
export function normalizeLocale(value: unknown): Locale | undefined {
  if (value === 'en') return 'en';
  if (value === 'zh-CN') return 'zh-CN';
  return undefined;
}

/**
 * 把 Electron `app.getLocale()` 返回的语言标签归一到受支持的 Locale。
 * `zh-*`（含 zh-CN / zh-TW / zh-HK）一律视为简体中文，其余回落到默认语言。
 */
export function localeFromTag(tag: string): Locale {
  const lower = String(tag ?? '').toLowerCase();
  if (lower.startsWith('zh')) return 'zh-CN';
  return DEFAULT_LOCALE;
}

/**
 * 解析当前生效语言。
 * - locale 为 undefined（= 跟随系统）时使用 systemLocale；
 * - systemLocale 也缺失时回落到 DEFAULT_LOCALE。
 */
export function resolveLocale(locale: unknown, systemLocale?: Locale): Locale {
  const explicit = normalizeLocale(locale);
  if (explicit) return explicit;
  return systemLocale ?? DEFAULT_LOCALE;
}

/**
 * 翻译：在对应语言字典里查 key，支持 `{name}` 占位符插值。
 * key 缺失时回落到英文，再缺失则原样返回 key（避免 UI 出现空白）。
 */
export function translate(locale: Locale, key: MessageKey, params?: Record<string, string | number>): string {
  const dict = MESSAGES[locale] ?? MESSAGES[DEFAULT_LOCALE];
  let str = dict[key] ?? MESSAGES[DEFAULT_LOCALE][key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      str = str.replaceAll(`{${name}}`, String(value));
    }
  }
  return str;
}
