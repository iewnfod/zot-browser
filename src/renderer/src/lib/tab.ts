import { DEFAULT_CLEAR_TAB_INTERVAL } from '@renderer/lib/settings';

export interface Tab {
  id: string;
  name: string;
  url: string;
  src: string;
  favicon: string;
  lastAccessed?: number;
  pinnedUrl?: string;
  shouldRender?: boolean;
  isPinned?: boolean;
  isFavorite?: boolean;
  spaceId?: string;
  isMediaPlaying?: boolean;
  lastMediaPlayed?: number;
  /**
   * 用户自定义名称。一旦设置（非空字符串），始终优先于网页标题作为显示名，
   * 且不会被页面 title 事件覆盖。设置回空串即恢复"跟随网页标题"。
   */
  customName?: string;
  // 由主进程 WebContentsView 事件维护（不序列化）
  canGoBack?: boolean;
  canGoForward?: boolean;
  isLoading?: boolean;
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
  customName?: string;
}

/**
 * 取标签页的显示名称：自定义名称优先，否则回落到网页标题，再回落到 url。
 */
export function getTabDisplayName(tab: Tab): string {
  return tab.customName || tab.name || tab.url;
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
    customName: tab.customName,
  };
}

export function deserializeTab(tab: SerializableTab): Tab {
  return {
    id: tab.id,
    name: tab.name,
    src: tab.pinnedUrl || tab.url,
    url: tab.url,
    favicon: tab.favicon,
    lastAccessed: tab.lastAccessed,
    pinnedUrl: tab.pinnedUrl,
    shouldRender: false,
    isPinned: tab.isPinned,
    isFavorite: tab.isFavorite,
    spaceId: tab.spaceId,
    isMediaPlaying: tab.isMediaPlaying || false,
    lastMediaPlayed: tab.lastMediaPlayed,
    customName: tab.customName,
  };
}

/**
 * 销毁标签页对应的 WebContentsView（主进程层面）。
 * 保留函数名以减少调用点改动，内部改为通过 IPC 通知主进程。
 */
export function cleanupWebView(tab: Tab) {
  try {
    window.api.viewDestroy(tab.id);
  } catch (e) {
    console.warn(`Error cleaning up webview for tab ${tab.id}:`, e);
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
