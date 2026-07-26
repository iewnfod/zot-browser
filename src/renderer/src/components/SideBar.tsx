import {
  Button,
  Divider, Drawer, DrawerContent,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Input, Tooltip,
  useDisclosure
} from '@heroui/react';
import {
  LuDownload, LuFolderOpen, LuLink,
  LuMenu,
  LuMoveLeft,
  LuMoveRight,
  LuPanelLeftClose,
  LuPanelLeftOpen,
  LuPause,
  LuPlay,
  LuPlus,
  LuPuzzle,
  LuRotateCw, LuSettings, LuSlidersHorizontal
} from 'react-icons/lu';
import { Tab } from '@renderer/lib/tab';
import FavoriteTabCard from '@renderer/components/FavoriteTabCard';
import TabRow from '@renderer/components/TabRow';
import { isMac } from '@react-aria/utils';
import { useMemo, useRef, useCallback, useEffect, useState } from 'react';
import { Space } from '@renderer/lib/space';
import { getUISizePrefs, UISize } from '@renderer/lib/settings';
import type { TFunction } from '@renderer/lib/i18n';
import type { InstalledExtension } from '@renderer/lib/extensions';
import { getExtensionPageUrl } from '@renderer/lib/extensions';

/** 进行中下载快照（与 preload/index.d.ts 的 DownloadProgressPayload 对齐）。 */
interface ActiveDownloadSnapshot {
  id: string;
  filename: string;
  url: string;
  received: number;
  total: number;
  state: 'progressing' | 'paused' | 'interrupted';
  speed: number;
}

/** 最近完成的历史条目（与 preload/index.d.ts 的 DownloadHistoryItem 对齐）。 */
interface RecentDownloadItem {
  id: string;
  filename: string;
  url: string;
  savePath: string;
  total: number;
  mimeType: string;
  completedAt: number;
}

export interface BrowserSideBarProps {
  showSideBar: boolean;
  currentTab: Tab | null;
  currentSpace: Space | null;
  favoriteTabs: Tab[];
  pinnedTabs: Tab[];
  tabs: Tab[];
  openNewTabModal: () => void;
  onTabClose: (tabId: string) => void;
  onTabSelect: (tabId: string) => void;
  className?: string;
  /** 标签右键：上报原生事件 + 目标 tab，由上层渲染统一右键菜单 */
  onTabContextMenu: (e: React.MouseEvent, tab: Tab) => void;
  setSiteBarState: (state: boolean) => void;
  spaces: Space[];
  width?: number;
  openEditTabModal: (content: string) => void;
  showFullUrl?: boolean;
  /** 打开 zot://settings 内部页 */
  openSettings: () => void;
  /** 打开 zot://extensions 内部页 */
  openExtensions: () => void;
  /** 打开 zot://downloads 内部页 */
  openDownloads: () => void;
  /** 进行中的下载（驱动按钮图标变为进度圈）。 */
  activeDownloads: ActiveDownloadSnapshot[];
  /** 最近完成的历史（驱动下载 Dropdown 列表）。 */
  recentDownloads: RecentDownloadItem[];
  /** 仍存在的文件路径集合（savePath）。文件被删除时对应历史项隐藏「在文件夹中显示」。 */
  existingPaths: Set<string>;
  /** UI 尺寸档位（sm/md/lg），驱动整个 sidebar 的控件/图标/文字大小 */
  uiSize?: UISize;
  /** 翻译函数（由上层根据当前 locale 提供） */
  t: TFunction;
}

interface BrowserSideBarContentProps extends BrowserSideBarProps {}

function BrowserSideBarContent(props: BrowserSideBarContentProps) {
  const {
    showSideBar,
    currentTab,
    currentSpace,
    favoriteTabs,
    pinnedTabs,
    tabs,
    openNewTabModal,
    onTabClose,
    onTabSelect,
    className,
    onTabContextMenu,
    setSiteBarState,
    spaces,
    width,
    openEditTabModal,
    showFullUrl,
    openSettings,
    openExtensions,
    openDownloads,
    activeDownloads,
    recentDownloads,
    existingPaths,
    uiSize,
    t,
  } = props;

  // sidebar 全部元素的尺寸：档位 → (Button size, 图标像素, Space 行图标/文字, ...)
  const { button: iconBtnSize, icon: iconPx, spaceIcon: spaceIconPx, text: spaceTextClass } = getUISizePrefs(uiSize);

  // —— 固定扩展（侧栏工具栏 reload 右侧显示）——
  const [pinnedExtensions, setPinnedExtensions] = useState<InstalledExtension[]>([]);
  const [extIcons, setExtIcons] = useState<Record<string, string>>({});

  const refreshPinnedExtensions = useCallback(async () => {
    const items = await window.api.extensionList();
    const pinned = items.filter((it) => it.pinned);
    setPinnedExtensions(pinned);
    // 并发拉图标
    const entries = await Promise.all(
      pinned.map(async (it) => {
        const url = await window.api.extensionGetIcon(it.id);
        return [it.id, url] as const;
      })
    );
    const map: Record<string, string> = {};
    for (const [id, url] of entries) if (url) map[id] = url;
    setExtIcons(map);
  }, []);

  useEffect(() => {
    refreshPinnedExtensions();
  }, [refreshPinnedExtensions]);

  useEffect(() => {
    const handler = (): void => {
      refreshPinnedExtensions();
    };
    window.electron.ipcRenderer.on('extensions-changed', handler);
    return () => {
      window.electron.ipcRenderer.removeAllListeners('extensions-changed');
    };
  }, [refreshPinnedExtensions]);

  // 下载按钮的综合进度：多个进行中下载时把 received/total 求和算总进度。
  // total 未知（=0）的下载不计入分母，但若全部未知则用 indeterminate（旋转）态。
  const hasActive = activeDownloads.length > 0;
  const totalReceived = activeDownloads.reduce((s, it) => s + Math.max(0, it.received), 0);
  const knownTotal = activeDownloads.reduce((s, it) => s + (it.total > 0 ? it.total : 0), 0);
  const overallPct = knownTotal > 0 ? Math.min(100, (totalReceived / knownTotal) * 100) : 0;
  const indeterminate = hasActive && knownTotal === 0;

  // 构造 Dropdown 的数据驱动 items（HeroUI 集合组件要求用 items prop 处理动态内容）。
  // kind 区分四类：进行中项 / 历史项 / 空态 / 查看全部。
  type DownloadMenuItem =
    | { key: string; kind: 'active'; id: string; filename: string; pct: number; received: number; total: number; state: 'progressing' | 'paused' | 'interrupted'; speed: number }
    | { key: string; kind: 'recent'; filename: string; savePath: string; fileExists: boolean; total: number }
    | { key: string; kind: 'empty' }
    | { key: string; kind: 'viewAll' };
  const menuItems: DownloadMenuItem[] = [
    ...activeDownloads.map((it) => ({
      key: `active-${it.id}`,
      kind: 'active' as const,
      id: it.id,
      filename: it.filename,
      pct: it.total > 0 ? Math.min(100, (it.received / it.total) * 100) : 0,
      received: it.received,
      total: it.total,
      state: it.state,
      speed: it.speed,
    })),
    ...recentDownloads.map((it) => ({
      key: `recent-${it.id}`,
      kind: 'recent' as const,
      filename: it.filename,
      savePath: it.savePath,
      fileExists: existingPaths.has(it.savePath),
      total: it.total,
    })),
  ];
  if (!hasActive && recentDownloads.length === 0) {
    menuItems.push({ key: 'empty', kind: 'empty' });
  }
  menuItems.push({ key: 'view-all', kind: 'viewAll' });
  // 降低 DropdownItem 的 hover 背景深度（HeroUI 默认用 default-100，偏重，降到 default-50）
  const itemHoverCls = 'data-[hover=true]:bg-default-50';

  function handleGoBack() {
    if (currentTab) {
      window.api.viewGoBack(currentTab.id);
    }
  }

  function handleGoForward() {
    if (currentTab) {
      window.api.viewGoForward(currentTab.id);
    }
  }

  function handleReload() {
    if (currentTab) {
      window.api.viewReload(currentTab.id);
    }
  }

  function canGoForward(): boolean {
    return currentTab?.canGoForward ?? false;
  }

  function canGoBack(): boolean {
    return currentTab?.canGoBack ?? false;
  }

  const displayUrl = useMemo(() => {
    if (currentTab) {
      if (showFullUrl) {
        return currentTab.url;
      } else {
        return new URL(currentTab.url).host;
      }
    } else {
      return "";
    }
  }, [showFullUrl, currentTab]);

  return (
    <div className={`flex flex-col items-center justify-between h-full w-[15vw] ${isMac() ? 'min-w-[250px]' : 'min-w-[150px]'} bg-transparent ${className}`} style={{
      width: width,
      // @ts-expect-error electron attribute
      appRegion: 'drag',
    }} id="sidebar-container">
      {/* Top Buttons */}
      <div className="flex flex-col w-full gap-2" style={{
        // @ts-expect-error electron attribute
        appRegion: 'no-drag',
      }}>
        {/* Actions */}
        <div className={`flex flex-row justify-between items-center ${isMac() ? 'pl-20' : ''}`} style={{
          // @ts-expect-error electron attribute
          appRegion: 'drag',
        }}>
          {/* More, Go Back, Go Forward, Reload */}
          <div className="flex flex-row justify-start items-center" style={{
            // @ts-expect-error electron attribute
            appRegion: 'no-drag',
          }}>
            <Dropdown>
              <DropdownTrigger>
                <Button variant="light" isIconOnly size={iconBtnSize}>
                  <LuMenu size={iconPx}/>
                </Button>
              </DropdownTrigger>
              <DropdownMenu aria-label={t('sidebar.more')}>
                <DropdownItem
                  key="settings"
                  textValue={t('sidebar.settings')}
                  startContent={<LuSettings size={iconPx}/>}
                  onPress={openSettings}
                >
                  {t('sidebar.settings')}
                </DropdownItem>
                <DropdownItem
                  key="extensions"
                  textValue={t('sidebar.extensions')}
                  startContent={<LuPuzzle size={iconPx}/>}
                  onPress={openExtensions}
                >
                  {t('sidebar.extensions')}
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>

            {
              showSideBar ? (
                <Tooltip size="sm" content={t('sidebar.hideSidebar')}>
                  <Button variant="light" isIconOnly size={iconBtnSize} onPress={() => setSiteBarState(false)}>
                    <LuPanelLeftClose size={iconPx}/>
                  </Button>
                </Tooltip>
              ) : (
                <Tooltip size="sm" content={t('sidebar.showSidebar')}>
                  <Button variant="light" isIconOnly size={iconBtnSize} onPress={() => setSiteBarState(true)}>
                    <LuPanelLeftOpen size={iconPx}/>
                  </Button>
                </Tooltip>
              )
            }
          </div>

          <div className="flex flex-row justify-end items-center" style={{
            // @ts-expect-error electron attribute
            appRegion: 'no-drag',
          }}>
            <Button variant="light" isIconOnly size={iconBtnSize} isDisabled={!canGoBack()} onPress={handleGoBack}>
              <LuMoveLeft size={iconPx}/>
            </Button>

            <Button variant="light" isIconOnly size={iconBtnSize} isDisabled={!canGoForward()} onPress={handleGoForward}>
              <LuMoveRight size={iconPx}/>
            </Button>

            <Button variant="light" isIconOnly size={iconBtnSize} onPress={handleReload}>
              <LuRotateCw size={iconPx}/>
            </Button>

            {/* 固定显示的扩展图标 */}
            {pinnedExtensions.map((ext) => {
              const pageUrl = getExtensionPageUrl(ext);
              const handleExtClick = () => {
                if (pageUrl) {
                  window.electron.ipcRenderer.send('open-internal-url', pageUrl);
                } else {
                  // 无 popup/options page → 回退到扩展管理页
                  openExtensions();
                }
              };
              return (
                <Tooltip key={ext.id} content={ext.name} size="sm" placement="bottom">
                  <Button
                    variant="light"
                    isIconOnly
                    size={iconBtnSize}
                    onPress={handleExtClick}
                    aria-label={ext.name}
                  >
                    {extIcons[ext.id] ? (
                      <img src={extIcons[ext.id]} alt="" style={{ width: iconPx, height: iconPx }} className="object-contain" />
                    ) : (
                      <LuPuzzle size={iconPx} />
                    )}
                  </Button>
                </Tooltip>
              );
            })}
          </div>
        </div>

        {/* URL Input */}
        <Input
          value={displayUrl}
          size={iconBtnSize}
          className="pl-1 group overflow-hidden"
          placeholder={t('sidebar.searchPlaceholder')}
          classNames={{
            input: "whitespace-nowrap text-ellipsis w-full"
          }}
          endContent={
            <div className="
              hidden group-hover:flex flex-row gap-0
              transition-all ease-in-out duration-300
              translate-x-2 backdrop-blur-md rounded-medium
            ">
              <Button isIconOnly size={iconBtnSize} variant="light" className="bg-transparent">
                <LuLink size={iconPx} className="text-neutral-700"/>
              </Button>
              <Button isIconOnly size={iconBtnSize} variant="light">
                <LuSlidersHorizontal size={iconPx} className="text-neutral-700"/>
              </Button>
            </div>
          }
          onClick={() => {
            if (currentTab) {
              openEditTabModal(currentTab ? currentTab.url : "")
            } else {
              openNewTabModal();
            }
          }}
        />

        {/* Favorite Tabs (in card) */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {
            favoriteTabs.map((tab: Tab) => (
              <FavoriteTabCard tab={tab} key={tab.id}/>
            ))
          }
        </div>

        {/* Space Info */}
        <div className="flex flex-row w-full gap-2 pl-3 pr-1 items-center justify-start">
          <img src={currentSpace ? currentSpace.icon : ""} alt="" className="select-none" style={{ width: spaceIconPx, height: spaceIconPx }} draggable={false}/>
          <p className={`select-none font-semibold whitespace-nowrap text-ellipsis ${spaceTextClass}`}>{currentSpace ? currentSpace.name : ""}</p>
        </div>

        {/* Pinned Tabs (in list) */}
        <div className={`flex flex-col w-full gap-1 ${pinnedTabs.length > 0 ? 'pt-1' : ''}`}>
          {
            pinnedTabs.map((tab: Tab) => (
              <TabRow
                tab={tab}
                key={tab.id}
                onTabClose={() => onTabClose(tab.id)}
                onSelect={() => onTabSelect(tab.id)}
                isSelected={currentTab ? currentTab.id === tab.id : false}
                isPinned={true}
                onContextMenuOpen={(e) => onTabContextMenu(e, tab)}
                render={tab.shouldRender}
                uiSize={uiSize}
              />
            ))
          }
        </div>

        <Divider className="pl-1 pr-1"/>

        {/* New Tab */}
        <div className="w-full">
          <Button
            startContent={<LuPlus size={iconPx}/>}
            variant="light"
            className="w-full"
            size={iconBtnSize}
            onPress={() => openNewTabModal()}
          >
            <p className="text-start w-full">
              {t('sidebar.newTab')}
            </p>
          </Button>
        </div>

        {/* Normal Tabs (in list) */}
        <div className="flex flex-col w-full gap-1">
          {
            tabs.map((tab: Tab) => (
              <TabRow
                tab={tab}
                key={tab.id}
                onTabClose={() => onTabClose(tab.id)}
                onSelect={() => onTabSelect(tab.id)}
                isSelected={currentTab ? currentTab.id === tab.id : false}
                isPinned={false}
                onContextMenuOpen={(e) => onTabContextMenu(e, tab)}
                render={tab.shouldRender}
                uiSize={uiSize}
              />
            ))
          }
        </div>
      </div>

      {/* Bottom Buttons */}
      <div className="flex flex-col w-full gap-2 no-drag">
        <div className="w-full flex flex-row justify-between items-center">
          <Dropdown>
            <DropdownTrigger>
              <Button variant="light" isIconOnly size={iconBtnSize} aria-label={t('downloads.title')}>
                {hasActive ? (
                  <DownloadProgressIcon
                    size={iconPx}
                    percent={overallPct}
                    indeterminate={indeterminate}
                  />
                ) : (
                  <LuDownload size={iconPx}/>
                )}
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              aria-label={t('downloads.title')}
              className="w-[360px] no-drag"
              items={menuItems}
            >
              {(item) => {
                if (item.kind === 'active') {
                  const paused = item.state === 'paused' || item.state === 'interrupted';
                  return (
                    <DropdownItem
                      key={item.key}
                      isReadOnly
                      textValue={item.filename}
                      className={itemHoverCls}
                    >
                      <div className="flex flex-row items-center gap-2 w-full">
                        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                          <span className="text-sm truncate">{item.filename}</span>
                          <span className="text-xs text-default-400">
                            {(() => {
                              const speed = formatSpeed(item.speed);
                              const size = `${formatBytes(item.received)}${item.total > 0 ? ` / ${formatBytes(item.total)}` : ''}`;
                              return speed ? `${speed} · ${size}` : size;
                            })()}
                          </span>
                          <div className="h-1 w-full rounded-full bg-default-200 overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-[width] duration-200"
                              style={{ width: `${item.pct > 0 ? item.pct : 30}%` }}
                            />
                          </div>
                        </div>
                        {/* 暂停 / 继续 */}
                        <Tooltip size="sm" content={paused ? t('downloads.resume') : t('downloads.pause')}>
                          <Button
                            isIconOnly
                            variant="light"
                            size="sm"
                            className="shrink-0"
                            aria-label={paused ? t('downloads.resume') : t('downloads.pause')}
                            onPress={() => paused ? window.api.downloadResume(item.id) : window.api.downloadPause(item.id)}
                          >
                            {paused ? <LuPlay size={14}/> : <LuPause size={14}/>}
                          </Button>
                        </Tooltip>
                      </div>
                    </DropdownItem>
                  );
                }
                if (item.kind === 'recent') {
                  return (
                    <DropdownItem
                      key={item.key}
                      textValue={item.filename}
                      className={itemHoverCls}
                      // 文件存在时点击打开；已删除时不绑定 action
                      onPress={item.fileExists ? () => window.api.downloadOpenFile(item.savePath) : undefined}
                    >
                      <div className="flex flex-row items-center gap-2 w-full">
                        <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                          <span className="text-sm truncate">{item.filename}</span>
                          <span className={`text-xs truncate ${item.fileExists ? 'text-default-400' : 'text-danger'}`}>
                            {item.fileExists ? formatBytes(item.total) : t('downloads.fileMissing')}
                          </span>
                        </div>
                        {/* 在文件夹中显示（文件已删除时隐藏） */}
                        {item.fileExists && (
                          <Tooltip size="sm" content={t('downloads.showInFolder')}>
                            <Button
                              isIconOnly
                              variant="light"
                              size="sm"
                              className="shrink-0"
                              aria-label={t('downloads.showInFolder')}
                              onPress={() => window.api.downloadShowInFolder(item.savePath)}
                            >
                              <LuFolderOpen size={14}/>
                            </Button>
                          </Tooltip>
                        )}
                      </div>
                    </DropdownItem>
                  );
                }
                if (item.kind === 'empty') {
                  return (
                    <DropdownItem key={item.key} isReadOnly className={itemHoverCls}>
                      <span className="text-sm text-default-400">{t('downloads.empty')}</span>
                    </DropdownItem>
                  );
                }
                // viewAll
                return (
                  <DropdownItem
                    key={item.key}
                    textValue={t('downloads.viewAll')}
                    onPress={openDownloads}
                    className={`${itemHoverCls} text-primary`}
                  >
                    {t('downloads.viewAll')}
                  </DropdownItem>
                );
              }}
            </DropdownMenu>
          </Dropdown>

          <div className="flex flex-row w-full items-center justify-center gap-1">
            {
              spaces.map((space) => (
                <Tooltip key={space.id} content={space.name} size="sm">
                  <Button isIconOnly variant={currentSpace?.id === space.id ? "flat" : "light"} size={iconBtnSize}>
                    <img
                      alt=""
                      src={space.icon}
                      className="h-[50%]"
                    />
                  </Button>
                </Tooltip>
              ))
            }
          </div>

          <Tooltip size="sm" content={t('sidebar.newSpace')}>
            <Button variant="light" isIconOnly size={iconBtnSize}>
              <LuPlus size={iconPx}/>
            </Button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

export default function BrowserSideBar(props: BrowserSideBarProps) {
  const {isOpen, onOpen, onClose, onOpenChange} = useDisclosure();

  const closeTimeoutRef = useRef<NodeJS.Timeout>(null);

  const handleMouseLeave = () => {
    closeTimeoutRef.current = setTimeout(() => {
      onClose();
    }, 300);
  };

  const handleMouseEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
    }
  };

  if (props.showSideBar) {
    return (
      <BrowserSideBarContent
        {...props}
      />
    );
  } else {
    return (
      <div className="flex flex-row h-full">
        <div
          className="h-full w-2"
          onMouseEnter={onOpen}
        />
        <Drawer
          isOpen={isOpen}
          onOpenChange={onOpenChange}
          placement="left"
          hideCloseButton
          classNames={{
            base: `sm:data-[placement=right]:m-3 sm:data-[placement=left]:m-3 rounded-medium min-w-0 w-auto max-w-[${props.width}px] pr-2`,
          }}
        >
          <DrawerContent
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <BrowserSideBarContent
              {...props}
            />
          </DrawerContent>
        </Drawer>
      </div>
    );
  }
}

/**
 * 下载按钮上的环形进度图标。
 * - 已知 total：用 stroke-dasharray 显示百分比，留一个小缺口（不到 100% 闭合）。
 * - 未知 total（indeterminate）：半圆弧 + 整体 animate-spin 旋转。
 */
/** 把字节数格式化为人类可读字符串（如 1.2 MB）。 */
function formatBytes(n: number): string {
  if (!n || n < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/** 把速度（bytes/sec）格式化为人类可读字符串（如 1.2 MB/s）。0 返回空串。 */
function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '';
  return `${formatBytes(bytesPerSec)}/s`;
}

function DownloadProgressIcon({ size, percent, indeterminate }: { size: number; percent: number; indeterminate: boolean }) {
  // SVG 尺寸略大于图标像素，给圆环留边距
  const svg = size + 4;
  const stroke = Math.max(2, Math.round(size / 8));
  const r = (svg - stroke) / 2;
  const cx = svg / 2;
  const cy = svg / 2;
  const circumference = 2 * Math.PI * r;

  if (indeterminate) {
    // 半圆弧 + 旋转
    const dash = circumference * 0.6;
    return (
      <svg width={svg} height={svg} viewBox={`0 0 ${svg} ${svg}`} className="animate-spin" style={{ animationDuration: '0.9s' }}>
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke="hsl(var(--heroui-default-200))"
          strokeWidth={stroke}
        />
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke="hsl(var(--heroui-primary-500))"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
        />
      </svg>
    );
  }

  // 已知进度：留 8% 缺口避免视觉上提前闭合
  const shown = Math.min(92, percent);
  const dash = (shown / 100) * circumference;
  return (
    <svg width={svg} height={svg} viewBox={`0 0 ${svg} ${svg}`}>
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke="hsl(var(--heroui-default-200))"
        strokeWidth={stroke}
      />
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke="hsl(var(--heroui-primary-500))"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference - dash}`}
        // 从顶部开始：旋转 -90deg
        transform={`rotate(-90 ${cx} ${cy})`}
      />
    </svg>
  );
}
