export interface Settings {
  ua?: string;
  showSideBar: boolean;
  sidebarWidth: number;
  clearTabInterval?: number;
}

export const DEFAULT_CLEAR_TAB_INTERVAL = 300 * 1000;  // default 5 min

export function getDefaultSettings() {
  return {
    ua: undefined,
    showSideBar: true,
    sidebarWidth: 200,
    clearTabInterval: DEFAULT_CLEAR_TAB_INTERVAL
  } as Settings;
}
