import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        // 主 UI 与 zot:// 内部页（settings/extensions）共享 src/renderer/src 下的 lib
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [
      react(),
      tailwindcss(),
    ],
    // 多页面：除主 UI 外，把 zot:// 内部页也作为独立入口打包。
    // electron-vite 默认用 string 形式 input（src/renderer/index.html），
    // 这里改成 object 形式会整体替换默认值（Vite mergeConfig 语义）。
    build: {
      rollupOptions: {
        input: {
          main: resolve('src/renderer/index.html'),
          settings: resolve('src/renderer/settings/index.html'),
          extensions: resolve('src/renderer/extensions/index.html'),
        }
      }
    }
  }
});
