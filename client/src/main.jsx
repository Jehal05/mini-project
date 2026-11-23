import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import PublicPassport from './passport/PublicPassport.jsx';
const FamilyStatus = lazy(() => import('./emergency/FamilyStatus.jsx'));
import './index.css';

// ?ui-kit shows the design system page. Development only, so it is not shipped in production builds.
const UiKit = import.meta.env.DEV ? lazy(() => import('./ui/UiKit.jsx')) : null;
const showKit = UiKit && new URLSearchParams(window.location.search).has('ui-kit');

// /p/<token> is the page behind a QR passport: public, no sign-in.
const passportToken = window.location.pathname.match(/^\/p\/([a-f0-9]{64})\/?$/i)?.[1];
// /status/<token> is the page behind an emergency contact's alert: public, no sign-in.
const statusToken = window.location.pathname.match(/^\/status\/([a-f0-9]{32})\/?$/i)?.[1];

// Feature 108: lets browsers offer to install the app. Production builds only, so development never serves a stale worker.
if (import.meta.env.PROD && 'serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {statusToken ? <Suspense fallback={null}><FamilyStatus token={statusToken.toLowerCase()} /></Suspense> : passportToken ? <PublicPassport token={passportToken.toLowerCase()} /> : showKit ? <Suspense fallback={null}><UiKit /></Suspense> : <App />}
  </React.StrictMode>,
);
