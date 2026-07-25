import { useDisclosure } from '@heroui/react';
import { NewTabModalContent } from '@renderer/components/modals/NewTabModal';
import { ReactNode, useState } from 'react';
import { UISize } from '@renderer/lib/settings';

export default function useEditTabModal(
  handleEditCurrentTab: (url: string) => void,
  inputContent?: string,
  uiSize?: UISize
): [() => void, (content: string) => void, ReactNode] {
  const {isOpen, onOpen, onOpenChange} = useDisclosure();
  const [content, setContent] = useState<string>(inputContent || "");

  return [
    onOpen,
    setContent,
    <NewTabModalContent
      onNewTab={handleEditCurrentTab}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      inputContent={content}
      uiSize={uiSize}
    />
  ];
}
