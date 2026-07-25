import { useEffect } from 'react';
import { Tab } from '@renderer/lib/tab';
import { Settings } from '@renderer/lib/settings';

export interface UseViewsCallbacks {
  /** favicon 列表更新（已含 tabId） */
  onFaviconsUpdate: (favicons: string[], tabId: string) => void;
  /** 页面标题更新 */
  onTitleUpdate: (title: string, tabId: string) => void;
  /** 主框架导航提交 */
  onLoadCommit: (url: string, isMainFrame: boolean, tabId: string) => void;
  /** 媒体开始播放 */
  onMediaStartedPlaying: (tabId: string) => void;
  /** 媒体暂停 */
  onMediaPaused: (tabId: string) => void;
  /** 页面请求关闭（window.close()） */
  onClose: (tabId: string) => void;
  /** 更新 tab 字段 */
  updateTab: (tabId: string, updates: Partial<Tab>) => void;
  /** 光标类型变化（仅当前标签） */
  onCursorChanged?: (type: string, tabId: string) => void;
  /** 悬停链接目标 URL 变化（仅当前标签） */
  onTargetURL?: (url: string, tabId: string) => void;
  /** 网页内右键菜单（仅当前标签） */
  onContextMenu?: (params: import('@renderer/lib/useWebUIState').WebContextMenuParams, tabId: string) => void;
}

export interface UseViewsArgs extends UseViewsCallbacks {
  allTabs: Tab[];
  currentTabId?: string;
  settings: Settings;
}

/**
 * 管理 renderer 侧与主进程 WebContentsView 的同步：
 * 1. 对账：shouldRender 为 true 的标签创建/确保视图，为 false 的销毁视图
 * 2. 当前标签变化 → 通知主进程置顶
 * 3. UA 变化 → 通知主进程
 * 4. 订阅主进程事件，回写到 Tab 状态
 */
export function useViews(args: UseViewsArgs): void {
  const {
    allTabs,
    currentTabId,
    settings,
    onFaviconsUpdate,
    onTitleUpdate,
    onLoadCommit,
    onMediaStartedPlaying,
    onMediaPaused,
    onClose,
    updateTab,
    onCursorChanged,
    onTargetURL,
    onContextMenu
  } = args;

  // 1. 对账：按 shouldRender 增删视图
  useEffect(() => {
    for (const tab of allTabs) {
      if (tab.shouldRender) {
        window.api.viewEnsure(tab.id, { src: tab.src, ua: settings.ua });
      } else {
        window.api.viewDestroy(tab.id);
      }
    }
  }, [allTabs, settings.ua]);

  // 2. 当前标签变化
  useEffect(() => {
    window.api.setCurrentTab(currentTabId ?? null);
  }, [currentTabId]);

  // 3. UA 变化（对账 effect 已处理新建视图的 ua，这里覆盖存量视图）
  useEffect(() => {
    if (settings.ua) {
      window.api.viewSetUserAgent(settings.ua);
    }
  }, [settings.ua]);

  // 4. 事件订阅（仅挂载一次）
  useEffect(() => {
    const ipc = window.electron.ipcRenderer;

    const onDidNavigate = (_e: unknown, tabId: string, url: string, isMainFrame: boolean): void => {
      onLoadCommit(url, isMainFrame, tabId);
    };
    const onNavState = (_e: unknown, tabId: string, state: { canGoBack: boolean; canGoForward: boolean }): void => {
      updateTab(tabId, { canGoBack: state.canGoBack, canGoForward: state.canGoForward });
    };
    const onTitle = (_e: unknown, tabId: string, title: string): void => {
      onTitleUpdate(title, tabId);
    };
    const onFavicons = (_e: unknown, tabId: string, favicons: string[]): void => {
      onFaviconsUpdate(favicons, tabId);
    };
    const onStartLoading = (_e: unknown, tabId: string): void => {
      updateTab(tabId, { isLoading: true });
    };
    const onStopLoading = (_e: unknown, tabId: string): void => {
      updateTab(tabId, { isLoading: false });
    };
    const onMediaStart = (_e: unknown, tabId: string): void => {
      onMediaStartedPlaying(tabId);
    };
    const onMediaPause = (_e: unknown, tabId: string): void => {
      onMediaPaused(tabId);
    };
    const onCloseEvent = (_e: unknown, tabId: string): void => {
      onClose(tabId);
    };
    const onCursorEvent = (_e: unknown, tabId: string, type: string): void => {
      onCursorChanged?.(type, tabId);
    };
    const onTargetURLEvent = (_e: unknown, tabId: string, url: string): void => {
      onTargetURL?.(url, tabId);
    };
    const onContextMenuEvent = (
      _e: unknown,
      tabId: string,
      params: import('@renderer/lib/useWebUIState').WebContextMenuParams
    ): void => {
      onContextMenu?.(params, tabId);
    };

    ipc.on('view-did-navigate', onDidNavigate);
    ipc.on('view-nav-state', onNavState);
    ipc.on('view-page-title-updated', onTitle);
    ipc.on('view-page-favicon-updated', onFavicons);
    ipc.on('view-did-start-loading', onStartLoading);
    ipc.on('view-did-stop-loading', onStopLoading);
    ipc.on('view-media-started-playing', onMediaStart);
    ipc.on('view-media-paused', onMediaPause);
    ipc.on('view-close', onCloseEvent);
    ipc.on('view-cursor-changed', onCursorEvent);
    ipc.on('view-target-url', onTargetURLEvent);
    ipc.on('view-context-menu', onContextMenuEvent);

    return () => {
      ipc.removeAllListeners('view-did-navigate');
      ipc.removeAllListeners('view-nav-state');
      ipc.removeAllListeners('view-page-title-updated');
      ipc.removeAllListeners('view-page-favicon-updated');
      ipc.removeAllListeners('view-did-start-loading');
      ipc.removeAllListeners('view-did-stop-loading');
      ipc.removeAllListeners('view-media-started-playing');
      ipc.removeAllListeners('view-media-paused');
      ipc.removeAllListeners('view-close');
      ipc.removeAllListeners('view-cursor-changed');
      ipc.removeAllListeners('view-target-url');
      ipc.removeAllListeners('view-context-menu');
    };
    // 回调引用可能变化，但事件载荷只携带 tabId，内部调 updateTab 等；
    // 为避免频繁重订阅，这里只挂载一次。callback 通过闭包捕获最新引用有风险，
    // 故让依赖包含回调以保证一致性。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    onFaviconsUpdate,
    onTitleUpdate,
    onLoadCommit,
    onMediaStartedPlaying,
    onMediaPaused,
    onClose,
    updateTab,
    onCursorChanged,
    onTargetURL,
    onContextMenu
  ]);
}
