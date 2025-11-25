/**
 * Energy CEF IPC Bridge
 *
 * This script provides a bridge between the React frontend and the Go backend
 * using the Energy CEF framework's IPC mechanism.
 *
 * It exposes the same API as the Electron preload script, making the migration
 * from Electron to CEF transparent for the React code.
 */

// Type definitions for Energy CEF IPC
interface EnergyIPC {
  emit(channel: string, args: unknown[], callback?: (result: unknown) => void): void;
  on(channel: string, callback: (...args: unknown[]) => void): void;
  off(channel: string, callback: (...args: unknown[]) => void): void;
}

// Extend Window interface
declare global {
  interface Window {
    ipc?: EnergyIPC;
    api: typeof api;
    store: typeof storeApi;
    electron: typeof electron;
  }
}

// Check if we're running in Energy CEF environment
const isEnergyCEF: boolean = typeof window.ipc !== 'undefined';

// Create the API bridge
const api = {
  // Favicon operations
  getFavicon(url: string): Promise<string> {
    if (isEnergyCEF && window.ipc) {
      return new Promise<string>((resolve) => {
        window.ipc!.emit('get-favicon', [url], (result) => {
          resolve(result as string);
        });
      });
    }
    return Promise.resolve('');
  },

  // Window control
  isMaximized(): Promise<boolean> {
    if (isEnergyCEF && window.ipc) {
      return new Promise<boolean>((resolve) => {
        window.ipc!.emit('is-maximized', [], (result) => {
          resolve(result as boolean);
        });
      });
    }
    return Promise.resolve(false);
  },

  maximize(): Promise<void> {
    if (isEnergyCEF && window.ipc) {
      return new Promise<void>((resolve) => {
        window.ipc!.emit('maximize', [], () => {
          resolve();
        });
      });
    }
    return Promise.resolve();
  },

  minimize(): Promise<void> {
    if (isEnergyCEF && window.ipc) {
      return new Promise<void>((resolve) => {
        window.ipc!.emit('minimize', [], () => {
          resolve();
        });
      });
    }
    return Promise.resolve();
  },

  unmaximize(): Promise<void> {
    if (isEnergyCEF && window.ipc) {
      return new Promise<void>((resolve) => {
        window.ipc!.emit('unmaximize', [], () => {
          resolve();
        });
      });
    }
    return Promise.resolve();
  },

  close(): Promise<void> {
    if (isEnergyCEF && window.ipc) {
      return new Promise<void>((resolve) => {
        window.ipc!.emit('close', [], () => {
          resolve();
        });
      });
    }
    return Promise.resolve();
  },

  focus(): Promise<void> {
    if (isEnergyCEF && window.ipc) {
      return new Promise<void>((resolve) => {
        window.ipc!.emit('focus', [], () => {
          resolve();
        });
      });
    }
    return Promise.resolve();
  },

  scaleFactor(): Promise<number> {
    if (isEnergyCEF && window.ipc) {
      return new Promise<number>((resolve) => {
        window.ipc!.emit('scale-factor', [], (result) => {
          resolve(result as number);
        });
      });
    }
    return Promise.resolve(1.0);
  }
};

// Create the store API
const storeApi = {
  get(key: string): Promise<unknown> {
    if (isEnergyCEF && window.ipc) {
      return new Promise<unknown>((resolve) => {
        window.ipc!.emit('store-get', [key], (result) => {
          try {
            resolve(result ? JSON.parse(result as string) : null);
          } catch {
            resolve(result);
          }
        });
      });
    }
    return Promise.resolve(null);
  },

  set(key: string, value: unknown): Promise<boolean> {
    if (isEnergyCEF && window.ipc) {
      return new Promise<boolean>((resolve) => {
        window.ipc!.emit('store-set', [key, JSON.stringify(value)], (result) => {
          resolve(result as boolean);
        });
      });
    }
    return Promise.resolve(true);
  },

  has(key: string): Promise<boolean> {
    if (isEnergyCEF && window.ipc) {
      return new Promise<boolean>((resolve) => {
        window.ipc!.emit('store-has', [key], (result) => {
          resolve(result as boolean);
        });
      });
    }
    return Promise.resolve(false);
  },

  delete(key: string): Promise<boolean> {
    if (isEnergyCEF && window.ipc) {
      return new Promise<boolean>((resolve) => {
        window.ipc!.emit('store-delete', [key], (result) => {
          resolve(result as boolean);
        });
      });
    }
    return Promise.resolve(true);
  }
};

// Type for IPC event callback
type IpcCallback = (event: null, ...args: unknown[]) => void;

// Create the electron-compatible IPC renderer interface
const ipcRenderer = {
  on(channel: string, callback: IpcCallback): void {
    if (isEnergyCEF && window.ipc) {
      window.ipc.on(channel, (...args: unknown[]) => {
        callback(null, ...args);
      });
    }
  },

  once(channel: string, callback: IpcCallback): void {
    if (isEnergyCEF && window.ipc) {
      const handler = (...args: unknown[]): void => {
        callback(null, ...args);
        window.ipc!.off(channel, handler);
      };
      window.ipc.on(channel, handler);
    }
  },

  removeAllListeners(channel: string): void {
    if (isEnergyCEF && channel) {
      // Note: Energy IPC may not support this directly
      console.log('[CEF Bridge] removeAllListeners:', channel);
    }
  },

  send(channel: string, ...args: unknown[]): void {
    if (isEnergyCEF && window.ipc) {
      window.ipc.emit(channel, args);
    }
  },

  invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    if (isEnergyCEF && window.ipc) {
      return new Promise<unknown>((resolve) => {
        window.ipc!.emit(channel, args, (result) => {
          resolve(result);
        });
      });
    }
    return Promise.resolve(null);
  }
};

// Create the electron-compatible interface
const electron = {
  ipcRenderer
};

// Expose to global scope
window.api = api;
window.store = storeApi;
window.electron = electron;

console.log('[CEF Bridge] API bridge initialized, isEnergyCEF:', isEnergyCEF);

// Export for module systems (optional)
export { api, storeApi, electron, isEnergyCEF };
