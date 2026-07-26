import { useDisclosure } from '@heroui/react';
import { NewTabModalContent } from '@renderer/components/modals/NewTabModal';
import { ReactNode, useState } from 'react';
import { UISize } from '@renderer/lib/settings';
import type { TFunction } from '@renderer/lib/i18n';

export default function useEditTabModal(
  handleEditCurrentTab: (url: string) => void,
  inputContent?: string,
  uiSize?: UISize,
  t?: TFunction
): [() => void, (content: string) => void, ReactNode] {
  const {isOpen, onOpen, onOpenChange} = useDisclosure();
  const [content, setContent] = useState<string>(inputContent || "");

  // t 由 App 提供；理论上不会缺失，这里给个回退避免类型为可选时的运行时报错
  const tfn: TFunction = t ?? ((k) => k as never);

  return [
    onOpen,
    setContent,
    <NewTabModalContent
      onNewTab={handleEditCurrentTab}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      inputContent={content}
      uiSize={uiSize}
      t={tfn}
    />
  ];
}
