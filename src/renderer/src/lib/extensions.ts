/**
 * 扩展（插件）系统的共享数据模型。
 *
 * 主进程（src/main/extensions.ts）是真相源，renderer 只读这些类型 + 通过
 * window.api.extension* 调用。类型放在 @renderer 别名下（src/renderer/src/lib），
 * 让主进程与扩展页（zot://extensions）共用同一份定义，避免双份声明漂移。
 *
 * 设计要点：
 * - 复用 Electron 原生 `session.loadExtension`（仅支持未打包目录），不自建
 *   content script 注入运行时。已启用扩展加载进 `persist:shared-partition`
 *   后，content_scripts 会自动注入该 partition 下创建的网页 view。
 *   透明 UI view 用的是默认 session（不走该 partition），因此扩展不会污染浏览器 UI。
 * - ID 由 Chrome 扩展 ID 规则生成（基于 key/路径）。我们安装时把扩展复制到
 *   userData/extensions/<dir>/ 下，保证路径稳定 → ID 跨重启稳定；但仍需每次
 *   启动重新 loadExtension（Electron 不会跨重启记忆，见文档）。
 */

/** 一条已安装扩展的序列化形态（持久化进 store 的 'extensions' key）。 */
export interface InstalledExtension {
  /** Chrome 扩展 ID（loadExtension 返回，路径稳定则稳定）。 */
  id: string;
  /** 已安装到 userData/extensions/<dir>/ 的绝对路径。 */
  path: string;
  /** 扩展名（manifest.name）。 */
  name: string;
  /** 版本（manifest.version）。 */
  version: string;
  /** 描述（manifest.description，可缺省）。 */
  description?: string;
  /** 原始 manifest.json 内容。 */
  manifest: Record<string, unknown>;
  /** 选出的最佳图标相对路径（manifest.icons 里挑）；无图标时为 undefined。 */
  iconRel?: string;
  /** 安装时间戳（ms）。 */
  installedAt: number;
  /** 是否启用。 */
  enabled: boolean;
}

/** store['extensions'] 的形态。 */
export interface ExtensionsState {
  list: InstalledExtension[];
}

/**
 * 安装前给 UI 预览用的解析结果（未经 loadExtension，不含真实 id）。
 * 用于「安装审核弹框」展示扩展信息 + 权限清单，用户确认后再真正安装。
 */
export interface ParsedExtension {
  /** 用户可读名 / 版本 / 描述（取自 manifest，缺失回退）。 */
  name: string;
  version: string;
  description?: string;
  /** 选出的最佳图标相对路径；无则 undefined。 */
  iconRel?: string;
  /** 原始 manifest.json。 */
  manifest: Record<string, unknown>;
  /** 待安装到的目标绝对路径（userData/extensions/<dir>/，安装后即是 InstalledExtension.path）。 */
  targetPath: string;
}

/**
 * 从 manifest 解析出的、要展示给用户审核的权限清单（去重后的并集）。
 *
 * 注意：Electron 加载 manifest 是整体生效，无法单权限拒绝（拒绝需重写 manifest，
 * 过于侵入）。因此「Chrome 风格授权」落地为：安装时弹审核框列出权限，
 * 用户整体接受/取消；装好后仅提供 enable/disable 开关。
 */
export interface ExtensionPermissions {
  /** manifest.permissions（chrome.* API 与权限名，如 "storage" / "tabs"）。 */
  permissions: string[];
  /** manifest.optional_permissions。 */
  optionalPermissions: string[];
  /** manifest.host_permissions（MV3）或 permissions 里以 http/https/file/<all_urls> 开头的项（MV2）。 */
  hostPermissions: string[];
  /** 所有 content_scripts.matches 去重后的并集（注入目标站点模式）。 */
  contentScriptMatches: string[];
}

/** 把数组里的非字符串项过滤掉，返回 string[]（容错：manifest 字段可能非法）。 */
function asStrArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** 判断一个权限字符串是否为 URL/host 模式（含 <all_urls>）。 */
function isUrlLike(s: string): boolean {
  return (
    /^https?:\/\//.test(s) ||
    /^file:\/\//.test(s) ||
    s === '<all_urls>' ||
    /^\*:\/\/./.test(s)
  );
}

/**
 * 从 manifest 提取去重后的权限清单（供安装审核 + 列表详情展示）。
 * 纯函数、无 Electron 依赖，主进程与 renderer 共用同一份实现，避免逻辑漂移。
 */
export function extractPermissions(manifest: Record<string, unknown>): ExtensionPermissions {
  const permissions = asStrArr(manifest['permissions']);
  const optionalPermissions = asStrArr(manifest['optional_permissions']);
  // MV3 host_permissions 字段；MV2 里 host 模式混在 permissions 中
  const hostFields = asStrArr(manifest['host_permissions']);

  const apiPerms = new Set<string>();
  const hostPerms = new Set<string>();
  for (const p of [...permissions, ...optionalPermissions]) {
    if (isUrlLike(p)) hostPerms.add(p);
    else apiPerms.add(p);
  }
  for (const h of hostFields) hostPerms.add(h);

  // content_scripts.matches 去重并集
  const matches = new Set<string>();
  const cs = manifest['content_scripts'];
  if (Array.isArray(cs)) {
    for (const entry of cs) {
      if (entry && typeof entry === 'object') {
        const m = (entry as Record<string, unknown>)['matches'];
        for (const x of asStrArr(m)) matches.add(x);
      }
    }
  }

  return {
    permissions: Array.from(apiPerms),
    optionalPermissions: [],
    hostPermissions: Array.from(hostPerms),
    contentScriptMatches: Array.from(matches),
  };
}

/**
 * 安装结果：成功返回 {ok:true, ext}；失败返回 {ok:false, error}。
 * error 为本地化的 i18n key（由 renderer 翻译），让 UI 显示统一文案。
 */
export type InstallResult =
  | { ok: true; ext: InstalledExtension }
  | { ok: false; error: string };

/** store['extensions'] 缺失时的兜底空状态。 */
export function getDefaultExtensionsState(): ExtensionsState {
  return { list: [] };
}
