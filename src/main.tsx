import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';
import { initPWAInstallListeners } from './lib/usePWAInstall';

initPWAInstallListeners();
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(<App />);
