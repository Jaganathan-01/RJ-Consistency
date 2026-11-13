import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let cachedPrompt: BeforeInstallPromptEvent | null = null;
let cachedInstalled = false;
const listeners = new Set<() => void>();

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

if (typeof window !== 'undefined') {
  cachedInstalled =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;

  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    cachedPrompt = e as BeforeInstallPromptEvent;
    notifyListeners();
  });

  window.addEventListener('appinstalled', () => {
    cachedInstalled = true;
    cachedPrompt = null;
    notifyListeners();
  });
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => cachedPrompt
  );
  const [isInstalled, setIsInstalled] = useState<boolean>(() => cachedInstalled);
  const [isIOS] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase())
      : false
  );

  useEffect(() => {
    const sync = () => {
      setDeferredPrompt(cachedPrompt);
      setIsInstalled(cachedInstalled);
    };
    listeners.add(sync);
    sync();
    return () => {
      listeners.delete(sync);
    };
  }, []);

  const install = async (): Promise<boolean> => {
    if (!cachedPrompt) return false;
    await cachedPrompt.prompt();
    const { outcome } = await cachedPrompt.userChoice;
    if (outcome === 'accepted') {
      cachedInstalled = true;
      cachedPrompt = null;
      notifyListeners();
      return true;
    }
    return false;
  };

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    install,
  };
}
