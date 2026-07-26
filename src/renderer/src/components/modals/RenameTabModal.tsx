import { Button, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { getUISizePrefs, UISize } from '@renderer/lib/settings';
import type { TFunction } from '@renderer/lib/i18n';

/**
 * 重命名标签页弹窗。
 * 用于给（pinned / favorite / 普通）标签设置 customName。
 * - 提交非空字符串 → 该标签始终使用该自定义名称，网页 title 不会再覆盖
 * - 提交空字符串 → 清除自定义名称，恢复"跟随网页标题"
 *
 * 遵循三套尺寸约定（见 AGENTS 6.4）：Input / Button 的 size 取自 uiSize 档位。
 */
export function RenameTabModalContent({
  isOpen,
  onOpenChange,
  initialValue,
  onConfirm,
  uiSize,
  t
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  initialValue?: string;
  onConfirm: (name: string) => void;
  uiSize?: UISize;
  t: TFunction;
}) {
  const { button: btnSize, modalInput } = getUISizePrefs(uiSize);
  const [value, setValue] = useState<string>(initialValue || '');
  const inputRef = useRef<HTMLInputElement>(null);

  // 弹窗每次打开时，重置输入为当前 customName（或网页标题），并聚焦、全选
  useEffect(() => {
    if (isOpen) {
      setValue(initialValue || '');
      // 等下一帧 DOM 渲染好再聚焦
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [isOpen, initialValue]);

  function handleSubmit(onClose: () => void) {
    // 去除首尾空白：留空即清除自定义名称
    onConfirm(value.trim());
    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent, onClose: () => void) {
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        handleSubmit(onClose);
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} placement="center" hideCloseButton>
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">{t('modal.rename.title')}</ModalHeader>
            <ModalBody>
              <Input
                ref={inputRef}
                size={modalInput}
                value={value}
                onValueChange={setValue}
                placeholder={t('modal.rename.placeholder')}
                onKeyDown={(e) => handleKeyDown(e, onClose)}
                classNames={{
                  innerWrapper: 'bg-transparent'
                }}
              />
            </ModalBody>
            <ModalFooter>
              <Button size={btnSize} variant="light" onPress={onClose}>
                {t('modal.rename.cancel')}
              </Button>
              <Button size={btnSize} color="primary" onPress={() => handleSubmit(onClose)}>
                {t('modal.rename.save')}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}

/**
 * 重命名标签页弹窗 hook。
 * 返回 [open, setInitialValue, node]，与 useEditTabModal / useNewTabModal 的用法一致。
 */
export default function useRenameTabModal(
  onConfirm: (name: string) => void,
  uiSize?: UISize,
  t?: TFunction
): [() => void, (value: string) => void, ReactNode] {
  const [isOpen, setIsOpen] = useState(false);
  const [initialValue, setInitialValue] = useState<string>('');

  const open = (): void => setIsOpen(true);
  const onOpenChange = (next: boolean): void => setIsOpen(next);

  // t 由 App 提供；理论上不会缺失，这里给个回退避免类型为可选时的运行时报错
  const tfn: TFunction = t ?? ((k) => k as never);

  return [
    open,
    setInitialValue,
    <RenameTabModalContent
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      initialValue={initialValue}
      onConfirm={onConfirm}
      uiSize={uiSize}
      t={tfn}
    />
  ];
}
