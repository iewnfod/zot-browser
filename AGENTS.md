# AGENTS.md

本文件面向后续接手的 AI / 开发者，记录 Zot Browser 的整体结构、核心设计与关键约定。
**改动代码前请先通读「核心架构」与「关键约束」两节**，否则极易踩坑。

---

## 1. 项目概述

**Zot Browser** 是一个用 Electron + React 构建的桌面浏览器。

- **技术栈**：Electron 38 / React 19 / TypeScript 5.9 / Vite 7（`electron-vite`）/ Tailwind CSS 4 / HeroUI 2 / framer-motion 12 / react-icons
- **包管理器**：pnpm（`.npmrc` 开启 `shamefully-hoist=true`，`pnpm-workspace.yaml` 配置了 heroui / electron / esbuild 的 hoist）
- **Node 版本**：22（见 `.nvmrc`）
- **许可**：MPL-2.0
- **平台**：Windows / macOS / Linux（Linux 下强制走 X11/XWayland，见下）

应用主页：<https://zot-browser.iewnfod.com>

### 常用命令

```bash
pnpm dev          # 开发：electron-vite dev
pnpm start        # 预览构建产物
pnpm build        # typecheck + electron-vite build
pnpm typecheck    # 同时跑 node 与 web 两套 tsconfig
pnpm build:win    # 打 Windows 安装包
pnpm build:mac    # 打 macOS 包
pnpm build:linux  # 打 Linux 包（AppImage / snap / deb）
```

构建配置见 `electron-builder.yml`；macOS entitlements 在 `build/entitlements.mac.plist`。

---

## 2. 核心架构（最重要的章节）

Zot Browser **不使用** `<webview>` 标签，也**不是**「每个标签一个 BrowserWindow」。
它采用 **单透明窗口 + 多 WebContentsView 叠层 + 坐标级输入转发** 的架构：

```
┌─────────────────────────────────────────────┐
│           透明 BrowserWindow                 │  frame:false, transparent:true, hasShadow:false
│  ┌───────────────────────────────────────┐  │
│  │  UI WebContentsView（React，最顶层）   │  │  背景色 #00000000，全窗口
│  │   - sidebar / 顶栏 / 模态框 / 菜单     │  │  默认接收所有输入事件
│  │  ┌─────────────────────────────────┐  │  │
│  │  │ 网页 WebContentsView（下层）     │  │  │  当前标签页的网页，仅占 pageRect
│  │  │  partition: persist:shared-...   │  │  │  其它标签 view.bounds = 0×0
│  │  └─────────────────────────────────┘  │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

**为什么这样设计**：UI 全透明覆盖在网页之上，可以实现「卡片挖洞」「圆角内阴影」「sidebar 透明融入」等视觉效果（见 `FrameOverlay`），同时网页由原生 WebContentsView 渲染、性能与兼容性与真实 Chromium 一致。

### 2.1 输入转发机制（`src/main/viewManager.ts`）

UI view 在最顶层，**默认吃掉所有鼠标事件**。`setupInputForwarding` 监听 UI view 的 `input-event`，按下述规则路由：

1. 若 `modalOpen`（模态框 / 右键菜单打开）→ 不转发，UI 处理一切。
2. 若事件坐标在 `pageRect`（网页内容矩形）**之外**（侧栏、顶栏等）→ 不转发，UI 自己处理。
3. 若坐标在 `pageRect` **之内** → `event.preventDefault()` 阻止 UI 处理，并把坐标减去 `pageRect.x/y` 后 `sendInputEvent` 给当前网页 view；`mouseDown` 时还会 `.focus()` 网页 view 以路由键盘事件。

**滚轮事件单独走 `forward-wheel` IPC**：renderer 在 `pageAreaRef` 上以 `{ passive: false }` 监听 `wheel`，`preventDefault` 后把 `deltaX/Y/deltaMode` + 坐标发给主进程，主进程再 `sendInputEvent({ type:'mouseWheel' })`。这样可应用「自然滚动」反转（见 `WebViewContainer`）。

**坐标系**：`pageRect`、`forward-wheel` 的 `x/y` 都是 **UI view 坐标系**（CSS 像素）。网页右键菜单的 `params.x/y` 是网页 view 内坐标，转发到 UI 时要 **加上** `pageRect.x/y`；反之 `view-inspect` 的 UI 坐标要 **减去** `pageRect.x/y`。改动时务必成对处理。

### 2.2 标签页生命周期与「对账」

主进程 `views: Map<tabId, ManagedView>` 是网页 view 的真相源。renderer 侧 `useViews`（`src/renderer/src/hooks/useViews.ts`）做 **reconcile（对账）**：

- `tab.shouldRender === true` → `window.api.viewEnsure(tab.id, { src, ua })`
- `tab.shouldRender === false` → `window.api.viewDestroy(tab.id)`
- 当前标签变化 → `setCurrentTab`（主进程把对应 view 置顶、重排）
- UA 变化 → 全量 `viewSetUserAgent`

**只有 `currentTab` 的 view 会被设为 `pageRect`，其余 view 的 bounds 都是 `0×0`**（节省资源 + 防止穿帮）。

**销毁时机很关键**：`closeTab` 里**先同步** `cleanupWebView(tab)`（即 `viewDestroy`）再从 state 删除 tab。因为对账 effect 只遍历 `allTabs`，tab 一旦从 state 删掉，循环里就碰不到它 → `viewDestroy` 永远不会被调用 → 视图成为孤儿（音频继续播放等）。**修改关闭逻辑时务必保持这一顺序**。

### 2.3 后台标签回收（`recycleOldTabs`）

为控制内存，`useBrowserState` 每 10 秒触发一次回收（debounced）：对非当前、`shouldRender` 的标签，若最后活动时间（`lastAccessed` 或 `lastMediaPlayed` 取大）超过 `settings.clearTabInterval`（默认 5 分钟），则销毁 view 并把 `shouldRender` 置 false。**正在播放媒体的标签不会被回收**。

被回收的标签数据仍在 `browser.tabs` 里（只是不渲染），再次选中时会被重新 `viewEnsure`。

### 2.4 `zot://` 内部页路由（设置 / 扩展等）

`zot://` 是 Zot Browser 的自定义内部页 scheme（如 `zot://settings`、`zot://extensions`）。**它不是真正的网络协议**——主进程在加载前把它翻译成本地打包的 React 页面 URL（`src/main/zotProtocol.ts` 的 `resolveZotURL`）：

- dev：`${ELECTRON_RENDERER_URL}/<page>/index.html`（vite dev server）
- prod：`file://.../out/renderer/<page>/index.html`

这些内部页是 **electron-vite 多页面 renderer 的独立入口**（`electron.vite.config.ts` 里 `build.rollupOptions.input` 用 object 形式声明 `main` / `settings` / `extensions`，object 会整体替换 electron-vite 的默认 string input）。

关键约定（改动 `zot://` 相关代码务必遵守）：

1. **走和普通网页相同的 WebContentsView 通道**：复用 partition、输入转发、对账、回收等，零特殊路径。
2. **`zot://` view 用「UI 同款」webPreferences**：`viewManager.webPrefsForSrc(src)` 判定 `isInternalPageURL(src)` 后，给 view 注入 preload、关闭 sandbox，使内部页能用 `window.store` / `window.api`。
3. **`loadedSrc` 保留原始 `zot://` 地址**：底层 `loadURL` 加载的是 `resolveZotURL` 返回的真实 URL，但 `attachForwarders` 的 `displayURL()` 会把 `did-navigate` 等事件里的真实 URL **映射回 `zot://`**，保证标签栏 / 地址栏显示 `zot://settings` 而非 `file://...`。
4. **settings 双向同步**：内部页用 `store.set('settings', ...)` 写入；`storage.ts` 的 `store-set` 检测到 key 为 `'settings'` 时向 UI view 广播 `settings-changed` 事件，主 UI（`App.tsx`）订阅后 `setSettings` 即时应用。为防回环（setSettings → debounced 保存 → 再次广播），`App.tsx` 用 `skipNextSaveRef` 跳过紧随其后的一次保存。
5. **入口**：应用菜单 Window → Settings…（`CmdOrCtrl+,`）/ Extensions…（`CmdOrCtrl+Shift+E`）触发 `menu-open-settings` / `menu-open-extensions`，renderer 调 `createTab('zot://settings')`；地址栏直接输入 `zot://settings` 也可（`normalizeUrl` 对 `zot://` 原样返回）。

---

## 3. 目录结构

```
.
├── src/
│   ├── main/                      # 主进程（Node 环境）
│   │   ├── index.ts               # 入口：创建透明窗口 + UI view，装配各事件模块
│   │   ├── viewManager.ts         # ★ 核心：WebContentsView 管理 + 输入转发
│   │   ├── zotProtocol.ts         # ★ zot:// 内部页路由：zot://xxx → 本地 React 页面 URL
│   │   ├── webcontent.ts          # 全局 web-contents 事件：新窗口拦截、证书错误
│   │   ├── storage.ts             # electron-store 的 IPC 包装；settings 写入时广播 settings-changed
│   │   ├── favicon.ts             # 服务端抓取 favicon → base64（带内存缓存）
│   │   ├── menu.ts                # 应用菜单模板，快捷键 → 向 UI 发事件
│   │   └── time.ts                # asyncCheck 轮询工具
│   ├── preload/
│   │   ├── index.ts               # contextBridge 暴露 window.api / window.store / window.electron
│   │   └── index.d.ts             # window.api / window.store 类型声明
│   └── renderer/                  # 渲染进程（React UI）
│       ├── index.html             # 注意 CSP 与全透明 body/#root
│       └── src/
│           ├── main.tsx           # React 入口，HeroUIProvider
│           ├── App.tsx            # ★ 顶层组件，组装所有状态与子组件
│           ├── env.d.ts           # vite/client 引用
│           ├── components/
│           │   ├── SideBar.tsx              # 侧栏（常驻 / 折叠 Drawer 两种形态）
│           │   ├── WebViewContainer.tsx      # 页面区域占位 + 顶栏 + 滚轮转发
│           │   ├── FrameOverlay.tsx          # ★ SVG 挖洞画框 + 内阴影背景层
│           │   ├── TabRow.tsx                # 单个标签行
│           │   ├── FavoriteTabCard.tsx       # 收藏标签卡片
│           │   ├── ResizeSidebarDivider.tsx  # 侧栏宽度拖拽分隔条
│           │   ├── ContextMenu.tsx           # ★ 受控右键菜单（portal + 边缘翻转）
│           │   ├── Versions.tsx              # Electron 版本展示（遗留，未在 App 使用）
│           │   └── modals/
│           │       ├── NewTabModal.tsx                  # 新标签 / 搜索弹窗（含上下键导航）
│           │       ├── EditTabModal.tsx                 # 复用 NewTabModalContent 编辑当前 URL
│           │       └── InSecureHttpsCertificateModal.tsx# 不安全证书确认
│           ├── hooks/
│           │   ├── BrowserState.ts          # ★ 浏览器状态：tab/space 增删改查 + 持久化
│           │   └── useViews.ts              # ★ 与主进程 WebContentsView 对账 + 事件订阅
│           ├── lib/
│           │   ├── browser.ts               # Browser 类型 + 序列化
│           │   ├── tab.ts                   # Tab 类型 + 序列化 + recycleOldTabs + cleanupWebView
│           │   ├── space.ts                 # Space 类型
│           │   ├── settings.ts              # Settings 类型 + 默认值
│           │   ├── useWebUIState.ts         # ★ 网页瞬态状态（光标/悬停链接/网页右键）
│           │   ├── menu.ts                  # 应用菜单事件 → 回调 的桥接
│           │   ├── search.ts                # SearchOption 类型
│           │   ├── webview.ts               # 旧 webview 标签的类型（迁移残留，仅供参考）
│           │   └── utils.ts                 # debounce + normalizeUrl（URL/search 归一）
│           └── styles/
│               ├── main.css                 # Tailwind + HeroUI 插件 + 透明背景
│               └── hero.ts                  # HeroUI 主题导出
│       ├── settings/                         # ★ zot://settings 内部页（独立多页面入口）
│       │   ├── index.html
│       │   └── src/{main.tsx,SettingsApp.tsx}   # 读写 store；改动经 settings-changed 广播给主 UI
│       └── extensions/                       # ★ zot://extensions 内部页（占位）
│           ├── index.html
│           └── src/{main.tsx,ExtensionsApp.tsx}
├── resources/icon.png             # 应用图标源
├── build/                         # electron-builder 资源（icon.ico/icns/png + mac entitlements）
├── electron.vite.config.ts        # main/preload/renderer 三段配置；@renderer 别名；renderer 多页面 input
├── electron-builder.yml
├── tsconfig.{,node,web}.json      # project references：node 管主/preload，web 管 renderer（含 settings/extensions）
└── package.json
```

★ 标记的文件是理解项目的关键路径，改动前务必读完。

---

## 4. 进程间通信（IPC）契约

所有跨进程通信都经 `preload/index.ts` 暴露的 `window.api` / `window.store` / `window.electron`。**新增能力时需同步改三处**：`preload/index.ts`（实现）+ `preload/index.d.ts`（类型）+ 主进程对应 `ipcMain.handle`。

### 4.1 主进程 → UI 的事件（`ipcRenderer.on`）

| channel | 载荷 | 说明 |
|---|---|---|
| `view-did-navigate` | `(tabId, url, isMainFrame)` | 主框架 / 子框架导航完成 |
| `view-nav-state` | `(tabId, {canGoBack, canGoForward})` | 导航历史状态 |
| `view-page-title-updated` | `(tabId, title)` | 标题更新 |
| `view-page-favicon-updated` | `(tabId, favicons[])` | favicon 更新（renderer 再请求 base64） |
| `view-did-start-loading` / `view-did-stop-loading` | `(tabId)` | 加载状态 |
| `view-media-started-playing` / `view-media-paused` | `(tabId)` | 媒体播放（影响回收） |
| `view-close` | `(tabId)` | 网页请求关闭（`window.close()`） |
| `view-cursor-changed` | `(tabId, type)` | **仅当前标签**：光标类型 |
| `view-target-url` | `(tabId, url)` | **仅当前标签**：悬停链接 URL |
| `view-context-menu` | `(tabId, params)` | **仅当前标签**：网页右键（`params.x/y` 已是 UI 坐标） |
| `open-url-in-new-tab` | `(url)` | 网页 `window.open` http(s) 链接 → 新标签 |
| `open-insecure-https-certificate-modal` | `(data)` | 证书错误，弹确认框 |
| `settings-changed` | `(settings)` | settings 被任何页面改写后广播给主 UI（见 2.4） |
| `menu-*` | 见 `menu.ts` | 应用菜单快捷键（含 `menu-open-settings` / `menu-open-extensions`） |

### 4.2 UI → 主进程（`ipcRenderer.invoke` / `send`）

- **窗口控制**：`is-maximized` / `maximize` / `minimize` / `unmaximize` / `close` / `focus`
- **视图生命周期**：`view-ensure` / `view-destroy`
- **导航**：`view-go-back` / `view-go-forward` / `view-reload` / `view-stop` / `view-set-muted`
- **编辑**（网页右键触发）：`view-cut` / `view-copy` / `view-paste` / `view-delete` / `view-select-all` / `view-undo` / `view-redo`
- **开发者**：`view-inspect(tabId,x,y)` / `view-open-devtools` / `view-view-source` / `view-set-user-agent`
- **布局 / 转发**：`set-current-tab` / `set-page-rect` / `set-modal-open` / `forward-wheel`
- **杂项**：`scale-factor` / `get-natural-scroll` / `get-favicon`
- **store**：`store-get` / `store-set` / `store-has` / `store-delete`（背后是 `electron-store`，持久化在用户数据目录）
- **证书**：`insecure-https-certificate-modal-response`（0=继续并记住，1=返回）

---

## 5. 数据模型与持久化

全部状态通过 `electron-store`（`store-get/set`）持久化，key 为字符串。

### 5.1 `browser`（见 `lib/browser.ts` / `lib/tab.ts` / `lib/space.ts`）

```ts
Browser {
  tabs: Record<tabId, Tab>;
  spaces: Record<spaceId, Space>;
  favoriteTabIds: string[];
  currentTabId?: string;
  currentSpaceId?: string;
}
Space { id, name, icon, tabIds[], pinnedTabIds[], themeColor }
Tab {
  id, name, url, src, favicon,
  lastAccessed?, pinnedUrl?, shouldRender?,   // shouldRender 不序列化
  isPinned?, isFavorite?, spaceId?,
  isMediaPlaying?, lastMediaPlayed?,
  canGoBack?, canGoForward?, isLoading?        // 由主进程事件维护，不序列化
}
```

- **`url` vs `src`**：`url` 是当前真实地址（随导航更新），`src` 是 view 实际加载的地址。反序列化时 `src = pinnedUrl || url`。
- **序列化**：`serializeBrowser` / `deserializeBrowser` 会剔除 `shouldRender`、`canGoBack` 等瞬态字段。
- **保存**：`useBrowserState` 用 `debounce(500ms)` 监听 `browser` 变化写入 store。
- **加载**：挂载时 `loadBrowserData()` 读取，反序列化后所有 `shouldRender=false`，由「当前 tab 应渲染」effect 逐个唤醒。

### 5.2 `settings`（见 `lib/settings.ts`）

```ts
Settings {
  ua?: string;
  showSideBar: boolean;
  sidebarWidth: number;
  clearTabInterval?: number;   // 默认 5*60*1000
  showFullUrl?: boolean;
  naturalScroll?: boolean;     // 首次运行未设置时读系统偏好（macOS）
  uiSize?: UISize;             // 'sm' | 'md' | 'lg'，全 UI 三套尺寸（见 6.4）
}
```

同样 debounce 保存。`naturalScroll` 首次启动会调用 `get-natural-scroll` 探测系统设置。`uiSize` 见 6.4 节。

> **迁移兼容**：历史版本字段名为 `iconSize`，已重命名为 `uiSize`（语义不再局限于图标）。读取时统一用 `resolveUISize(settings)`——它会在 `uiSize` 缺失时回退读老的 `iconSize`，避免老用户的设置丢失。写入一律用 `uiSize`。

### 5.3 证书白名单

`allowedCertificates: string[]`（指纹数组），由证书错误弹窗「Continue」时写入；可在菜单 Develop → Clear Trusted Certificates 清空。

---

## 6. UI 组织（renderer）

`App.tsx` 是唯一顶层组件，组装：

- **`useBrowserState`**：浏览器状态 + 所有 tab/space 操作函数。
- **`useViews`**：与主进程 view 对账、订阅事件、回写 tab。
- **`useWebUIState`**：网页瞬态状态（光标 / 悬停链接 / 网页右键）。**独立于 browser store**，因为高频且不需持久化（写进 tab 会触发 debounced 保存）。切标签自动 reset。
- **settings**：本地 state，debounce 保存。
- **`pageAreaRef`**：页面区域测量锚点。`ResizeObserver` + resize 监听把矩形同步给主进程（`set-page-rect`），驱动 WebContentsView 的 `setBounds`。**`FrameOverlay` 也读这个 ref 来画洞**。
- **模态 / 右键菜单的输入阻断**：只要 `tabContextMenu` 或 `webUI.contextMenu` 任一打开，就 `setModalOpen(true)`；否则用 `MutationObserver` 监听 `[role="dialog"]` 决定。这避免「同时点到菜单和网页」。

### 6.1 视觉背景层（`FrameOverlay`）

整个窗口的白色背景由一个固定 SVG 提供：用一个「远超画布的外框 + 圆角洞」的 path（even-odd 填充），洞口跟随 `pageAreaRef` 实时测量。再叠一个 SVG filter（`feMorphology erode` + `feGaussianBlur` + `arithmetic k2=-1,k3=1`）复刻 Figma 的 **inner-shadow**，让阴影出现在洞口轮廓上、向画框一侧扩散，不进入卡片内部。颜色用 CSS 变量 `--bg-color`（`main.css` 里 = white）。

因此 **sidebar / divider / 顶栏都是透明**，白色全由 `FrameOverlay` 提供，这样洞口四周（含左侧）的内阴影能自然落在透明的 sidebar 上，没有割裂。

### 6.2 右键菜单（`ContextMenu`）

- 受控组件：调用方持有 `open/x/y/items/onClose`。
- `createPortal` 到 `document.body`，规避 `transform` 祖先（Drawer 等）导致 `fixed` 失效。
- 挂载后 `useLayoutEffect` 测量尺寸，右/下溢出时翻转或贴边。
- Esc 关闭、外部 `pointerdown` 关闭、窗口失焦关闭。
- 两类菜单：
  - **标签右键**（`SideBar` 触发 → `App.tabContextMenu`）：Pin/Unpin、Select、Close。
  - **网页右键**（主进程 `context-menu` → `useWebUIState.contextMenu`）：动态拼装 Back/Forward/Reload、链接组、图片组、编辑组（按 `editFlags` 显隐）、开发者组。

### 6.3 侧栏（`SideBar`）

两种形态：常驻（`showSideBar=true`）或折叠 Drawer（左侧 2px 触发区，hover 300ms 延迟开关）。顶部按钮区按 macOS/其它平台区分窗口控制按钮位置（`isMac()`）。`appRegion: 'drag'` / `'no-drag'` 通过内联 style 控制（`-webkit-app-region` 的 TS 别名），让顶栏可拖拽窗口、按钮可点击。

侧栏内**所有可见元素**（图标按钮、地址栏、New Tab 按钮、标签行 TabRow、Space 标题行的图标与文字）都接入「三套尺寸」体系（见 6.4），无一例外。

### 6.4 ★ 三套尺寸体系（`uiSize`，全 UI 强制约定）

**这是全 UI 的硬性约定：任何新增的、面向用户的尺寸都要提供 sm / md / lg 三档，跟随 `settings.uiSize`。** 不要再写死 `size="sm"` / `size={20}` 这类固定值——必须从映射表取。

> 字段原名 `iconSize`，因作用范围早已超出图标（含文字、控件、弹窗），已重命名为 `uiSize`。读取用 `resolveUISize()` 以兼容老数据。

#### 6.4.1 数据来源

`src/renderer/src/lib/settings.ts`：

```ts
type UISize = 'sm' | 'md' | 'lg';
const DEFAULT_UI_SIZE: UISize = 'md';

const UI_SIZE_MAP: Record<UISize, {
  button: 'sm'|'md'|'lg';     // HeroUI Button 的 size
  icon: number;               // 工具栏图标像素
  spaceIcon: number;          // Space 标题行图标像素（略小）
  text: string;               // Space 标题行文字 Tailwind 类
  modalInput: 'sm'|'md'|'lg'; // NewTabModal 搜索框 Input 的 size
  modalTitle: string;         // 弹窗候选项标题 Tailwind 类
  modalDesc: string;          // 弹窗候选项描述 Tailwind 类
}>;

function getUISizePrefs(size?: UISize);        // 统一取值入口（不传则用 md）
function resolveUISize(settings?): UISize;     // 读 uiSize，缺失时回退老 iconSize，再缺失用 md
```

**新增 UI 尺寸时：先在 `UI_SIZE_MAP` 加一个字段（三档取值），再在组件里用 `getUISizePrefs(uiSize)` 取。** 不要在组件里自己写 if/else 判档位。

当前取值（改档位只需改这一张表）：

| 字段 | sm | md（默认） | lg |
|------|----|----|----|
| `button` | sm | md | lg |
| `icon` | 18 | 20 | 24 |
| `spaceIcon` | 14 | 16 | 20 |
| `text` | text-xs | text-sm | text-base |
| `modalInput` | md | lg | lg |
| `modalTitle` | text-md | text-lg | text-xl |
| `modalDesc` | text-small | text-md | text-lg |

> 注意 HeroUI 的 `Input` / `Button` size 最大只到 `lg`，达到后封顶（如 `modalInput` 在 md、lg 都用 lg）。像素类字段（icon / spaceIcon）不受此限。

#### 6.4.2 数据流

```
store('settings.uiSize')            // 写入用 uiSize；读取经 resolveUISize() 兼容老 iconSize
  → App.tsx 读 resolveUISize(settings)
    → SideBar  prop uiSize          （内部 getUISizePrefs → iconBtnSize/iconPx/spaceIconPx/spaceTextClass）
    → TabRow  prop uiSize           （ButtonGroup/关闭按钮/占位图标）
    → useNewTabModal(uiSize) / useEditTabModal(uiSize)
      → NewTabModalContent prop uiSize（Input/LuSearch/候选项文字）
```

设置页 `zot://settings` 改 UI size → `store.set('settings')` → 主进程广播 `settings-changed`（见 2.4 / 4.1）→ `App.tsx` `setSettings` → 上述所有组件重渲染即时生效。

#### 6.4.3 作用范围 / 例外

- **接入**：SideBar 全部（顶/底图标按钮、地址栏 Input 及其 endContent 小按钮、New Tab 按钮、TabRow、Space 标题行）、NewTabModal / EditTabModal。
- **不接入（刻意）**：
  - `Tooltip size="sm"` —— 那是气泡提示的渲染尺寸，独立于控件尺寸，不属于「面向用户的控件尺寸」。
  - `WebViewContainer` 顶栏的窗口控制按钮（最小化/最大化/关闭）—— 窗口装饰，与工具栏图标无关。
  - `InSecureHttpsCertificateModal` —— 低频安全对话框，保持固定大小。
  - 空白占位页（`WebViewContainer` 的 `isEmpty` 层）的提示图标 —— 静态占位，非交互控件。
- **判断准则**：只要它是「用户能交互的、属于常规 UI 的」控件/图标/文字，就接；纯装饰或一次性系统对话框可不接。拿不准就接（三档表成本极低）。

---

---

## 7. 关键约束 / 易踩坑

1. **不要用 `<webview>` 标签。** 项目已从 webview 迁移到 `WebContentsView`（见 commit `9410a3e`）。`lib/webview.ts` 是迁移残留的类型定义，仅供历史参考，**不要在新代码里引用**。
2. **`closeTab` 必须先 `cleanupWebView` 再删 state**（见 2.2），否则产生孤儿 view。
3. **坐标系**：UI 层 ↔ 网页 view 的坐标转换必须成对出现（见 2.1），遗漏会出现「右键菜单位置错位」「inspect 点错元素」。
4. **输入转发依赖 `pageRect` 与 `modalOpen`**：新增「需要吃掉网页事件」的浮层时，必须让它触发 `setModalOpen(true)`（参考 App 里的 `menusOpen` / MutationObserver 模式），否则网页会同时收到点击。
5. **`html/body/#root` 必须透明**（`main.css` + `index.html` 都显式设了）。一旦改成不透明，底层网页 view 就看不到了。
6. **Linux 必须走 X11**：`index.ts` 里 `app.commandLine.appendSwitch('ozone-platform-hint','x11')`，否则透明窗口在 Wayland 下不可用。改动平台逻辑时不要删。
7. **partition 固定为 `persist:shared-partition`**（`viewManager.ts`）。所有标签共享 session/cookie/localStorage。如需隔离，需重新设计。
8. **新增 IPC 时改三处**：`preload/index.ts` + `preload/index.d.ts` + 主进程 handler。漏掉类型声明会导致 renderer 侧 `window.api.xxx` 类型报错。
9. **`useViews` 的事件订阅 effect 只挂载一次**（依赖是回调引用）。改回调时注意闭包陷阱；回调内部尽量用 `updateTab(tabId, {...})` 这种带 id 的纯函数，不要依赖外部 state 快照。
10. **瞬态状态不要放进 `Tab`**：光标、悬停链接、网页右键等高频 / 非持久状态走 `useWebUIState`；放进 Tab 会触发 debounced 序列化（无谓写盘 + 状态抖动）。
11. **macOS 红绿灯按钮**：`titleBarStyle:'hidden'` + `trafficLightPosition:{x:17,y:17}`，sidebar 顶部按钮区用 `pl-20` 给红绿灯留位。
12. **★ 面向用户的新 UI 尺寸必须三档化**：不要再写死 `size="sm"` / `size={20}`。在 `lib/settings.ts` 的 `UI_SIZE_MAP` 加一个三档字段，组件里用 `getUISizePrefs(uiSize)` 取值，跟随 `settings.uiSize`（读取用 `resolveUISize()`）。详见 6.4。例外：`Tooltip size`、窗口控制按钮、`InSecureHttpsCertificateModal`、空白占位页图标。

---

## 8. 编码风格约定

- **缩进**：2 空格（`.editorconfig`，仅对 ts/tsx/js/jsx 生效）。
- **分号**：强制（`force_semicolon_style` + `use_semicolon_after_statement`）。
- **行尾**：LF，文件末尾留空行，去行尾空格。
- **TypeScript**：`strict` 经 `@electron-toolkit/tsconfig` 启用。`any` 仅在 Electron 类型缺失处使用（如 `input-event`、`webContents.destroy`），并加注释说明原因。
- **React**：函数组件 + Hooks；`useCallback` / `useMemo` 控制重渲染；重型保存用 `debounce`。
- **注释**：关键设计点用中文行内注释（与现有代码一致）。复杂逻辑（输入转发、对账、回收、FrameOverlay）已有详尽注释，改动时同步更新。
- **样式**：Tailwind utility 为主；视觉常量（圆角半径等）尽量与 HeroUI 默认对齐（如 `medium=12`）。

---

## 9. 待办 / 已知遗留

- `lib/webview.ts`：旧 `<webview>` 标签的类型定义，迁移到 `WebContentsView` 后未删除，建议清理。
- `components/Versions.tsx`：演示用版本展示组件，未在 `App` 中使用。
- `SideBar` 底部的「下载」「新建 Space」按钮尚无实际功能。
- `search.ts` 的 `SearchOption` 与 `NewTabModal` 的搜索建议目前只生成「直接打开 / Google 搜索」两项，无搜索引擎集成。
- `electron-builder.yml` 的 `publish.url` 仍为 `https://example.com/auto-updates`，自动更新未真正配置。
- `appId` 为占位的 `com.electron.app`（代码里 `setAppUserModelId` 用的是 `com.iewnfod.zot-browser`），发布前需统一。

---

*最后更新基于 commit `32ef5ee`（feat: background & webpage shadow）+ `zot://` 内部页路由（settings / extensions）。后续大改架构时请同步修订本文件。*
