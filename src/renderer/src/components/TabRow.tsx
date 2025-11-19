import { Tab } from '@renderer/lib/tab';
import { Button, ButtonGroup } from '@heroui/react';
import { LuMinus, LuX } from 'react-icons/lu';
import ContextMenu from '@renderer/components/ContextMenu';

export default function TabRow({
  tab,
  onTabClose,
  onSelect,
  isSelected = false,
  isPinned = false,
  onPin,
  onPinGoSource,
} : {
  tab: Tab,
  onTabClose: () => void,
  onSelect: () => void,
  isSelected?: boolean;
  isPinned?: boolean;
  onPin?: () => void;
  onPinGoSource?: () => void;
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
            <img
              src={tab.favicon}
              alt=""
              className="h-[50%]"
            />
          }
          className={`w-full ${isSelected ? 'bg-gray-200' : ''}`}
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
              onPress={onPinGoSource}
              className={`${isSelected ? 'bg-gray-200' : ''}`}
            >
              <LuMinus/>
            </Button>
          ) : (
            <Button
              isIconOnly
              onPress={onTabClose}
              className={`${isSelected ? 'bg-gray-200' : ''}`}
            >
              <LuX/>
            </Button>
          )
        }
      </ButtonGroup>
    </ContextMenu>
  );
}
