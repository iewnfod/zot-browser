import { useState } from 'react';
import { newTab, Tab } from '@renderer/lib/tab';
import { Button, ButtonGroup, Input } from '@heroui/react';
import WebView from '@renderer/components/WebView';
import { LuX } from 'react-icons/lu';

function App() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);

  function handleSelectTab(id: string) {
    setSelectedTabId(id);
  }

  function handleNewTab() {
    const tab = newTab("https://google.com/");
    setTabs([...tabs, tab]);
    setSelectedTabId(tab.id);
  }

  function handleLoadCommit(url: string, isMainFrame: boolean, id: string) {
    if (isMainFrame) {
      setTabs((tabs) => {
        return tabs.map(tab => tab.id === id ? { ...tab, url } : tab);
      });
    }
  }

  function handleFaviconsUpdate(favicons: string[], id: string) {
    if (favicons.length > 0) {
      window.electron.ipcRenderer.invoke('get-favicon', favicons[0]).then((data: string) => {
        setTabs((tabs) => {
          return tabs.map(tab => tab.id === id ? { ...tab, favicon: data } : tab);
        });
      });
    }
  }

  function handleTitleUpdate(title: string, id: string) {
    setTabs((tabs) => {
      return tabs.map(tab => tab.id === id ? { ...tab, name: title } : tab);
    });
  }

  function handleDeleteTab(id: string) {
    setTabs((tabs) => {
      const newTabs = tabs.filter(tab => tab.id !== id);

      if (id === selectedTabId) {
        const remainingTab = newTabs[newTabs.length - 1];
        setSelectedTabId(remainingTab ? remainingTab.id : null);
      }

      return newTabs;
    });
  }

  function getTabUrlById(id: string | null) {
    if (id === null) {
      return "";
    }
    const selectedTab = tabs.find(tab => tab.id === id);
    return selectedTab ? selectedTab.url : "";
  }

  return (
    <div className="flex flex-col w-[100vw] h-[100vh]">
      <div className="flex flex-row w-full h-full grow p-2 gap-2">
        <div className="flex flex-col h-full gap-1 min-w-[20vw]">
          <Input
            placeholder="url"
            value={getTabUrlById(selectedTabId)}
          />
          <Button onPress={handleNewTab} variant="flat">
            New Tab
          </Button>
          {
            tabs.map((tab) => (
              <ButtonGroup variant="flat" key={tab.id}>
                <Button
                  onPress={() => handleSelectTab(tab.id)}
                  variant="flat"
                  className="w-full"
                  startContent={<img src={tab.favicon} alt="" className="h-[50%]"/>}
                >
                  <p className="w-full text-start overflow-hidden whitespace-nowrap text-ellipsis">
                    {tab.name || tab.url}
                  </p>
                </Button>
                <Button isIconOnly onPress={() => handleDeleteTab(tab.id)}>
                  <LuX/>
                </Button>
              </ButtonGroup>
            ))
          }
        </div>
        {
          tabs.map((tab) => (
            <WebView
              key={tab.id}
              src={tab.src}
              ref={tab.webview}
              className={`w-full h-full grow ${tab.id === selectedTabId ? '' : 'hidden'}`}
              onPageFaviconUpdated={(favicons) => handleFaviconsUpdate(favicons, tab.id)}
              onPageTitleUpdated={(title) => handleTitleUpdate(title, tab.id)}
              onLoadCommit={(url, isMainFrame) => handleLoadCommit(url, isMainFrame, tab.id)}
            />
          ))
        }
      </div>
    </div>
  );
}

export default App;
