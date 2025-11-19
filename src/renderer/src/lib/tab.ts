import { RefObject } from 'react';
import { WebViewMethods } from '@renderer/lib/webview';

export interface Tab {
  id: string;
  name: string;
  url: string;
  src: string;
  favicon: string;
  webview: RefObject<WebViewMethods | null>;
  lastAccessed?: number;
  pinnedUrl?: string;
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
  };
}
