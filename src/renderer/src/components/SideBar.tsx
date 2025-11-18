import { Button, Divider, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, Input } from '@heroui/react';
import { LuMenu, LuMoveLeft, LuMoveRight, LuPanelLeftClose, LuPanelLeftOpen, LuPlus } from 'react-icons/lu';
import { TbReload } from 'react-icons/tb';
import { Tab } from '@renderer/lib/tab';
import FavoriteTabCard from '@renderer/components/FavoriteTabCard';
import TabRow from '@renderer/components/TabRow';

export default function BrowserSideBar({
  showSideBar,
  currentTab,
  favoriteTabs,
  pinnedTabs,
  tabs,
  spaceName,
  spaceIcon,
  openNewTabModal,
  onTabClose,
  onTabSelect,
  className,
} : {
  showSideBar: boolean;
  currentTab: Tab | null;
  favoriteTabs: Tab[];
  pinnedTabs: Tab[];
  tabs: Tab[];
  spaceName: string;
  spaceIcon: string;
  openNewTabModal: () => void;
  onTabClose: (tabId: string) => void;
  onTabSelect: (tabId: string) => void;
  className?: string;
}) {
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
    <div className={`h-full min-w-64 w-[15vw] ${className}`} style={{
      // @ts-expect-error electron attribute
      'app-region': 'drag',
    }}>
      <div className="flex flex-col w-full gap-2" style={{
        // @ts-expect-error electron attribute
        'app-region': 'no-drag',
      }}>
        {/* Actions */}
        <div className="flex flex-row justify-between items-center" style={{
          // @ts-expect-error electron attribute
          'app-region': 'drag',
        }}>
          {/* More, Go Back, Go Forward, Reload */}
          <div className="flex flex-row justify-start items-center" style={{
            // @ts-expect-error electron attribute
            'app-region': 'no-drag',
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
                <Button variant="light" isIconOnly size="sm">
                  <LuPanelLeftClose size={20}/>
                </Button>
              ) : (
                <Button variant="light" isIconOnly size="sm">
                  <LuPanelLeftOpen size={20}/>
                </Button>
              )
            }
          </div>

          <div className="flex flex-row justify-end items-center" style={{
            // @ts-expect-error electron attribute
            'app-region': 'no-drag',
          }}>
            <Button variant="light" isIconOnly size="sm" isDisabled={!canGoBack()} onPress={handleGoBack}>
              <LuMoveLeft size={20}/>
            </Button>
            <Button variant="light" isIconOnly size="sm" isDisabled={!canGoForward()} onPress={handleGoForward}>
              <LuMoveRight size={20}/>
            </Button>
            <Button variant="light" isIconOnly size="sm" onPress={handleReload}>
              <TbReload size={20}/>
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
        <div className="flex flex-row w-full gap-2 pl-1 pr-1 items-center justify-start">
          <img src={spaceIcon} alt="" className="w-4 select-none" draggable={false}/>
          <p className="select-none text-sm font-semibold">{spaceName}</p>
        </div>

        {/* Pinned Tabs (in list) */}
        <div className="flex flex-col w-full gap-1">
          {
            pinnedTabs.map((tab: Tab) => (
              <TabRow
                tab={tab}
                key={tab.id}
                onTabClose={() => onTabClose(tab.id)}
                onSelect={() => onTabSelect(tab.id)}
                isSelected={currentTab ? currentTab.id === tab.id : false}
              />
            ))
          }
        </div>

        <Divider className="pl-1 pr-1"/>

        {/* New Tab */}
        <div className="w-full">
          <Button
            startContent={<LuPlus/>}
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
              />
            ))
          }
        </div>
      </div>
    </div>
  );
}
