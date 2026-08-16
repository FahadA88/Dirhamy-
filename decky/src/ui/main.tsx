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
