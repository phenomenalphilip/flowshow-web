import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Suppress benign ResizeObserver errors
const hideResizeObserverError = (e: ErrorEvent) => {
  if (e.message.includes('ResizeObserver loop')) {
    const resizeObserverErrDiv = document.getElementById('webpack-dev-server-client-overlay-div');
    const viteOverlay = document.getElementById('vite-error-overlay');
    if (resizeObserverErrDiv) resizeObserverErrDiv.setAttribute('style', 'display: none');
    if (viteOverlay) viteOverlay.setAttribute('style', 'display: none');
    e.preventDefault();
    e.stopImmediatePropagation();
  }
};

window.addEventListener('error', hideResizeObserverError);
window.onerror = function(msg) {
  if (typeof msg === 'string' && msg.includes('ResizeObserver loop')) {
    return true; // Prevents default error handling
  }
  return false;
};

const originalError = console.error;
console.error = (...args) => {
  if (args[0] && typeof args[0] === 'string' && args[0].includes('ResizeObserver loop')) {
    return;
  }
  originalError.call(console, ...args);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
