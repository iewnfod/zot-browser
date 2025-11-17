// @ts-nocheck

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

// https://www.electronjs.org/docs/latest/api/webview-tag
export interface WebViewRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WebViewReferrer {
  url: string;
  policy: "default" | "unsafe-url" | "no-referrer-when-downgrade" | "no-referrer" | "origin" | "string-origin-when-cross-origin" | "same-origin" | "string-origin";
}

export type WebViewFormControlType = "none"
  | "button-button" | "field-set" | "input-button" | "input-checkbox"
  | "input-color" | "input-date" | "input-datetime-local" | "input-email"
  | "input-file" | "input-hidden" | "input-image" | "input-month"
  | "input-number" | "input-password" | "input-radio" | "input-range"
  | "input-reset" | "input-search" | "input-submit" | "input-telephone"
  | "input-text" | "input-time" | "input-url" | "input-week"
  | "output" | "reset-button" | "select-list" | "select-multiple"
  | "select-one" | "submit-button" | "text-area";

export interface WebViewContextMenuProps {
  x: number;
  y: number;
  linkURL: string;
  linkText: string;
  pageURL: string;
  frameURL: string;
  srcURL: string;
  mediaType: 'none' | 'image' | 'audio' | 'video' | 'canvas' | 'file' | 'plugin';
  hasImageContents: boolean;
  isEditable: boolean;
  selectionText: string;
  titleText: string;
  altText: string;
  suggestedFilename: string;
  selectionRect: WebViewRectangle;
  selectionStartOffset: number;
  referrerPolicy: WebViewReferrer;
  misspelledWord: string;
  dictionarySuggestions: string[];
  frameCharset: string;
  formControlType: WebViewFormControlType;
  spellcheckEnabled: boolean;
  menuSourceType: "none" | "mouse" | "keyboard" | "touch" | "touchMenu" | "longPress" | "longTap" | "touchHandle" | "stylus" | "adjustSelection" | "adjustSelectionReset";
  mediaFlags: {
    inError: boolean;
    isPaused: boolean;
    isMuted: boolean;
    hasAudio: boolean;
    isLooping: boolean;
    isControlsVisible: boolean;
    canToggleControls: boolean;
    canPrint: boolean;
    canSave: boolean;
    canShowPictureInPicture: boolean;
    isShowingPictureInPicture: boolean;
    canRotate: boolean;
    canLoop: boolean;
  };
  editFlags: {
    canUndo: boolean;
    canRedo: boolean;
    canCut: boolean;
    canCopy: boolean;
    canPaste: boolean;
    canDelete: boolean;
    canSelectAll: boolean;
    canEditRichly: boolean;
  }
}

export interface WebViewRenderProcessGoneDetails {
  reason: "clean-exit" | "abnormal-exit" | "killed" | "crashed" | "oom" | "launch-failed" | "integrity-failure" | "memory-eviction";
  exitCode: number;
}

export interface WebViewProps {
  className?: string;

  src: string;
  nodeintegration?: boolean;
  nodeintegrationinsubframes?: boolean;
  plugins?: boolean;
  preload?: string;
  httpreferrer?: string;
  useragent?: string;
  disablewebsecurity?: boolean;
  partition?: string;
  allowpopups?: boolean;
  webpreferences?: string;
  enableblinkfeatures?: string;
  disableblinkfeatures?: string;

  onLoadCommit?: (url: string, isMainFrame: boolean) => void;
  onDidFinishLoad?: () => void;
  onDidFailLoad?: (errorCode: number, errorDescription: string, validatedURL: string, isMainFrame: boolean) => void;
  onDidFrameFinishLoad?: (isMainFrame: boolean) => void;
  onDidStartLoading?: () => void;
  onDidStopLoading?: () => void;
  onDidAttach?: () => void;
  onDomReady?: () => void;
  onPageTitleUpdated?: (title: string, explicitSet: boolean) => void;
  onPageFaviconUpdated?: (favicons: string[]) => void;
  onEnterHtmlFullScreen?: () => void;
  onLeaveHtmlFullScreen?: () => void;
  onConsoleMessage?: (level: number, message: string, line: number, sourceId: string) => void;
  onFoundInPage?: (result: {requestId: number, activeMatchOrdinal: number, matches: number, selectionArea: WebViewRectangle, finalUpdate: boolean}) => void;
  onWillNavigate?: (url: string) => void;
  onWillFrameNavigate?: (url: string, isMainFrame: boolean, frameProcessId: number, frameRoutingId: number) => void;
  onDidStartNavigation?: (url: string, isInPlace: boolean, isMainFrame: boolean, frameProcessId: number, frameRoutingId: number) => void;
  onDidRedirectNavigation?: (url: string, isInPlace: boolean, isMainFrame: boolean, frameProcessId: number, frameRoutingId: number) => void;
  onDidNavigate?: (url: string) => void;
  onDidFrameNavigate?: (url: string, httpResponseCode: number, httpStatusText: string, isMainFrame: boolean, frameProcessId: number, frameRoutingId: number) => void;
  onDidNavigateInPage?: (url: string, isMainFrame: boolean) => void;
  onClose?: () => void;
  onIpcMessage?: (frameId: [number, number], channel: string, args: any[]) => void;
  onRenderProcessGone?: (details: WebViewRenderProcessGoneDetails) => void;
  onDestroyed?: () => void;
  onMediaStartedPlaying?: () => void;
  onMediaPaused?: () => void;
  onDidChangeThemeColor?: (themeColor: string) => void;
  onUpdateTargetUrl?: (url: string) => void;
  onDevtoolsOpenUrl?: (url: string) => void;
  onDevtoolsSearchQuery?: (event: Event, query: string) => void;
  onDevtoolsOpened?: () => void;
  onDevtoolsClosed?: () => void;
  onDevtoolsFocused?: () => void;
  onContextMenu?: (params: WebViewContextMenuProps) => void;
}

export interface WebViewMethods {
  loadURL: (url: string, options?: any) => Promise<void>;
  downloadURL: (url: string, options?: any) => void;
  getURL: () => string;
  getTitle: () => string;
  isLoading: () => boolean;
  isLoadingMainFrame: () => boolean;
  isWaitingForResponse: () => boolean;
  stop: () => void;
  reload: () => void;
  reloadIgnoringCache: () => void;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  canGoToOffset: (offset: number) => boolean;
  clearHistory: () => void;
  goBack: () => void;
  goForward: () => void;
  goToIndex: (index: number) => void;
  goToOffset: (offset: number) => void;
  isCrashed: () => boolean;
  setUserAgent: (userAgent: string) => void;
  getUserAgent: () => string;
  insertCSS: (css: string) => Promise<string>;
  removeInsertedCSS: (key: string) => Promise<void>;
  executeJavaScript: (code: string, userGesture?: boolean) => Promise<any>;
  openDevTools: () => void;
  closeDevTools: () => void;
  isDevToolsOpened: () => boolean;
  isDevToolsFocused: () => boolean;
  inspectElement: (x: number, y: number) => void;
  inspectSharedWorker: () => void;
  inspectServiceWorker: () => void;
  setAudioMuted: (muted: boolean) => void;
  isAudioMuted: () => boolean;
  isCurrentlyAudible: () => boolean;
  undo: () => void;
  redo: () => void;
  cut: () => void;
  copy: () => void;
  centerSelection: () => void;
  paste: () => void;
  pasteAndMatchStyle: () => void;
  delete: () => void;
  selectAll: () => void;
  unselect: () => void;
  scrollToTop: () => void;
  scrollToBottom: () => void;
  adjustSelection: (options: {start?: number, end?: number}) => void;
  replace: (text: string) => void;
  replaceMisspelling: (text: string) => void;
  insertText: (text: string) => Promise<void>;
  findInPage: (text: string, options?: any) => number;
  stopFindInPage: (action: "clearSelection" | "keepSelection" | "activateSelection") => void;
  print: (options?: any) => Promise<void>;
  printToPDF: (options: any) => Promise<Uint8Array>;
  capturePage: (rect?: WebViewRectangle) => Promise<any>;
  send: (channel: string, ...args: any[]) => Promise<void>;
  sendToFrame: (frameId: [number, number], channel: string, ...args: any[]) => Promise<void>;
  sendInputEvent: (event: any) => Promise<void>;
  setZoomFactor: (factor: number) => void;
  setZoomLevel: (level: number) => void;
  getZoomFactor: () => number;
  getZoomLevel: () => number;
  setVisualZoomLevelLimits: (minimumLevel: number, maximumLevel: number) => Promise<void>;
  macShowDefinitionForSelection: () => void;
  getWebContentsId: () => number;
}

const WebView = forwardRef<WebViewMethods, WebViewProps>((props, ref) => {
  const {
    src, nodeintegration, nodeintegrationinsubframes, plugins, preload,
    httpreferrer, useragent, disablewebsecurity, partition, allowpopups,
    webpreferences, enableblinkfeatures, disableblinkfeatures, className
  } = props;
  const webviewRef = useRef<HTMLWebViewElement>(null);

  useEffect(() => {
    const handlers = {
      'load-commit': (ev) => props.onLoadCommit?.(ev.url, ev.isMainFrame),
      'did-finish-load': () => props.onDidFinishLoad?.(),
      'did-fail-load': (ev) => props.onDidFailLoad?.(ev.errorCode, ev.errorDescription, ev.validatedURL, ev.isMainFrame),
      'did-frame-finish-load': (ev) => props.onDidFrameFinishLoad?.(ev.isMainFrame),
      'did-start-loading': () => props.onDidStartLoading?.(),
      'did-stop-loading': () => props.onDidStopLoading?.(),
      'did-attach': () => props.onDidAttach?.(),
      'dom-ready': () => props.onDomReady?.(),
      'page-title-updated': (ev) => props.onPageTitleUpdated?.(ev.title, ev.explicitSet),
      'page-favicon-updated': (ev) => props.onPageFaviconUpdated?.(ev.favicons),
      'enter-html-full-screen': () => props.onEnterHtmlFullScreen?.(),
      'leave-html-full-screen': () => props.onLeaveHtmlFullScreen?.(),
      'console-message': (ev) => props.onConsoleMessage?.(ev.level, ev.message, ev.line, ev.sourceId),
      'found-in-page': (ev) => props.onFoundInPage?.(ev.result),
      'will-navigate': (ev) => props.onWillNavigate?.(ev.url),
      'will-frame-navigate': (ev) => props.onWillFrameNavigate?.(ev.url, ev.isMainFrame, ev.frameProcessId, ev.frameRoutingId),
      'did-start-navigation': (ev) => props.onDidStartNavigation?.(ev.url, ev.isInPlace, ev.isMainFrame, ev.frameProcessId, ev.frameRoutingId),
      'did-redirect-navigation': (ev) => props.onDidRedirectNavigation?.(ev.url, ev.isInPlace, ev.isMainFrame, ev.frameProcessId, ev.frameRoutingId),
      'did-navigate': (ev) => props.onDidNavigate?.(ev.url),
      'did-frame-navigate': (ev) => props.onDidFrameNavigate?.(ev.url, ev.httpResponseCode, ev.httpStatusText, ev.isMainFrame, ev.frameProcessId, ev.frameRoutingId),
      'did-navigate-in-page': (ev) => props.onDidNavigateInPage?.(ev.url, ev.isMainFrame),
      'close': () => props.onClose?.(),
      'ipc-message': (ev) => props.onIpcMessage?.(ev.frameId, ev.channel, ev.args),
      'render-process-gone': (ev) => props.onRenderProcessGone?.(ev.details),
      'destroyed': () => props.onDestroyed?.(),
      'media-started-playing': () => props.onMediaStartedPlaying?.(),
      'media-paused': () => props.onMediaPaused?.(),
      'did-change-theme-color': (ev) => props.onDidChangeThemeColor?.(ev.themeColor),
      'update-target-url': (ev) => props.onUpdateTargetUrl?.(ev.url),
      'devtools-open-url': (ev) => props.onDevtoolsOpenUrl?.(ev.url),
      'devtools-search-query': (ev) => props.onDevtoolsSearchQuery?.(ev, ev.query),
      'devtools-opened': () => props.onDevtoolsOpened?.(),
      'devtools-closed': () => props.onDevtoolsClosed?.(),
      'devtools-focused': () => props.onDevtoolsFocused?.(),
      'context-menu': (ev) => props.onContextMenu?.(ev.params),
    };

    if (webviewRef.current) {
      Object.entries(handlers).forEach(([eventName, handler]) => {
        webviewRef.current.addEventListener(eventName, handler);
      });
    }

    return () => {
      if (webviewRef.current) {
        Object.entries(handlers).forEach(([eventName, handler]) => {
          webviewRef.current.removeEventListener(eventName, handler);
        });
      }
    }
  }, [webviewRef.current]);

  // 暴露 webview 方法到外部
  useImperativeHandle(ref, () => ({
    loadURL: async (url, options) => {
      if (webviewRef.current) {
        await webviewRef.current.loadURL(url, options);
      }
    },
    downloadURL: (url, options) => webviewRef.current?.downloadURL(url, options),
    getURL: () => webviewRef.current?.getURL() || "",
    getTitle: () => webviewRef.current?.getTitle() || "",
    isLoading: () => webviewRef.current?.isLoading() ?? false,
    isLoadingMainFrame: () => webviewRef.current?.isLoadingMainFrame() ?? false,
    isWaitingForResponse: () => webviewRef.current?.isWaitingForResponse() ?? false,
    stop: () => webviewRef.current?.stop(),
    reload: () => webviewRef.current?.reload(),
    reloadIgnoringCache: () => webviewRef.current?.reloadIgnoringCache(),
    canGoBack: () => webviewRef.current?.canGoBack() ?? false,
    canGoForward: () => webviewRef.current?.canGoForward() ?? false,
    canGoToOffset: (offset) => webviewRef.current?.canGoToOffset(offset) ?? false,
    clearHistory: () => webviewRef.current?.clearHistory(),
    goBack: () => webviewRef.current?.goBack(),
    goForward: () => webviewRef.current?.goForward(),
    goToIndex: (index) => webviewRef.current?.goToIndex(index),
    goToOffset: (offset) => webviewRef.current?.goToOffset(offset),
    isCrashed: () => webviewRef.current?.isCrashed() ?? false,
    setUserAgent: (userAgent) => webviewRef.current?.setUserAgent(userAgent),
    getUserAgent: () => webviewRef.current?.getUserAgent() || "",
    insertCSS: async (css) => {
      if (webviewRef.current) {
        return await webviewRef.current.insertCSS(css) as string;
      } else {
        return "";
      }
    },
    removeInsertedCSS: async (key) => {
      if (webviewRef.current) {
        await webviewRef.current.removeInsertedCSS(key);
      }
    },
    executeJavaScript: async (code, userGesture = false) => {
      if (webviewRef.current) {
        return await webviewRef.current.executeJavaScript(code, userGesture);
      }
    },
    openDevTools: () => webviewRef.current?.openDevTools(),
    closeDevTools: () => webviewRef.current?.closeDevTools(),
    isDevToolsOpened: () => webviewRef.current?.isDevToolsOpened() ?? false,
    isDevToolsFocused: () => webviewRef.current?.isDevToolsFocused() ?? false,
    inspectElement: (x, y) => webviewRef.current?.inspectElement(x, y),
    inspectSharedWorker: () => webviewRef.current?.inspectSharedWorker(),
    inspectServiceWorker: () => webviewRef.current?.inspectServiceWorker(),
    setAudioMuted: (muted) => webviewRef.current?.setAudioMuted(muted),
    isAudioMuted: () => webviewRef.current?.isAudioMuted() ?? false,
    isCurrentlyAudible: () => webviewRef.current?.isCurrentlyAudible() ?? false,
    undo: () => webviewRef.current?.undo(),
    redo: () => webviewRef.current?.redo(),
    cut: () => webviewRef.current?.cut(),
    copy: () => webviewRef.current?.copy(),
    centerSelection: () => webviewRef.current?.centerSelection(),
    paste: () => webviewRef.current?.paste(),
    pasteAndMatchStyle: () => webviewRef.current?.pasteAndMatchStyle(),
    delete: () => webviewRef.current?.delete(),
    selectAll: () => webviewRef.current?.selectAll(),
    unselect: () => webviewRef.current?.unselect(),
    scrollToTop: () => webviewRef.current?.scrollToTop(),
    scrollToBottom: () => webviewRef.current?.scrollToBottom(),
    adjustSelection: (options) => webviewRef.current?.adjustSelection(options),
    replace: (text) => webviewRef.current?.replace(text),
    replaceMisspelling: (text) => webviewRef.current?.replaceMisspelling(text),
    insertText: async (text) => {
      if (webviewRef.current) {
        await webviewRef.current.insertText(text);
      }
    },
    findInPage: (text, options) => webviewRef.current?.findInPage(text, options) as number,
    stopFindInPage: (action) => webviewRef.current?.stopFindInPage(action),
    print: async (options) => {
      if (webviewRef.current) {
        await webviewRef.current.print(options);
      }
    },
    printToPDF: async (options) => {
      if (webviewRef.current) {
        return await webviewRef.current.printToPDF(options) as Uint8Array;
      } else {
        return new Uint8Array();
      }
    },
    capturePage: async (rect) => {
      if (webviewRef.current) {
        return await webviewRef.current.capturePage(rect);
      }
    },
    send: async (channel, ...args) => {
      if (webviewRef.current) {
        await webviewRef.current.send(channel, ...args);
      }
    },
    sendToFrame: async (frameId, channel, ...args) => {
      if (webviewRef.current) {
        await webviewRef.current.sendToFrame(frameId, channel, ...args);
      }
    },
    sendInputEvent: async (event) => {
      if (webviewRef.current) {
        await webviewRef.current.sendInputEvent(event);
      }
    },
    setZoomFactor: (factor) => webviewRef.current?.setZoomFactor(factor),
    setZoomLevel: (level) => webviewRef.current?.setZoomLevel(level),
    getZoomFactor: () => webviewRef.current?.getZoomFactor() || 1,
    getZoomLevel: () => webviewRef.current?.getZoomLevel() || 0,
    setVisualZoomLevelLimits: async (minimumLevel, maximumLevel) => {
      if (webviewRef.current) {
        await webviewRef.current.setVisualZoomLevelLimits(minimumLevel, maximumLevel);
      }
    },
    macShowDefinitionForSelection: () => webviewRef.current?.showDefinitionForSelection(),
    getWebContentsId: () => webviewRef.current?.getWebContentsId() || 0,
  }), [webviewRef.current]);

  return (
    <webview
      ref={webviewRef}
      className={className}
      {...{
        src, nodeintegration, nodeintegrationinsubframes, plugins, preload,
        httpreferrer, useragent, disablewebsecurity, partition, allowpopups,
        webpreferences, enableblinkfeatures, disableblinkfeatures
      }}
    />
  );
});

export default WebView;
