import "@renderer/styles/main.css";

import { createRoot } from 'react-dom/client';
import DownloadsApp from './DownloadsApp';
import { HeroUIProvider } from '@heroui/react';

createRoot(document.getElementById('root')!).render(
  <HeroUIProvider>
    <DownloadsApp />
  </HeroUIProvider>
);
