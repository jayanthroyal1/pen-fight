import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Platform } from './platform/Platform';
import './platform/platform.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Platform />
  </StrictMode>,
);
