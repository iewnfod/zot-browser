import { useEffect, useState } from 'react';
import { DEFAULT_LOCALE, resolveLocale, type Locale } from '@renderer/lib/i18n';
import type { Settings } from '@renderer/lib/settings';

/**
 * 解析当前生效语言。
 *
 * 与 `useT` 配套：本 hook 负责「取数 + 订阅」，把系统语言探测与 settings 同步集中在一处，
 * 适用于不便接入完整 App 状态的独立入口（如 zot://extensions 页）。
 *
 * 主 UI / 设置页自带 settings 状态管理，直接在那里用 resolveLocale + useT 即可，
 * 不必走本 hook。
 *
 * 返回的 locale 已经过 resolveLocale 处理：settings.locale 为 undefined 时跟随系统。
 */
export function useLocale(): Locale {
  const [settingsLocale, setSettingsLocale] = useState<Locale | undefined>(undefined);
  const [systemLocale, setSystemLocale] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    let cancelled = false;
    // 探测系统语言（首次 / 跟随系统时使用）
    window.api.getSystemLocale().then((sys) => {
      if (!cancelled) setSystemLocale(sys);
    });
    // 读取已持久化的 settings 取 locale
    window.store.get('settings').then((data?: Settings) => {
      if (!cancelled) setSettingsLocale(resolveLocale(data?.locale, systemLocale));
    });
    return () => {
      cancelled = true;
    };
    // systemLocale 在上面的异步回调里完成更新后，下面这个 effect 会再同步一次 settings.locale
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // systemLocale 探测完成后，重新解析一次 settings.locale（覆盖初始 DEFAULT_LOCALE 的取值）
  useEffect(() => {
    window.store.get('settings').then((data?: Settings) => {
      setSettingsLocale(resolveLocale(data?.locale, systemLocale));
    });
  }, [systemLocale]);

  // 订阅 settings 变更广播，实时跟随（设置页改语言 → 这里即时切换）
  useEffect(() => {
    const handler = (_e: unknown, next: Settings): void => {
      setSettingsLocale(resolveLocale(next?.locale, systemLocale));
    };
    window.electron.ipcRenderer.on('settings-changed', handler);
    return () => {
      window.electron.ipcRenderer.removeAllListeners('settings-changed');
    };
  }, [systemLocale]);

  return resolveLocale(settingsLocale, systemLocale);
}
