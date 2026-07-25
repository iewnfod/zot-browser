import "@renderer/styles/main.css";

import { createRoot } from 'react-dom/client';
import ExtensionsApp from './ExtensionsApp';
import { HeroUIProvider } from '@heroui/react';

createRoot(document.getElementById('root')!).render(
  <HeroUIProvider>
    <ExtensionsApp />
  </HeroUIProvider>
);
