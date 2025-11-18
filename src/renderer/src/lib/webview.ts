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
