import { useEffect, useMemo, useState } from 'react';
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
import WebView from '@renderer/components/WebView';
import useNewTabModal from '@renderer/components/modals/NewTabModal';
import { Button, Card } from '@heroui/react';
import { LuMaximize, LuMinimize, LuMinus, LuX } from 'react-icons/lu';
import { isMac } from '@react-aria/utils';

function App() {
  const [browser, setBrowser] = useState<Browser>(CreateNewBrowser());
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [currentTab, setCurrentTab] = useState<Tab | null>(null);
  const [currentSpace, setCurrentSpace] = useState<Space | null>(null);
  const [allTabs, setAllTabs] = useState<Tab[]>([]);
  const [openNewTabModal, NewTabModal] = useNewTabModal(handleNewTab);
  const [showWindowButtons, setShowWindowButtons] = useState<boolean>(false);
  const [isMaximized, setIsMaximized] = useState<boolean>(false);

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
  }

  function getIsMaximized() {
    window.api.isMaximized().then((m) => {
      setIsMaximized(m);
    });
  }

  useEffect(() => {
    // window.store.delete("browser");
    loadBrowserData();
    window.addEventListener('resize', () => {
      getIsMaximized();
    });
  }, []);

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

        console.log(tabData);

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
        {
          allTabs.map((tab) => (
            <div
              key={tab.id}
              className={`flex flex-col w-full h-full select-none grow ${tab.id === browser.currentTabId ? '' : 'hidden'}`}
            >
              {
                isMac() ? (
                  <div className="w-full h-2"/>
                ) : (
                  <div
                    className={`
                      w-full h-2 hover:h-10 transition-all duration-300 ease-in-out
                      flex flex-row justify-end items-center
                    `}
                    onMouseEnter={() => setShowWindowButtons(true)}
                    onMouseLeave={() => setShowWindowButtons(false)}
                  >
                    <div
                      className={`flex flex-row h-full ${showWindowButtons ? '' : 'hidden'}`}
                    >
                      <Button isIconOnly variant="light" onPress={window.api.minimize}>
                        <LuMinus size={20}/>
                      </Button>
                      {
                        isMaximized ? (
                          <Button isIconOnly variant="light" onPress={() => window.api.unmaximize().then(() => getIsMaximized())}>
                            <LuMinimize size={20}/>
                          </Button>
                        ) : (
                          <Button isIconOnly variant="light" onPress={() => window.api.maximize().then(() => getIsMaximized())}>
                            <LuMaximize size={20}/>
                          </Button>
                        )
                      }
                      <Button isIconOnly variant="light" color="danger" onPress={window.api.close}>
                        <LuX size={20}/>
                      </Button>
                    </div>
                  </div>
                )
              }

              <div className="w-full h-full grow p-2 pl-0 pt-0">
                <Card
                  className={"w-full h-full overflow-hidden"}
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
              </div>
            </div>
          ))
        }
      </div>
    </div>
  );
}

export default App;
