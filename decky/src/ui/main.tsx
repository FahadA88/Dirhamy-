import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './ErrorBoundary';
import { SettingsProvider } from '../settings/SettingsContext';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SettingsProvider>
      <ErrorBoundary><App /></ErrorBoundary>
    </SettingsProvider>
  </React.StrictMode>,
);

// Register the offline worker, but never let it break the page.
//
// Only in a built app: in development the module graph is served piece by piece by the dev
// server, and caching that is a way to spend an afternoon confused about why an edit did
// nothing. A browser without service workers simply skips this and loses nothing but offline.
const isProd = (import.meta as { env?: Record<string, unknown> }).env?.PROD === true;
if (isProd && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      /* an unsupported or blocked worker is not an error worth showing anybody */
    });
  });
}
