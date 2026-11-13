import { Download, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';

export function PWAInstallButton({ compact = false }: { compact?: boolean }) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <Button
        onClick={install}
        size={compact ? 'sm' : 'default'}
        variant="outline"
        className="w-full justify-start border-emerald-500/30 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
      >
        <Download className="h-4 w-4 shrink-0" />
        <span>Install App</span>
      </Button>
    );
  }

  return (
    <>
      <Button
        onClick={() => setShowGuide(true)}
        size={compact ? 'sm' : 'default'}
        variant="outline"
        className="w-full justify-start"
      >
        <Smartphone className="h-4 w-4 shrink-0" />
        <span>{isIOS ? 'Install on iOS' : 'Install Guide'}</span>
      </Button>

      <Dialog open={showGuide} onOpenChange={setShowGuide}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Install RJ Consistency</DialogTitle>
            <DialogDescription>
              Run RJ Consistency as an offline-capable standalone app on your phone or desktop.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-4 text-sm text-slate-600 dark:text-slate-300">
            {isIOS ? (
              <ol className="list-decimal space-y-2 pl-5">
                <li>Tap the Share button in the Safari toolbar.</li>
                <li>Scroll down and tap Add to Home Screen.</li>
                <li>Confirm by tapping Add.</li>
              </ol>
            ) : (
              <ol className="list-decimal space-y-2 pl-5">
                <li>
                  Open your deployed <span className="font-mono text-xs">.workers.dev</span> HTTPS URL
                  directly in regular <strong>Chrome</strong> (not Incognito or an in-app browser).
                </li>
                <li>
                  Reload the page once so the offline service worker activates, then tap Chrome&apos;s{' '}
                  <strong>⋮</strong> menu → <strong>Add to Home screen</strong> → <strong>Install</strong>{' '}
                  (not <em>Create shortcut</em>).
                </li>
                <li>
                  Launch <strong>RJ Consistency</strong> from your home screen in standalone mode.
                </li>
              </ol>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
