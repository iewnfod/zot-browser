import "@renderer/styles/main.css";

import { createRoot } from 'react-dom/client';
import SettingsApp from './SettingsApp';
import { HeroUIProvider } from '@heroui/react';

createRoot(document.getElementById('root')!).render(
  <HeroUIProvider>
    <SettingsApp />
  </HeroUIProvider>
);
