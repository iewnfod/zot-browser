import { Card, CardBody, Divider, Input, Select, SelectItem, Switch } from '@heroui/react';
import { useEffect, useState } from 'react';
import { getDefaultSettings, resolveUISize, Settings, UISize } from '@renderer/lib/settings';

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
  const [sidebarWidth, setSidebarWidth] = useState<string>(String(settings.sidebarWidth));
  const [clearIntervalMin, setClearIntervalMin] = useState<string>(
    String(Math.round((settings.clearTabInterval ?? getDefaultSettings().clearTabInterval!) / 60000))
  );
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
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

  if (!loaded) {
    return <div className="w-screen h-screen" />;
  }

  return (
    <div className="w-screen h-screen overflow-auto bg-neutral-50">
      <div className="max-w-3xl mx-auto p-8 flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="text-sm text-default-500">Changes apply to the browser instantly.</p>
        </header>

        {/* 外观 */}
        <Card shadow="sm">
          <CardBody className="p-5 flex flex-col gap-4">
            <h2 className="text-base font-semibold">Appearance</h2>
            <Divider />
            <Row
              title="Show sidebar"
              description="Display the tab sidebar on the left."
            >
              <Switch
                isSelected={settings.showSideBar}
                onValueChange={(v) => commit({ showSideBar: v })}
                aria-label="Show sidebar"
              />
            </Row>
            <Row
              title="Show full URL"
              description="Show the full address instead of just the host in the address bar."
            >
              <Switch
                isSelected={!!settings.showFullUrl}
                onValueChange={(v) => commit({ showFullUrl: v })}
                aria-label="Show full URL"
              />
            </Row>
            <Row
              title="Sidebar width"
              description="Width of the sidebar in pixels (200–500)."
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
              title="UI size"
              description="Scale of controls, icons, and text across the sidebar and dialogs."
            >
              <Select
                aria-label="UI size"
                className="max-w-[140px]"
                size="sm"
                selectedKeys={[resolveUISize(settings)]}
                disallowEmptySelection
                onSelectionChange={(keys) => {
                  const v = Array.from(keys)[0] as UISize;
                  if (v) commit({ uiSize: v });
                }}
              >
                <SelectItem key="sm">Small</SelectItem>
                <SelectItem key="md">Medium</SelectItem>
                <SelectItem key="lg">Large</SelectItem>
              </Select>
            </Row>
          </CardBody>
        </Card>

        {/* 行为 */}
        <Card shadow="sm">
          <CardBody className="p-5 flex flex-col gap-4">
            <h2 className="text-base font-semibold">Behavior</h2>
            <Divider />
            <Row
              title="Natural scrolling"
              description="Reverse scroll direction, matching trackpad conventions."
            >
              <Switch
                isSelected={!!settings.naturalScroll}
                onValueChange={(v) => commit({ naturalScroll: v })}
                aria-label="Natural scrolling"
              />
            </Row>
            <Row
              title="Unload inactive tabs after"
              description="Minutes of inactivity before a background tab is unloaded (media-playing tabs are exempt)."
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
