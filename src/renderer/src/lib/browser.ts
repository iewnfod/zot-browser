import { deserializeTab, SerializableTab, serializeTab, Tab } from '@renderer/lib/tab';
import { CreateNewSpace, deserializeSpace, SerializableSpace, serializeSpace, Space } from '@renderer/lib/space';

export interface Browser {
  favoriteTabs: Tab[],
  spaces: Space[];
  currentTabId?: string;
  currentSpaceId?: string;
}

export interface SerializableBrowser {
  favoriteTabs: SerializableTab[];
  spaces: SerializableSpace[];
  currentTabId?: string;
  currentSpaceId?: string;
}

export function serializeBrowser(browser: Browser): SerializableBrowser {
  return {
    favoriteTabs: browser.favoriteTabs.map(t => serializeTab(t)),
    spaces: browser.spaces.map(s => serializeSpace(s)),
    currentTabId: browser.currentTabId,
    currentSpaceId: browser.currentSpaceId,
  };
}

export function deserializeBrowser(browser: SerializableBrowser): Browser {
  return {
    favoriteTabs: browser.favoriteTabs.map(t => deserializeTab(t)),
    spaces: browser.spaces.map(s => deserializeSpace(s)),
    currentTabId: browser.currentTabId,
    currentSpaceId: browser.currentSpaceId,
  };
}

export function CreateNewBrowser(): Browser {
  const defaultSpace = CreateNewSpace();

  return {
    favoriteTabs: [],
    spaces: [defaultSpace],
    currentSpaceId: defaultSpace.id
  };
}
