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

export function newTab(src: string) {
  // @ts-ignore
  return {
    id: crypto.randomUUID(),
    src: src,
    name: "",
    url: src,
    favicon: "",
    webview: null
  } as Tab;
}
