import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initPhysics } from './game/world';
import './styles.css';

// The physics engine loads while the intro plays; the app waits for it before leaving the intro.
const physics = initPhysics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App physics={physics} />
  </StrictMode>,
);
