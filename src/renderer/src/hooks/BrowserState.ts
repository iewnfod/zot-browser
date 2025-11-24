import {
  Browser,
  CreateNewBrowser,
  deserializeBrowser,
  SerializableBrowser,
  serializeBrowser
} from '@renderer/lib/browser';
import { cleanupWebView, CreateNewTab, recycleOldTabs, Tab } from '@renderer/lib/tab';
import { NewDefaultSpace, Space } from '@renderer/lib/space';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Settings } from '@renderer/lib/settings';
import { debounce } from '@renderer/lib/utils';

export interface UseBrowserStateReturn {
  // data
  browser: Browser;
  currentTab: Tab | null;
  currentSpace: Space | null;
  allTabs: Tab[];
  favoriteTabs: Tab[];
  pinnedTabs: Tab[];
  tabs: Tab[];

  // funcs
  // tab
  createTab: (url: string, options?: {spaceId?: string, isPinned?: boolean}) => Tab;
  closeTab: (tabId: string) => void;
  selectTab: (tabId: string) => void;
  updateTab: (tabId: string, updates: Partial<Tab>) => void;
  pinTab: (tabId: string) => void;
  unpinTab: (tabId: string) => void;
  addTabToFavorite: (tabId: string) => void;
  removeTabFromFavorite: (tabId: string) => void;
  // advanced tab actions
  selectLastTab: () => void;
  selectTabByIndex: (index: number) => void;

  // space
  createSpace: (name?: string, icon?: string) => Space;
  selectSpace: (spaceId: string) => void;
  updateSpace: (spaceId: string, updates: Partial<Space>) => void;

  // tools
  findTabById: (tabId: string) => Tab | null;
  getSpaceTabs: (spaceId: string) => { pinnedTabs: Tab[]; tabs: Tab[]; };
  recycleOldTabs: () => void;
}

export function useBrowserState(initialBrowser?: Browser, settings?: Settings): UseBrowserStateReturn {
  const [browser, setBrowser] = useState<Browser>(initialBrowser || CreateNewBrowser());
  const [currentTab, setCurrentTab] = useState<Tab | null>(null);
  const [currentSpace, setCurrentSpace] = useState<Space | null>(null);
  const [tabSelectHistory, setTabSelectHistory] = useState<string[]>([]);
  const [isBrowserInitialized, setIsBrowserInitialized] = useState<boolean>(false);

  const allTabs = useMemo(() => Object.values(browser.tabs), [browser]);
  const pinnedTabs = useMemo(() => {
    if (currentSpace) {
      return currentSpace.pinnedTabIds.map(id => browser.tabs[id]).filter(Boolean);
    } else {
      return [];
    }
  }, [browser, currentSpace]);
  const normalTabs = useMemo(() => {
    if (currentSpace) {
      return currentSpace.tabIds.map(id => browser.tabs[id]).filter(Boolean);
    } else {
      return [];
    }
  }, [browser, currentSpace]);
  const favoriteTabs = useMemo(
    () => browser.favoriteTabIds.map(id => browser.tabs[id]).filter(Boolean),
    [browser]
  );
  const allCurrentSpaceTabs = useMemo(
    () => favoriteTabs.concat(pinnedTabs).concat(normalTabs),
    [favoriteTabs, pinnedTabs, normalTabs]
  );

  const findTabById = useCallback((tabId: string) => {
    return browser.tabs[tabId] || null;
  }, [browser]);

  const getSpaceTabs = useCallback((spaceId: string) => {
    if (!browser.spaces[spaceId]) {
      return {pinnedTabs: [], tabs: []};
    }
    const pinnedTabs = browser.spaces[spaceId].pinnedTabIds.map(
      id => browser.tabs[id]
    ).filter(Boolean);
    const tabs = browser.spaces[spaceId].tabIds.map(
      id => browser.tabs[id]
    ).filter(Boolean);
    return {pinnedTabs, tabs};
  }, [browser]);

  const updateTabSelectHistory = useCallback((tabId: string) => {
    setTabSelectHistory(prev => {
      const filtered = prev.filter(id => id !== tabId);
      return [...filtered, tabId];
    });
  }, []);

  const clearTabSelectHistory = useCallback(() => {
    setTabSelectHistory([]);
  }, []);

  const removeFromTabSelectHistory = useCallback((tabId: string) => {
    setTabSelectHistory(prev => prev.filter(id => id !== tabId));
  }, []);

  const createTab = useCallback((url: string, options?: {spaceId?: string, isPinned?: boolean}) => {
    const spaceId = options?.spaceId || browser.currentSpaceId;
    if (!spaceId) {
      throw new Error("No space id found for new tab");
    }

    const tab = CreateNewTab(url);
    tab.spaceId = spaceId;
    tab.isPinned = options?.isPinned;

    setBrowser(prev => {
      const newBrowser = {...prev};

      newBrowser.tabs[tab.id] = tab;

      const space = newBrowser.spaces[spaceId];
      if (space) {
        if (options?.isPinned) {
          space.pinnedTabIds.push(tab.id);
        } else {
          space.tabIds.push(tab.id);
        }
      }

      newBrowser.currentTabId = tab.id;
      newBrowser.currentSpaceId = spaceId;

      if (spaceId === browser.currentSpaceId) {
        updateTabSelectHistory(tab.id);
      }

      return newBrowser;
    });

    return tab;
  }, [browser, updateTabSelectHistory]);

  const closeTab = useCallback((tabId: string) => {
    const tab = findTabById(tabId);
    if (!tab) return;

    const isCurrentTab = tab.id === browser.currentTabId;

    setBrowser(prev => {
      const newBrowser = {...prev};

      // 如果是被钉住的或收藏的，先停止渲染并清理 webview 引用
      if (tab.isFavorite || tab.isPinned) {
        cleanupWebView(tab);

        newBrowser.tabs[tabId] = {
          ...newBrowser.tabs[tabId],
          shouldRender: false,
          webview: { current: null }
        };
      } else {
        // 否则，从 tab list 中移除，从 space 对应表中移除
        delete newBrowser.tabs[tabId];

        if (tab.spaceId) {
          const space = newBrowser.spaces[tab.spaceId];
          if (space) {
            space.tabIds = space.tabIds.filter(id => id !== tab.id);
          }
        }
      }

      // 如果是当前 tab，打开之前的 tab
      if (isCurrentTab) {
        console.log(`Closing current tab ${tab.id}, get history`, tabSelectHistory);
        const history = [...tabSelectHistory].reverse();
        newBrowser.currentTabId = history.find(id =>
          id !== tab.id && // 不是当前 tab
          newBrowser.tabs[id] // 这个 tab 存在
        );
        console.log("Try to use new current tab id: ", newBrowser.currentTabId);
        removeFromTabSelectHistory(tabId);
      }

      return newBrowser;
    });
  }, [findTabById, tabSelectHistory, removeFromTabSelectHistory, browser]);

  const selectTab = useCallback((tabId: string) => {
    const tab = findTabById(tabId);
    if (!tab) return;

    setBrowser(prev => {
      const newBrowser = {...prev};

      newBrowser.currentTabId = tab.id;
      newBrowser.currentSpaceId = tab.spaceId || newBrowser.currentSpaceId;
      newBrowser.tabs[tabId] = {
        ...tab,
        lastAccessed: Date.now()
      };

      return newBrowser;
    });

    if (tab.spaceId === browser.currentSpaceId) {
      updateTabSelectHistory(tab.id);
    }
  }, [findTabById, updateTabSelectHistory, browser]);

  const updateTab = useCallback((tabId: string, updates: Partial<Tab>) => {
    const tab = findTabById(tabId);
    if (!tab) return;

    setBrowser(prev => {
      const newBrowser = {...prev};

      newBrowser.tabs[tabId] = {
        ...tab,
        ...updates
      };

      console.log('update tab:', tabId, updates);
      return newBrowser;
    });
  }, [findTabById]);

  const pinTab = useCallback((tabId: string) => {
    const tab = findTabById(tabId);
    if (!tab || !tab.spaceId || tab.isPinned) return;

    setBrowser(prev => {
      const newBrowser = {...prev};

      const space = newBrowser.spaces[tab.spaceId!];
      if (!space) return prev;

      space.tabIds = space.tabIds.filter(id => id !== tab.id);
      space.pinnedTabIds.push(tab.id);

      newBrowser.tabs[tab.id] = {
        ...tab,
        isPinned: true,
        pinnedUrl: tab.url
      };

      return newBrowser;
    });
  }, [findTabById]);

  const unpinTab = useCallback((tabId: string) => {
    const tab = findTabById(tabId);
    if (!tab || !tab.spaceId || !tab.isPinned) return;

    setBrowser(prev => {
      const newBrowser = {...prev};

      const space = newBrowser.spaces[tab.spaceId!];
      if (!space) return prev;

      space.pinnedTabIds = space.pinnedTabIds.filter(id => id !== tab.id);
      space.tabIds.push(tab.id);

      newBrowser.tabs[tab.id] = {
        ...tab,
        isPinned: false,
      };

      return newBrowser;
    });
  }, [findTabById]);

  const addTabToFavorite = useCallback((tabId: string) => {
    const tab = findTabById(tabId);
    if (!tab || !tab.spaceId || tab.isFavorite) return;

    setBrowser(prev => {
      const newBrowser = {...prev};

      const space = newBrowser.spaces[tab.spaceId!];
      if (!space) return prev;

      if (tab.isPinned) {
        space.pinnedTabIds = space.pinnedTabIds.filter(id => id !== tab.id);
      } else {
        space.tabIds = space.tabIds.filter(id => id !== tab.id);
      }

      if (!newBrowser.favoriteTabIds.includes(tab.id)) {
        newBrowser.favoriteTabIds.push(tab.id);
      }

      newBrowser.tabs[tab.id] = {
        ...tab,
        isFavorite: true,
        pinnedUrl: tab.url,
      };

      return newBrowser;
    });
  }, [findTabById]);

  const removeTabFromFavorite = useCallback((tabId: string) => {
    const tab = findTabById(tabId);
    if (!tab || !tab.spaceId || !tab.isFavorite) return;

    setBrowser(prev => {
      const newBrowser = {...prev};

      newBrowser.favoriteTabIds = newBrowser.favoriteTabIds.filter(id => id !== tab.id);

      newBrowser.tabs[tab.id] = {
        ...tab,
        isFavorite: false,
      };

      return newBrowser;
    });
  }, [findTabById]);

  const createSpace = useCallback((name?: string, icon?: string) => {
    const space = NewDefaultSpace();
    if (name) {
      space.name = name;
    }
    if (icon) {
      space.icon = icon;
    }

    setBrowser(prev => ({
      ...prev,
      space: {
        ...prev.spaces,
        [space.id]: space
      }
    }));

    return space;
  }, []);

  const selectSpace = useCallback((spaceId: string) => {
    const space = browser.spaces[spaceId];
    if (!space) return;

    if (browser.currentSpaceId !== spaceId) {
      clearTabSelectHistory();
      setBrowser(prev => ({
        ...prev,
        currentSpaceId: spaceId
      }));
    }
  }, [browser]);

  const updateSpace = useCallback((spaceId: string, updates: Partial<Space>) => {
    const space = browser.spaces[spaceId];
    if (!space) return;

    setBrowser(prev => ({
      ...prev,
      spaces: {
        ...prev.spaces,
        [space.id]: {
          ...space,
          ...updates
        }
      }
    }));
  }, [browser]);

  const recycleOldSpaceCallback = useCallback(() => {
    recycleOldTabs({
      allTabs,
      currentTabId: browser.currentTabId,
      makeTabNotRender: (tabId) => updateTab(tabId, {shouldRender: false}),
      interval: settings?.clearTabInterval
    });
  }, [allTabs, browser, updateTab, settings]);

  const selectLastTab = useCallback(() => {
    if (allCurrentSpaceTabs.length > 0) {
      const lastTab = allCurrentSpaceTabs[allCurrentSpaceTabs.length - 1];
      selectTab(lastTab.id);
    }
  }, [allCurrentSpaceTabs, selectTab]);

  const selectTabByIndex = useCallback((index: number) => {
    const tab = allCurrentSpaceTabs[index];
    if (tab) {
      selectTab(tab.id);
    } else {
      selectLastTab();
    }
  }, [allCurrentSpaceTabs, selectTab, selectLastTab]);

  useEffect(() => {
    if (browser.currentSpaceId && browser.spaces[browser.currentSpaceId]) {
      setCurrentSpace(browser.spaces[browser.currentSpaceId]);
    } else {
      setCurrentSpace(null);
    }

    if (browser.currentTabId && browser.tabs[browser.currentTabId]) {
      setCurrentTab(browser.tabs[browser.currentTabId]);
    } else {
      setCurrentTab(null);
    }
  }, [browser]);

  const debouncedSaveBrowser = useMemo(
    () => debounce((browserToSave: SerializableBrowser) => {
      console.log("Debounced saving browser to store:", browserToSave);
      window.store.set('browser', browserToSave);
    }, 500),
    []
  );

  const loadBrowserData = useCallback(() => {
    window.store.get('browser').then((data) => {
      if (data) {
        console.log('Load Browser', data);
        setBrowser(deserializeBrowser(data));
      }
      setIsBrowserInitialized(true);
    });
  }, []);

  useEffect(() => {
    loadBrowserData();
  }, [loadBrowserData]);

  useEffect(() => {
    if (isBrowserInitialized && browser) {
      debouncedSaveBrowser(serializeBrowser(browser));
    }
  }, [browser, isBrowserInitialized, debouncedSaveBrowser]);

  useEffect(() => {
    if (browser.currentTabId && currentTab) {
      if (!currentTab.shouldRender) {
        updateTab(browser.currentTabId, {shouldRender: true});
      }
    }
  }, [browser, currentTab, updateTab]);

  return {
    browser,
    currentTab,
    currentSpace,
    allTabs,
    favoriteTabs,
    pinnedTabs,
    tabs: normalTabs,

    createTab,
    closeTab,
    selectTab,
    updateTab,
    pinTab,
    unpinTab,
    addTabToFavorite,
    removeTabFromFavorite,
    selectLastTab,
    selectTabByIndex,

    createSpace,
    selectSpace,
    updateSpace,

    findTabById,
    getSpaceTabs,
    recycleOldTabs: recycleOldSpaceCallback
  };
}
