// Unified WebView Component
// This component provides a unified interface that works with both Electron and CEF backends.
// It automatically detects the runtime environment and uses the appropriate implementation.

import { forwardRef } from 'react';
import ElectronWebView from './WebView';
import CEFWebView from './CEFWebView';
import type { WebViewMethods } from '@renderer/lib/webview';

// Detect if we're running in CEF or Electron
const isElectron = typeof window !== 'undefined' && 
  window.navigator?.userAgent?.toLowerCase().includes('electron');

const isCEF = typeof (window as any).ipc !== 'undefined' && !isElectron;

// Re-export WebViewMethods for convenience
export type { WebViewMethods };

// Props that are common to both implementations
export interface UnifiedWebViewProps {
  className?: string;
  src: string;
  tabId?: string; // Required for CEF, optional for Electron
  useragent?: string;
  partition?: string;
  
  // Common event handlers
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

// The Unified WebView component
const UnifiedWebView = forwardRef<WebViewMethods, UnifiedWebViewProps>((props, ref) => {
  if (isCEF) {
    // Use CEF implementation
    const { tabId, ...restProps } = props;
    return (
      <CEFWebView
        ref={ref as any}
        tabId={tabId || 'default-tab'}
        {...restProps}
      />
    );
  } else {
    // Use Electron implementation (default)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { tabId, ...restProps } = props;
    return (
      <ElectronWebView
        ref={ref}
        {...restProps}
      />
    );
  }
});

UnifiedWebView.displayName = 'UnifiedWebView';

export default UnifiedWebView;

// Export runtime detection utilities
export const runtime = {
  isElectron,
  isCEF,
  name: isCEF ? 'CEF' : isElectron ? 'Electron' : 'Browser',
};
