import { useCallback, useEffect, useMemo, useState } from 'react';
import { debounce } from '@renderer/lib/utils';
import {
  Browser,
  CreateNewBrowser,
  deserializeBrowser,
  SerializableBrowser,
  serializeBrowser
} from '@renderer/lib/browser';
import BrowserSideBar from '@renderer/components/SideBar';
import { CreateNewTab, recycleOldTabs, Tab, upgradeTabToPinnedTab } from '@renderer/lib/tab';
import { Space } from '@renderer/lib/space';
import useNewTabModal from '@renderer/components/modals/NewTabModal';
import WebViewContainer from '@renderer/components/WebViewContainer';
import WebView from '@renderer/components/WebView';
import { LoadMenuEvents, UnLoadMenuEvents } from '@renderer/lib/menu';
import { getDefaultSettings, Settings } from '@renderer/lib/settings';
import ResizeSidebarDivider from '@renderer/components/ResizeSidebarDivider';
import InSecureHttpsCertificateModal from '@renderer/components/modals/InSecureHttpsCertificateModal';
import useEditTabModal from '@renderer/components/modals/EditTabModal';

function App() {
  const [browser, setBrowser] = useState<Browser>(CreateNewBrowser());
  const [isBrowserInitialized, setIsBrowserInitialized] = useState<boolean>(false);
  const [currentTab, setCurrentTab] = useState<Tab | null>(null);
  const [currentSpace, setCurrentSpace] = useState<Space | null>(null);
  const [allTabs, setAllTabs] = useState<Tab[]>([]);
  const [openNewTabModal, NewTabModal] = useNewTabModal(handleNewTab);
  const [settings, setSettings] = useState<Settings>(getDefaultSettings());
  const [isSettingsInitialized, setIsSettingsInitialized] = useState<boolean>(false);
  const [openEditTabModal, setEditTabModalContent, EditTabModal] = useEditTabModal(handleEditCurrentTab);
  const [isCurrentTabLoading, setIsCurrentTabLoading] = useState<boolean>(false);

  function handleOpenEditTabModal(content: string) {
    setEditTabModalContent(content);
    openEditTabModal();
  }

  function loadBrowserData() {
    window.store.get('browser').then((data) => {
      if (data) {
        console.log('Load Browser', data);
        setBrowser(deserializeBrowser(data));
      }
      setIsBrowserInitialized(true);
    });
  }

  function loadSettingsData() {
    window.store.get('settings').then((data) => {
      if (data) {
        console.log('Load Settings', data);
        setSettings(data);
      }
      setIsSettingsInitialized(true);
    });
  }

  const debouncedSaveBrowser = useMemo(
    () => debounce((browserToSave: SerializableBrowser) => {
      console.log("Debounced saving browser to store:", browserToSave);
      window.store.set('browser', browserToSave);
    }, 500),
    []
  );

  const debouncedSaveSettings = useMemo(
    () => debounce((settingsToSave: Settings) => {
      console.log("Debounced saving settings to store:", settingsToSave);
      window.store.set('settings', settingsToSave);
    }, 500),
    []
  );

  function findTabById(id: string | undefined, browserData?: Browser, currentSpaceData?: Space): [Tab, Space, boolean] | Tab | null {
    let bd = browserData;
    if (!bd) {
      bd = browser;
    }
    let csd = currentSpaceData;
    if (!csd) {
      csd = currentSpace || undefined;
    }

    if (!id) return null;

    let tab: Tab | null = null;

    // find in favorite
    tab = bd.favoriteTabs.find((t) => t.id === id) || null;
    if (tab) return tab;

    // find in current space
    if (csd) {
      tab = csd.pinnedTabs.find((t) => t.id === id) || null;
      if (tab) return [tab, csd, true];
      tab = csd.tabs.find((t) => t.id === id) || null;
      if (tab) return [tab, csd, false];
    }

    // find in other space
    for (let i = 0; i < bd.spaces.length; i ++) {
      tab = bd.spaces[i].pinnedTabs.find((t) => t.id === id) || null;
      if (tab) return [tab, bd.spaces[i], true];
      tab = bd.spaces[i].tabs.find((t) => t.id === id) || null;
      if (tab) return [tab, bd.spaces[i], false];
    }

    // final
    return null;
  }

  function updateTabProperty(tabId: string, updates: Partial<Tab>) {
    const tabData = findTabById(tabId);
    if (!tabData) return;

    if (currentTab && currentTab.id === tabId) {
      setCurrentTab(prev => prev ? { ...prev, ...updates } : null);
    }

    setBrowser(prevBrowser => {
      const newBrowser = {...prevBrowser};
      // in Favorite Tabs
      if (!Array.isArray(tabData)) {
        newBrowser.favoriteTabs = newBrowser.favoriteTabs.map(tab =>
          tab.id === tabId ? { ...tab, ...updates } : tab
        );
        return newBrowser;
      }
      // in Space
      const [_tab, space, isPinned] = tabData;

      const spaceIndex = newBrowser.spaces.findIndex(s => s.id === space.id);
      if (spaceIndex === -1) return prevBrowser;

      if (isPinned) {
        // 更新固定标签页
        newBrowser.spaces[spaceIndex].pinnedTabs = newBrowser.spaces[spaceIndex].pinnedTabs.map(t =>
          t.id === tabId ? { ...t, ...updates } : t
        );
      } else {
        // 更新普通标签页
        newBrowser.spaces[spaceIndex].tabs = newBrowser.spaces[spaceIndex].tabs.map(t =>
          t.id === tabId ? { ...t, ...updates } : t
        );
      }
      return newBrowser;
    });
  }

  function handleFaviconsUpdate(favicons: string[], tabId: string) {
    if (favicons && favicons.length > 0) {
      let faviconLoadSuccess = false;
      favicons.forEach((favicon) => {
        if (faviconLoadSuccess) {
          return;
        }
        window.api.getFavicon(favicon).then((data) => {
          updateTabProperty(tabId, { favicon: data });
          faviconLoadSuccess = true;
        });
      });
    }
  }

  function handleTitleUpdate(title: string, tabId: string) {
    updateTabProperty(tabId, { name: title });
  }

  function handleLoadCommit(url: string, isMainFrame: boolean, tabId: string) {
    if (isMainFrame) {
      updateTabProperty(tabId, { url });
    }
  }

  function handleNewTab(url: string) {
    const newTab = CreateNewTab(url);
    if (currentSpace) {
      setBrowser(prevBrowser => {
        const newBrowser = { ...prevBrowser };
        const spaceIndex = newBrowser.spaces.findIndex(s => s.id === currentSpace.id);

        if (spaceIndex === -1) return prevBrowser;

        newBrowser.spaces[spaceIndex].tabs = [
          ...newBrowser.spaces[spaceIndex].tabs,
          newTab
        ];

        newBrowser.currentTabId = newTab.id;
        newBrowser.currentSpaceId = currentSpace.id;

        return newBrowser;
      });
    }
  }

  function handleTabClose(tabId: string) {
    const tabData = findTabById(tabId);
    if (!tabData) return;

    if (!Array.isArray(tabData)) {
      const index = browser.favoriteTabs.findIndex(t => t.id === tabId);
      if (index !== -1) {
        setBrowser(prevBrowser => {
          const newBrowser = {...prevBrowser};
          const removedTab = newBrowser.favoriteTabs.splice(index, 1);
          if (removedTab[0].id === tabId) {
            return newBrowser;
          } else {
            return prevBrowser;
          }
        });
      }
    } else {
      const [_tab, space, isPinned] = tabData;
      const spaceIndex = browser.spaces.findIndex(s => s.id === space.id);
      if (spaceIndex === -1) return;
      if (isPinned) {
        const tabIndex = browser.spaces[spaceIndex].pinnedTabs.findIndex(t => t.id === tabId);
        if (tabIndex === -1) return;
        setBrowser(prevBrowser => {
          const newBrowser = {...prevBrowser};
          const removedTab = newBrowser.spaces[spaceIndex].pinnedTabs.splice(tabIndex, 1);
          if (removedTab[0].id === tabId) {
            return newBrowser;
          } else {
            return prevBrowser;
          }
        });
      } else {
        const tabIndex = browser.spaces[spaceIndex].tabs.findIndex(t => t.id === tabId);
        if (tabIndex === -1) return;
        setBrowser(prevBrowser => {
          const newBrowser = {...prevBrowser};
          const removedTab = newBrowser.spaces[spaceIndex].tabs.splice(tabIndex, 1);
          if (removedTab[0].id === tabId) {
            return newBrowser;
          } else {
            return prevBrowser;
          }
        });
      }
    }

    console.log('Close Tab:', tabData);
  }

  function handleSelectTab(tabId: string) {
    const tabData = findTabById(tabId);
    if (!tabData) return;
    updateTabProperty(tabId, { lastAccessed: Date.now() });
    if (!Array.isArray(tabData)) {
      setBrowser(prevBrowser => {
        const newBrowser = {...prevBrowser};
        newBrowser.currentTabId = tabId;
        return newBrowser;
      });
    } else {
      const [_tab, space, _isPinned] = tabData;
      setBrowser(prevBrowser => {
        const newBrowser = {...prevBrowser};
        newBrowser.currentTabId = tabId;
        newBrowser.currentSpaceId = space.id;
        return newBrowser;
      });
    }
  }

  function handlePinTab(tabId: string) {
    const tabData = findTabById(tabId);
    if (!tabData) return;
    if (Array.isArray(tabData)) {
      const [_tab, space, isPinned] = tabData;
      if (!isPinned) {
        console.log('Pin tab: ', tabId);
        // move tab from normal to pin
        setBrowser((prevBrowser) => {
          const newBrowser = {...prevBrowser};
          const spaceIndex = newBrowser.spaces.findIndex(s => s.id === space.id);
          if (spaceIndex === -1) return prevBrowser;
          const tabIndex = newBrowser.spaces[spaceIndex].tabs.findIndex(t => t.id === tabId);
          if (tabIndex === -1) return prevBrowser;
          const moveTab = newBrowser.spaces[spaceIndex].tabs.splice(tabIndex, 1);
          moveTab.forEach((tab) => {
            newBrowser.spaces[spaceIndex].pinnedTabs.push(upgradeTabToPinnedTab(tab));
          });
          return newBrowser;
        });
      }
    }
  }

  function handlePinGoSource(tabId: string) {
    const tabData = findTabById(tabId);
    if (!tabData) return;
    if (!Array.isArray(tabData)) {
      if (tabData.webview.current && tabData.pinnedUrl) {
        tabData.webview.current.loadURL(tabData.pinnedUrl);
      }
    } else {
      const [tab, _space, isPinned] = tabData;
      if (isPinned) {
        console.log(`Pin tab ${tab.id} back to ${tab.pinnedUrl}`);
        if (tab.webview.current && tab.pinnedUrl) {
          tab.webview.current.loadURL(tab.pinnedUrl);
        }
      }
    }

    console.log('Back Tab to Source:', tabData);
  }

  function handleSetSiteBarState(status: boolean) {
    setSettings((prevSettings) => {
      return {
        ...prevSettings,
        showSideBar: status
      };
    });
  }

  function handleEditCurrentTab(newUrl: string) {
    if (currentTab) {
      updateTabProperty(currentTab.id, {src: newUrl});
    }
  }

  const closeCurrentTab = useCallback(() => {
    console.log('Try delete current tab:', currentTab);

    if (!currentTab) return;

    const tabData = findTabById(currentTab.id);
    if (!tabData) return;

    if (!Array.isArray(tabData)) {
      handlePinGoSource(tabData.id);
    } else {
      const [tab, _space, isPinned] = tabData;
      if (isPinned) {
        handlePinGoSource(tab.id);
      } else {
        handleTabClose(tab.id);
      }
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

  const recycleOldTabsCallback = useCallback(() => {
    console.log("Recycle Old Tabs");
    recycleOldTabs({
      allTabs,
      currentTabId: browser.currentTabId,
      makeTabNotRender: (tabId) => {
        updateTabProperty(tabId, {shouldRender: false});
      },
      interval: settings.clearTabInterval
    });
  }, [allTabs, browser, settings]);

  useEffect(() => {
    // data
    // window.store.delete("browser");
    // window.store.delete("settings");
    loadBrowserData();
    loadSettingsData();
  }, []);

  useEffect(() => {
    // recycle old tabs every 10 seconds
    const intervalId = setInterval(() => {
      recycleOldTabsCallback();
    }, 10000);

    return () => {
      clearInterval(intervalId);
    };
  }, [recycleOldTabsCallback]);

  useEffect(() => {
    // menu
    LoadMenuEvents({
      openNewTabModal,
      closeCurrentTab,
      reloadCurrentTab,
      currentTabGoBack,
      currentTabGoForward,
      toggleSideBar
    });

    return () => {
      UnLoadMenuEvents();
    }
  }, [currentTab, settings]);

  useEffect(() => {
    if (isBrowserInitialized && browser) {
      debouncedSaveBrowser(serializeBrowser(browser));
    }
  }, [browser, isBrowserInitialized]);

  useEffect(() => {
    if (isSettingsInitialized && settings) {
      debouncedSaveSettings(settings);
    }
  }, [settings, isSettingsInitialized]);

  useEffect(() => {
    if (currentTab && currentTab.webview.current) {
      try {
        setIsCurrentTabLoading(currentTab.webview.current.isLoading());
      } catch (_e) {}
    } else {
      setIsCurrentTabLoading(false);
    }
  }, [currentTab]);

  useEffect(() => {
    const space = browser.spaces.find((s) => s.id === browser.currentSpaceId);
    if (space) {
      setCurrentSpace(space);

      if (browser.currentTabId) {
        const tabData = findTabById(browser.currentTabId, browser, space);
        if (!tabData) {
          setCurrentTab(null);
          return;
        }

        let tab: Tab | null = null;
        if (!Array.isArray(tabData)) {
          tab = tabData;
        } else {
          const [t, _space, _isPinned] = tabData;
          tab = t;
        }

        if (tab) {
          if (!tab.shouldRender) {
            updateTabProperty(tab.id, {shouldRender: true});
          }
          setCurrentTab(tab);
        } else {
          setCurrentTab(null);
        }
      }
    }
  }, [browser]);

  useEffect(() => {
    const tabs = browser.favoriteTabs
      .concat(currentSpace ? currentSpace.pinnedTabs : [])
      .concat(currentSpace ? currentSpace.tabs : []);
    setAllTabs(tabs);
  }, [browser, currentSpace]);

  return (
    <div className="flex flex-col w-[100vw] h-[100vh]">
      <div className={`flex flex-row w-fulls h-full grow gap-0`}>
        <BrowserSideBar
          showSideBar={settings.showSideBar}
          currentTab={currentTab}
          currentSpace={currentSpace}
          favoriteTabs={browser.favoriteTabs}
          pinnedTabs={currentSpace ? currentSpace.pinnedTabs : []}
          tabs={currentSpace ? currentSpace.tabs : []}
          openNewTabModal={openNewTabModal}
          onTabClose={handleTabClose}
          onTabSelect={handleSelectTab}
          onTabPin={handlePinTab}
          onPinGoSource={handlePinGoSource}
          setSiteBarState={handleSetSiteBarState}
          spaces={browser.spaces}
          width={settings.sidebarWidth}
          openEditTabModal={handleOpenEditTabModal}
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
