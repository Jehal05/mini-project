import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// ?ui-kit shows the design system page. Development only, so it is not shipped in production builds.
const UiKit = import.meta.env.DEV ? lazy(() => import('./ui/UiKit.jsx')) : null;
const showKit = UiKit && new URLSearchParams(window.location.search).has('ui-kit');

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {showKit ? <Suspense fallback={null}><UiKit /></Suspense> : <App />}
  </React.StrictMode>,
);
