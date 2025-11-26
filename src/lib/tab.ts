import { RefObject } from 'react';
import { WebViewMethods } from '@/lib/webview';
import { DEFAULT_CLEAR_TAB_INTERVAL } from '@/lib/settings';

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
  isPinned?: boolean;
  isFavorite?: boolean;
  spaceId?: string;
  isMediaPlaying?: boolean;
  lastMediaPlayed?: number;
}

export interface SerializableTab {
  id: string;
  name: string;
  url: string;
  favicon: string;
  lastAccessed?: number;
  pinnedUrl?: string;
  isPinned?: boolean;
  isFavorite?: boolean;
  spaceId?: string;
  isMediaPlaying?: boolean;
  lastMediaPlayed?: number;
}

export function upgradeTabToPinnedTab(tab: Tab): Tab {
  return {
    ...tab,
    pinnedUrl: tab.url,
    isPinned: tab.isPinned,
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
    isPinned: false,
    isFavorite: false,
    isMediaPlaying: false,
    lastMediaPlayed: undefined,
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
    isPinned: tab.isPinned,
    isFavorite: tab.isFavorite,
    spaceId: tab.spaceId,
    isMediaPlaying: tab.isMediaPlaying,
    lastMediaPlayed: tab.lastMediaPlayed,
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
    isPinned: tab.isPinned,
    isFavorite: tab.isFavorite,
    spaceId: tab.spaceId,
    isMediaPlaying: tab.isMediaPlaying || false,
    lastMediaPlayed: tab.lastMediaPlayed,
  };
}

export function cleanupWebView(tab: Tab) {
  if (tab.webview.current) {
    try {
      // 停止任何加载或媒体播放
      if (tab.webview.current.stop) {
        tab.webview.current.stop();
      }
      if (tab.webview.current.setAudioMuted) {
        tab.webview.current.setAudioMuted(true);
      }
    } catch (e) {
      console.warn(`Error cleaning up webview for tab ${tab.id}:`, e);
    }
  }
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
    if (props.currentTabId !== tab.id && tab.shouldRender) {
      // 不卸载正在播放媒体的 tab
      if (tab.isMediaPlaying) {
        return;
      }

      // 计算最后活动时间
      let lastActiveTime = tab.lastAccessed || 0;
      if (tab.lastMediaPlayed && tab.lastMediaPlayed > lastActiveTime) {
        lastActiveTime = tab.lastMediaPlayed;
      }

      if (lastActiveTime && (now - lastActiveTime) > inter) {
        console.log("Clear tab:", tab);
        cleanupWebView(tab);
        props.makeTabNotRender(tab.id);
      }
    }
  });
}
