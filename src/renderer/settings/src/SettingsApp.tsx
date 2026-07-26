import { Button, Card, CardBody, Divider, Input, Select, SelectItem, Switch } from '@heroui/react';
import { useEffect, useState } from 'react';
import { LuPuzzle } from 'react-icons/lu';
import { getDefaultSettings, resolveUISize, Settings, UISize } from '@renderer/lib/settings';
import { DEFAULT_LOCALE, Locale, resolveLocale } from '@renderer/lib/i18n';
import { useT } from '@renderer/lib/useT';

/** 设置页 Language 下拉选项的内部值：'' 表示跟随系统，否则为具体 Locale。 */
type LanguageSelectValue = '' | Locale;

/**
 * zot://settings 设置页。
 *
 * 与主 UI 共享同一份持久化 settings（electron-store 的 'settings' key）：
 * - 读取：store.get('settings')
 * - 写入：store.set('settings', ...) —— 主进程 storage.ts 检测到该 key 变化时，
 *   会向 UI view 广播 'settings-changed' 事件，主 UI 立即应用，无需重启。
 *
 * 本页面加载在带 preload 的 WebContentsView 里（contextIsolation 开启），
 * 所以 window.store / window.api 可用。
 */
export default function SettingsApp() {
  const [settings, setSettings] = useState<Settings>(getDefaultSettings());
  const [systemLocale, setSystemLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [sidebarWidth, setSidebarWidth] = useState<string>(String(settings.sidebarWidth));
  const [clearIntervalMin, setClearIntervalMin] = useState<string>(
    String(Math.round((settings.clearTabInterval ?? getDefaultSettings().clearTabInterval!) / 60000))
  );
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // 探测系统语言（用于 settings.locale 为 undefined「跟随系统」时的回退与显示）
    window.api.getSystemLocale().then((sys) => setSystemLocale(sys));
    window.store.get('settings').then((data) => {
      const base = data ?? getDefaultSettings();
      // 与主 UI 首次加载逻辑一致：未设置 naturalScroll 时探测系统偏好
      if (base.naturalScroll === undefined) {
        window.api.getNaturalScroll().then((sysNatural) => {
          const merged = { ...base, naturalScroll: sysNatural };
          setSettings(merged);
          setSidebarWidth(String(merged.sidebarWidth));
          setClearIntervalMin(
            String(Math.round((merged.clearTabInterval ?? getDefaultSettings().clearTabInterval!) / 60000))
          );
          setLoaded(true);
        });
      } else {
        setSettings(base);
        setSidebarWidth(String(base.sidebarWidth));
        setClearIntervalMin(
          String(Math.round((base.clearTabInterval ?? getDefaultSettings().clearTabInterval!) / 60000))
        );
        setLoaded(true);
      }
    });
  }, []);

  // 实时感知：主 UI 或别处改了 settings 时同步本页
  useEffect(() => {
    const handler = (_e: unknown, next: Settings): void => {
      setSettings(next);
      setSidebarWidth(String(next.sidebarWidth));
      setClearIntervalMin(
        String(Math.round((next.clearTabInterval ?? getDefaultSettings().clearTabInterval!) / 60000))
      );
    };
    window.electron.ipcRenderer.on('settings-changed', handler);
    return () => {
      window.electron.ipcRenderer.removeAllListeners('settings-changed');
    };
  }, []);

  function commit(patch: Partial<Settings>): void {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      window.store.set('settings', next); // 触发主进程广播 settings-changed → 主 UI 应用
      return next;
    });
  }

  // sidebarWidth：本地输入即时反馈，失焦/Enter 时落库（夹在 200–500）
  function commitSidebarWidth(): void {
    const n = Number(sidebarWidth);
    const clamped = Number.isFinite(n) ? Math.max(200, Math.min(500, Math.round(n))) : getDefaultSettings().sidebarWidth;
    setSidebarWidth(String(clamped));
    if (clamped !== settings.sidebarWidth) {
      commit({ sidebarWidth: clamped });
    }
  }

  function commitClearInterval(): void {
    const n = Number(clearIntervalMin);
    const minutes = Number.isFinite(n) && n > 0 ? Math.round(n) : 5;
    setClearIntervalMin(String(minutes));
    const ms = minutes * 60000;
    if (ms !== settings.clearTabInterval) {
      commit({ clearTabInterval: ms });
    }
  }

  // 当前生效语言 + 翻译函数（settings.locale 为 undefined 时跟随系统）。
  // 注意：hooks 必须在任何 early return 之前调用。
  const locale = resolveLocale(settings.locale, systemLocale);
  const t = useT(locale);
  // Language 下拉当前选中值：跟随系统时为 ''，否则为具体 Locale
  const languageSelectValue: LanguageSelectValue = settings.locale ?? '';

  // 页面标题随语言切换
  useEffect(() => {
    document.title = t('settings.title');
  }, [t]);

  if (!loaded) {
    return <div className="w-screen h-screen" />;
  }

  return (
    <div className="w-screen h-screen overflow-auto bg-neutral-50">
      <div className="max-w-3xl mx-auto p-8 flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">{t('settings.title')}</h1>
          <p className="text-sm text-default-500">{t('settings.subtitle')}</p>
        </header>

        {/* 通用 */}
        <Card shadow="sm">
          <CardBody className="p-5 flex flex-col gap-4">
            <h2 className="text-base font-semibold">{t('settings.general')}</h2>
            <Divider />
            <Row
              title={t('settings.language')}
              description={t('settings.languageDesc')}
            >
              <Select
                aria-label={t('settings.language')}
                className="max-w-[180px]"
                size="sm"
                selectedKeys={[languageSelectValue]}
                disallowEmptySelection
                onSelectionChange={(keys) => {
                  const v = Array.from(keys)[0] as LanguageSelectValue;
                  // '' 表示跟随系统 → 写入 undefined（不落库 locale，由系统语言决定）
                  commit({ locale: v === '' ? undefined : v });
                }}
              >
                <SelectItem key="">{t('settings.languageSystem')}</SelectItem>
                <SelectItem key="en">{t('settings.languageEn')}</SelectItem>
                <SelectItem key="zh-CN">{t('settings.languageZhCN')}</SelectItem>
              </Select>
            </Row>
          </CardBody>
        </Card>

        {/* 外观 */}
        <Card shadow="sm">
          <CardBody className="p-5 flex flex-col gap-4">
            <h2 className="text-base font-semibold">{t('settings.appearance')}</h2>
            <Divider />
            <Row
              title={t('settings.showSidebar')}
              description={t('settings.showSidebarDesc')}
            >
              <Switch
                isSelected={settings.showSideBar}
                onValueChange={(v) => commit({ showSideBar: v })}
                aria-label={t('settings.showSidebar')}
              />
            </Row>
            <Row
              title={t('settings.showFullUrl')}
              description={t('settings.showFullUrlDesc')}
            >
              <Switch
                isSelected={!!settings.showFullUrl}
                onValueChange={(v) => commit({ showFullUrl: v })}
                aria-label={t('settings.showFullUrl')}
              />
            </Row>
            <Row
              title={t('settings.sidebarWidth')}
              description={t('settings.sidebarWidthDesc')}
            >
              <Input
                type="number"
                className="max-w-[120px]"
                size="sm"
                value={sidebarWidth}
                onValueChange={setSidebarWidth}
                onBlur={commitSidebarWidth}
                onKeyDown={(e) => { if (e.key === 'Enter') commitSidebarWidth(); }}
              />
            </Row>
            <Row
              title={t('settings.uiSize')}
              description={t('settings.uiSizeDesc')}
            >
              <Select
                aria-label={t('settings.uiSize')}
                className="max-w-[140px]"
                size="sm"
                selectedKeys={[resolveUISize(settings)]}
                disallowEmptySelection
                onSelectionChange={(keys) => {
                  const v = Array.from(keys)[0] as UISize;
                  if (v) commit({ uiSize: v });
                }}
              >
                <SelectItem key="sm">{t('settings.uiSizeSmall')}</SelectItem>
                <SelectItem key="md">{t('settings.uiSizeMedium')}</SelectItem>
                <SelectItem key="lg">{t('settings.uiSizeLarge')}</SelectItem>
              </Select>
            </Row>
          </CardBody>
        </Card>

        {/* 行为 */}
        <Card shadow="sm">
          <CardBody className="p-5 flex flex-col gap-4">
            <h2 className="text-base font-semibold">{t('settings.behavior')}</h2>
            <Divider />
            <Row
              title={t('settings.naturalScroll')}
              description={t('settings.naturalScrollDesc')}
            >
              <Switch
                isSelected={!!settings.naturalScroll}
                onValueChange={(v) => commit({ naturalScroll: v })}
                aria-label={t('settings.naturalScroll')}
              />
            </Row>
            <Row
              title={t('settings.unloadTabs')}
              description={t('settings.unloadTabsDesc')}
            >
              <Input
                type="number"
                className="max-w-[120px]"
                size="sm"
                min={1}
                value={clearIntervalMin}
                onValueChange={setClearIntervalMin}
                onBlur={commitClearInterval}
                onKeyDown={(e) => { if (e.key === 'Enter') commitClearInterval(); }}
              />
            </Row>
          </CardBody>
        </Card>

        {/* 扩展 */}
        <Card shadow="sm">
          <CardBody className="p-5 flex flex-col gap-4">
            <h2 className="text-base font-semibold">{t('settings.extensions')}</h2>
            <Divider />
            <Row
              title={t('settings.extensions')}
              description={t('settings.extensionsDesc')}
            >
              <Button
                size="sm"
                color="primary"
                variant="flat"
                startContent={<LuPuzzle />}
                onPress={() => window.electron.ipcRenderer.send('open-internal-url', 'zot://extensions')}
              >
                {t('settings.openExtensions')}
              </Button>
            </Row>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Row({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-row items-center justify-between gap-4">
      <div className="flex flex-col">
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="text-xs text-default-500">{description}</p>}
      </div>
      {children}
    </div>
  );
}
