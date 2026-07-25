import {
  Button,
  Divider, Drawer, DrawerContent,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Input, Tooltip,
  useDisclosure
} from '@heroui/react';
import {
  LuDownload, LuLink,
  LuMenu,
  LuMoveLeft,
  LuMoveRight,
  LuPanelLeftClose,
  LuPanelLeftOpen,
  LuPlus,
  LuPuzzle,
  LuRotateCw, LuSettings, LuSlidersHorizontal
} from 'react-icons/lu';
import { Tab } from '@renderer/lib/tab';
import FavoriteTabCard from '@renderer/components/FavoriteTabCard';
import TabRow from '@renderer/components/TabRow';
import { isMac } from '@react-aria/utils';
import { useMemo, useRef } from 'react';
import { Space } from '@renderer/lib/space';
import { getUISizePrefs, UISize } from '@renderer/lib/settings';

export interface BrowserSideBarProps {
  showSideBar: boolean;
  currentTab: Tab | null;
  currentSpace: Space | null;
  favoriteTabs: Tab[];
  pinnedTabs: Tab[];
  tabs: Tab[];
  openNewTabModal: () => void;
  onTabClose: (tabId: string) => void;
  onTabSelect: (tabId: string) => void;
  className?: string;
  /** 标签右键：上报原生事件 + 目标 tab，由上层渲染统一右键菜单 */
  onTabContextMenu: (e: React.MouseEvent, tab: Tab) => void;
  setSiteBarState: (state: boolean) => void;
  spaces: Space[];
  width?: number;
  openEditTabModal: (content: string) => void;
  showFullUrl?: boolean;
  /** 打开 zot://settings 内部页 */
  openSettings: () => void;
  /** 打开 zot://extensions 内部页 */
  openExtensions: () => void;
  /** UI 尺寸档位（sm/md/lg），驱动整个 sidebar 的控件/图标/文字大小 */
  uiSize?: UISize;
}

interface BrowserSideBarContentProps extends BrowserSideBarProps {}

function BrowserSideBarContent(props: BrowserSideBarContentProps) {
  const {
    showSideBar,
    currentTab,
    currentSpace,
    favoriteTabs,
    pinnedTabs,
    tabs,
    openNewTabModal,
    onTabClose,
    onTabSelect,
    className,
    onTabContextMenu,
    setSiteBarState,
    spaces,
    width,
    openEditTabModal,
    showFullUrl,
    openSettings,
    openExtensions,
    uiSize,
  } = props;

  // sidebar 全部元素的尺寸：档位 → (Button size, 图标像素, Space 行图标/文字, ...)
  const { button: iconBtnSize, icon: iconPx, spaceIcon: spaceIconPx, text: spaceTextClass } = getUISizePrefs(uiSize);

  function handleGoBack() {
    if (currentTab) {
      window.api.viewGoBack(currentTab.id);
    }
  }

  function handleGoForward() {
    if (currentTab) {
      window.api.viewGoForward(currentTab.id);
    }
  }

  function handleReload() {
    if (currentTab) {
      window.api.viewReload(currentTab.id);
    }
  }

  function canGoForward(): boolean {
    return currentTab?.canGoForward ?? false;
  }

  function canGoBack(): boolean {
    return currentTab?.canGoBack ?? false;
  }

  const displayUrl = useMemo(() => {
    if (currentTab) {
      if (showFullUrl) {
        return currentTab.url;
      } else {
        return new URL(currentTab.url).host;
      }
    } else {
      return "";
    }
  }, [showFullUrl, currentTab]);

  return (
    <div className={`flex flex-col items-center justify-between h-full w-[15vw] ${isMac() ? 'min-w-[250px]' : 'min-w-[150px]'} bg-transparent ${className}`} style={{
      width: width,
      // @ts-expect-error electron attribute
      appRegion: 'drag',
    }} id="sidebar-container">
      {/* Top Buttons */}
      <div className="flex flex-col w-full gap-2" style={{
        // @ts-expect-error electron attribute
        appRegion: 'no-drag',
      }}>
        {/* Actions */}
        <div className={`flex flex-row justify-between items-center ${isMac() ? 'pl-20' : ''}`} style={{
          // @ts-expect-error electron attribute
          appRegion: 'drag',
        }}>
          {/* More, Go Back, Go Forward, Reload */}
          <div className="flex flex-row justify-start items-center" style={{
            // @ts-expect-error electron attribute
            appRegion: 'no-drag',
          }}>
            <Dropdown>
              <DropdownTrigger>
                <Button variant="light" isIconOnly size={iconBtnSize}>
                  <LuMenu size={iconPx}/>
                </Button>
              </DropdownTrigger>
              <DropdownMenu aria-label="More">
                <DropdownItem
                  key="settings"
                  textValue="Settings"
                  startContent={<LuSettings size={iconPx}/>}
                  onPress={openSettings}
                >
                  Settings
                </DropdownItem>
                <DropdownItem
                  key="extensions"
                  textValue="Extensions"
                  startContent={<LuPuzzle size={iconPx}/>}
                  onPress={openExtensions}
                >
                  Extensions
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>

            {
              showSideBar ? (
                <Tooltip size="sm" content="Hide Sidebar">
                  <Button variant="light" isIconOnly size={iconBtnSize} onPress={() => setSiteBarState(false)}>
                    <LuPanelLeftClose size={iconPx}/>
                  </Button>
                </Tooltip>
              ) : (
                <Tooltip size="sm" content="Show Sidebar">
                  <Button variant="light" isIconOnly size={iconBtnSize} onPress={() => setSiteBarState(true)}>
                    <LuPanelLeftOpen size={iconPx}/>
                  </Button>
                </Tooltip>
              )
            }
          </div>

          <div className="flex flex-row justify-end items-center" style={{
            // @ts-expect-error electron attribute
            appRegion: 'no-drag',
          }}>
            <Button variant="light" isIconOnly size={iconBtnSize} isDisabled={!canGoBack()} onPress={handleGoBack}>
              <LuMoveLeft size={iconPx}/>
            </Button>

            <Button variant="light" isIconOnly size={iconBtnSize} isDisabled={!canGoForward()} onPress={handleGoForward}>
              <LuMoveRight size={iconPx}/>
            </Button>

            <Button variant="light" isIconOnly size={iconBtnSize} onPress={handleReload}>
              <LuRotateCw size={iconPx}/>
            </Button>

            {/* Plugins */}
          </div>
        </div>

        {/* URL Input */}
        <Input
          value={displayUrl}
          size={iconBtnSize}
          className="pl-1 group overflow-hidden"
          placeholder="Search..."
          classNames={{
            input: "whitespace-nowrap text-ellipsis w-full"
          }}
          endContent={
            <div className="
              hidden group-hover:flex flex-row gap-0
              transition-all ease-in-out duration-300
              translate-x-2 backdrop-blur-md rounded-medium
            ">
              <Button isIconOnly size={iconBtnSize} variant="light" className="bg-transparent">
                <LuLink size={iconPx} className="text-neutral-700"/>
              </Button>
              <Button isIconOnly size={iconBtnSize} variant="light">
                <LuSlidersHorizontal size={iconPx} className="text-neutral-700"/>
              </Button>
            </div>
          }
          onClick={() => {
            if (currentTab) {
              openEditTabModal(currentTab ? currentTab.url : "")
            } else {
              openNewTabModal();
            }
          }}
        />

        {/* Favorite Tabs (in card) */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {
            favoriteTabs.map((tab: Tab) => (
              <FavoriteTabCard tab={tab} key={tab.id}/>
            ))
          }
        </div>

        {/* Space Info */}
        <div className="flex flex-row w-full gap-2 pl-3 pr-1 items-center justify-start">
          <img src={currentSpace ? currentSpace.icon : ""} alt="" className="select-none" style={{ width: spaceIconPx, height: spaceIconPx }} draggable={false}/>
          <p className={`select-none font-semibold whitespace-nowrap text-ellipsis ${spaceTextClass}`}>{currentSpace ? currentSpace.name : ""}</p>
        </div>

        {/* Pinned Tabs (in list) */}
        <div className={`flex flex-col w-full gap-1 ${pinnedTabs.length > 0 ? 'pt-1' : ''}`}>
          {
            pinnedTabs.map((tab: Tab) => (
              <TabRow
                tab={tab}
                key={tab.id}
                onTabClose={() => onTabClose(tab.id)}
                onSelect={() => onTabSelect(tab.id)}
                isSelected={currentTab ? currentTab.id === tab.id : false}
                isPinned={true}
                onContextMenuOpen={(e) => onTabContextMenu(e, tab)}
                render={tab.shouldRender}
                uiSize={uiSize}
              />
            ))
          }
        </div>

        <Divider className="pl-1 pr-1"/>

        {/* New Tab */}
        <div className="w-full">
          <Button
            startContent={<LuPlus size={iconPx}/>}
            variant="light"
            className="w-full"
            size={iconBtnSize}
            onPress={() => openNewTabModal()}
          >
            <p className="text-start w-full">
              New Tab
            </p>
          </Button>
        </div>

        {/* Normal Tabs (in list) */}
        <div className="flex flex-col w-full gap-1">
          {
            tabs.map((tab: Tab) => (
              <TabRow
                tab={tab}
                key={tab.id}
                onTabClose={() => onTabClose(tab.id)}
                onSelect={() => onTabSelect(tab.id)}
                isSelected={currentTab ? currentTab.id === tab.id : false}
                isPinned={false}
                onContextMenuOpen={(e) => onTabContextMenu(e, tab)}
                render={tab.shouldRender}
                uiSize={uiSize}
              />
            ))
          }
        </div>
      </div>

      {/* Bottom Buttons */}
      <div className="flex flex-col w-full gap-2" style={{
        // @ts-expect-error electron attribute
        appRegion: 'no-drag',
      }}>
        <div className="w-full flex flex-row justify-between items-center">
          <Dropdown>
            <DropdownTrigger>
              <Button variant="light" isIconOnly size={iconBtnSize}>
                <LuDownload size={iconPx}/>
              </Button>
            </DropdownTrigger>
            <DropdownMenu>
              <DropdownItem key="d1">Download Item 1</DropdownItem>
            </DropdownMenu>
          </Dropdown>

          <div className="flex flex-row w-full items-center justify-center gap-1">
            {
              spaces.map((space) => (
                <Tooltip key={space.id} content={space.name} size="sm">
                  <Button isIconOnly variant={currentSpace?.id === space.id ? "flat" : "light"} size={iconBtnSize}>
                    <img
                      alt=""
                      src={space.icon}
                      className="h-[50%]"
                    />
                  </Button>
                </Tooltip>
              ))
            }
          </div>

          <Tooltip size="sm" content="New Space">
            <Button variant="light" isIconOnly size={iconBtnSize}>
              <LuPlus size={iconPx}/>
            </Button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

export default function BrowserSideBar(props: BrowserSideBarProps) {
  const {isOpen, onOpen, onClose, onOpenChange} = useDisclosure();

  const closeTimeoutRef = useRef<NodeJS.Timeout>(null);

  const handleMouseLeave = () => {
    closeTimeoutRef.current = setTimeout(() => {
      onClose();
    }, 300);
  };

  const handleMouseEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
    }
  };

  if (props.showSideBar) {
    return (
      <BrowserSideBarContent
        {...props}
      />
    );
  } else {
    return (
      <div className="flex flex-row h-full">
        <div
          className="h-full w-2"
          onMouseEnter={onOpen}
        />
        <Drawer
          isOpen={isOpen}
          onOpenChange={onOpenChange}
          placement="left"
          hideCloseButton
          classNames={{
            base: `sm:data-[placement=right]:m-3 sm:data-[placement=left]:m-3 rounded-medium min-w-0 w-auto max-w-[${props.width}px] pr-2`,
          }}
        >
          <DrawerContent
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <BrowserSideBarContent
              {...props}
            />
          </DrawerContent>
        </Drawer>
      </div>
    );
  }
}
