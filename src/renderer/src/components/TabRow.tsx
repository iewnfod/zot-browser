import { Tab } from '@renderer/lib/tab';
import { Button, ButtonGroup } from '@heroui/react';
import { LuMinus, LuSquareDashed, LuX } from 'react-icons/lu';

/**
 * 单个标签行。
 * 右键菜单改为受控：触发时通过 onContextMenuOpen 上报事件，由上层统一渲染菜单。
 */
export default function TabRow({
  tab,
  onTabClose,
  onSelect,
  isSelected = false,
  isPinned = false,
  onContextMenuOpen,
  render = false
} : {
  tab: Tab,
  onTabClose: () => void,
  onSelect: () => void,
  isSelected?: boolean;
  isPinned?: boolean;
  /** 右键触发时回调，带上原生事件供上层定位菜单 */
  onContextMenuOpen?: (e: React.MouseEvent) => void;
  render?: boolean;
}) {
  return (
    <ButtonGroup
      variant="light"
      key={tab.id}
      size="sm"
      className="w-full"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenuOpen?.(e);
      }}
    >
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
        <p className={`
          w-full text-start overflow-hidden whitespace-nowrap text-ellipsis
          duration-300 ease-in-out transition-all
          ${render ? 'text-neutral-950' : 'text-neutral-500'}
        `}>
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
  );
}
