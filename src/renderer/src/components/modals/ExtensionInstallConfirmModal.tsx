import {
  Button,
  Chip,
  Divider,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  useDisclosure
} from '@heroui/react';
import { useEffect, useState } from 'react';
import { LuPuzzle } from 'react-icons/lu';
import type { TFunction } from '@renderer/lib/i18n';
import type { InstallConfirmPayload } from '@renderer/lib/extensions';

/**
 * 「扩展安装确认」Modal —— 用户在 Chrome Web Store 点击「添加到 Chrome」时弹出。
 *
 * 流程：主进程 beforeInstall(details) → IPC 发 extension-install-confirm-request
 *   → 本组件展示扩展信息 + 权限清单 → 用户 allow/deny
 *   → IPC 回 extension-install-confirm-response → 主进程据此授权安装。
 *
 * 与 InSecureHttpsCertificateModal 同模式：useDisclosure + ipcRenderer.on 触发 +
 * ipcRenderer.send 回复。挂载在主 UI（App.tsx），因为用户当时在看 CWS 页面。
 */
export default function ExtensionInstallConfirmModal({ t }: { t: TFunction }) {
  const { isOpen, onOpen, onOpenChange, onClose } = useDisclosure();
  const [reqId, setReqId] = useState('');
  const [payload, setPayload] = useState<InstallConfirmPayload | null>(null);

  function handleOpen(_event: unknown, id: string, data: InstallConfirmPayload): void {
    setReqId(id);
    setPayload(data);
    onOpen();
  }

  function reply(allowed: boolean): void {
    window.electron.ipcRenderer.send('extension-install-confirm-response', reqId, allowed);
    onClose();
  }

  useEffect(() => {
    window.electron.ipcRenderer.on('extension-install-confirm-request', handleOpen);
    return () => {
      window.electron.ipcRenderer.removeAllListeners('extension-install-confirm-request');
    };
  }, [reqId]);

  const perms = payload?.permissions;
  const hasPerms = !!perms &&
    perms.permissions.length + perms.hostPermissions.length + perms.contentScriptMatches.length > 0;

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} isDismissable={false} hideCloseButton isKeyboardDismissDisabled>
      <ModalContent>
        {() => (
          <>
            <ModalHeader className="select-none">{t('extensions.reviewTitle')}</ModalHeader>
            <ModalBody>
              {payload && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-row items-center gap-3">
                    <div className="w-10 h-10 rounded-medium bg-default-100 flex items-center justify-center overflow-hidden shrink-0">
                      {payload.iconUrl ? (
                        <img src={payload.iconUrl} alt="" className="w-full h-full object-contain" />
                      ) : (
                        <LuPuzzle size={20} className="text-default-400" />
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <p className="text-sm font-semibold truncate">{payload.name}</p>
                      {payload.version && <p className="text-xs text-default-500">v{payload.version}</p>}
                    </div>
                  </div>
                  {payload.description && (
                    <p className="text-xs text-default-500">{payload.description}</p>
                  )}
                  <Divider />
                  <p className="text-xs text-default-500">{t('extensions.reviewDesc')}</p>
                  <div className="flex flex-col gap-2">
                    {!hasPerms && (
                      <p className="text-xs text-default-400">{t('extensions.permissionsNone')}</p>
                    )}
                    {perms && (
                      <>
                        <PermissionList title={t('extensions.permissionsApis')} items={perms.permissions} />
                        <PermissionList title={t('extensions.permissionsHosts')} items={perms.hostPermissions} />
                        <PermissionList title={t('extensions.permissionsMatches')} items={perms.contentScriptMatches} />
                      </>
                    )}
                  </div>
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button size="sm" variant="light" onPress={() => reply(false)}>
                {t('extensions.reviewCancel')}
              </Button>
              <Button size="sm" color="primary" onPress={() => reply(true)}>
                {t('extensions.reviewAdd')}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
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
          <Chip key={p} size="sm" variant="flat" className="h-5 text-tiny">{p}</Chip>
        ))}
      </div>
    </div>
  );
}
