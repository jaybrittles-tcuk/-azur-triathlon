import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import './app/styles.css';
const staging=import.meta.env.VITE_AZUR_STAGING==='true';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {staging && <div className="azur-staging-banner" role="status">AZUR STAGING · Separate test environment</div>}
    <App />
  </React.StrictMode>,
);

if ('serviceWorker' in navigator && !staging) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
