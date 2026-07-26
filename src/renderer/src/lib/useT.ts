import { useMemo } from 'react';
import { resolveLocale, translate, type Locale, type MessageKey, type TFunction } from '@renderer/lib/i18n';

/**
 * 返回一个随 `locale` 变化而重建的 `t` 函数。
 *
 * 用法：`const t = useT(locale);`，组件内调用 `t('sidebar.settings')`。
 *
 * 注意：t 引用仅在 locale 变化时改变，可作为依赖放心传入 useCallback/useMemo。
 * 实际生效语言由 resolveLocale(settings.locale, systemLocale) 决定——
 * settings.locale 为 undefined 时跟随系统。
 */
export function useT(locale: Locale): TFunction {
  return useMemo(
    () => (key: MessageKey, params?: Record<string, string | number>) => translate(locale, key, params),
    [locale]
  );
}

/** 便捷重导出，避免组件分别从两个路径导入 i18n 类型与 hook。 */
export { resolveLocale };
export type { Locale, MessageKey, TFunction };
