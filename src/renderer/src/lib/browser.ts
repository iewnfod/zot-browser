import { deserializeTab, SerializableTab, serializeTab, Tab } from '@renderer/lib/tab';
import { NewDefaultSpace, Space } from '@renderer/lib/space';

export interface Browser {
  tabs: Record<string, Tab>;
  spaces: Record<string, Space>;

  favoriteTabIds: string[];
  currentTabId?: string;
  currentSpaceId?: string;
}

export interface SerializableBrowser {
  tabs: Record<string, SerializableTab>;
  spaces: Record<string, Space>;

  favoriteTabIds: string[];
  currentTabId?: string;
  currentSpaceId?: string;
}

export function serializeBrowser(browser: Browser): SerializableBrowser {
  const serializedTabs: Record<string, SerializableTab> = {};
  for (const [tabId, tab] of Object.entries(browser.tabs)) {
    serializedTabs[tabId] = serializeTab(tab);
  }

  return {
    tabs: serializedTabs,
    spaces: browser.spaces,

    favoriteTabIds: browser.favoriteTabIds,
    currentTabId: browser.currentTabId,
    currentSpaceId: browser.currentSpaceId,
  };
}

export function deserializeBrowser(browser: SerializableBrowser): Browser {
  const deserializedTabs: Record<string, Tab> = {};
  for (const [tabId, tab] of Object.entries(browser.tabs)) {
    deserializedTabs[tabId] = deserializeTab(tab);
  }

  return {
    tabs: deserializedTabs,
    spaces: browser.spaces,
    favoriteTabIds: browser.favoriteTabIds,
    currentTabId: browser.currentTabId,
    currentSpaceId: browser.currentSpaceId,
  };
}

export function CreateNewBrowser(): Browser {
  const defaultSpace = NewDefaultSpace();

  return {
    tabs: {},
    spaces: {
      [defaultSpace.id]: defaultSpace
    },
    favoriteTabIds: [],
    currentSpaceId: defaultSpace.id
  };
}
