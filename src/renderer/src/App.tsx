import { useEffect, useMemo, useState } from 'react';
import { debounce } from '@renderer/lib/utils';
import { Browser, CreateNewBrowser, deserializeBrowser, SerializableBrowser } from '@renderer/lib/browser';
import BrowserSideBar from '@renderer/components/SideBar';
import { CreateNewTab, Tab } from '@renderer/lib/tab';
import { Space } from '@renderer/lib/space';
import WebView from '@renderer/components/WebView';
import useNewTabModal from '@renderer/components/modals/NewTabModal';
import { Card } from '@heroui/react';

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

  function findTabById(id: string | undefined): [Tab, Space, boolean] | Tab | null {
    if (!id) return null;

    let tab: Tab | null = null;

    // check is current tab
    if (currentSpace && currentTab && currentTab.id === id) {
      return [currentTab, currentSpace, currentSpace.pinnedTabs.find((t) => t.id === id) !== undefined];
    }

    // find in favorite
    tab = browser.favoriteTabs.find((t) => t.id === id) || null;
    if (tab) return tab;

    // find in current space
    if (currentSpace) {
      tab = currentSpace.pinnedTabs.find((t) => t.id === id) || null;
      if (tab) return [tab, currentSpace, true];
      tab = currentSpace.tabs.find((t) => t.id === id) || null;
      if (tab) return [tab, currentSpace, false];
    }

    // find in other space
    for (let i = 0; i < browser.spaces.length; i ++) {
      tab = browser.spaces[i].pinnedTabs.find((t) => t.id === id) || null;
      if (tab) return [tab, browser.spaces[i], true];
      tab = browser.spaces[i].tabs.find((t) => t.id === id) || null;
      if (tab) return [tab, browser.spaces[i], false];
    }

    // final
    return null;
  }

  function updateTabProperty(tabId: string, updates: Partial<Tab>) {
    const tabData = findTabById(tabId);
    if (!tabData) return;

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
      window.api.getFavicon(favicons[0]).then((data) => {
        updateTabProperty(tabId, { favicon: data });
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
    console.log('handleNewTab called with url:', url);
    const newTab = CreateNewTab(url);
    console.log('New tab created with id:', newTab.id);
    if (currentSpace) {
      console.log('Current space:', currentSpace.id, currentSpace.name);
      setBrowser(prevBrowser => {
        const newBrowser = { ...prevBrowser };
        const spaceIndex = newBrowser.spaces.findIndex(s => s.id === currentSpace.id);
        console.log('Space index:', spaceIndex);

        if (spaceIndex === -1) return prevBrowser;

        console.log('Tabs before:', newBrowser.spaces[spaceIndex].tabs.length);

        newBrowser.spaces[spaceIndex].tabs = [
          ...newBrowser.spaces[spaceIndex].tabs,
          newTab
        ];

        console.log('Tabs after:', newBrowser.spaces[spaceIndex].tabs.length);

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
          newBrowser.favoriteTabs.splice(index, 1);
          return newBrowser;
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
          newBrowser.spaces[spaceIndex].pinnedTabs.splice(tabIndex, 1);
          return newBrowser;
        });
      } else {
        const tabIndex = browser.spaces[spaceIndex].tabs.findIndex(t => t.id === tabId);
        if (tabIndex === -1) return;
        setBrowser(prevBrowser => {
          const newBrowser = {...prevBrowser};
          newBrowser.spaces[spaceIndex].tabs.splice(tabIndex, 1);
          return newBrowser;
        });
      }
    }
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

  useEffect(() => {
    // window.store.delete("browser");
    loadBrowserData();
  }, []);

  useEffect(() => {
    if (isInitialized && browser) {
      debouncedSave(deserializeBrowser(browser));
    }
  }, [browser, isInitialized]);

  useEffect(() => {
    const space = browser.spaces.find((s) => s.id === browser.currentSpaceId);
    if (space) {
      setCurrentSpace(space);

      if (browser.currentTabId) {

      }
      const tabData = findTabById(browser.currentTabId);
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
      <div className="flex flex-row w-fulls h-full grow p-2 gap-2">
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
        />

        {/* WebView */}
        {
          allTabs.map((tab) => (
            <Card
              key={tab.id}
              className={`w-full h-full grow overflow-hidden ${tab.id === browser.currentTabId ? '' : 'hidden'}`}
            >
              <WebView
                src={tab.src}
                ref={tab.webview}
                className="w-full h-full"
                onPageFaviconUpdated={(favicons) => handleFaviconsUpdate(favicons, tab.id)}
                onPageTitleUpdated={(title) => handleTitleUpdate(title, tab.id)}
                onLoadCommit={(url, isMainFrame) => handleLoadCommit(url, isMainFrame, tab.id)}
              />
            </Card>
          ))
        }
      </div>
    </div>
  );
}

export default App;
