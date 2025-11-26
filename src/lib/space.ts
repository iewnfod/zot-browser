export interface Space {
  id: string;
  name: string;
  icon: string;
  tabIds: string[];
  pinnedTabIds: string[];
  themeColor: string;
}

export function NewDefaultSpace(): Space {
  return {
    id: crypto.randomUUID(),
    name: "Default",
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' class='lucide lucide-house-icon lucide-house'%3E%3Cpath d='M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8'/%3E%3Cpath d='M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'/%3E%3C/svg%3E",
    tabIds: [],
    pinnedTabIds: [],
    themeColor: "",
  };
}
