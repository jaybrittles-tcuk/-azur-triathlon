import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import './app/styles.css';
import './app/session-v11.css';
const staging=import.meta.env.VITE_AZUR_STAGING==='true';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {staging && <div className="azur-staging-banner" role="status">AZUR STAGING · Separate test environment</div>}
    <App />
  </React.StrictMode>,
);

// Staging never runs as an offline PWA. Older staging builds may have
// registered a worker which continues controlling Safari after deploys.
// Unregister only same-origin workers in this isolated test environment.
if (staging && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then(async registrations => {
    for (const registration of registrations) {
      if (new URL(registration.scope).origin === window.location.origin) {
        await registration.unregister();
      }
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter(key => key.startsWith('azur-v2-shell-'))
        .map(key => caches.delete(key)));
    }
  }).catch(() => undefined);
}

if ('serviceWorker' in navigator && !staging) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
