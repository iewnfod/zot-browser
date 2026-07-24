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
        setSettings(data);
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

  // 模态框 z-order：打开时将 UI view 提升到网页之上，关闭时恢复
  useEffect(() => {
    const checkModal = (): void => {
      const hasModal = !!document.querySelector('[role="dialog"]');
      window.api.setModalOpen(hasModal);
    };
    const observer = new MutationObserver(checkModal);
    observer.observe(document.body, { childList: true, subtree: true });
    checkModal();
    return () => observer.disconnect();
  }, []);

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
    updateTab
  });


  // render
  return (
    <div className="flex flex-col w-[100vw] h-[100vh]">
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
          onTabPin={pinTab}
          onTabUnpin={unpinTab}
          setSiteBarState={handleSetSiteBarState}
          spaces={Object.values(browser.spaces)}
          width={settings.sidebarWidth}
          openEditTabModal={handleOpenEditTabModal}
          showFullUrl={settings.showFullUrl}
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
        <WebViewContainer isLoading={isCurrentTabLoading} pageAreaRef={pageAreaRef} />
      </div>

      {/* Modals — 直接在覆盖层显示，无需隐藏页面 */}
      <InSecureHttpsCertificateModal/>
      {EditTabModal}
      {NewTabModal}
    </div>
  );
}

export default App;
