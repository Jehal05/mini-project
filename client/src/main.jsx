import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import PublicPassport from './passport/PublicPassport.jsx';
import './index.css';

// ?ui-kit shows the design system page. Development only, so it is not shipped in production builds.
const UiKit = import.meta.env.DEV ? lazy(() => import('./ui/UiKit.jsx')) : null;
const showKit = UiKit && new URLSearchParams(window.location.search).has('ui-kit');

// /p/<token> is the page behind a QR passport: public, no sign-in.
const passportToken = window.location.pathname.match(/^\/p\/([a-f0-9]{64})\/?$/i)?.[1];

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {passportToken ? <PublicPassport token={passportToken.toLowerCase()} /> : showKit ? <Suspense fallback={null}><UiKit /></Suspense> : <App />}
  </React.StrictMode>,
);
