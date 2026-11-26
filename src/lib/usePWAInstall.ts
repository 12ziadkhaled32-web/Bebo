import { useEffect, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

// Capture beforeinstallprompt globally on startup so SettingsModal can access it even when opened later
let sharedDeferredPrompt: BeforeInstallPromptEvent | null = null;
let sharedIsInstalled = false;
let initializedListeners = false;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((cb) => cb());
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function detectIOS(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent.toLowerCase();
  const isAppleMobile = /iphone|ipad|ipod/.test(ua);
  const isIPadOS =
    window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1;
  return isAppleMobile || isIPadOS;
}

export function initPWAInstallListeners(): void {
  if (typeof window === 'undefined' || initializedListeners) return;
  initializedListeners = true;
  sharedIsInstalled = detectStandalone();

  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    sharedDeferredPrompt = e as BeforeInstallPromptEvent;
    notifyListeners();
  });

  window.addEventListener('appinstalled', () => {
    sharedIsInstalled = true;
    sharedDeferredPrompt = null;
    notifyListeners();
  });
}

export function usePWAInstall() {
  const [, setTick] = useState(0);
  const [isIOS] = useState(() => detectIOS());

  useEffect(() => {
    initPWAInstallListeners();
    sharedIsInstalled = detectStandalone() || sharedIsInstalled;

    const refresh = () => setTick((n) => n + 1);
    listeners.add(refresh);
    return () => {
      listeners.delete(refresh);
    };
  }, []);

  const install = async (): Promise<boolean> => {
    if (!sharedDeferredPrompt) return false;
    await sharedDeferredPrompt.prompt();
    const { outcome } = await sharedDeferredPrompt.userChoice;
    if (outcome === 'accepted') {
      sharedIsInstalled = true;
      sharedDeferredPrompt = null;
      notifyListeners();
      return true;
    }
    return false;
  };

  return {
    isInstallable: Boolean(sharedDeferredPrompt),
    isInstalled: sharedIsInstalled,
    isIOS,
    install,
  };
}

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
