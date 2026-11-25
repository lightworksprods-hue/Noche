import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

import { GoogleOAuthProvider } from '@react-oauth/google';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID || ''}>
      <App />
    </GoogleOAuthProvider>
  </React.StrictMode>
)

// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      .then(reg => console.log('🚀 PWA: Service Worker Registered!', reg.scope))
      .catch(err => console.log('❌ PWA: Registration Failed!', err));
  });
}

// Global PWA Install Prompt Capture
window.deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.deferredPrompt = e;
});
