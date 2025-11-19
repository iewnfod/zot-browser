export interface Settings {
  ua?: string;
  showSideBar: boolean;
  sidebarWidth: number;
}

export function getDefaultSettings() {
  return {
    ua: undefined,
    showSideBar: true,
    sidebarWidth: 200
  } as Settings;
}
