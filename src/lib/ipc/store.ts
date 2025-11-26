import { JsonDataCallback } from '@/lib/ipc/index.ts';

function StoreGet(key: string, callback?: (data: any) => void) {
  ipc.emit('store-get', [key], JsonDataCallback(callback));
}

function StoreSet(key: string, value: any, callback?: (data: boolean) => void) {
  ipc.emit('store-set', [key, JSON.stringify(value)], JsonDataCallback(callback));
}

function StoreHas(key: string, callback?: (data: boolean) => void) {
  ipc.emit('store-has', [key], JsonDataCallback(callback));
}

function StoreDelete(key: string, value: string, callback?: (data: boolean) => void) {
  ipc.emit('store-delete', [key, value], JsonDataCallback(callback));
}

export const Store = {
  get: StoreGet,
  set: StoreSet,
  has: StoreHas,
  delete: StoreDelete,
};
