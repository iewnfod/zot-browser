import { is } from '@electron-toolkit/utils';
import { join } from 'path';
import { pathToFileURL } from 'url';

/**
 * zot:// 自定义 scheme 路由。
 *
 * zot:// 内部页是本地打包的 React 页面（与主 UI 同源），但暴露为 zot://
 * 这样的语义化地址（zot://settings、zot://extensions）。实现方式：
 * 主进程把 zot://xxx 翻译成真实可加载的 URL：
 *   - dev：${ELECTRON_RENDERER_URL}/<page>/index.html（vite dev server）
 *   - prod：file://.../out/renderer/<page>/index.html
 *
 * 标签栏始终显示原始的 zot:// 地址（loadedSrc 保留原值），
 * 真实 URL 仅用于底层 webContents.loadURL。
 */

/** 已注册的 zot:// 内部页：hostname → 打包后的子目录名。 */
const ZOT_PAGES: Record<string, string> = {
  settings: 'settings',
  extensions: 'extensions',
};

/** 判断一个 URL 是否是 zot:// 内部页。 */
export function isZotURL(url: string): boolean {
  return typeof url === 'string' && url.startsWith('zot://');
}

/**
 * 把 zot:// 地址翻译成真实可加载的 URL。
 * 无法识别的 hostname 返回 null（调用方可回退到普通网页处理或显示错误）。
 *
 * 注意：返回值用于 webContents.loadURL，prod 必须是 file:// URL（不能是裸路径）。
 */
export function resolveZotURL(zotURL: string): string | null {
  if (!isZotURL(zotURL)) return null;
  try {
    // URL 解析自定义 scheme 时，hostname 为 zot:// 之后、下一个 / 之前的部分
    const parsed = new URL(zotURL);
    const page = ZOT_PAGES[parsed.hostname];
    if (!page) return null;
    const file = `${page}/index.html`;
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      // dev：vite dev server 提供该页面
      return `${process.env['ELECTRON_RENDERER_URL']}/${file}`;
    }
    // prod：out/renderer/<page>/index.html，转成 file:// URL 供 loadURL 加载
    // （__dirname = out/main，故 ../renderer 对应打包产物目录）
    return pathToFileURL(join(__dirname, '../renderer', file)).href;
  } catch {
    return null;
  }
}

/**
 * 判断一个 URL 是否对应一个 zot:// 内部页（含解析失败检查）。
 * 用于决定 WebContentsView 是否需要「UI 同款」webPreferences（含 preload）。
 */
export function isInternalPageURL(url: string): boolean {
  return isZotURL(url) && resolveZotURL(url) !== null;
}
