import "./styles/main.css";

import { createRoot } from 'react-dom/client';
import App from './App';
import {HeroUIProvider} from '@heroui/react';

createRoot(document.getElementById('root')!).render(
  <HeroUIProvider>
    <App/>
  </HeroUIProvider>
);
