import {
  Button,
  Card,
  CardBody,
  Chip,
  Divider,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Spinner,
  Switch,
  Tooltip,
} from '@heroui/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LuChevronDown,
  LuChevronUp,
  LuFolderOpen,
  LuLoaderCircle,
  LuPin,
  LuPuzzle,
  LuShieldAlert,
  LuStore,
  LuTrash2,
  LuUpload,
} from 'react-icons/lu';
import { useLocale } from '@renderer/lib/useLocale';
import { useT } from '@renderer/lib/useT';
import {
  extractPermissions,
  ExtensionPermissions,
  InstalledExtension,
  ParsedExtension,
} from '@renderer/lib/extensions';

/**
 * zot://extensions 扩展管理页。
 *
 * 复用 Electron 原生 `session.loadExtension`（仅未打包目录），扩展加载进
 * `persist:shared-partition` 后自动注入网页 view（透明 UI view 走默认 session，
 * 不受影响）。详见 src/main/extensions.ts。
 *
 * 数据流（与 downloads 页一致）：
 * - 挂载时 window.api.extensionList() 拉取已安装列表 + 逐个拉图标 data URL。
 * - 订阅 'extensions-changed' 广播，主进程任意增删改后即时刷新。
 * - 安装走三步流程（pickSource → 权限审核 → confirmInstall/abortStaged），
 *   支持 Chrome 风格的安装前权限审核。
 *
 * 本页面加载在带 preload 的 WebContentsView 里（contextIsolation 开启），
 * 所以 window.store / window.api / window.electron 均可用。
 */
export default function ExtensionsApp() {
  const locale = useLocale();
  const t = useT(locale);

  const [list, setList] = useState<InstalledExtension[]>([]);
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  /** 操作中（安装/启用/禁用/卸载）的扩展 id 集合，用于按钮 loading 态。 */
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  // —— 安装审核弹框状态 ——
  const [review, setReview] = useState<{
    stageId: string;
    parsed: ParsedExtension;
    permissions: ExtensionPermissions;
    installing: boolean;
  } | null>(null);
  // —— 顶部安装中（unpacked/zip）——
  const [picking, setPicking] = useState<'unpacked' | 'zip' | null>(null);
  // —— 顶部错误/提示横幅 ——
  const [banner, setBanner] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  // 页面标题随语言切换
  useEffect(() => {
    document.title = t('extensions.title');
  }, [t]);

  // 刷新列表 + 图标
  const refresh = useCallback(async () => {
    const items = await window.api.extensionList();
    setList(items);
    // 并发拉图标（无图标的返回 undefined，跳过）
    const entries = await Promise.all(
      items.map(async (it) => {
        const url = await window.api.extensionGetIcon(it.id);
        return [it.id, url] as const;
      })
    );
    const map: Record<string, string> = {};
    for (const [id, url] of entries) if (url) map[id] = url;
    setIcons(map);
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoaded(true));
  }, [refresh]);

  // 订阅广播：主进程任意增删改后刷新
  useEffect(() => {
    const handler = (): void => {
      refresh();
    };
    window.electron.ipcRenderer.on('extensions-changed', handler);
    return () => {
      window.electron.ipcRenderer.removeAllListeners('extensions-changed');
    };
  }, [refresh]);

  const markBusy = useCallback((id: string, on: boolean) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // —— 三步安装：第 1 步 pickSource（unpacked / zip / crx）——
  const pickSource = useCallback(
    async (source: 'unpacked' | 'zip' | 'crx', sourceData?: string) => {
      setBanner(null);
      const res = await window.api.extensionPickSource(source, sourceData);
      if (!res.ok) {
        // 用户取消（errorCancelled）不报错、仅静默
        if (res.error !== 'extensions.errorCancelled') {
          setBanner({ kind: 'error', text: t(res.error as never) });
        }
        return;
      }
      // 弹审核框
      setReview({ stageId: res.stageId, parsed: res.parsed, permissions: res.permissions, installing: false });
    },
    [t]
  );

  const onInstallUnpacked = useCallback(async () => {
    setPicking('unpacked');
    try {
      await pickSource('unpacked');
    } finally {
      setPicking(null);
    }
  }, [pickSource]);

  const onInstallZip = useCallback(async () => {
    setPicking('zip');
    try {
      await pickSource('zip');
    } finally {
      setPicking(null);
    }
  }, [pickSource]);

  // —— 第 3a 步：审核通过 → confirmInstall ——
  const confirmInstall = useCallback(async () => {
    if (!review) return;
    setReview((r) => (r ? { ...r, installing: true } : r));
    const stageId = review.stageId;
    const res = await window.api.extensionConfirmInstall(stageId);
    setReview(null);
    if (res.ok) {
      setBanner({ kind: 'info', text: t('extensions.installedToast', { name: res.ext.name }) });
    } else {
      setBanner({ kind: 'error', text: t(res.error as never) });
    }
  }, [review, t]);

  // —— 第 3b 步：取消 → abortStaged ——
  const cancelReview = useCallback(async () => {
    if (!review) return;
    const stageId = review.stageId;
    setReview(null);
    await window.api.extensionAbortStaged(stageId);
  }, [review]);

  const toggleEnabled = useCallback(
    async (ext: InstalledExtension, next: boolean) => {
      markBusy(ext.id, true);
      try {
        const ok = next
          ? await window.api.extensionEnable(ext.id)
          : await window.api.extensionDisable(ext.id);
        if (!ok) setBanner({ kind: 'error', text: t('extensions.errorAction') });
        else setBanner({ kind: 'info', text: t('extensions.reloadHint') });
      } finally {
        markBusy(ext.id, false);
      }
    },
    [markBusy, t]
  );

  const onUninstall = useCallback(
    async (ext: InstalledExtension) => {
      markBusy(ext.id, true);
      try {
        const ok = await window.api.extensionUninstall(ext.id);
        if (ok) {
          setBanner({ kind: 'info', text: t('extensions.uninstalledToast', { name: ext.name }) });
        } else {
          setBanner({ kind: 'error', text: t('extensions.errorAction') });
        }
      } finally {
        markBusy(ext.id, false);
      }
    },
    [markBusy, t]
  );

  const onTogglePin = useCallback(
    async (ext: InstalledExtension) => {
      markBusy(ext.id, true);
      try {
        const next = !ext.pinned;
        const ok = await window.api.extensionSetPinned(ext.id, next);
        if (!ok) setBanner({ kind: 'error', text: t('extensions.errorAction') });
      } finally {
        markBusy(ext.id, false);
      }
    },
    [markBusy, t]
  );

  return (
    <div className="w-screen h-screen overflow-auto bg-neutral-50">
      <div className="max-w-3xl mx-auto p-8 flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">{t('extensions.title')}</h1>
          <p className="text-sm text-default-500">{t('extensions.subtitle')}</p>
        </header>

        {/* 安装按钮区 */}
        <Card shadow="sm">
          <CardBody className="p-5 flex flex-col gap-4">
            <div className="flex flex-row flex-wrap gap-2">
              <Button
                size="sm"
                color="primary"
                variant="flat"
                startContent={
                  picking === 'unpacked' ? (
                    <LuLoaderCircle className="animate-spin" />
                  ) : (
                    <LuFolderOpen />
                  )
                }
                onPress={onInstallUnpacked}
                isDisabled={picking !== null || review !== null}
              >
                {t('extensions.installUnpacked')}
              </Button>
              <Button
                size="sm"
                color="primary"
                variant="flat"
                startContent={
                  picking === 'zip' ? <LuLoaderCircle className="animate-spin" /> : <LuUpload />
                }
                onPress={onInstallZip}
                isDisabled={picking !== null || review !== null}
              >
                {t('extensions.installZip')}
              </Button>
              <Button
                size="sm"
                color="primary"
                variant="flat"
                startContent={<LuStore />}
                onPress={() => window.electron.ipcRenderer.send('open-internal-url', 'https://chromewebstore.google.com/')}
                isDisabled={picking !== null || review !== null}
              >
                {t('extensions.installStore')}
              </Button>
            </div>
            <p className="text-xs text-default-400">{t('extensions.storeHint')}</p>
          </CardBody>
        </Card>

        {/* 提示横幅 */}
        {banner && (
          <div
            className={
              banner.kind === 'error'
                ? 'text-sm px-4 py-2 rounded-medium bg-danger-50 text-danger-700 border border-danger-200'
                : 'text-sm px-4 py-2 rounded-medium bg-primary-50 text-primary-700 border border-primary-200'
            }
          >
            {banner.text}
          </div>
        )}

        {/* 扩展列表 */}
        {!loaded ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : list.length === 0 ? (
          <Card shadow="sm">
            <CardBody className="p-10 flex flex-col items-center justify-center gap-3 text-default-400">
              <LuPuzzle size={40} />
              <p className="text-sm">{t('extensions.empty')}</p>
            </CardBody>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {list.map((ext) => (
              <ExtensionRow
                key={ext.id}
                ext={ext}
                icon={icons[ext.id]}
                busy={busyIds.has(ext.id)}
                onToggle={(next) => toggleEnabled(ext, next)}
                onUninstall={() => onUninstall(ext)}
                onTogglePin={() => onTogglePin(ext)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 安装审核弹框 */}
      <ReviewModal
        isOpen={review !== null}
        parsed={review?.parsed}
        permissions={review?.permissions}
        installing={review?.installing ?? false}
        onConfirm={confirmInstall}
        onCancel={cancelReview}
      />
    </div>
  );
}

/** 单个扩展卡片：图标 + 名称/版本/描述 + 启用开关 + 权限详情 + 卸载。 */
function ExtensionRow({
  ext,
  icon,
  busy,
  onToggle,
  onUninstall,
  onTogglePin,
}: {
  ext: InstalledExtension;
  icon?: string;
  busy: boolean;
  onToggle: (next: boolean) => void;
  onUninstall: () => void;
  onTogglePin: () => void;
}) {
  const locale = useLocale();
  const t = useT(locale);
  const [expanded, setExpanded] = useState(false);

  const perms = useMemo(() => extractPermissions(ext.manifest), [ext.manifest]);
  const hasPerms =
    perms.permissions.length + perms.hostPermissions.length + perms.contentScriptMatches.length > 0;

  return (
    <Card shadow="sm">
      <CardBody className="p-4 flex flex-col gap-3">
        <div className="flex flex-row items-start gap-3">
          <div className="w-10 h-10 rounded-medium bg-default-100 flex items-center justify-center overflow-hidden shrink-0">
            {icon ? (
              <img src={icon} alt="" className="w-full h-full object-contain" />
            ) : (
              <LuPuzzle size={20} className="text-default-400" />
            )}
          </div>

          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            <div className="flex flex-row items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold truncate">{ext.name}</p>
              <Chip size="sm" variant="flat" className="h-5 text-tiny">
                v{ext.version}
              </Chip>
              <Chip
                size="sm"
                variant="flat"
                color={ext.enabled ? 'success' : 'default'}
                className="h-5 text-tiny"
              >
                {ext.enabled ? t('extensions.enabled') : t('extensions.disabled')}
              </Chip>
            </div>
            {ext.description && (
              <p className="text-xs text-default-500 line-clamp-2">{ext.description}</p>
            )}
            <p className="text-tiny text-default-300 truncate" title={ext.id}>
              ID: {ext.id}
            </p>
          </div>

          <div className="flex flex-row items-center gap-2 shrink-0">
            <Switch
              size="sm"
              isSelected={ext.enabled}
              isDisabled={busy}
              onValueChange={onToggle}
              aria-label={ext.enabled ? t('extensions.disable') : t('extensions.enable')}
            />
            <Tooltip content={ext.pinned ? t('extensions.unpin') : t('extensions.pin')} size="sm" placement="top">
              <Button
                isIconOnly
                size="sm"
                variant={ext.pinned ? 'flat' : 'light'}
                color={ext.pinned ? 'primary' : 'default'}
                isDisabled={busy}
                onPress={onTogglePin}
                aria-label={ext.pinned ? t('extensions.unpin') : t('extensions.pin')}
              >
                <LuPin />
              </Button>
            </Tooltip>
            <Tooltip content={t('extensions.uninstall')} size="sm" placement="top">
              <Button
                isIconOnly
                size="sm"
                variant="light"
                color="danger"
                isDisabled={busy}
                onPress={onUninstall}
                aria-label={t('extensions.uninstall')}
              >
                {busy ? <LuLoaderCircle className="animate-spin" /> : <LuTrash2 />}
              </Button>
            </Tooltip>
          </div>
        </div>

        {/* 权限详情可展开区 */}
        <div>
          <Button
            size="sm"
            variant="light"
            className="h-6 text-tiny text-default-500"
            startContent={<LuShieldAlert />}
            endContent={expanded ? <LuChevronUp /> : <LuChevronDown />}
            onPress={() => setExpanded((v) => !v)}
          >
            {t('extensions.permissions')}
          </Button>
          {expanded && (
            <div className="mt-2 pl-1 flex flex-col gap-2">
              {!hasPerms && (
                <p className="text-xs text-default-400">{t('extensions.permissionsNone')}</p>
              )}
              <PermissionList title={t('extensions.permissionsApis')} items={perms.permissions} />
              <PermissionList
                title={t('extensions.permissionsHosts')}
                items={perms.hostPermissions}
              />
              <PermissionList
                title={t('extensions.permissionsMatches')}
                items={perms.contentScriptMatches}
              />
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

/** 权限清单小组件：标题 + 每项一个 Chip；空时不渲染。 */
function PermissionList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-tiny font-medium text-default-500">{title}</p>
      <div className="flex flex-row flex-wrap gap-1">
        {items.map((p) => (
          <Chip key={p} size="sm" variant="flat" className="h-5 text-tiny">
            {p}
          </Chip>
        ))}
      </div>
    </div>
  );
}

/** 安装审核弹框：展示解析出的扩展信息 + 权限清单，确认/取消。 */
function ReviewModal({
  isOpen,
  parsed,
  permissions,
  installing,
  onConfirm,
  onCancel,
}: {
  isOpen: boolean;
  parsed?: ParsedExtension;
  permissions?: ExtensionPermissions;
  installing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const locale = useLocale();
  const t = useT(locale);
  const hasPerms = permissions
    ? permissions.permissions.length +
        permissions.hostPermissions.length +
        permissions.contentScriptMatches.length >
      0
    : false;

  return (
    <Modal isOpen={isOpen} onClose={onCancel} size="lg">
      <ModalContent>
        {() => (
          <>
            <ModalHeader>{t('extensions.reviewTitle')}</ModalHeader>
            <ModalBody>
              {parsed && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-row items-center gap-3">
                    <LuPuzzle size={28} className="text-default-400" />
                    <div className="flex flex-col">
                      <p className="text-sm font-semibold">{parsed.name}</p>
                      <p className="text-xs text-default-500">v{parsed.version}</p>
                    </div>
                  </div>
                  {parsed.description && (
                    <p className="text-xs text-default-500">{parsed.description}</p>
                  )}
                  <Divider />
                  <p className="text-xs text-default-500">{t('extensions.reviewDesc')}</p>
                  <div className="flex flex-col gap-2">
                    {permissions && !hasPerms && (
                      <p className="text-xs text-default-400">{t('extensions.permissionsNone')}</p>
                    )}
                    {permissions && (
                      <>
                        <PermissionList
                          title={t('extensions.permissionsApis')}
                          items={permissions.permissions}
                        />
                        <PermissionList
                          title={t('extensions.permissionsHosts')}
                          items={permissions.hostPermissions}
                        />
                        <PermissionList
                          title={t('extensions.permissionsMatches')}
                          items={permissions.contentScriptMatches}
                        />
                      </>
                    )}
                  </div>
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button size="sm" variant="light" onPress={onCancel} isDisabled={installing}>
                {t('extensions.reviewCancel')}
              </Button>
              <Button size="sm" color="primary" isLoading={installing} onPress={onConfirm}>
                {t('extensions.reviewAdd')}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
