import { RefObject } from 'react';
import { WebViewMethods } from '@renderer/lib/webview';
import { DEFAULT_CLEAR_TAB_INTERVAL } from '@renderer/lib/settings';

export interface Tab {
  id: string;
  name: string;
  url: string;
  src: string;
  favicon: string;
  webview: RefObject<WebViewMethods | null>;
  lastAccessed?: number;
  pinnedUrl?: string;
  shouldRender?: boolean;
}

export interface SerializableTab {
  id: string;
  name: string;
  url: string;
  favicon: string;
  lastAccessed?: number;
  pinnedUrl?: string;
}

export function upgradeTabToPinnedTab(tab: Tab): Tab {
  return {
    ...tab,
    pinnedUrl: tab.url,
  };
}

export function downgradePinnedTabToTab(tab: Tab): Tab {
  return {
    ...tab,
    pinnedUrl: tab.url
  };
}

export function CreateNewTab(src: string) {
  return {
    id: crypto.randomUUID(),
    src: src,
    name: "",
    url: src,
    favicon: "",
    webview: {current: null},
    lastAccessed: Date.now(),
    pinnedUrl: "",
    shouldRender: false,
  } as Tab;
}

export function serializeTab(tab: Tab): SerializableTab {
  return {
    id: tab.id,
    name: tab.name,
    url: tab.url,
    favicon: tab.favicon,
    lastAccessed: tab.lastAccessed,
    pinnedUrl: tab.pinnedUrl,
  };
}

export function deserializeTab(tab: SerializableTab): Tab {
  return {
    id: tab.id,
    name: tab.name,
    src: tab.pinnedUrl || tab.url,
    url: tab.url,
    favicon: tab.favicon,
    webview: {current: null},
    lastAccessed: tab.lastAccessed,
    pinnedUrl: tab.pinnedUrl,
    shouldRender: false,
  };
}

export function recycleOldTabs(props: {
  allTabs: Tab[],
  currentTabId?: string,
  makeTabNotRender: (tabId: string) => void,
  interval?: number
}) {
  const now = Date.now();
  const inter = props.interval || DEFAULT_CLEAR_TAB_INTERVAL;
  props.allTabs.forEach((tab: Tab) => {
    if (props.currentTabId !== tab.id && tab.shouldRender) {  // can be cleared
      if (tab.lastAccessed && (now - tab.lastAccessed) > inter) {
        console.log("Clear Tab: ", tab);
        props.makeTabNotRender(tab.id);
      }
    }
  });
}
