import { RefObject } from 'react';
import { WebViewMethods } from '@renderer/lib/webview';

export interface Tab {
  id: string;
  name: string;
  url: string;
  src: string;
  favicon: string;
  webview: RefObject<WebViewMethods | null>
}

export interface SerializableTab {
  id: string;
  name: string;
  url: string;
  favicon: string;
}

export function CreateNewTab(src: string) {
  return {
    id: crypto.randomUUID(),
    src: src,
    name: "",
    url: src,
    favicon: "",
    webview: {current: null}
  } as Tab;
}

export function serializeTab(tab: Tab): SerializableTab {
  return {
    id: tab.id,
    name: tab.name,
    url: tab.url,
    favicon: tab.favicon,
  };
}

export function deserializeTab(tab: SerializableTab): Tab {
  return {
    id: tab.id,
    name: tab.name,
    src: tab.url,
    url: tab.url,
    favicon: tab.favicon,
    webview: {current: null}
  };
}
