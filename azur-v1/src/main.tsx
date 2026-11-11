import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import './app/styles.css';
const staging=import.meta.env.VITE_AZUR_STAGING==='true';
class AzurAppErrorBoundary extends React.Component<{children:React.ReactNode},{error:Error|null}> {
  state:{error:Error|null}={error:null};
  static getDerivedStateFromError(error:Error){return {error};}
  componentDidCatch(error:Error,info:React.ErrorInfo){console.error('AZUR render failure',error,info.componentStack);}
  render(){
    if(!this.state.error)return this.props.children;
    return <main role="alert" style={{minHeight:'100dvh',background:'#090e18',color:'#f0f5fa',padding:'max(32px,env(safe-area-inset-top)) 22px 42px',fontFamily:'system-ui,-apple-system,sans-serif',boxSizing:'border-box'}}>
      <div style={{maxWidth:560,margin:'12vh auto 0'}}>
        <div style={{letterSpacing:3,color:'#78bedf',fontSize:11,fontWeight:800}}>AZUR STAGING · SESSION RECOVERY</div>
        <h1 style={{fontSize:27,lineHeight:1.2,margin:'22px 0 10px'}}>We couldn't display this screen</h1>
        <p style={{fontSize:15,lineHeight:1.6,color:'#b4c7d7'}}>A display error interrupted the athlete app. Your training records have not been changed by this message.</p>
        <details style={{background:'#131f2d',border:'1px solid #294159',borderRadius:12,padding:14,margin:'22px 0'}}>
          <summary style={{fontWeight:700,cursor:'pointer'}}>Technical error information</summary>
          <pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:12,color:'#e2bfbf'}}>{this.state.error.name}: {this.state.error.message}</pre>
        </details>
        <a href="/" style={{display:'block',textAlign:'center',background:'#2586bd',borderRadius:12,padding:16,color:'#fff',fontWeight:700,textDecoration:'none'}}>Return to AZUR</a>
      </div>
    </main>;
  }
}


ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {staging && <div className="azur-staging-banner" role="status">AZUR STAGING · Separate test environment</div>}
    <AzurAppErrorBoundary><App /></AzurAppErrorBoundary>
  </React.StrictMode>,
);

if ('serviceWorker' in navigator && !staging) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
