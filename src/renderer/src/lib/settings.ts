export interface Settings {
  ua?: string;
  showSideBar: boolean;
}

export function getDefaultSettings() {
  return {
    ua: undefined,
    showSideBar: true,
  } as Settings;
}
