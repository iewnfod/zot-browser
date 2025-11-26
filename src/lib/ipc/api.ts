import { JsonDataCallback } from '@/lib/ipc/index.ts';

function getFavicon(url: string, callback?: (data: any) => void) {
  callback?.(url);
}

function isMaximized(callback?: (data: boolean) => void) {
  ipc.emit("is-maximized", [], JsonDataCallback(callback));
}

function maximize(callback?: () => void) {
  ipc.emit('maximize', [], callback);
}

function unmaximize(callback?: () => void) {
  ipc.emit('unmaximize', [], callback);
}

function minimize(callback?: () => void) {
  ipc.emit('minimize', [], callback);
}

function close(callback?: () => void) {
  ipc.emit('close', [], callback);
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
