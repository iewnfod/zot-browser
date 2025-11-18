import { Tab } from '@renderer/lib/tab';
import { Button, ButtonGroup } from '@heroui/react';
import { LuX } from 'react-icons/lu';

export default function TabRow({
  tab,
  onTabClose,
  onSelect
} : {
  tab: Tab,
  onTabClose: () => void,
  onSelect: () => void,
}) {
  return (
    <ButtonGroup variant="light" key={tab.id} size="sm">
      <Button
        className="w-full"
        startContent={<img src={tab.favicon} alt="" className="h-[50%]"/>}
        onPress={onSelect}
      >
        <p className="w-full text-start overflow-hidden whitespace-nowrap text-ellipsis">
          {tab.name || tab.url}
        </p>
      </Button>
      <Button isIconOnly onPress={onTabClose}>
        <LuX/>
      </Button>
    </ButtonGroup>
  );
}
