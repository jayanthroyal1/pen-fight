import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initPhysics } from './game/world';
import './styles.css';

const root = createRoot(document.getElementById('root')!);

initPhysics().then(
  () =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  () =>
    root.render(
      <main className="app">
        <p className="error" role="alert">
          The game couldn't load its physics engine. Reload the page to try again.
        </p>
      </main>,
    ),
);
