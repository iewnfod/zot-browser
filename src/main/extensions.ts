import { app, dialog, ipcMain, session } from 'electron';
import { join, basename } from 'path';
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  mkdtemp,
  writeFile,
} from 'fs/promises';
import { createHash, randomUUID } from 'crypto';
import { tmpdir } from 'os';
import AdmZip from 'adm-zip';
import { ElectronChromeExtensions } from 'electron-chrome-extensions';
import { installChromeWebStore } from 'electron-chrome-web-store';
import { broadcastToUiViews, PARTITION, getUiView, getMainWindow, getWebContents, getTabIdByWebContentsId, waitForView, setViewLifecycleHooks } from './viewManager';
import { store } from './storage';
import {
  extractPermissions,
  getDefaultExtensionsState,
  InstalledExtension,
  InstallConfirmPayload,
  InstallResult,
  ParsedExtension,
  ExtensionPermissions,
  ExtensionsState,
} from '../renderer/src/lib/extensions';

// 重新导出，方便调用方统一从主进程模块引用（解析逻辑实际在共享 lib 中）。
export { extractPermissions };

/**
 * 扩展（插件）管理 —— 主进程模块。
 *
 * 复用 Electron 原生 `session.loadExtension`（仅支持未打包目录）：
 * - 安装 = 校验 manifest → 复制到 userData/extensions/<dir>/ → loadExtension
 *   → 取回 Chrome id 等元信息 → 写内存/store → 广播 extensions-changed。
 * - 启用/禁用 = loadExtension / removeExtension（即时生效；对已开标签，
 *   content_scripts 在下次导航或手动 reload 后注入，与 Chrome 一致）。
 * - 卸载 = removeExtension → 删目录 → 删记录 → 广播。
 *
 * 隔离：扩展加载进 `persist:shared-partition`，所有网页 view + zot:// 内部页
 * 都跑在该 partition 上；透明 UI view 用默认 session（不走该 partition），
 * 因此扩展 content_scripts 不会污染浏览器 UI。
 *
 * 已知限制（Electron 原生能力所限）：
 * - 不支持 .crx 打包格式（仅未打包目录）。CWS 安装靠下载 .crx → 剥头 → 解压实现。
 * - 每次启动都要重新 loadExtension（Electron 不跨重启记忆）→ loadAllEnabledOnBoot。
 * - MV3 service worker 需手动启动（see maybeStartServiceWorker），已处理。
 * - 不支持 popup / options 页 / 大部分 chrome.* API（Electron 原生仅支持 content script 注入）。
 * - 权限为「安装时审核 + 整体启用/禁用」，无法单权限拒绝（需重写 manifest，过侵入）。
 */

const STORE_KEY = 'extensions';
/** userData 下存放已安装扩展的根目录名。 */
const EXTENSIONS_DIRNAME = 'extensions';

// —— 内存状态（启动时从 store 恢复）——
const installed = new Map<string, InstalledExtension>();
/** 图标 base64 缓存（id → data URL），避免每次列表面板都读盘。 */
const iconCache = new Map<string, string>();

/** userData/extensions/ 的绝对路径。 */
function extensionsRoot(): string {
  return join(app.getPath('userData'), EXTENSIONS_DIRNAME);
}

/**
 * 取 partition 的扩展 API（Electron ≥37 迁移到 session.extensions，旧版直接在 session 上）。
 * 统一从这里取，避免散落的 deprecation 警告，并兼容老版本。
 */
function extApi(ses: Electron.Session): {
  loadExtension: (p: string, opts?: Electron.LoadExtensionOptions) => Promise<Electron.Extension>;
  removeExtension: (id: string) => void;
  getExtension: (id: string) => Electron.Extension | undefined;
} {
  const withExt = ses as Electron.Session & { extensions?: any };
  return withExt.extensions ?? (ses as any);
}

/** 读取持久化状态（缺失返回空默认）。 */
function readState(): ExtensionsState {
  const data = store.get(STORE_KEY);
  if (data && typeof data === 'object' && Array.isArray((data as ExtensionsState).list)) {
    return data as ExtensionsState;
  }
  return getDefaultExtensionsState();
}

/** 写入持久化状态。 */
function writeState(): void {
  store.set(STORE_KEY, { list: Array.from(installed.values()) } satisfies ExtensionsState);
}

/** 广播给主 UI + 所有 zot:// 内部页（含已打开的 zot://extensions 页）。 */
function notifyChanged(): void {
  broadcastToUiViews('extensions-changed');
}

/**
 * 递归复制目录（fs.cp 在较新 Node 可用，但为稳妥手写递归）。
 */
async function copyDir(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const s = join(src, entry.name);
    const d = join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(s, d);
    } else if (entry.isSymbolicLink()) {
      // 复制软链接指向的目标内容（避免链接逃逸出 userData）
      const real = await stat(s).then((st) => st.isFile()).catch(() => false);
      if (real) await copyFile(s, d);
    } else if (entry.isFile()) {
      await copyFile(s, d);
    }
  }
}

/**
 * 把名字/版本规整为一个安全的目录名（去掉路径分隔符与空白，小写化）。
 * 同名时追加 (n) 避免覆盖已存在的安装。
 */
async function uniqueTargetDir(name: string, version: string): Promise<string> {
  const sanitize = (s: string): string =>
    s.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'ext';
  const base = `${sanitize(name)}-${sanitize(version)}`;
  const root = extensionsRoot();
  await mkdir(root, { recursive: true });
  let candidate = join(root, base);
  let i = 2;
  // 已存在目录（且非空）则追加 (n)
  while (
    await stat(candidate).then((s) => s.isDirectory()).catch(() => false)
  ) {
    const files = await readdir(candidate).catch(() => []);
    if (files.length === 0) break; // 空目录可复用
    candidate = join(root, `${base} (${i++})`);
  }
  return candidate;
}

/** 读取并解析 manifest.json；缺失或非法抛错（由调用方捕获转 i18n key）。 */
async function readManifest(dir: string): Promise<Record<string, unknown>> {
  const raw = await readFile(join(dir, 'manifest.json'), 'utf8').catch(() => null);
  if (raw === null) throw new Error('manifest-not-found');
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('manifest-invalid');
  }
}

/** 从 manifest.icons 选最佳图标相对路径（优先最大尺寸；常见 128/48/16）。 */
function pickIcon(manifest: Record<string, unknown>): string | undefined {
  const icons = manifest['icons'];
  if (icons && typeof icons === 'object') {
    const entries = Object.entries(icons as Record<string, string>)
      .map(([size, rel]) => ({ size: Number(size), rel }))
      .filter((e) => Number.isFinite(e.size) && typeof e.rel === 'string' && e.rel);
    if (entries.length) {
      entries.sort((a, b) => b.size - a.size);
      return entries[0].rel;
    }
  }
  return undefined;
}

/**
 * 解析一个含 manifest.json 的目录，生成 UI 预览用的 ParsedExtension（含目标路径）。
 * 不做 loadExtension，仅供安装审核弹框使用。
 */
export async function parseExtensionDir(dir: string): Promise<ParsedExtension> {
  const manifest = await readManifest(dir);
  const name = typeof manifest['name'] === 'string' ? manifest['name'] : basename(dir);
  const version = typeof manifest['version'] === 'string' ? manifest['version'] : '0.0.0';
  const description =
    typeof manifest['description'] === 'string' ? manifest['description'] : undefined;
  const iconRel = pickIcon(manifest);
  const targetPath = await uniqueTargetDir(name, version);
  return { name, version, description, iconRel, manifest, targetPath };
}

/** 把一个含 manifest.json 的源目录复制到目标路径（targetPath），返回目标路径。 */
async function installFiles(srcDir: string, targetPath: string): Promise<void> {
  // targetPath 已由 parseExtensionDir 选好（去重），先建再复制
  await mkdir(targetPath, { recursive: true });
  await copyDir(srcDir, targetPath);
}

/**
 * 真正安装：复制暂存源目录到 targetPath → loadExtension → 取回元信息 → 写记录。
 * 失败抛错（含 'load-failed:' 前缀，供调用方区分错误类型）。
 */
async function copyAndRegister(srcDir: string, targetPath: string): Promise<InstalledExtension> {
  await installFiles(srcDir, targetPath);
  const ses = session.fromPartition(PARTITION);
  let ext;
  try {
    ext = await extApi(ses).loadExtension(targetPath, { allowFileAccess: true });
  } catch (e) {
    throw new Error(`load-failed:${(e as Error)?.message ?? 'unknown'}`);
  }
  maybeStartServiceWorker(ext);
  // loadExtension 返回的 manifest 与磁盘一致；重新读一遍保证字段完整
  const manifest = await readManifest(targetPath).catch(() => ({}));
  const record: InstalledExtension = {
    id: ext.id,
    path: targetPath,
    name: ext.name,
    version: ext.version,
    description:
      typeof manifest['description'] === 'string' ? manifest['description'] : undefined,
    manifest,
    iconRel: pickIcon(manifest),
    installedAt: Date.now(),
    enabled: true,
    pinned: false,
  };
  installed.set(record.id, record);
  writeState();
  return record;
}

/**
 * 启用一个已安装扩展。若已启用则幂等返回。
 */
async function enableExtension(id: string): Promise<boolean> {
  const rec = installed.get(id);
  if (!rec) return false;
  if (rec.enabled) return true;
  const ses = session.fromPartition(PARTITION);
  let ext;
  try {
    ext = await extApi(ses).loadExtension(rec.path, { allowFileAccess: true });
  } catch {
    return false;
  }
  maybeStartServiceWorker(ext);
  rec.enabled = true;
  writeState();
  notifyChanged();
  return true;
}

/** 禁用一个已安装扩展。已禁用则幂等。 */
async function disableExtension(id: string): Promise<boolean> {
  const rec = installed.get(id);
  if (!rec) return false;
  if (!rec.enabled) return true;
  const ses = session.fromPartition(PARTITION);
  try {
    await extApi(ses).removeExtension(id);
  } catch {
    // 即便 removeExtension 报错（例如未加载），也按禁用处理
  }
  rec.enabled = false;
  writeState();
  notifyChanged();
  return true;
}

/** 卸载：移除加载 + 删目录 + 删记录。 */
async function uninstallExtension(id: string): Promise<boolean> {
  const rec = installed.get(id);
  if (!rec) return false;
  const ses = session.fromPartition(PARTITION);
  try { await extApi(ses).removeExtension(id); } catch (_) { /* 忽略未加载 */ }
  await rm(rec.path, { recursive: true, force: true }).catch(() => {});
  installed.delete(id);
  iconCache.delete(id);
  writeState();
  notifyChanged();
  return true;
}

/**
 * 若扩展为 MV3 且声明了 background.service_worker，启动其 service worker。
 *
 * Electron 加载 MV3 扩展后 service worker 不会自动启动，必须手动
 * `session.serviceWorkers.startWorkerForScope('chrome-extension://<id>')`，
 * 否则扩展的 background 脚本完全不运行（事件监听、消息处理都失效）。
 * 启动失败不视为加载失败（content scripts 仍可工作），仅记录警告。
 */
function maybeStartServiceWorker(ext: Electron.Extension): void {
  const manifest = ext.manifest as Record<string, unknown> | undefined;
  const mv = manifest?.['manifest_version'];
  const bg = manifest?.['background'];
  const sw = bg && typeof bg === 'object' ? (bg as Record<string, unknown>)['service_worker'] : undefined;
  if (mv === 3 && typeof sw === 'string' && sw) {
    const scope = `chrome-extension://${ext.id}`;
    const ses = session.fromPartition(PARTITION);
    // startWorkerForScope 在 serviceWorkers 上；Electron 类型可能缺失，用 any 兜底
    const workers = ses.serviceWorkers as unknown as {
      startWorkerForScope?: (scope: string) => Promise<unknown>;
    };
    workers.startWorkerForScope?.(scope).catch((e) => {
      console.warn('[extensions] failed to start service worker for', ext.name, e);
    });
  }
}

/**
 * 打开扩展 popup 前确保其 MV3 service worker 已（重新）启动。
 *
 * MV3 service worker 会被 Chromium 在空闲后终止；打开 popup 时若不重新唤醒，
 * popup 启动后立刻发出的 chrome.runtime.sendMessage（拉数据）会无人接收 →
 * "Could not establish connection. Receiving end does not exist."，且功能异常。
 *
 * 与 maybeStartServiceWorker 的区别：入参是 extId（从 installed map 查 manifest，
 * 不依赖 Electron.Extension 对象），返回 Promise 供调用方 await（worker 就绪后再加载
 * popup 内容，避免首条消息踩空窗口）。worker 已运行时幂等无副作用。
 */
export async function ensurePopupServiceWorker(extId: string): Promise<void> {
  const rec = installed.get(extId);
  if (!rec) return;
  const manifest = rec.manifest as Record<string, unknown> | undefined;
  const mv = manifest?.['manifest_version'];
  const bg = manifest?.['background'];
  const sw = bg && typeof bg === 'object' ? (bg as Record<string, unknown>)['service_worker'] : undefined;
  if (mv !== 3 || typeof sw !== 'string' || !sw) return; // 非 MV3 或无 service_worker，无需启动
  const scope = `chrome-extension://${extId}`;
  const ses = session.fromPartition(PARTITION);
  const workers = ses.serviceWorkers as unknown as {
    startWorkerForScope?: (scope: string) => Promise<unknown>;
  };
  if (!workers.startWorkerForScope) return;
  try {
    await workers.startWorkerForScope(scope);
  } catch (e) {
    // 启动失败不阻塞 popup 打开（catch 兜底）
    console.warn('[extensions] startWorkerForScope failed before popup for', extId, e);
  }
}

/**
 * 开机时把所有已启用扩展重新 loadExtension 进 partition。
 * 必须在首个网页 view 创建前调用，content scripts 才能注入到首批页面。
 * 单个失败不影响其它扩展（标 disabled 并广播，等用户在扩展页处理）。
 */
export async function loadAllEnabledOnBoot(): Promise<void> {
  const state = readState();
  installed.clear();
  for (const rec of state.list) installed.set(rec.id, { ...rec });
  const ses = session.fromPartition(PARTITION);
  for (const rec of installed.values()) {
    if (!rec.enabled) continue;
    // 安装目录可能被用户外部删除 —— 校验存在性
    const exists = await stat(rec.path).then((s) => s.isDirectory()).catch(() => false);
    if (!exists) {
      rec.enabled = false;
      continue;
    }
    try {
      const ext = await extApi(ses).loadExtension(rec.path, { allowFileAccess: true });
      maybeStartServiceWorker(ext);
    } catch (e) {
      console.warn('[extensions] failed to load on boot:', rec.name, e);
      rec.enabled = false;
    }
  }
  // 开机可能改了若干 enabled 状态（目录缺失/加载失败），落库一次
  writeState();
}

// —— electron-chrome-extensions 宿主实例（在 persist:shared-partition 上）——
// 提供 chrome.* API 兼容层（tabs/runtime/storage/contextMenus/nativeMessaging 等），
// 使 1Password / Dark Reader 等真实扩展可运行。单实例，绑定一个 session。
let extensionHost: ElectronChromeExtensions | null = null;

/**
 * 请求 renderer 开一个标签并回传 tabId。
 *
 * 桥接模式（仿 webcontent.ts 的 open-url-in-new-tab，但加了请求/回复）：
 *   main → uiView: 'tabs-create-request' { reqId, url }
 *   renderer → main: 'tabs-create-response' (reqId, tabId)
 * 用 reqId 关联，支持并发请求。
 */
function requestRendererCreateTab(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const uv = getUiView();
    if (!uv) { reject(new Error('no UI view')); return; }
    const reqId = randomUUID();
    const timer = setTimeout(() => {
      ipcMain.removeHandler('tabs-create-response');
      cleanup();
      reject(new Error('renderer createTab timeout'));
    }, 5000);
    const cleanup = (): void => { clearTimeout(timer); };
    // 一次性 handler：收到对应 reqId 的回复即 resolve
    const handler = (_e: unknown, replyReqId: string, tabId: string): void => {
      if (replyReqId !== reqId) return;
      ipcMain.removeListener('tabs-create-response', handler);
      cleanup();
      resolve(tabId);
    };
    ipcMain.on('tabs-create-response', handler);
    uv.webContents.send('tabs-create-request', reqId, url);
  });
}

/**
 * 请求主 UI 弹出「扩展安装确认」Modal，等待用户 allow/deny。
 *
 * CWS 网站点击安装时，beforeInstall 在主进程触发；Modal 在 renderer，
 * 故经 IPC 往返（同 requestRendererCreateTab 的 reqId 关联模式）。
 * 超时（60s）默认拒绝，避免用户离开后安装永久挂起。
 */
function requestRendererInstallConfirm(payload: InstallConfirmPayload): Promise<boolean> {
  return new Promise((resolve) => {
    const uv = getUiView();
    if (!uv) { resolve(false); return; }
    const reqId = randomUUID();
    const timer = setTimeout(() => {
      ipcMain.removeListener('extension-install-confirm-response', handler);
      resolve(false);
    }, 60000);
    const handler = (_e: unknown, replyReqId: string, allowed: boolean): void => {
      if (replyReqId !== reqId) return;
      clearTimeout(timer);
      ipcMain.removeListener('extension-install-confirm-response', handler);
      resolve(allowed);
    };
    ipcMain.on('extension-install-confirm-response', handler);
    uv.webContents.send('extension-install-confirm-request', reqId, payload);
  });
}

/**
 * 初始化 electron-chrome-extensions 宿主。
 * 在 index.ts 的 app.whenReady 里、createMainWindow 之后、首张网页 view 创建前调用。
 *
 * 提供的 impl 回调把扩展对 tab/window 的操作桥接到我们的标签系统
 * （标签状态真相源在 renderer，故需经 IPC 往返）。
 */
export async function initExtensionHost(): Promise<void> {
  const ses = session.fromPartition(PARTITION);
  const win = getMainWindow();
  if (!win) { console.warn('[extensions] main window not ready, host init skipped'); return; }

  extensionHost = new ElectronChromeExtensions({
    license: 'GPL-3.0',
    session: ses,
    // 扩展调 chrome.tabs.create → 我们让 renderer 开标签，并等 view 就绪后返回 webContents
    createTab: async (details) => {
      const url = details.url || 'about:blank';
      const tabId = await requestRendererCreateTab(url);
      const wc = await waitForView(tabId);
      const w = getMainWindow();
      return [wc, w!];
    },
    // 扩展调 chrome.tabs.update({active:true}) / 切换激活标签 → 反查 tabId 后通知 renderer
    selectTab: (tab) => {
      const uv = getUiView();
      const tabId = getTabIdByWebContentsId(tab.id);
      if (tabId) uv?.webContents.send('tabs-select-by-tabid', tabId);
    },
    // 扩展调 chrome.tabs.remove → 反查 tabId 后通知 renderer 关闭对应标签
    removeTab: (tab) => {
      const uv = getUiView();
      const tabId = getTabIdByWebContentsId(tab.id);
      if (tabId) uv?.webContents.send('tabs-remove-by-tabid', tabId);
    },
    // 扩展调 chrome.windows.create → 复用 createTab（单窗口浏览器，新窗口即新标签）
    createWindow: async () => win,
    removeWindow: () => { /* 单窗口，忽略 */ },
  });

  // 处理扩展宿主对当前标签的查询：扩展需要知道"当前活动 tab"。
  // 库内部维护 addTab 注册的 webContents，selectTab 由我们主动调用驱动。
  // （库的 selectTab 也会在 addTab 时自动设首个为 active。）

  console.log('[extensions] electron-chrome-extensions host initialized on', PARTITION);

  // 监听 session 上的 extension-loaded：任何来源（启动加载 / 启用 / CWS 安装 / 自动更新）
  // 加载扩展后都会触发。借此把 CWS 安装的扩展登记进我们的 installed 记录，供扩展页展示与管理。
  ses.addListener('extension-loaded', (_e, ext) => {
    try {
      if (!installed.has(ext.id)) {
        const manifest = ext.manifest as Record<string, unknown>;
        installed.set(ext.id, {
          id: ext.id,
          path: ext.path,
          name: ext.name,
          version: ext.version,
          description: typeof manifest['description'] === 'string' ? manifest['description'] : undefined,
          manifest,
          iconRel: pickIcon(manifest),
          installedAt: Date.now(),
          enabled: true,
          pinned: false,
        });
        writeState();
        notifyChanged();
        console.log('[extensions] auto-registered extension via session event:', ext.name, ext.id);
      }
    } catch (err) {
      console.warn('[extensions] extension-loaded handler failed:', err);
    }
  });

  // —— electron-chrome-web-store：让用户在 Chrome Web Store 网站直接点「添加到 Chrome」安装，
  // 并提供每 5 小时自动更新。preload 注入后，CWS 页面的安装按钮会被接管。
  //
  // 关键协调：
  // - extensionsPath 指向我们自己的 extensionsRoot()，避免两个并行安装目录。
  // - loadExtensions:false —— 启动加载由我们的 loadAllEnabledOnBoot 负责（它遵循 enable/disable
  //   状态；若让库也 loadAllExtensions 会加载所有扩展且忽略我们的禁用状态 → 冲突）。
  // - autoUpdate:true —— 库负责把已装扩展更新到最新版（更新后会触发 session 的 extension-loaded）。
  // - beforeInstall —— 同步我们的 installed 记录（CWS 网站安装走的不是我们的 IPC，需在此登记）。
  try {
    await installChromeWebStore({
      session: ses,
      extensionsPath: extensionsRoot(),
      loadExtensions: false,
      autoUpdate: true,
      beforeInstall: async (details) => {
        // CWS 网站点击安装 → 弹确认 Modal 让用户审核扩展信息 + 权限。
        // details.icon 是 NativeImage，转 data URL 后才能跨 IPC 给 renderer。
        const icon = details.icon as unknown as { toDataURL?: () => string; toPNG?: () => Buffer } | undefined;
        let iconUrl: string | undefined;
        try {
          if (icon?.toDataURL) iconUrl = icon.toDataURL();
          else if (icon?.toPNG) iconUrl = `data:image/png;base64,${icon.toPNG().toString('base64')}`;
        } catch (_) { /* 图标转换失败不阻塞安装 */ }
        const manifest = details.manifest as Record<string, unknown>;
        const payload: InstallConfirmPayload = {
          id: details.id,
          name: details.localizedName,
          version: typeof manifest['version'] === 'string' ? manifest['version'] : '',
          description: typeof manifest['description'] === 'string' ? manifest['description'] : undefined,
          iconUrl,
          permissions: extractPermissions(manifest),
        };
        const allowed = await requestRendererInstallConfirm(payload);
        return { action: allowed ? 'allow' : 'deny' };
      },
    });
    console.log('[extensions] electron-chrome-web-store enabled (click-to-install on CWS + auto-update)');
  } catch (e) {
    console.warn('[extensions] electron-chrome-web-store init failed:', e);
  }

  // 把 view 生命周期桥接到扩展宿主（避免 viewManager ↔ extensions 循环依赖）
  setViewLifecycleHooks({
    onViewCreated: (tabId) => registerTabToHost(tabId),
    onViewDestroyed: (tabId) => unregisterTabFromHost(tabId),
    onCurrentTabChanged: (tabId) => selectTabInHost(tabId),
    onPopupOpened: (extId) => ensurePopupServiceWorker(extId),
  });
}

/**
 * 注册一个标签给扩展宿主（扩展的 tabs/contextMenus 等 API 依赖此注册）。
 * 在 viewManager 创建 view 后调用。幂等。
 */
export function registerTabToHost(tabId: string): void {
  if (!extensionHost) return;
  const wc = getWebContents(tabId);
  const win = getMainWindow();
  if (!wc || !win) return;
  try {
    extensionHost.addTab(wc, win);
  } catch (e) {
    console.warn('[extensions] addTab failed for', tabId, e);
  }
}

/** 注销标签（view 销毁时调用）。 */
export function unregisterTabFromHost(tabId: string): void {
  if (!extensionHost) return;
  const wc = getWebContents(tabId);
  if (!wc) return;
  try {
    extensionHost.removeTab(wc);
  } catch (_) { /* 忽略 */ }
}

/** 标记某标签为活动（切到当前标签时调用）。 */
export function selectTabInHost(tabId: string): void {
  if (!extensionHost) return;
  const wc = getWebContents(tabId);
  if (!wc) return;
  try {
    extensionHost.selectTab(wc);
  } catch (_) { /* 忽略 */ }
}

/** 获取宿主实例（供 index.ts 注册 crx:// 协议等）。 */
export function getExtensionHost(): ElectronChromeExtensions | null {
  return extensionHost;
}

/** 读图标为 base64 data URL（缓存）；无图标或读失败返回 undefined。 */
async function getIcon(id: string): Promise<string | undefined> {
  const cached = iconCache.get(id);
  if (cached) return cached;
  const rec = installed.get(id);
  if (!rec || !rec.iconRel) return undefined;
  const abs = join(rec.path, rec.iconRel);
  const buf = await readFile(abs).catch(() => null);
  if (!buf) return undefined;
  // 依扩展名推断 mime，默认 png
  const ext = rec.iconRel.toLowerCase().split('.').pop() ?? 'png';
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : 'image/png';
  const url = `data:${mime};base64,${buf.toString('base64')}`;
  iconCache.set(id, url);
  return url;
}

/**
 * 装载扩展相关 IPC handlers。在 index.ts 的 app.whenReady 里、loadStoreEvents
 * 之后、createMainWindow 之前调用（loadAllEnabledOnBoot 也在那之前 await）。
 *
 * 安装采用「三步」流程以支持 Chrome 风格的安装前权限审核：
 *   1) extension-pick-source：弹选择器（目录/zip/crx）→ 解析 manifest →
 *      把源「暂存」到 userData 之外的临时目录，返回 stageId + 解析信息 + 权限清单。
 *      ⚠️ 此时尚未复制进 userData，也未 loadExtension。
 *   2) 用户在审核弹框里查看权限，决定是否安装。
 *   3a) extension-confirm-install(stageId)：复制进 userData + loadExtension + 记录。
 * 3b) extension-abort-staged(stageId)：用户取消 → 删除临时目录。
 */
export function loadExtensionEvents(): void {
  // 内部页（如 zot://settings）请求打开另一个内部页（如 zot://extensions）：
  // 内部页与主 UI 不在同一 webContents，需经主进程转发给主 UI 开新标签。
  ipcMain.on('open-internal-url', (_e, url: string) => {
    if (typeof url !== 'string' || !url) return;
    getUiView()?.webContents.send('open-url-in-new-tab', url);
  });

  // —— 列表：返回内存中的快照（含 manifest 等）——
  ipcMain.handle('extension-list', (): InstalledExtension[] => {
    return Array.from(installed.values());
  });

  // —— 第 1 步：选择源（dir / zip / crx）→ 暂存 → 返回审核信息 ——
  // source: 'unpacked' | 'zip' | 'crx'；crx 时 sourceData 为 idOrUrl，其它忽略。
  ipcMain.handle(
    'extension-pick-source',
    async (
      _e,
      source: 'unpacked' | 'zip' | 'crx',
      sourceData?: string
    ): Promise<PickSourceResult> => {
      try {
        if (source === 'unpacked') {
          const res = await dialog.showOpenDialog({
            title: 'Load unpacked extension',
            properties: ['openDirectory'],
          });
          if (res.canceled || res.filePaths.length === 0) return { ok: false, error: 'extensions.errorCancelled' };
          return stageFromDir(res.filePaths[0]);
        }
        if (source === 'zip') {
          const res = await dialog.showOpenDialog({
            title: 'Install extension from .zip',
            filters: [{ name: 'Zip', extensions: ['zip'] }],
            properties: ['openFile'],
          });
          if (res.canceled || res.filePaths.length === 0) return { ok: false, error: 'extensions.errorCancelled' };
          return stageFromZip(res.filePaths[0]);
        }
        // crx
        const idOrUrl = String(sourceData ?? '');
        const id = extractCwsId(idOrUrl);
        if (!id) return { ok: false, error: 'extensions.errorInvalidStoreId' };
        return stageFromCrx(id);
      } catch (e) {
        return { ok: false, error: 'extensions.errorGeneric' };
      }
    }
  );

  // —— 第 3a 步：审核通过 → 复制进 userData + loadExtension + 记录 ——
  ipcMain.handle('extension-confirm-install', async (_e, stageId: string): Promise<InstallResult> => {
    const staged = stagedSources.get(stageId);
    if (!staged) return { ok: false, error: 'extensions.errorGeneric' };
    stagedSources.delete(stageId); // 取出（无论成功失败都不再保留引用）
    try {
      const record = await copyAndRegister(staged.srcDir, staged.targetPath);
      iconCache.delete(record.id);
      notifyChanged();
      return { ok: true, ext: record };
    } catch (e) {
      // 加载失败：清理已复制的目录
      await rm(staged.targetPath, { recursive: true, force: true }).catch(() => {});
      const msg = (e as Error).message ?? '';
      return { ok: false, error: msg.startsWith('load-failed') ? 'extensions.errorLoad' : 'extensions.errorGeneric' };
    }
  });

  // —— 第 3b 步：取消 → 清理临时目录 ——
  ipcMain.handle('extension-abort-staged', async (_e, stageId: string): Promise<void> => {
    const staged = stagedSources.get(stageId);
    if (!staged) return;
    stagedSources.delete(stageId);
    await rm(staged.tempRoot, { recursive: true, force: true }).catch(() => {});
  });

  ipcMain.handle('extension-enable', (_e, id: string) => enableExtension(id));
  ipcMain.handle('extension-disable', (_e, id: string) => disableExtension(id));
  ipcMain.handle('extension-uninstall', (_e, id: string) => uninstallExtension(id));

  // —— 图标：返回 data URL 或 undefined ——
  ipcMain.handle('extension-get-icon', (_e, id: string) => getIcon(id));

  // —— 固定显示：在侧栏工具栏（reload 右侧）显示/隐藏扩展图标 ——
  ipcMain.handle('extension-set-pinned', (_e, id: string, pinned: boolean): boolean => {
    const rec = installed.get(id);
    if (!rec) return false;
    rec.pinned = pinned;
    writeState();
    notifyChanged();
    return true;
  });
}

/** 第 1 步 pick-source 的返回类型。 */
type PickSourceResult =
  | {
      ok: true;
      stageId: string;
      parsed: ParsedExtension;
      permissions: ExtensionPermissions;
    }
  | { ok: false; error: string };

/** 暂存源信息：用户审核通过后，把 srcDir 复制到 parsed.targetPath。 */
interface StagedSource {
  /** 临时根目录（取消时整体删除）。 */
  tempRoot: string;
  /** 临时目录内含 manifest.json 的目录（复制的源）。 */
  srcDir: string;
  /** 目标安装路径（parsed.targetPath，复制目标）。 */
  targetPath: string;
}
const stagedSources = new Map<string, StagedSource>();
let stageSeq = 1;

/**
 * 把一个含 manifest.json 的目录暂存（仅解析 + 记录），返回审核信息。
 *
 * 注意：传入的 dir 可能是用户自有的开发目录（unpacked 来源）。我们不能把用户的
 * 原目录当成「可删除的临时目录」——故先把它整体复制到一个我们拥有的临时目录，
 * tempRoot/srcDir 都指向这个副本。这样：
 * - 用户取消（abort-staged）时删的是我们的副本，不会误删用户源目录；
 * - confirm-install 时从副本复制进 userData，源目录全程只读。
 */
async function stageFromDir(dir: string): Promise<PickSourceResult> {
  let parsed: ParsedExtension;
  try {
    parsed = await parseExtensionDir(dir);
  } catch (e) {
    return {
      ok: false,
      error: (e as Error).message === 'manifest-not-found' ? 'extensions.errorNoManifest' : 'extensions.errorInvalidManifest',
    };
  }
  let tempRoot: string;
  try {
    tempRoot = await mkdtemp(join(tmpdir(), 'zot-ext-'));
    await copyDir(dir, tempRoot);
  } catch {
    return { ok: false, error: 'extensions.errorCopy' };
  }
  return stageOwnedDir(tempRoot, parsed);
}

/**
 * 暂存一个我们已经拥有的临时目录（zip/crx 解压结果，删除安全）。
 * 与 stageFromDir 不同：不再二次复制，tempRoot 即为 srcDir。
 */
async function stageOwnedDir(tempRoot: string, parsed: ParsedExtension): Promise<PickSourceResult> {
  const stageId = `stage-${stageSeq++}`;
  stagedSources.set(stageId, { tempRoot, srcDir: tempRoot, targetPath: parsed.targetPath });
  return { ok: true, stageId, parsed, permissions: extractPermissions(parsed.manifest) };
}

/** 解压 .zip 到临时目录后暂存（临时目录为我们所有，删除安全）。 */
async function stageFromZip(zipPath: string): Promise<PickSourceResult> {
  let tempRoot: string | null = null;
  try {
    tempRoot = await mkdtemp(join(tmpdir(), 'zot-ext-'));
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(tempRoot, true);
    const dir = await resolveManifestRoot(tempRoot);
    const parsed = await parseExtensionDir(dir);
    return stageOwnedDir(tempRoot, parsed);
  } catch (e) {
    if (tempRoot) await rm(tempRoot, { recursive: true, force: true }).catch(() => {});
    const m = (e as Error).message;
    return { ok: false, error: m === 'manifest-not-found' ? 'extensions.errorNoManifest' : 'extensions.errorZip' };
  }
}

/** 下载 .crx 并解压到临时目录后暂存（临时目录为我们所有，删除安全）。 */
async function stageFromCrx(id: string): Promise<PickSourceResult> {
  let tempRoot: string | null = null;
  try {
    const crxPath = await downloadCrx(id);
    tempRoot = await mkdtemp(join(tmpdir(), 'zot-ext-'));
    // extractCrx 会校验魔数 + 推导 ID + 验证与期望 id 一致 + 写回 manifest.key，
    // 任何一步失败都抛带语义 message 的 Error。
    const dir = await extractCrx(crxPath, tempRoot, id);
    const parsed = await parseExtensionDir(dir);
    return stageOwnedDir(tempRoot, parsed);
  } catch (e) {
    if (tempRoot) await rm(tempRoot, { recursive: true, force: true }).catch(() => {});
    const msg = (e as Error).message ?? '';
    if (msg === 'manifest-not-found') return { ok: false, error: 'extensions.errorNoManifest' };
    if (msg === 'download-failed') return { ok: false, error: 'extensions.errorDownload' };
    if (msg === 'crx-id-mismatch') return { ok: false, error: 'extensions.errorInvalidStoreId' };
    // crx-magic / crx-truncated / crx-no-id / crx-key-mismatch / crx-version → 解析失败
    return { ok: false, error: 'extensions.errorCrxParse' };
  }
}

/**
 * 探测 .zip 解压后真正含 manifest.json 的目录：
 * - 顶层直接含 manifest.json → 返回 tmp
 * - 仅一个子目录且其含 manifest.json → 返回该子目录
 * 否则抛错。
 */
async function resolveManifestRoot(tmp: string): Promise<string> {
  const hasManifest = async (d: string): Promise<boolean> =>
    stat(join(d, 'manifest.json')).then((s) => s.isFile()).catch(() => false);

  if (await hasManifest(tmp)) return tmp;
  const entries = await readdir(tmp, { withFileTypes: true });
  const subdirs = entries.filter((e) => e.isDirectory());
  if (subdirs.length === 1) {
    const sub = join(tmp, subdirs[0].name);
    if (await hasManifest(sub)) return sub;
  }
  throw new Error('manifest-not-found');
}

/** 从用户输入（CWS URL 或纯 ID）提取 32 位扩展 ID。 */
function extractCwsId(input: string): string | null {
  const s = String(input ?? '').trim();
  if (/^[a-p]{32}$/.test(s)) return s;
  // 形如 https://chromewebstore.google.com/detail/<name>/<id> 或 .../detail/<id>
  const m = s.match(/\/detail\/(?:[^/]+\/)?([a-p]{32})(?:[/?#]|$)/);
  if (m) return m[1];
  const m2 = s.match(/([a-p]{32})/);
  return m2 ? m2[1] : null;
}

/** 下载 .crx 到临时文件并返回路径。失败抛 'download-failed'。 */
async function downloadCrx(id: string): Promise<string> {
  const { net } = await import('electron');
  // CWS 更新接口：response=redirect 直接给出 .crx 字节流。
  // prodversion 用真实的 Chromium 版本（Electron 内嵌），否则 CWS 可能返回过旧版本。
  // 注意：此路径依赖 CWS 公开更新端点，可能随政策变化而失效，仅作 best-effort。
  const chromeVersion = process.versions.chrome || '131.0.0.0';
  const updateUrl =
    `https://clients2.google.com/service/update2/crx` +
    `?response=redirect&acceptformat=crx2,crx3&prodversion=${chromeVersion}` +
    `&x=id%3D${id}%26uc`;
  const tmpFile = join(await mkdtemp(join(tmpdir(), 'zot-crx-')), 'ext.crx');
  return new Promise<string>((resolve, reject) => {
    const request = net.request({ url: updateUrl, redirect: 'follow' });
    const chunks: Buffer[] = [];
    request.on('response', (response) => {
      const status = response.statusCode;
      if (status && status >= 300) {
        reject(new Error('download-failed'));
        return;
      }
      response.on('data', (c: Buffer) => chunks.push(c));
      response.on('end', async () => {
        const buf = Buffer.concat(chunks);
        if (buf.length === 0) { reject(new Error('download-failed')); return; }
        try {
          await writeFile(tmpFile, buf);
          resolve(tmpFile);
        } catch {
          reject(new Error('download-failed'));
        }
      });
    });
    request.on('error', () => reject(new Error('download-failed')));
    request.end();
  });
}

/**
 * 把 SHA-256 前 16 字节的 hex（0-9a-f）映射到 Chrome 扩展 ID 字母表（a-p）。
 * Chrome 用 a-p 而非 0-9a-f，避免主机名全数字被某些软件误判为 IP。
 */
function hashToExtensionId(hexHash: string): string {
  let id = '';
  for (const ch of hexHash) {
    const val = parseInt(ch, 16);
    id += isNaN(val) ? 'a' : String.fromCharCode('a'.charCodeAt(0) + val);
  }
  return id;
}

/**
 * 由 public key（base64）推导 Chrome 扩展 ID：
 *   SHA-256(publicKey) 取前 16 字节 → hex(32 字符) → 映射到 a-p 字母表 → 32 字符 ID
 * 与 Chrome / CWS 的算法一致，保证跨机器稳定（只要 key 不变）。
 */
function deriveIdFromPublicKey(publicKeyB64: string): string {
  const hash = createHash('sha256').update(publicKeyB64, 'base64').digest();
  return hashToExtensionId(hash.subarray(0, 16).toString('hex'));
}

/** 把十六进制字节串（来自 CRX3 签名头的 crx_id）映射到 a-p 字母表。 */
function hexBytesToId(hex: string): string {
  return hashToExtensionId(hex);
}

// —— 极简 protobuf reader（仅够解析 CRX3 头，避免引入 pbf 依赖）——
// CRX3 header 是一个 CrxFileHeader 消息，字段：
//   field 2  (length-delimited): AsymmetricKeyProof  sha256_with_rsa（可重复）
//   field 3  (length-delimited): AsymmetricKeyProof  sha256_with_ecdsa（可重复）
//   field 10000 (length-delimited): SignedHeaderData signed_header_data
// AsymmetricKeyProof: { field 1 (bytes) public_key; field 2 (bytes) signature }
// SignedHeaderData:   { field 1 (bytes) crx_id }
// length-delimited = wire type 2；bytes 字段内部也是 length-delimited。
function readVarint(buf: Buffer, pos: number): { value: number; next: number } {
  let result = 0;
  let shift = 0;
  let p = pos;
  while (p < buf.length) {
    const byte = buf[p++];
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value: result >>> 0, next: p };
    shift += 7;
    if (shift > 35) break; // 防御：varint 最多 10 字节
  }
  return { value: result >>> 0, next: p };
}

/** 解析 CRX3 头，返回 { publicKeys[], crxIdHex }（任一可能缺失则该字段为 undefined）。 */
function parseCrx3Header(header: Buffer): {
  publicKeys: Buffer[];
  crxIdHex?: string;
} {
  const publicKeys: Buffer[] = [];
  let crxIdHex: string | undefined;
  let pos = 0;
  while (pos < header.length) {
    const { value: tag, next: p1 } = readVarint(header, pos);
    pos = p1;
    const fieldNumber = tag >>> 3;
    const wireType = tag & 0x7;
    if (wireType !== 2) {
      // 非 length-delimited 字段，本头里不会出现；跳过（容错）
      break;
    }
    const { value: len, next: p2 } = readVarint(header, pos);
    pos = p2;
    if (pos + len > header.length) break;
    const data = header.subarray(pos, pos + len);
    pos += len;

    if (fieldNumber === 2 || fieldNumber === 3) {
      // AsymmetricKeyProof：内部读 field 1 (public_key)
      let q = 0;
      while (q < data.length) {
        const { value: t2, next: q1 } = readVarint(data, q);
        q = q1;
        const fn2 = t2 >>> 3;
        const wt2 = t2 & 0x7;
        if (wt2 !== 2) break;
        const { value: l2, next: q2 } = readVarint(data, q);
        q = q2;
        if (q + l2 > data.length) break;
        if (fn2 === 1) publicKeys.push(Buffer.from(data.subarray(q, q + l2)));
        q += l2;
      }
    } else if (fieldNumber === 10000) {
      // SignedHeaderData：内部读 field 1 (crx_id)
      let q = 0;
      while (q < data.length) {
        const { value: t2, next: q1 } = readVarint(data, q);
        q = q1;
        const fn2 = t2 >>> 3;
        const wt2 = t2 & 0x7;
        if (wt2 !== 2) break;
        const { value: l2, next: q2 } = readVarint(data, q);
        q = q2;
        if (q + l2 > data.length) break;
        if (fn2 === 1) crxIdHex = data.subarray(q, q + l2).toString('hex');
        q += l2;
      }
    }
  }
  return { publicKeys, crxIdHex };
}

/** CRX 解析结果：真实扩展 ID、zip 字节起点、应写回 manifest 的 public key（base64）。 */
interface CrxParseResult {
  extensionId: string;
  zipOffset: number;
  publicKeyB64: string;
}

/**
 * 解析 CRX（CRX2 / CRX3）文件，校验魔数 + 推导真实扩展 ID + 定位 zip 体 + 取出 public key。
 *
 * 与早期"仅跳过 header"的实现不同，这里完整解析 CRX3 的 protobuf 头：
 *   - 从 signed_header_data.crx_id 拿到 CWS 声明的 ID；
 *   - 在 sha256_with_rsa proofs 里找到 public key 与声明 ID 匹配的那个（防伪造）；
 *   - 返回该 public key，供调用方写回 manifest.key（使 loadExtension 算出同样稳定的 ID）。
 *
 * expectedId 给定时校验一致，不一致抛错（防止 CWS 返回错文件）。
 */
function parseCrxFile(buf: Buffer, expectedId?: string): CrxParseResult {
  if (buf.length < 16 || buf.subarray(0, 4).toString('latin1') !== 'Cr24') {
    throw new Error('crx-magic');
  }
  const version = buf.readUInt32LE(4);

  if (version === 2) {
    // CRX2: pubKeyLen(4) + sigLen(4) + publicKey + signature + zip
    const keyLen = buf.readUInt32LE(8);
    const sigLen = buf.readUInt32LE(12);
    const keyStart = 16;
    const zipOffset = keyStart + keyLen + sigLen;
    if (zipOffset > buf.length) throw new Error('crx-truncated');
    const publicKey = buf.subarray(keyStart, keyStart + keyLen);
    const publicKeyB64 = publicKey.toString('base64');
    const extensionId = deriveIdFromPublicKey(publicKeyB64);
    if (expectedId && expectedId !== extensionId) throw new Error('crx-id-mismatch');
    return { extensionId, zipOffset, publicKeyB64 };
  }

  if (version === 3) {
    // CRX3: headerLen(4) + header(proto) + zip
    const headerLen = buf.readUInt32LE(8);
    const headerStart = 12;
    const zipOffset = headerStart + headerLen;
    if (zipOffset > buf.length) throw new Error('crx-truncated');
    const header = buf.subarray(headerStart, zipOffset);
    const { publicKeys, crxIdHex } = parseCrx3Header(header);

    if (!crxIdHex) throw new Error('crx-no-id');
    const declaredId = hexBytesToId(crxIdHex);

    // 在 proofs 里找到 public key 与声明 ID 匹配的那个
    const matchingKey = publicKeys.find((pk) => deriveIdFromPublicKey(pk.toString('base64')) === declaredId);
    if (!matchingKey) throw new Error('crx-key-mismatch');
    const publicKeyB64 = matchingKey.toString('base64');

    if (expectedId && expectedId !== declaredId) throw new Error('crx-id-mismatch');
    return { extensionId: declaredId, zipOffset, publicKeyB64 };
  }

  throw new Error('crx-version');
}

/**
 * 解析 CRX 文件，把 zip 体解压到 dest，并把 public key 写回 manifest.json 的 key 字段。
 * 写回 key 是关键：Electron loadExtension 时若 manifest 有 key，会用 key 算 ID
 * （= CWS 真实 ID，跨机器稳定）；否则用路径算 ID（路径变就变）。
 *
 * 返回解压根目录（含 manifest.json）；失败抛 Error（message 见上方各分支）。
 */
async function extractCrx(crxPath: string, dest: string, expectedId?: string): Promise<string> {
  const buf = await readFile(crxPath);
  const { zipOffset, publicKeyB64 } = parseCrxFile(buf, expectedId);
  const zip = new AdmZip(buf.subarray(zipOffset));
  zip.extractAllTo(dest, true);

  // 写回 manifest.key（若已存在且一致则跳过）
  const manifestPath = join(dest, 'manifest.json');
  const raw = await readFile(manifestPath, 'utf8').catch(() => null);
  if (raw !== null) {
    try {
      const manifest = JSON.parse(raw);
      if (manifest.key !== publicKeyB64) {
        manifest.key = publicKeyB64;
        await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
      }
    } catch {
      // manifest 解析失败：保留原样，让后续 readManifest 报更准确的错
    }
  }
  return resolveManifestRoot(dest);
}
