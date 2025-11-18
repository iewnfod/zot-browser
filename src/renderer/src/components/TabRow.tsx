import { Tab } from '@renderer/lib/tab';
import { Button, ButtonGroup } from '@heroui/react';
import { LuX } from 'react-icons/lu';

export default function TabRow({
  tab,
  onTabClose,
  onSelect,
  isSelected = false,
} : {
  tab: Tab,
  onTabClose: () => void,
  onSelect: () => void,
  isSelected?: boolean;
}) {
  return (
    <ButtonGroup variant="light" key={tab.id} size="sm">
      <Button
        startContent={<img src={tab.favicon} alt="" className="h-[50%]"/>}
        className={`w-full ${isSelected ? 'bg-gray-200' : ''}`}
        onPress={onSelect}
      >
        <p className="w-full text-start overflow-hidden whitespace-nowrap text-ellipsis">
          {tab.name || tab.url}
        </p>
      </Button>
      <Button
        isIconOnly
        onPress={onTabClose}
        className={`${isSelected ? 'bg-gray-200' : ''}`}
      >
        <LuX/>
      </Button>
    </ButtonGroup>
  );
}
