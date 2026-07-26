import type { MessageKey } from './index';

/**
 * 简体中文字典。key 与 `enMessages` 一一对应：类型为 `Record<MessageKey, string>`，
 * 新增/删除英文 key 时若忘记同步此处译文，TypeScript 会立即报错。
 *
 * `MessageKey` 由 `en.ts` 的 `enMessages` 反推（在 index.ts 中定义），
 * 这里只用类型、不引入运行时值，避免字典之间产生循环引用。
 */
export const zhCNMessages: Record<MessageKey, string> = {
  'app.name': 'Zot Browser',

  // 应用菜单
  'menu.edit': '编辑',
  'menu.view': '视图',
  'menu.window': '窗口',
  'menu.tab': '标签页',
  'menu.develop': '开发',
  'menu.copy': '复制',
  'menu.paste': '粘贴',
  'menu.undo': '撤销',
  'menu.redo': '重做',
  'menu.selectAll': '全选',
  'menu.toggleSidebar': '显示/隐藏侧栏',
  'menu.settings': '设置…',
  'menu.extensions': '扩展…',
  'menu.downloads': '下载…',
  'menu.newTab': '新建标签页',
  'menu.closeTab': '关闭标签页',
  'menu.reload': '重新加载',
  'menu.goBack': '后退',
  'menu.goForward': '前进',
  'menu.select': '选择',
  'menu.lastTab': '最后一个标签页',
  'menu.tabN': '标签页 {n}',
  'menu.developerTools': '开发者工具',
  'menu.electronDevTools': 'Electron 开发者工具',
  'menu.uiDevTools': 'UI 开发者工具',
  'menu.clearTrustedCerts': '清除已信任证书',

  // 原生对话框
  'dialog.clearCerts.title': '清除已信任证书',
  'dialog.clearCerts.message': '确定要清除所有已信任的证书吗？',
  'dialog.clearCerts.confirm': '清除',
  'dialog.clearCerts.cancel': '取消',
  'dialog.clearCerts.success': '已清除已信任的证书。',
  'dialog.clearCerts.ok': '确定',

  // 标签右键菜单
  'context.tab.pin': '固定',
  'context.tab.unpin': '取消固定',
  'context.tab.rename': '重命名',
  'context.tab.editName': '编辑名称',
  'context.tab.select': '选择',
  'context.tab.close': '关闭',

  // 网页右键菜单
  'context.web.back': '后退',
  'context.web.forward': '前进',
  'context.web.reload': '重新加载',
  'context.web.openLinkNewTab': '在新标签页打开链接',
  'context.web.copyLink': '复制链接地址',
  'context.web.copyImage': '复制图片地址',
  'context.web.cut': '剪切',
  'context.web.copy': '复制',
  'context.web.paste': '粘贴',
  'context.web.delete': '删除',
  'context.web.selectAll': '全选',
  'context.web.viewSource': '查看网页源代码',
  'context.web.inspect': '检查',

  // 侧栏
  'sidebar.settings': '设置',
  'sidebar.extensions': '扩展',
  'sidebar.hideSidebar': '隐藏侧栏',
  'sidebar.showSidebar': '显示侧栏',
  'sidebar.searchPlaceholder': '搜索…',
  'sidebar.newTab': '新建标签页',
  'sidebar.newSpace': '新建 Space',
  'sidebar.more': '更多',

  // 重命名标签弹窗
  'modal.rename.title': '重命名标签页',
  'modal.rename.placeholder': '输入自定义名称（留空则重置）',
  'modal.rename.cancel': '取消',
  'modal.rename.save': '保存',

  // 新标签弹窗
  'modal.newTab.searchPlaceholder': '搜索…',
  'modal.newTab.searchGoogle': '使用 Google 搜索',

  // HTTPS 证书警告
  'modal.cert.title': '不安全的 HTTPS 证书',
  'modal.cert.url': '网址',
  'modal.cert.error': '错误',
  'modal.cert.subject': '主题名称',
  'modal.cert.issuer': '颁发者名称',
  'modal.cert.expiry': '过期时间',
  'modal.cert.fingerprint': '指纹',
  'modal.cert.warning': '如果你信任此站点，请选择继续访问；否则请返回。',
  'modal.cert.continue': '继续访问（信任并记住）',
  'modal.cert.return': '返回',

  // 空状态
  'empty.openTab': '打开一个标签页开始浏览',

  // 设置页
  'settings.title': '设置',
  'settings.subtitle': '更改将立即应用于浏览器。',
  'settings.general': '通用',
  'settings.language': '语言',
  'settings.languageDesc': '选择界面语言。更改将立即生效。',
  'settings.languageSystem': '跟随系统',
  'settings.languageEn': 'English',
  'settings.languageZhCN': '简体中文',
  'settings.appearance': '外观',
  'settings.showSidebar': '显示侧栏',
  'settings.showSidebarDesc': '在左侧显示标签页侧栏。',
  'settings.showFullUrl': '显示完整网址',
  'settings.showFullUrlDesc': '在地址栏显示完整地址，而非仅显示主机名。',
  'settings.sidebarWidth': '侧栏宽度',
  'settings.sidebarWidthDesc': '侧栏宽度（像素，200–500）。',
  'settings.uiSize': 'UI 尺寸',
  'settings.uiSizeDesc': '侧栏与对话框中控件、图标、文字的缩放比例。',
  'settings.uiSizeSmall': '小',
  'settings.uiSizeMedium': '中',
  'settings.uiSizeLarge': '大',
  'settings.behavior': '行为',
  'settings.naturalScroll': '自然滚动',
  'settings.naturalScrollDesc': '反转滚动方向，与触控板习惯一致。',
  'settings.unloadTabs': '非活动标签页卸载时间',
  'settings.unloadTabsDesc': '后台标签页在多少分钟无活动后卸载（正在播放媒体的标签页不受影响）。',

  // 扩展页
  'extensions.title': '扩展',
  'extensions.comingSoon': '即将推出。',

  // 下载页
  'downloads.title': '下载',
  'downloads.inProgress': '进行中的下载会显示在这里。',
  'downloads.history': '历史记录',
  'downloads.empty': '还没有下载内容。',
  'downloads.viewAll': '查看全部下载',
  'downloads.inProgressShort': '进行中',
  'downloads.clearHistory': '清空历史',
  'downloads.pause': '暂停',
  'downloads.resume': '继续',
  'downloads.cancel': '取消',
  'downloads.showInFolder': '在文件夹中显示',
  'downloads.fileMissing': '文件已被移动或移除',
  'downloads.openFile': '打开文件',
  'downloads.remove': '从列表中移除',
  'downloads.completed': '已下载',
  'downloads.cancelled': '已取消',
  'downloads.interrupted': '已中断',
  'downloads.unknownSize': '未知大小',
};
