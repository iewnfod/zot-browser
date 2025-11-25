// CEF WebView Component
// This component provides a WebView-like interface for the CEF backend.
// Instead of using Electron's webview tag, it communicates with the Go backend
// to manage browser tabs using off-screen rendering.

import { forwardRef, useEffect, useImperativeHandle, useState, useCallback } from 'react';

// Check if we're running in CEF or Electron environment
const isCEF = typeof (window as any).ipc !== 'undefined' && !(window as any).electron?.process;

// WebView Methods interface - matches the Electron WebView API
export interface CEFWebViewMethods {
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
  adjustSelection: (options: any) => void;
  replace: (text: string) => void;
  replaceMisspelling: (text: string) => void;
  insertText: (text: string) => Promise<void>;
  findInPage: (text: string, options?: any) => number;
  stopFindInPage: (action: string) => void;
  print: (options?: any) => Promise<void>;
  printToPDF: (options?: any) => Promise<Uint8Array>;
  capturePage: (rect?: any) => Promise<any>;
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

export interface CEFWebViewProps {
  className?: string;
  tabId: string;
  src: string;
  useragent?: string;
  partition?: string;
  
  // Event handlers
  onLoadCommit?: (url: string, isMainFrame: boolean) => void;
  onDidFinishLoad?: () => void;
  onDidFailLoad?: (errorCode: number, errorDescription: string, validatedURL: string, isMainFrame: boolean) => void;
  onDidFrameFinishLoad?: (isMainFrame: boolean) => void;
  onDidStartLoading?: () => void;
  onDidStopLoading?: () => void;
  onDomReady?: () => void;
  onPageTitleUpdated?: (title: string, explicitSet?: boolean) => void;
  onPageFaviconUpdated?: (favicons: string[]) => void;
  onWillNavigate?: (url: string) => void;
  onDidNavigate?: (url: string) => void;
  onDidNavigateInPage?: (url: string, isMainFrame: boolean) => void;
  onClose?: () => void;
  onMediaStartedPlaying?: () => void;
  onMediaPaused?: () => void;
}

// CEF WebView Component
const CEFWebView = forwardRef<CEFWebViewMethods, CEFWebViewProps>((props, ref) => {
  const {
    className,
    tabId,
    src,
    useragent,
    onDidFinishLoad,
    onDidStartLoading,
    onDidStopLoading,
    onPageTitleUpdated,
    onPageFaviconUpdated,
    onDidNavigate,
  } = props;

  const [currentUrl, setCurrentUrl] = useState(src);
  const [title, setTitle] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  // Function to emit IPC messages to Go backend
  const emitToGo = useCallback((channel: string, ...args: any[]): Promise<any> => {
    if (isCEF && (window as any).ipc) {
      return new Promise((resolve) => {
        (window as any).ipc.emit(channel, args, (result: any) => {
          resolve(result);
        });
      });
    }
    return Promise.resolve(null);
  }, []);

  // Register event listeners for IPC from Go backend
  useEffect(() => {
    if (!isCEF) return;

    const ipc = (window as any).ipc;
    if (!ipc) return;

    // Listen for tab events from Go backend
    const handleTitleChange = (newTitle: string, tid: string) => {
      if (tid === tabId) {
        setTitle(newTitle);
        onPageTitleUpdated?.(newTitle, true);
      }
    };

    const handleUrlChange = (newUrl: string, tid: string) => {
      if (tid === tabId) {
        setCurrentUrl(newUrl);
        onDidNavigate?.(newUrl);
      }
    };

    const handleLoadStart = (tid: string) => {
      if (tid === tabId) {
        setIsLoading(true);
        onDidStartLoading?.();
      }
    };

    const handleLoadEnd = (tid: string, goBack: boolean, goForward: boolean) => {
      if (tid === tabId) {
        setIsLoading(false);
        setCanGoBack(goBack);
        setCanGoForward(goForward);
        onDidStopLoading?.();
        onDidFinishLoad?.();
      }
    };

    const handleFaviconChange = (favicon: string, tid: string) => {
      if (tid === tabId) {
        onPageFaviconUpdated?.([favicon]);
      }
    };

    ipc.on(`tab-title-changed-${tabId}`, handleTitleChange);
    ipc.on(`tab-url-changed-${tabId}`, handleUrlChange);
    ipc.on(`tab-load-start-${tabId}`, handleLoadStart);
    ipc.on(`tab-load-end-${tabId}`, handleLoadEnd);
    ipc.on(`tab-favicon-changed-${tabId}`, handleFaviconChange);

    // Create the tab renderer on Go side
    emitToGo('create-tab-renderer', tabId, src, useragent || '');

    return () => {
      // Cleanup listeners
      // Note: Energy IPC may not have removeListener
    };
  }, [tabId, src, useragent, emitToGo, onPageTitleUpdated, onDidNavigate, onDidStartLoading, onDidStopLoading, onDidFinishLoad, onPageFaviconUpdated]);

  // Expose WebView methods
  useImperativeHandle(ref, () => ({
    loadURL: async (url: string) => {
      await emitToGo('tab-load-url', tabId, url);
      setCurrentUrl(url);
    },
    downloadURL: () => {},
    getURL: () => currentUrl,
    getTitle: () => title,
    isLoading: () => isLoading,
    isLoadingMainFrame: () => isLoading,
    isWaitingForResponse: () => false,
    stop: () => {
      emitToGo('tab-stop', tabId);
      setIsLoading(false);
    },
    reload: () => {
      emitToGo('tab-reload', tabId);
      setIsLoading(true);
    },
    reloadIgnoringCache: () => {
      emitToGo('tab-reload', tabId);
      setIsLoading(true);
    },
    canGoBack: () => canGoBack,
    canGoForward: () => canGoForward,
    canGoToOffset: () => false,
    clearHistory: () => {},
    goBack: () => {
      emitToGo('tab-go-back', tabId);
    },
    goForward: () => {
      emitToGo('tab-go-forward', tabId);
    },
    goToIndex: () => {},
    goToOffset: () => {},
    isCrashed: () => false,
    setUserAgent: () => {},
    getUserAgent: () => useragent || '',
    insertCSS: async () => '',
    removeInsertedCSS: async () => {},
    executeJavaScript: async (code: string) => {
      return await emitToGo('tab-execute-js', tabId, code);
    },
    openDevTools: () => {
      emitToGo('tab-open-devtools', tabId);
    },
    closeDevTools: () => {
      emitToGo('tab-close-devtools', tabId);
    },
    isDevToolsOpened: () => false,
    isDevToolsFocused: () => false,
    inspectElement: () => {},
    inspectSharedWorker: () => {},
    inspectServiceWorker: () => {},
    setAudioMuted: (muted: boolean) => {
      emitToGo('tab-set-audio-muted', tabId, muted);
    },
    isAudioMuted: () => false,
    isCurrentlyAudible: () => false,
    undo: () => {},
    redo: () => {},
    cut: () => {},
    copy: () => {},
    centerSelection: () => {},
    paste: () => {},
    pasteAndMatchStyle: () => {},
    delete: () => {},
    selectAll: () => {},
    unselect: () => {},
    scrollToTop: () => {},
    scrollToBottom: () => {},
    adjustSelection: () => {},
    replace: () => {},
    replaceMisspelling: () => {},
    insertText: async () => {},
    findInPage: () => 0,
    stopFindInPage: () => {},
    print: async () => {},
    printToPDF: async () => new Uint8Array(),
    capturePage: async () => {},
    send: async () => {},
    sendToFrame: async () => {},
    sendInputEvent: async () => {},
    setZoomFactor: () => {},
    setZoomLevel: () => {},
    getZoomFactor: () => 1,
    getZoomLevel: () => 0,
    setVisualZoomLevelLimits: async () => {},
    macShowDefinitionForSelection: () => {},
    getWebContentsId: () => 0,
  }), [tabId, currentUrl, title, isLoading, canGoBack, canGoForward, useragent, emitToGo]);

  // For CEF, we render a canvas or div that will display the off-screen rendered content
  // The actual content rendering is handled by the Go backend
  return (
    <div 
      className={className}
      data-tab-id={tabId}
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#fff',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {isLoading && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#666',
        }}>
          Loading...
        </div>
      )}
      {/* 
        In a full implementation, this would be a canvas element
        that receives paint updates from the Go backend's OSR.
        For now, we're using a placeholder.
      */}
      <canvas 
        id={`tab-canvas-${tabId}`}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
        }}
      />
    </div>
  );
});

CEFWebView.displayName = 'CEFWebView';

export default CEFWebView;
