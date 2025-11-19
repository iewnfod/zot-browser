export interface LoadMenuEventsProps {
  openNewTabModal: () => void;
  closeCurrentTab: () => void;
  reloadCurrentTab: () => void;
  currentTabGoBack: () => void;
  currentTabGoForward: () => void;
  toggleSideBar: () => void;
}

export function LoadMenuEvents(props: LoadMenuEventsProps) {
  window.electron.ipcRenderer.on('menu-new-tab', props.openNewTabModal);
  window.electron.ipcRenderer.on('menu-close-tab', props.closeCurrentTab);
  window.electron.ipcRenderer.on('menu-reload-tab', props.reloadCurrentTab);
  window.electron.ipcRenderer.on('menu-tab-go-back', props.currentTabGoBack);
  window.electron.ipcRenderer.on('menu-tab-go-forward', props.currentTabGoForward);
  window.electron.ipcRenderer.on('menu-toggle-sidebar', props.toggleSideBar);
  console.log('Finish register menu events!');
}

export function UnLoadMenuEvents() {
  window.electron.ipcRenderer.removeAllListeners('menu-new-tab');
  window.electron.ipcRenderer.removeAllListeners('menu-close-tab');
  window.electron.ipcRenderer.removeAllListeners('menu-reload-tab');
  window.electron.ipcRenderer.removeAllListeners('menu-tab-go-back');
  window.electron.ipcRenderer.removeAllListeners('menu-tab-go-forward');
  window.electron.ipcRenderer.removeAllListeners('menu-toggle-sidebar');
  console.log('Finish unregister menu events!');
}
