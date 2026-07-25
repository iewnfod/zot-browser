import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 网页端 → UI 同步的瞬态状态。
 *
 * 这些状态高频变化且不需要持久化，因此独立于 browser store（放 Tab 上会触发
 * debounced 序列化保存，见 BrowserState.ts 的 updateTab）。切标签时自动重置。
 */

/** 网页右键菜单上下文（从主进程 context-menu 事件转发而来）。 */
export interface WebContextMenuParams {
  x: number;
  y: number;
  linkURL: string;
  linkText: string;
  pageURL: string;
  srcURL: string;
  mediaType: 'none' | 'image' | 'audio' | 'video' | 'canvas' | 'file' | 'plugin';
  hasImageContents: boolean;
  isEditable: boolean;
  selectionText: string;
  editFlags: {
    canUndo: boolean;
    canRedo: boolean;
    canCut: boolean;
    canCopy: boolean;
    canPaste: boolean;
    canDelete: boolean;
    canSelectAll: boolean;
    canEditRichly: boolean;
  };
}

export interface WebContextMenuState {
  tabId: string;
  x: number;
  y: number;
  params: WebContextMenuParams;
}

export interface WebUIState {
  /** 当前光标类型（Electron cursor-changed 的 type 字符串）。 */
  cursorType: string;
  setCursorType: (type: string) => void;
  /** 悬停链接目标 URL，空串表示未悬停链接。 */
  hoverURL: string;
  setHoverURL: (url: string) => void;
  /** 网页右键菜单状态，null 表示关闭。 */
  contextMenu: WebContextMenuState | null;
  setContextMenu: (menu: WebContextMenuState | null) => void;
  /** 切标签时调用，重置光标/悬停链接（右键菜单由其组件自行关闭）。 */
  resetForTabSwitch: () => void;
}

/**
 * 维护光标 / 悬停链接 / 网页右键菜单三类瞬态状态。
 * @param currentTabId 当前标签 id，变化时触发重置。
 */
export function useWebUIState(currentTabId?: string): WebUIState {
  const [cursorType, setCursorType] = useState<string>('default');
  const [hoverURL, setHoverURL] = useState<string>('');
  const [contextMenu, setContextMenu] = useState<WebContextMenuState | null>(null);

  // 用 ref 保存最新的 setHoverURL，避免 debounce 闭包捕获旧值
  const hoverURLRef = useRef(setHoverURL);
  hoverURLRef.current = setHoverURL;

  // update-target-url 在鼠标移出链接后会发空串，但部分页面会频繁抖动。
  // 用微小延迟去抖：新 URL 到来时取消上一次未决的"清空"。
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setHoverURLDebounced = useCallback((url: string): void => {
    if (clearTimer.current) {
      clearTimeout(clearTimer.current);
      clearTimer.current = null;
    }
    if (url) {
      hoverURLRef.current(url);
    } else {
      // 延迟清空，避免在相邻链接间移动时状态条闪烁消失
      clearTimer.current = setTimeout(() => hoverURLRef.current(''), 120);
    }
  }, []);

  const resetForTabSwitch = useCallback((): void => {
    setCursorType('default');
    setHoverURL('');
  }, []);

  // 切标签时重置光标和悬停链接
  useEffect(() => {
    resetForTabSwitch();
  }, [currentTabId, resetForTabSwitch]);

  // 卸载时清理定时器
  useEffect(() => {
    return () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
    };
  }, []);

  return {
    cursorType,
    setCursorType,
    hoverURL,
    setHoverURL: setHoverURLDebounced,
    contextMenu,
    setContextMenu,
    resetForTabSwitch
  };
}
