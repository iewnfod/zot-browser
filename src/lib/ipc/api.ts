import { JsonDataCallback } from '@/lib/ipc/index.ts';

function getFavicon(url: string, callback?: (data: any) => void) {
  callback?.(url);
}

function isMaximized(callback?: (data: boolean) => void) {
  ipc.emit("is-maximized", [], JsonDataCallback(callback));
}

function maximize(callback?: () => void) {
  ipc.emit('maximize', [], JsonDataCallback(callback));
}

function unmaximize(callback?: () => void) {
  ipc.emit('unmaximize', [], JsonDataCallback(callback));
}

function minimize(callback?: () => void) {
  ipc.emit('minimize', [], JsonDataCallback(callback));
}

function close(callback?: () => void) {
  ipc.emit('close', [], JsonDataCallback(callback));
}

function focus(_callback?: () => void) {}

function scaleFactor(callback?: (data: any) => void) {
  callback?.(1);
}

export const Api = {
  getFavicon,
  isMaximized,
  maximize,
  unmaximize,
  minimize,
  close,
  focus,
  scaleFactor,
};
