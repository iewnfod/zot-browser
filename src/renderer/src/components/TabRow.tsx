import { Tab } from '@renderer/lib/tab';
import { Button, ButtonGroup } from '@heroui/react';
import { LuMinus, LuSquareDashed, LuX } from 'react-icons/lu';
import ContextMenu from '@renderer/components/ContextMenu';

export default function TabRow({
  tab,
  onTabClose,
  onSelect,
  isSelected = false,
  isPinned = false,
  onPin,
} : {
  tab: Tab,
  onTabClose: () => void,
  onSelect: () => void,
  isSelected?: boolean;
  isPinned?: boolean;
  onPin?: () => void;
}) {
  return (
    <ContextMenu menuItems={[
      <Button variant="light" onPress={onPin} isDisabled={isPinned} size="sm">
        Pin
      </Button>,
      <Button variant="light" onPress={onSelect} isDisabled={isSelected} size="sm">
        Select
      </Button>,
      <Button variant="light" onPress={onTabClose} size="sm">
        Close
      </Button>
    ]}>
      <ButtonGroup variant="light" key={tab.id} size="sm" className="w-full">
        <Button
          startContent={
            tab.favicon ? (
              <img
                src={tab.favicon}
                alt=""
                className="h-[50%]"
              />
            ) : (
              <LuSquareDashed
                className="text-neutral-700"
                size={16}
              />
            )
          }
          className={`w-full ${isSelected ? 'bg-neutral-200' : ''}`}
          onPress={onSelect}
        >
          <p className="w-full text-start overflow-hidden whitespace-nowrap text-ellipsis">
            {tab.name || tab.url}
          </p>
        </Button>
        {
          isPinned ? (
            <Button
              isIconOnly
              onPress={onTabClose}
              className={`${isSelected ? 'bg-neutral-200' : ''}`}
            >
              <LuMinus/>
            </Button>
          ) : (
            <Button
              isIconOnly
              onPress={onTabClose}
              className={`${isSelected ? 'bg-neutral-200' : ''}`}
            >
              <LuX/>
            </Button>
          )
        }
      </ButtonGroup>
    </ContextMenu>
  );
}
