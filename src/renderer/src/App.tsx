import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { debounce } from '@renderer/lib/utils';
import BrowserSideBar from '@renderer/components/SideBar';
import useNewTabModal from '@renderer/components/modals/NewTabModal';
import WebViewContainer from '@renderer/components/WebViewContainer';
import { LoadMenuEvents, UnLoadMenuEvents } from '@renderer/lib/menu';
import { getDefaultSettings, Settings } from '@renderer/lib/settings';
import ResizeSidebarDivider from '@renderer/components/ResizeSidebarDivider';
import InSecureHttpsCertificateModal from '@renderer/components/modals/InSecureHttpsCertificateModal';
import useEditTabModal from '@renderer/components/modals/EditTabModal';
import { useBrowserState } from '@renderer/hooks/BrowserState';
import { useViews } from '@renderer/hooks/useViews';
import { useWebUIState, WebContextMenuParams } from '@renderer/lib/useWebUIState';
import ContextMenu, { ContextMenuItem } from '@renderer/components/ContextMenu';
import { Tab } from '@renderer/lib/tab';
import { LuArrowLeft, LuArrowRight, LuClipboard, LuCopy, LuEye, LuImage, LuLink2, LuPin, LuRotateCw, LuScissors, LuSquareAsterisk, LuTrash2, LuType, LuX } from 'react-icons/lu';

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
      selectLastTab
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


  // settings
  const [settings, setSettings] = useState<Settings>(getDefaultSettings());
  const [isSettingsInitialized, setIsSettingsInitialized] = useState<boolean>(false);

  function loadSettingsData() {
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

  const handleSetNaturalScroll = useCallback((naturalScroll: boolean) => {
    setSettings((prevSettings) => {
      return {
        ...prevSettings,
        naturalScroll
      };
    });
  }, []);

  const debouncedSaveSettings = useMemo(
    () => debounce((settingsToSave: Settings) => {
      console.log("Debounced saving settings to store:", settingsToSave);
      window.store.set('settings', settingsToSave);
    }, 500),
    []
  );

  useEffect(() => {
    if (isSettingsInitialized && settings) {
      debouncedSaveSettings(settings);
    }
  }, [settings, isSettingsInitialized]);

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
  const [openEditTabModal, setEditTabModalContent, EditTabModal] = useEditTabModal(handleEditCurrentTab);
  const [openNewTabModal, NewTabModal] = useNewTabModal(createTab);

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
    const t = tabContextMenu?.tab;
    if (!t) return [];
    const items: ContextMenuItem[] = [];
    items.push({
      key: 'pin',
      label: t.isPinned ? 'Unpin' : 'Pin',
      startContent: <LuPin size={15} />,
      onAction: () => (t.isPinned ? unpinTab(t.id) : pinTab(t.id))
    });
    items.push({
      key: 'select',
      label: 'Select',
      startContent: <LuSquareAsterisk size={15} />,
      isDisabled: currentTab ? currentTab.id === t.id : false,
      onAction: () => selectTab(t.id)
    });
    items.push({ key: 'div1', divider: true });
    items.push({
      key: 'close',
      label: 'Close',
      color: 'danger',
      startContent: <LuX size={15} />,
      onAction: () => closeTab(t.id)
    });
    return items;
  }, [tabContextMenu, currentTab, pinTab, unpinTab, selectTab, closeTab]);

  // —— 网页内右键菜单项（按上下文动态显隐）——
  const webContextMenuItems: ContextMenuItem[] = useMemo(() => {
    const ctx = webUI.contextMenu;
    if (!ctx) return [];
    const p = ctx.params;
    const tabId = ctx.tabId;
    const tab = allTabs.find((t) => t.id === tabId);
    const items: ContextMenuItem[] = [];

    // 导航组
    items.push({
      key: 'back',
      label: 'Back',
      startContent: <LuArrowLeft size={15} />,
      isDisabled: !tab?.canGoBack,
      onAction: () => window.api.viewGoBack(tabId)
    });
    items.push({
      key: 'forward',
      label: 'Forward',
      startContent: <LuArrowRight size={15} />,
      isDisabled: !tab?.canGoForward,
      onAction: () => window.api.viewGoForward(tabId)
    });
    items.push({
      key: 'reload',
      label: 'Reload',
      startContent: <LuRotateCw size={15} />,
      onAction: () => window.api.viewReload(tabId)
    });
    items.push({ key: 'div-nav', divider: true });

    // 链接组
    if (p.linkURL) {
      items.push({
        key: 'open-link',
        label: 'Open link in new tab',
        startContent: <LuLink2 size={15} />,
        onAction: () => createTab(p.linkURL)
      });
      items.push({
        key: 'copy-link',
        label: 'Copy link address',
        startContent: <LuCopy size={15} />,
        onAction: () => navigator.clipboard?.writeText(p.linkURL).catch(() => {})
      });
      items.push({ key: 'div-link', divider: true });
    }

    // 媒体组（图片）
    if (p.mediaType === 'image') {
      items.push({
        key: 'copy-image-addr',
        label: 'Copy image address',
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
          label: 'Cut',
          startContent: <LuScissors size={15} />,
          isDisabled: !ef?.canCut,
          onAction: () => window.api.viewCut(tabId)
        });
      }
      items.push({
        key: 'copy',
        label: 'Copy',
        startContent: <LuCopy size={15} />,
        isDisabled: !ef?.canCopy,
        onAction: () => window.api.viewCopy(tabId)
      });
      if (p.isEditable) {
        items.push({
          key: 'paste',
          label: 'Paste',
          startContent: <LuClipboard size={15} />,
          isDisabled: !ef?.canPaste,
          onAction: () => window.api.viewPaste(tabId)
        });
        items.push({
          key: 'delete',
          label: 'Delete',
          startContent: <LuTrash2 size={15} />,
          isDisabled: !ef?.canDelete,
          onAction: () => window.api.viewDelete(tabId)
        });
      }
      items.push({
        key: 'select-all',
        label: 'Select all',
        startContent: <LuType size={15} />,
        isDisabled: !ef?.canSelectAll,
        onAction: () => window.api.viewSelectAll(tabId)
      });
      items.push({ key: 'div-edit', divider: true });
    }

    // 开发者组
    items.push({
      key: 'view-source',
      label: 'View page source',
      startContent: <LuEye size={15} />,
      onAction: () => window.api.viewViewSource(tabId)
    });
    items.push({
      key: 'inspect',
      label: 'Inspect',
      startContent: <LuEye size={15} />,
      onAction: () => window.api.viewInspect(tabId, ctx.x, ctx.y)
    });

    return items;
  }, [webUI.contextMenu, allTabs, createTab]);


  // render
  return (
    <div className="flex flex-col w-screen h-screen">
      {/* 主 UI 容器 */}
      <div className={`flex flex-row w-fulls h-full grow gap-0`}>
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
          naturalScroll={settings.naturalScroll}
          onNaturalScrollChange={handleSetNaturalScroll}
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
        />
      </div>

      {/* Modals — 直接在覆盖层显示，无需隐藏页面 */}
      <InSecureHttpsCertificateModal/>
      {EditTabModal}
      {NewTabModal}

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
