import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { debounce } from '@renderer/lib/utils';
import BrowserSideBar from '@renderer/components/SideBar';
import useNewTabModal from '@renderer/components/modals/NewTabModal';
import WebViewContainer from '@renderer/components/WebViewContainer';
import FrameOverlay from '@renderer/components/FrameOverlay';
import { LoadMenuEvents, UnLoadMenuEvents } from '@renderer/lib/menu';
import { getDefaultSettings, resolveUISize, Settings } from '@renderer/lib/settings';
import { useT } from '@renderer/lib/useT';
import { DEFAULT_LOCALE, resolveLocale, type Locale } from '@renderer/lib/i18n';
import ResizeSidebarDivider from '@renderer/components/ResizeSidebarDivider';
import InSecureHttpsCertificateModal from '@renderer/components/modals/InSecureHttpsCertificateModal';
import ExtensionInstallConfirmModal from '@renderer/components/modals/ExtensionInstallConfirmModal';
import useEditTabModal from '@renderer/components/modals/EditTabModal';
import useRenameTabModal from '@renderer/components/modals/RenameTabModal';
import { useBrowserState } from '@renderer/hooks/BrowserState';
import { useViews } from '@renderer/hooks/useViews';
import { useWebUIState, WebContextMenuParams } from '@renderer/lib/useWebUIState';
import ContextMenu, { ContextMenuItem } from '@renderer/components/ContextMenu';
import { Tab } from '@renderer/lib/tab';
import { LuArrowLeft, LuArrowRight, LuClipboard, LuCopy, LuEye, LuImage, LuLink2, LuPencilLine, LuPin, LuRotateCw, LuScissors, LuSquareAsterisk, LuTrash2, LuType, LuX } from 'react-icons/lu';

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

function App() {
  // browser
  const {
    browser,
    currentTab,
    currentSpace,
    allTabs,
    favoriteTabs,
    pinnedTabs,
    tabs,

    createTab,
    closeTab,
    selectTab,
    updateTab,
    pinTab,
    unpinTab,
    // addTabToFavorite,
    // removeTabFromFavorite,
    selectLastTab,
    selectTabByIndex,

    // createSpace,
    // selectSpace,
    // updateSpace,

    // findTabById,
    // getSpaceTabs,
    // recycleOldTabs
  } = useBrowserState();


  // others
  const [isCurrentTabLoading, setIsCurrentTabLoading] = useState<boolean>(false);

  // 网页端瞬态 UI 状态（光标 / 悬停链接 / 网页右键菜单），独立于 browser store
  const webUI = useWebUIState(browser.currentTabId);
  // 标签右键菜单状态：{ tab, x, y }，null 表示关闭
  const [tabContextMenu, setTabContextMenu] = useState<{ tab: Tab; x: number; y: number } | null>(null);


  // menu
  useEffect(() => {
    LoadMenuEvents({
      openNewTabModal,
      closeCurrentTab,
      reloadCurrentTab,
      currentTabGoBack,
      currentTabGoForward,
      toggleSideBar,
      selectTabByIndex,
      selectLastTab,
      openSettings: () => createTab('zot://settings'),
      openExtensions: () => createTab('zot://extensions'),
      openDownloads: () => createTab('zot://downloads')
    });

    // 监听从主进程发送的新标签页打开请求
    window.electron.ipcRenderer.on('open-url-in-new-tab', (_event, url: string) => {
      console.log('Received request to open URL in new tab:', url);
      createTab(url);
    });

    return () => {
      UnLoadMenuEvents();
      window.electron.ipcRenderer.removeAllListeners('open-url-in-new-tab');
    }
  }, [currentTab]);

  // —— 扩展宿主（electron-chrome-extensions）的 tab 桥接 ——
  // 扩展调 chrome.tabs.create/update({active})/remove 时，主进程经 IPC 请求 renderer
  // 操作标签状态（真相源在 renderer 的 useBrowserState）。此 effect 仅挂载一次，
  // 回调内用最新的 createTab/selectTab/closeTab 引用（经 ref，避免频繁重订阅）。
  const createTabRef = useRef(createTab);
  const selectTabRef = useRef(selectTab);
  const closeTabRef = useRef(closeTab);
  createTabRef.current = createTab;
  selectTabRef.current = selectTab;
  closeTabRef.current = closeTab;

  useEffect(() => {
    // chrome.tabs.create → 开标签并回传 tabId（主进程据此找 webContents）
    const onCreateReq = (_e: unknown, reqId: string, url: string): void => {
      const tab = createTabRef.current(url);
      window.electron.ipcRenderer.send('tabs-create-response', reqId, tab.id);
    };
    // chrome.tabs.update({active:true}) → 切到对应标签
    const onSelect = (_e: unknown, tabId: string): void => {
      selectTabRef.current(tabId);
    };
    // chrome.tabs.remove → 关闭对应标签
    const onRemove = (_e: unknown, tabId: string): void => {
      closeTabRef.current(tabId);
    };
    window.electron.ipcRenderer.on('tabs-create-request', onCreateReq);
    window.electron.ipcRenderer.on('tabs-select-by-tabid', onSelect);
    window.electron.ipcRenderer.on('tabs-remove-by-tabid', onRemove);
    return () => {
      window.electron.ipcRenderer.removeListener('tabs-create-request', onCreateReq);
      window.electron.ipcRenderer.removeListener('tabs-select-by-tabid', onSelect);
      window.electron.ipcRenderer.removeListener('tabs-remove-by-tabid', onRemove);
    };
  }, []);


  // settings
  const [settings, setSettings] = useState<Settings>(getDefaultSettings());
  const [isSettingsInitialized, setIsSettingsInitialized] = useState<boolean>(false);
  // 系统语言（用于 settings.locale 为 undefined「跟随系统」时的回退）
  const [systemLocale, setSystemLocale] = useState<Locale>(DEFAULT_LOCALE);

  function loadSettingsData() {
    // 探测系统语言（与 naturalScroll 一致：无论 settings 是否存在都读取，保证「跟随系统」语义）
    window.api.getSystemLocale().then((sys) => setSystemLocale(sys));
    window.store.get('settings').then((data) => {
      if (data) {
        console.log('Load Settings', data);
        // 首次运行 naturalScroll 未设置时，读取系统偏好
        if (data.naturalScroll === undefined) {
          window.api.getNaturalScroll().then((sysNatural) => {
            setSettings({ ...data, naturalScroll: sysNatural });
          });
        } else {
          setSettings(data);
        }
      } else {
        // 没有任何设置时，也检查系统偏好
        window.api.getNaturalScroll().then((sysNatural) => {
          setSettings({ ...getDefaultSettings(), naturalScroll: sysNatural });
        });
      }
      setIsSettingsInitialized(true);
    });
  }

  function handleSetSiteBarState(status: boolean) {
    setSettings((prevSettings) => {
      return {
        ...prevSettings,
        showSideBar: status
      };
    });
  }

  const debouncedSaveSettings = useMemo(
    () => debounce((settingsToSave: Settings) => {
      if (skipNextSaveRef.current) {
        skipNextSaveRef.current = false;
        return;
      }
      console.log("Debounced saving settings to store:", settingsToSave);
      window.store.set('settings', settingsToSave);
    }, 500),
    []
  );

  // 来自别处（如 zot://settings 页面）的 settings 变更广播：
  // 同步到本地状态使 UI 即时应用。设 skipNextSaveRef 避免本次 setSettings
  // 又触发 debouncedSaveSettings → store.set → 再次广播的回环。
  const skipNextSaveRef = useRef(false);
  useEffect(() => {
    const onSettingsChanged = (_e: unknown, next: Settings): void => {
      skipNextSaveRef.current = true;
      setSettings(next);
    };
    window.electron.ipcRenderer.on('settings-changed', onSettingsChanged);
    return () => {
      window.electron.ipcRenderer.removeAllListeners('settings-changed');
    };
  }, []);

  // —— 下载状态（供 SideBar 的下载按钮进度圈 + Dropdown 展示）——
  // activeDownloads：进行中（驱动按钮图标变进度圈）
  // recentDownloads：最近完成历史（驱动 Dropdown 列表）
  // 注：类型与 preload/index.d.ts 的 DownloadProgressPayload / DownloadHistoryItem 对齐。
  const [activeDownloads, setActiveDownloads] = useState<ActiveDownloadSnapshot[]>([]);
  const [recentDownloads, setRecentDownloads] = useState<RecentDownloadItem[]>([]);
  /** 仍存在的文件路径集合（savePath）。文件被删除时对应历史项隐藏「在文件夹中显示」。 */
  const [existingPaths, setExistingPaths] = useState<Set<string>>(new Set());
  useEffect(() => {
    // 初始拉取进行中快照 + 最近历史
    window.api.downloadGetActive().then((snapshot) => setActiveDownloads(snapshot ?? []));
    window.api.downloadGetHistory(5).then((items) => {
      setRecentDownloads(items ?? []);
      // 批量检查历史项文件是否仍存在
      const list = items ?? [];
      if (list.length > 0) {
        window.api.downloadCheckFiles(list.map((it) => it.savePath)).then((existing) => {
          setExistingPaths(new Set(existing));
        });
      }
    });

    const onProgress = (_e: unknown, p: ActiveDownloadSnapshot): void => {
      setActiveDownloads((prev) => {
        const idx = prev.findIndex((it) => it.id === p.id);
        if (idx === -1) return [...prev, p];
        const next = prev.slice();
        next[idx] = p;
        return next;
      });
    };
    const onDone = (
      _e: unknown,
      d: { id: string; state: 'completed' | 'cancelled' | 'interrupted'; filename: string; url: string; savePath: string; total: number; mimeType: string }
    ): void => {
      // 从进行中移除
      setActiveDownloads((prev) => prev.filter((it) => it.id !== d.id));
      // completed 时刷新最近历史（主进程已落库，这里重新拉取保证一致）
      if (d.state === 'completed') {
        window.api.downloadGetHistory(5).then((items) => setRecentDownloads(items ?? []));
        // 刚下载完成，文件必然存在
        setExistingPaths((prev) => new Set(prev).add(d.savePath));
      }
    };
    // 历史被删除/清空（来自主 UI 或 zot://downloads 页面）时，重新拉取保持同步
    const onHistoryChanged = (): void => {
      window.api.downloadGetHistory(5).then((items) => {
        setRecentDownloads(items ?? []);
        const list = items ?? [];
        if (list.length > 0) {
          window.api.downloadCheckFiles(list.map((it) => it.savePath)).then((existing) => {
            setExistingPaths(new Set(existing));
          });
        } else {
          setExistingPaths(new Set());
        }
      });
    };
    window.electron.ipcRenderer.on('download-progress', onProgress);
    window.electron.ipcRenderer.on('download-done', onDone);
    window.electron.ipcRenderer.on('downloads-history-changed', onHistoryChanged);
    return () => {
      window.electron.ipcRenderer.removeAllListeners('download-progress');
      window.electron.ipcRenderer.removeAllListeners('download-done');
      window.electron.ipcRenderer.removeAllListeners('downloads-history-changed');
    };
  }, []);

  // 定期检测文件存在性（30s），让 SideBar Dropdown 在文件被外部删除/恢复后自动更新按钮显隐。
  // 仅刷新 existingPaths，不动 recentDownloads（历史变更由 downloads-history-changed 广播覆盖）。
  useEffect(() => {
    if (recentDownloads.length === 0) return;
    const paths = recentDownloads.map((it) => it.savePath).filter(Boolean);
    if (paths.length === 0) return;
    const timer = window.setInterval(() => {
      window.api.downloadCheckFiles(paths).then((existing) => {
        setExistingPaths(new Set(existing));
      });
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [recentDownloads]);

  useEffect(() => {
    if (isSettingsInitialized && settings) {
      debouncedSaveSettings(settings);
    }
  }, [settings, isSettingsInitialized]);

  // 当前生效语言：settings.locale 为 undefined 时跟随系统
  const locale = useMemo(
    () => resolveLocale(settings?.locale, systemLocale),
    [settings?.locale, systemLocale]
  );
  const t = useT(locale);

  // 窗口标题随语言切换（frameless 窗口下标题主要影响任务栏/系统显示）
  useEffect(() => {
    document.title = t('app.name');
  }, [t]);

  const toggleSideBar = useCallback(() => {
    console.log('Try toggle sidebar, current state: ', settings.showSideBar);
    if (settings) {
      handleSetSiteBarState(!settings.showSideBar);
    }
  }, [settings]);

  const setSidebarWidth = useCallback((width: number) => {
    setSettings((prevSettings) => {
      const newSettings = {...prevSettings};
      newSettings.sidebarWidth = width;
      return newSettings;
    });
  }, [settings]);

  useEffect(() => {
    // data
    // window.store.delete("settings");
    loadSettingsData();
  }, []);


  // modals
  const [openEditTabModal, setEditTabModalContent, EditTabModal] = useEditTabModal(handleEditCurrentTab, undefined, resolveUISize(settings), t);
  const [openNewTabModal, NewTabModal] = useNewTabModal(createTab, resolveUISize(settings), t);

  // 记录当前正在重命名的 tab id（通过 ref，避免 onConfirm 闭包读到旧值）。
  // 留空提交即清除自定义名称 → 恢复跟随网页标题。
  const renameTargetTabIdRef = useRef<string | null>(null);
  const handleRenameConfirm = useCallback((name: string) => {
    const tabId = renameTargetTabIdRef.current;
    if (!tabId) return;
    updateTab(tabId, { customName: name });
    renameTargetTabIdRef.current = null;
  }, [updateTab]);
  const [openRenameTabModal, setRenameInitialValue, RenameTabModal] = useRenameTabModal(
    handleRenameConfirm,
    resolveUISize(settings),
    t
  );

  function handleOpenEditTabModal(content: string) {
    setEditTabModalContent(content);
    openEditTabModal();
  }


  // browser
  function handleFaviconsUpdate(favicons: string[], tabId: string) {
    if (favicons && favicons.length > 0) {
      let faviconLoadSuccess = false;
      favicons.forEach((favicon) => {
        if (faviconLoadSuccess) {
          return;
        }
        window.api.getFavicon(favicon).then((data) => {
          updateTab(tabId, { favicon: data });
          faviconLoadSuccess = true;
        });
      });
    }
  }

  function handleTitleUpdate(title: string, tabId: string) {
    // 若用户已设置自定义名称（customName 非空），则始终保持自定义名称，
    // 网页 title 事件不再覆盖显示名。
    const tab = browser.tabs[tabId];
    if (tab?.customName) return;
    updateTab(tabId, { name: title });
  }

  function handleLoadCommit(url: string, isMainFrame: boolean, tabId: string) {
    if (isMainFrame) {
      updateTab(tabId, { url });
    }
  }

  function handleEditCurrentTab(newUrl: string) {
    if (currentTab) {
      updateTab(currentTab.id, {src: newUrl});
    }
  }

  const closeCurrentTab = useCallback(() => {
    console.log('Try close current tab:', currentTab);
    if (currentTab) {
      closeTab(currentTab.id);
    }
  }, [currentTab]);

  const reloadCurrentTab = useCallback(() => {
    console.log('Try reload current tab:', currentTab);
    if (currentTab) {
      window.api.viewReload(currentTab.id);
    }
  }, [currentTab]);

  const currentTabGoBack = useCallback(() => {
    console.log('Try current tab go back:', currentTab);
    if (currentTab) {
      window.api.viewGoBack(currentTab.id);
    }
  }, [currentTab]);

  const currentTabGoForward = useCallback(() => {
    console.log('Try current tab go forward:', currentTab);
    if (currentTab) {
      window.api.viewGoForward(currentTab.id);
    }
  }, [currentTab]);

  // 加载状态由 useViews 的事件监听写入 tab.isLoading，这里直接派生
  useEffect(() => {
    setIsCurrentTabLoading(!!currentTab?.isLoading);
  }, [currentTab]);

  // 页面区域测量：把真实矩形同步给主进程（驱动 WebContentsView 的 setBounds）
  const pageAreaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = pageAreaRef.current;
    if (!el) return;
    const sendRect = (): void => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        window.api.setPageRect({ x: r.left, y: r.top, width: r.width, height: r.height });
      }
    };
    sendRect();
    const ro = new ResizeObserver(sendRect);
    ro.observe(el);
    window.addEventListener('resize', sendRect);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', sendRect);
    };
  }, [settings.showSideBar, settings.sidebarWidth]);

  // 阻断网页输入转发：模态框（dialog）或右键菜单打开时，
  // 通知主进程停止把输入事件转发给下层网页 view，避免"同时点到菜单和网页"。
  // 右键菜单由 React 状态驱动（即时）；dialog 由第三方组件挂载，用 MutationObserver 兜底。
  const menusOpen = !!tabContextMenu || !!webUI.contextMenu;
  useEffect(() => {
    // 右键菜单打开 → 必然阻断；关闭 → 退回按 dialog 实际状态决定
    if (menusOpen) {
      window.api.setModalOpen(true);
    } else {
      window.api.setModalOpen(!!document.querySelector('[role="dialog"]'));
    }
  }, [menusOpen]);
  useEffect(() => {
    const checkDialog = (): void => {
      if (menusOpen) return; // 右键菜单打开时不干预
      window.api.setModalOpen(!!document.querySelector('[role="dialog"]'));
    };
    const observer = new MutationObserver(checkDialog);
    observer.observe(document.body, { childList: true, subtree: true });
    checkDialog();
    return () => observer.disconnect();
  }, [menusOpen]);

  // 与主进程 WebContentsView 同步：对账视图、当前标签、UA、事件订阅
  useViews({
    allTabs,
    currentTabId: browser.currentTabId,
    settings,
    onFaviconsUpdate: handleFaviconsUpdate,
    onTitleUpdate: handleTitleUpdate,
    onLoadCommit: handleLoadCommit,
    onMediaStartedPlaying: (tabId) => updateTab(tabId, { isMediaPlaying: true }),
    onMediaPaused: (tabId) => updateTab(tabId, { isMediaPlaying: false, lastMediaPlayed: Date.now() }),
    onClose: closeTab,
    updateTab,
    onCursorChanged: (type) => webUI.setCursorType(type),
    onTargetURL: (url) => webUI.setHoverURL(url),
    onContextMenu: (params: WebContextMenuParams) =>
      webUI.setContextMenu({ tabId: browser.currentTabId ?? '', x: params.x, y: params.y, params })
  });

  // —— 标签右键菜单项（保持原有 固定/选择/关闭 三个动作，视觉规范化）——
  const tabContextMenuItems: ContextMenuItem[] = useMemo(() => {
    const tab = tabContextMenu?.tab;
    if (!tab) return [];
    const items: ContextMenuItem[] = [];
    items.push({
      key: 'pin',
      label: tab.isPinned ? t('context.tab.unpin') : t('context.tab.pin'),
      startContent: <LuPin size={15} />,
      onAction: () => (tab.isPinned ? unpinTab(tab.id) : pinTab(tab.id))
    });
    // 仅 pinned 标签允许重命名：设置 customName 后始终保持自定义名称，
    // 不再被网页 title 事件覆盖。已设置时菜单项显示为 Edit name。
    if (tab.isPinned) {
      items.push({
        key: 'rename',
        label: tab.customName ? t('context.tab.editName') : t('context.tab.rename'),
        startContent: <LuPencilLine size={15} />,
        onAction: () => {
          renameTargetTabIdRef.current = tab.id;
          // 初始值优先用已有的自定义名称，否则用网页标题
          setRenameInitialValue(tab.customName || tab.name || '');
          openRenameTabModal();
        }
      });
    }
    items.push({
      key: 'select',
      label: t('context.tab.select'),
      startContent: <LuSquareAsterisk size={15} />,
      isDisabled: currentTab ? currentTab.id === tab.id : false,
      onAction: () => selectTab(tab.id)
    });
    items.push({ key: 'div1', divider: true });
    items.push({
      key: 'close',
      label: t('context.tab.close'),
      color: 'danger',
      startContent: <LuX size={15} />,
      onAction: () => closeTab(tab.id)
    });
    return items;
  }, [t, tabContextMenu, currentTab, pinTab, unpinTab, selectTab, closeTab, openRenameTabModal, setRenameInitialValue]);

  // —— 网页内右键菜单项（按上下文动态显隐）——
  const webContextMenuItems: ContextMenuItem[] = useMemo(() => {
    const ctx = webUI.contextMenu;
    if (!ctx) return [];
    const p = ctx.params;
    const tabId = ctx.tabId;
    const tab = allTabs.find((x) => x.id === tabId);
    const items: ContextMenuItem[] = [];

    // 导航组
    items.push({
      key: 'back',
      label: t('context.web.back'),
      startContent: <LuArrowLeft size={15} />,
      isDisabled: !tab?.canGoBack,
      onAction: () => window.api.viewGoBack(tabId)
    });
    items.push({
      key: 'forward',
      label: t('context.web.forward'),
      startContent: <LuArrowRight size={15} />,
      isDisabled: !tab?.canGoForward,
      onAction: () => window.api.viewGoForward(tabId)
    });
    items.push({
      key: 'reload',
      label: t('context.web.reload'),
      startContent: <LuRotateCw size={15} />,
      onAction: () => window.api.viewReload(tabId)
    });
    items.push({ key: 'div-nav', divider: true });

    // 链接组
    if (p.linkURL) {
      items.push({
        key: 'open-link',
        label: t('context.web.openLinkNewTab'),
        startContent: <LuLink2 size={15} />,
        onAction: () => createTab(p.linkURL)
      });
      items.push({
        key: 'copy-link',
        label: t('context.web.copyLink'),
        startContent: <LuCopy size={15} />,
        onAction: () => navigator.clipboard?.writeText(p.linkURL).catch(() => {})
      });
      items.push({ key: 'div-link', divider: true });
    }

    // 媒体组（图片）
    if (p.mediaType === 'image') {
      items.push({
        key: 'copy-image-addr',
        label: t('context.web.copyImage'),
        startContent: <LuImage size={15} />,
        onAction: () => navigator.clipboard?.writeText(p.srcURL).catch(() => {})
      });
      items.push({ key: 'div-media', divider: true });
    }

    // 编辑组（可编辑或有选区时显示，按 editFlags 动态显隐）
    const showEdit = p.isEditable || !!p.selectionText;
    if (showEdit) {
      const ef = p.editFlags;
      if (p.isEditable) {
        items.push({
          key: 'cut',
          label: t('context.web.cut'),
          startContent: <LuScissors size={15} />,
          isDisabled: !ef?.canCut,
          onAction: () => window.api.viewCut(tabId)
        });
      }
      items.push({
        key: 'copy',
        label: t('context.web.copy'),
        startContent: <LuCopy size={15} />,
        isDisabled: !ef?.canCopy,
        onAction: () => window.api.viewCopy(tabId)
      });
      if (p.isEditable) {
        items.push({
          key: 'paste',
          label: t('context.web.paste'),
          startContent: <LuClipboard size={15} />,
          isDisabled: !ef?.canPaste,
          onAction: () => window.api.viewPaste(tabId)
        });
        items.push({
          key: 'delete',
          label: t('context.web.delete'),
          startContent: <LuTrash2 size={15} />,
          isDisabled: !ef?.canDelete,
          onAction: () => window.api.viewDelete(tabId)
        });
      }
      items.push({
        key: 'select-all',
        label: t('context.web.selectAll'),
        startContent: <LuType size={15} />,
        isDisabled: !ef?.canSelectAll,
        onAction: () => window.api.viewSelectAll(tabId)
      });
      items.push({ key: 'div-edit', divider: true });
    }

    // 开发者组
    items.push({
      key: 'view-source',
      label: t('context.web.viewSource'),
      startContent: <LuEye size={15} />,
      onAction: () => window.api.viewViewSource(tabId)
    });
    items.push({
      key: 'inspect',
      label: t('context.web.inspect'),
      startContent: <LuEye size={15} />,
      onAction: () => window.api.viewInspect(tabId, ctx.x, ctx.y)
    });

    return items;
  }, [t, webUI.contextMenu, allTabs, createTab]);


  // render
  return (
    <div className="relative flex flex-col w-screen h-screen">
      {/* 全局背景画框：白色 + 卡片洞口 + inner shadow，作为整个 UI 的统一背景层 */}
      <FrameOverlay pageAreaRef={pageAreaRef} />
      {/* 主 UI 容器 */}
      <div className={`relative z-10 flex flex-row w-fulls h-full grow gap-0`}>
        <BrowserSideBar
          showSideBar={settings.showSideBar}
          currentTab={currentTab}
          currentSpace={currentSpace}
          favoriteTabs={favoriteTabs}
          pinnedTabs={pinnedTabs}
          tabs={tabs}
          openNewTabModal={openNewTabModal}
          onTabClose={closeTab}
          onTabSelect={selectTab}
          onTabContextMenu={(e, tab) => setTabContextMenu({ tab, x: e.clientX, y: e.clientY })}
          setSiteBarState={handleSetSiteBarState}
          spaces={Object.values(browser.spaces)}
          width={settings.sidebarWidth}
          openEditTabModal={handleOpenEditTabModal}
          showFullUrl={settings.showFullUrl}
          openSettings={() => createTab('zot://settings')}
          openExtensions={() => createTab('zot://extensions')}
          openDownloads={() => createTab('zot://downloads')}
          activeDownloads={activeDownloads}
          recentDownloads={recentDownloads}
          existingPaths={existingPaths}
          uiSize={resolveUISize(settings)}
          t={t}
          className="p-2 pr-0"
        />

        {
          settings.showSideBar && (
            <ResizeSidebarDivider
              sidebarWidth={settings.sidebarWidth}
              setSidebarWidth={setSidebarWidth}
            />
          )
        }

        {/* 页面区域占位 — 实际页面由主进程 WebContentsView 在底层窗口渲染，这里只放测量锚点 */}
        <WebViewContainer
          isLoading={isCurrentTabLoading}
          pageAreaRef={pageAreaRef}
          naturalScroll={settings.naturalScroll}
          cursorType={webUI.cursorType}
          hoverURL={webUI.hoverURL}
          currentTab={currentTab}
          t={t}
        />
      </div>

      {/* Modals — 直接在覆盖层显示，无需隐藏页面 */}
      <InSecureHttpsCertificateModal t={t}/>
      <ExtensionInstallConfirmModal t={t}/>
      {EditTabModal}
      {NewTabModal}
      {RenameTabModal}

      {/* 标签右键菜单 */}
      <ContextMenu
        open={!!tabContextMenu}
        x={tabContextMenu?.x ?? 0}
        y={tabContextMenu?.y ?? 0}
        onClose={() => setTabContextMenu(null)}
        items={tabContextMenuItems}
      />

      {/* 网页内右键菜单 */}
      <ContextMenu
        open={!!webUI.contextMenu}
        x={webUI.contextMenu?.x ?? 0}
        y={webUI.contextMenu?.y ?? 0}
        onClose={() => webUI.setContextMenu(null)}
        items={webContextMenuItems}
      />
    </div>
  );
}

export default App;
