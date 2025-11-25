/**
 * Energy CEF IPC Bridge
 * 
 * This script provides a bridge between the React frontend and the Go backend
 * using the Energy CEF framework's IPC mechanism.
 * 
 * It exposes the same API as the Electron preload script, making the migration
 * from Electron to CEF transparent for the React code.
 */

(function() {
  'use strict';

  // Check if we're running in Energy CEF environment
  const isEnergyCEF = typeof window.ipc !== 'undefined';

  // Create the API bridge
  const api = {
    // Favicon operations
    getFavicon: function(url) {
      if (isEnergyCEF) {
        return new Promise(function(resolve) {
          ipc.emit('get-favicon', [url], function(result) {
            resolve(result);
          });
        });
      }
      return Promise.resolve('');
    },

    // Window control
    isMaximized: function() {
      if (isEnergyCEF) {
        return new Promise(function(resolve) {
          ipc.emit('is-maximized', [], function(result) {
            resolve(result);
          });
        });
      }
      return Promise.resolve(false);
    },

    maximize: function() {
      if (isEnergyCEF) {
        return new Promise(function(resolve) {
          ipc.emit('maximize', [], function() {
            resolve();
          });
        });
      }
      return Promise.resolve();
    },

    minimize: function() {
      if (isEnergyCEF) {
        return new Promise(function(resolve) {
          ipc.emit('minimize', [], function() {
            resolve();
          });
        });
      }
      return Promise.resolve();
    },

    unmaximize: function() {
      if (isEnergyCEF) {
        return new Promise(function(resolve) {
          ipc.emit('unmaximize', [], function() {
            resolve();
          });
        });
      }
      return Promise.resolve();
    },

    close: function() {
      if (isEnergyCEF) {
        return new Promise(function(resolve) {
          ipc.emit('close', [], function() {
            resolve();
          });
        });
      }
      return Promise.resolve();
    },

    focus: function() {
      if (isEnergyCEF) {
        return new Promise(function(resolve) {
          ipc.emit('focus', [], function() {
            resolve();
          });
        });
      }
      return Promise.resolve();
    },

    scaleFactor: function() {
      if (isEnergyCEF) {
        return new Promise(function(resolve) {
          ipc.emit('scale-factor', [], function(result) {
            resolve(result);
          });
        });
      }
      return Promise.resolve(1.0);
    }
  };

  // Create the store API
  const storeApi = {
    get: function(key) {
      if (isEnergyCEF) {
        return new Promise(function(resolve) {
          ipc.emit('store-get', [key], function(result) {
            try {
              resolve(result ? JSON.parse(result) : null);
            } catch (e) {
              resolve(result);
            }
          });
        });
      }
      return Promise.resolve(null);
    },

    set: function(key, value) {
      if (isEnergyCEF) {
        return new Promise(function(resolve) {
          ipc.emit('store-set', [key, JSON.stringify(value)], function(result) {
            resolve(result);
          });
        });
      }
      return Promise.resolve(true);
    },

    has: function(key) {
      if (isEnergyCEF) {
        return new Promise(function(resolve) {
          ipc.emit('store-has', [key], function(result) {
            resolve(result);
          });
        });
      }
      return Promise.resolve(false);
    },

    delete: function(key) {
      if (isEnergyCEF) {
        return new Promise(function(resolve) {
          ipc.emit('store-delete', [key], function(result) {
            resolve(result);
          });
        });
      }
      return Promise.resolve(true);
    }
  };

  // Create the electron-compatible IPC renderer interface
  const ipcRenderer = {
    on: function(channel, callback) {
      if (isEnergyCEF) {
        ipc.on(channel, function() {
          var args = Array.prototype.slice.call(arguments);
          callback.apply(null, [null].concat(args));
        });
      }
    },

    once: function(channel, callback) {
      if (isEnergyCEF) {
        var handler = function() {
          var args = Array.prototype.slice.call(arguments);
          callback.apply(null, [null].concat(args));
          ipc.off(channel, handler);
        };
        ipc.on(channel, handler);
      }
    },

    removeAllListeners: function(channel) {
      if (isEnergyCEF && channel) {
        // Note: Energy IPC may not support this directly
        console.log('[CEF Bridge] removeAllListeners:', channel);
      }
    },

    send: function(channel) {
      if (isEnergyCEF) {
        var args = Array.prototype.slice.call(arguments, 1);
        ipc.emit(channel, args);
      }
    },

    invoke: function(channel) {
      if (isEnergyCEF) {
        var args = Array.prototype.slice.call(arguments, 1);
        return new Promise(function(resolve) {
          ipc.emit(channel, args, function(result) {
            resolve(result);
          });
        });
      }
      return Promise.resolve(null);
    }
  };

  // Create the electron-compatible interface
  const electron = {
    ipcRenderer: ipcRenderer
  };

  // Expose to global scope
  window.api = api;
  window.store = storeApi;
  window.electron = electron;

  console.log('[CEF Bridge] API bridge initialized, isEnergyCEF:', isEnergyCEF);
})();
