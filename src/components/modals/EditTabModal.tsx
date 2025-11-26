import { useDisclosure } from '@heroui/react';
import { NewTabModalContent } from '@/components/modals/NewTabModal';
import { ReactNode, useState } from 'react';

export default function useEditTabModal(
  handleEditCurrentTab: (url: string) => void,
  inputContent?: string
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
    />
  ];
}
