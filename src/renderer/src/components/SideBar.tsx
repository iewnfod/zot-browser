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
  LuDownload,
  LuMenu,
  LuMoveLeft,
  LuMoveRight,
  LuPanelLeftClose,
  LuPanelLeftOpen,
  LuPlus,
  LuRotateCw
} from 'react-icons/lu';
import { Tab } from '@renderer/lib/tab';
import FavoriteTabCard from '@renderer/components/FavoriteTabCard';
import TabRow from '@renderer/components/TabRow';
import { isMac } from '@react-aria/utils';
import { useRef } from 'react';
import { Space } from '@renderer/lib/space';

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
  onTabPin: (tabId: string) => void;
  onPinGoSource: (tabId: string) => void;
  setSiteBarState: (state: boolean) => void;
  spaces: Space[];
  width?: number;
  openEditTabModal: (content: string) => void;
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
    onTabPin,
    onPinGoSource,
    setSiteBarState,
    spaces,
    width,
    openEditTabModal,
  } = props;

  function handleGoBack() {
    if (currentTab && currentTab.webview.current) {
      currentTab.webview.current.goBack();
    }
  }

  function handleGoForward() {
    if (currentTab && currentTab.webview.current) {
      currentTab.webview.current.goForward();
    }
  }

  function handleReload() {
    if (currentTab && currentTab.webview.current) {
      currentTab.webview.current.reload();
    }
  }

  function canGoForward() {
    if (currentTab && currentTab.webview.current) {
      return currentTab.webview.current.canGoForward();
    } else {
      return false;
    }
  }

  function canGoBack() {
    if (currentTab && currentTab.webview.current) {
      return currentTab.webview.current.canGoBack();
    } else {
      return false;
    }
  }

  return (
    <div className={`flex flex-col items-center justify-between h-full w-[15vw] ${isMac() ? 'min-w-[250px]' : 'min-w-[150px]'} ${className}`} style={{
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
                <Button variant="light" isIconOnly size="sm">
                  <LuMenu size={20}/>
                </Button>
              </DropdownTrigger>
              <DropdownMenu>
                <DropdownItem key="more">More Settings Here</DropdownItem>
              </DropdownMenu>
            </Dropdown>

            {
              showSideBar ? (
                <Tooltip size="sm" content="Hide Sidebar">
                  <Button variant="light" isIconOnly size="sm" onPress={() => setSiteBarState(false)}>
                    <LuPanelLeftClose size={20}/>
                  </Button>
                </Tooltip>
              ) : (
                <Tooltip size="sm" content="Show Sidebar">
                  <Button variant="light" isIconOnly size="sm" onPress={() => setSiteBarState(true)}>
                    <LuPanelLeftOpen size={20}/>
                  </Button>
                </Tooltip>
              )
            }
          </div>

          <div className="flex flex-row justify-end items-center" style={{
            // @ts-expect-error electron attribute
            appRegion: 'no-drag',
          }}>
            <Button variant="light" isIconOnly size="sm" isDisabled={!canGoBack()} onPress={handleGoBack}>
              <LuMoveLeft size={20}/>
            </Button>

            <Button variant="light" isIconOnly size="sm" isDisabled={!canGoForward()} onPress={handleGoForward}>
              <LuMoveRight size={20}/>
            </Button>

            <Button variant="light" isIconOnly size="sm" onPress={handleReload}>
              <LuRotateCw size={20}/>
            </Button>

            {/* Plugins */}
          </div>
        </div>

        {/* URL Input */}
        <Input
          value={currentTab ? currentTab.url : ""}
          size="sm"
          className="pl-1 pr-1"
          placeholder="Search..."
          onClick={() => openEditTabModal(currentTab ? currentTab.url : "")}
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
          <img src={currentSpace ? currentSpace.icon : ""} alt="" className="w-4 select-none" draggable={false}/>
          <p className="select-none text-sm font-semibold whitespace-nowrap text-ellipsis">{currentSpace ? currentSpace.name : ""}</p>
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
                onPinGoSource={() => onPinGoSource(tab.id)}
              />
            ))
          }
        </div>

        <Divider className="pl-1 pr-1"/>

        {/* New Tab */}
        <div className="w-full">
          <Button
            startContent={<LuPlus size={16}/>}
            variant="light"
            className="w-full"
            size="sm"
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
                onPin={() => onTabPin(tab.id)}
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
              <Button variant="light" isIconOnly size="sm">
                <LuDownload size={20}/>
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
                  <Button isIconOnly variant={currentSpace?.id === space.id ? "flat" : "light"} size="sm">
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
            <Button variant="light" isIconOnly size="sm">
              <LuPlus size={20}/>
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
