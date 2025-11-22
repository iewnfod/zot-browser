import { useCallback, useEffect, useMemo, useState } from 'react';
import { debounce } from '@renderer/lib/utils';
import BrowserSideBar from '@renderer/components/SideBar';
import useNewTabModal from '@renderer/components/modals/NewTabModal';
import WebViewContainer from '@renderer/components/WebViewContainer';
import WebView from '@renderer/components/WebView';
import { LoadMenuEvents, UnLoadMenuEvents } from '@renderer/lib/menu';
import { getDefaultSettings, Settings } from '@renderer/lib/settings';
import ResizeSidebarDivider from '@renderer/components/ResizeSidebarDivider';
import InSecureHttpsCertificateModal from '@renderer/components/modals/InSecureHttpsCertificateModal';
import useEditTabModal from '@renderer/components/modals/EditTabModal';
import { useBrowserState } from '@renderer/hooks/BrowserState';

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
    recycleOldTabs
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

    return () => {
      UnLoadMenuEvents();
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
    if (currentTab && currentTab.webview.current) {
      currentTab.webview.current.reload();
    }
  }, [currentTab]);

  const currentTabGoBack = useCallback(() => {
    console.log('Try current tab go back:', currentTab);
    if (currentTab && currentTab.webview.current) {
      currentTab.webview.current.goBack();
    }
  }, [currentTab]);

  const currentTabGoForward = useCallback(() => {
    console.log('Try current tab go forward:', currentTab);
    if (currentTab && currentTab.webview.current) {
      currentTab.webview.current.goForward();
    }
  }, [currentTab]);

  const debouncedRecycleOldTabs = useMemo(
    () => debounce(() => {
      recycleOldTabs();
    }, 500),
    [allTabs, browser, settings]
  );

  useEffect(() => {
    // recycle old tabs every 10 seconds
    const intervalId = setInterval(() => {
      debouncedRecycleOldTabs();
    }, 10000);

    return () => {
      clearInterval(intervalId);
    };
  }, [recycleOldTabs]);

  useEffect(() => {
    debouncedRecycleOldTabs();
  }, [allTabs, browser, settings]);

  useEffect(() => {
    if (currentTab && currentTab.webview.current) {
      try {
        setIsCurrentTabLoading(currentTab.webview.current.isLoading());
      } catch (_e) {}
    } else {
      setIsCurrentTabLoading(false);
    }
  }, [currentTab]);


  // render
  return (
    <div className="flex flex-col w-[100vw] h-[100vh]">
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

        {/* WebView */}
        <WebViewContainer isLoading={isCurrentTabLoading}>
          {
            allTabs.map((tab) => (
              (tab.shouldRender && (
                <WebView
                  key={tab.id}
                  src={tab.src}
                  ref={tab.webview}
                  useragent={settings.ua}
                  partition="persist:shared-partition"
                  className={`w-full h-full ${tab.id === browser.currentTabId ? '' : 'hidden'}`}
                  onPageFaviconUpdated={(favicons) => handleFaviconsUpdate(favicons, tab.id)}
                  onPageTitleUpdated={(title) => handleTitleUpdate(title, tab.id)}
                  onLoadCommit={(url, isMainFrame) => handleLoadCommit(url, isMainFrame, tab.id)}
                />
              ))
            ))
          }
        </WebViewContainer>
      </div>

      {/* Modals */}
      <InSecureHttpsCertificateModal/>
      {EditTabModal}
      {NewTabModal}
    </div>
  );
}

export default App;
