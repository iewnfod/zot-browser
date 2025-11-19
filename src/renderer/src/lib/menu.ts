export interface LoadMenuEventsProps {
  openNewTabModal: () => void;
  closeCurrentTab: () => void;
  reloadCurrentTab: () => void;
}

export function LoadMenuEvents(props: LoadMenuEventsProps) {
  window.electron.ipcRenderer.on('menu-new-tab', props.openNewTabModal);
  window.electron.ipcRenderer.on('menu-close-tab', props.closeCurrentTab);
  window.electron.ipcRenderer.on('menu-reload-tab', props.reloadCurrentTab);
  console.log('Finish register menu events!');
}

export function UnLoadMenuEvents() {
  window.electron.ipcRenderer.removeAllListeners('menu-new-tab');
  window.electron.ipcRenderer.removeAllListeners('menu-close-tab');
  window.electron.ipcRenderer.removeAllListeners('menu-reload-tab');
  console.log('Finish unregister menu events!');
}
