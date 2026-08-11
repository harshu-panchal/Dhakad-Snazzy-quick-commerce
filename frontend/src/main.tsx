import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './styles/anti-flash.css'

// Set background immediately to prevent flash
if (document.documentElement) {
  document.documentElement.style.backgroundColor = '#ffffff';
}

// Handle Vite dynamic import / asset preload errors caused by new deployments
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  const reloadKey = 'vite_preload_reloaded';
  if (!sessionStorage.getItem(reloadKey)) {
    sessionStorage.setItem(reloadKey, 'true');
    window.location.reload();
  }
});

const rootElement = document.getElementById('root');
if (rootElement) {
  rootElement.style.backgroundColor = '#ffffff';
}

ReactDOM.createRoot(rootElement!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

