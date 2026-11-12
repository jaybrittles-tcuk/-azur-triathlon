import { Component, type ErrorInfo, type ReactNode } from 'react';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import './app/styles.css';
const staging=import.meta.env.VITE_AZUR_STAGING==='true';

class AppErrorBoundary extends Component<{children:ReactNode},{failed:boolean}> {
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 componentDidCatch(error:Error, info:ErrorInfo){console.error('AZUR app render failed',error,info.componentStack);}
 render(){
  if(!this.state.failed)return this.props.children;
  return <main style={{minHeight:'100vh',background:'#071b2d',color:'#eaf4fb',padding:'32px 22px',fontFamily:'system-ui'}}>
   <h1>AZUR couldn't load this screen</h1>
   <p>Your training data is safe. Please reload the app. If this continues, contact your coach with the preview link.</p>
   <button type="button" style={{padding:'12px 20px',borderRadius:12,background:'#1594cc',color:'#fff',border:0}} onClick={()=>window.location.reload()}>Reload AZUR</button>
  </main>;
 }
}
const previewHost=window.location.hostname.endsWith('.vercel.app');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {staging && <div className="azur-staging-banner" role="status">AZUR STAGING · Separate test environment</div>}
    <AppErrorBoundary><App /></AppErrorBoundary>
  </React.StrictMode>,
);

if ('serviceWorker' in navigator && (staging || previewHost)) {
  // Preview builds must not retain a stale PWA shell from an earlier commit.
  void navigator.serviceWorker.getRegistrations().then(registrations=>Promise.all(registrations.map(reg=>reg.unregister()))).catch(()=>undefined);
}
if ('serviceWorker' in navigator && !staging && !previewHost) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
