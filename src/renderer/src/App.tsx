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
import { CreateNewTab, Tab, upgradeTabToPinnedTab } from '@renderer/lib/tab';
import { Space } from '@renderer/lib/space';
import useNewTabModal from '@renderer/components/modals/NewTabModal';
import WebViewContainer from '@renderer/components/WebViewContainer';
import WebView from '@renderer/components/WebView';
import { LoadMenuEvents, UnLoadMenuEvents } from '@renderer/lib/menu';

function App() {
  const [browser, setBrowser] = useState<Browser>(CreateNewBrowser());
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [currentTab, setCurrentTab] = useState<Tab | null>(null);
  const [currentSpace, setCurrentSpace] = useState<Space | null>(null);
  const [allTabs, setAllTabs] = useState<Tab[]>([]);
  const [openNewTabModal, NewTabModal] = useNewTabModal(handleNewTab);

  function loadBrowserData() {
    window.store.get('browser').then((data) => {
      if (data) {
        console.log('Load Browser', data);
        setBrowser(deserializeBrowser(data));
      }
      setIsInitialized(true);
    });
  }

  const debouncedSave = useMemo(
    () => debounce((browserToSave: SerializableBrowser) => {
      console.log("Debounced saving to store:", browserToSave);
      window.store.set('browser', browserToSave);
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

  useEffect(() => {
    // data
    // window.store.delete("browser");
    loadBrowserData();
  }, []);

  useEffect(() => {
    // menu
    LoadMenuEvents({
      openNewTabModal,
      closeCurrentTab,
      reloadCurrentTab
    });

    return () => {
      UnLoadMenuEvents();
    }
  }, [currentTab]);

  useEffect(() => {
    if (isInitialized && browser) {
      debouncedSave(serializeBrowser(browser));
    }
  }, [browser, isInitialized]);

  useEffect(() => {
    const space = browser.spaces.find((s) => s.id === browser.currentSpaceId);
    if (space) {
      setCurrentSpace(space);

      if (browser.currentTabId) {
        const tabData = findTabById(browser.currentTabId, browser, space);
        if (!tabData) return;

        let tab: Tab | null = null;
        if (!Array.isArray(tabData)) {
          tab = tabData;
        } else {
          const [t, _space, _isPinned] = tabData;
          tab = t;
        }

        if (tab) {
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
      {NewTabModal}
      <div className="flex flex-row w-fulls h-full grow gap-2">
        <BrowserSideBar
          showSideBar={browser.showSideBar}
          currentTab={currentTab}
          favoriteTabs={browser.favoriteTabs}
          pinnedTabs={currentSpace ? currentSpace.pinnedTabs : []}
          tabs={currentSpace ? currentSpace.tabs : []}
          spaceIcon={currentSpace ? currentSpace.icon : ""}
          spaceName={currentSpace ? currentSpace.name : "Default"}
          openNewTabModal={openNewTabModal}
          onTabClose={handleTabClose}
          onTabSelect={handleSelectTab}
          onTabPin={handlePinTab}
          onPinGoSource={handlePinGoSource}
          className="p-2 pr-0"
        />

        {/* WebView */}
        <WebViewContainer>
          {
            allTabs.map((tab) => (
              <WebView
                key={tab.id}
                src={tab.src}
                ref={tab.webview}
                className={`w-full h-full ${tab.id === browser.currentTabId ? '' : 'hidden'}`}
                onPageFaviconUpdated={(favicons) => handleFaviconsUpdate(favicons, tab.id)}
                onPageTitleUpdated={(title) => handleTitleUpdate(title, tab.id)}
                onLoadCommit={(url, isMainFrame) => handleLoadCommit(url, isMainFrame, tab.id)}
              />
            ))
          }
        </WebViewContainer>
      </div>
    </div>
  );
}

export default App;
