import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/Common/ErrorBoundary';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* Last resort. App carries a narrower one so a crash in the workspace
        does not take the header with it. */}
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
