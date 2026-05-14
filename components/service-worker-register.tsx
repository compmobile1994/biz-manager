'use client';

import { useEffect } from 'react';

// Registers /sw.js and wires up automatic reload on new-version activation.
// Behavior on the user's phone / desktop PWA:
//   1. On every page load we register the SW and check for an update.
//   2. Whenever the tab becomes visible again (PWA brought to foreground),
//      we check for an update — this catches the common "leave PWA open
//      for days" case.
//   3. The SW itself calls skipWaiting+clients.claim on install, so a new
//      version takes control immediately.
//   4. When that takeover happens, the browser fires `controllerchange` on
//      navigator.serviceWorker. We listen for it and `location.reload()`
//      once — so the user transparently jumps to the new version, no
//      manual refresh / app-reinstall needed.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    let reloaded = false;
    const sw = navigator.serviceWorker;

    // When a brand-new SW becomes the active controller, refresh the page
    // so the user sees the latest UI/code. Guard against repeated reloads.
    sw.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });

    let registration: ServiceWorkerRegistration | null = null;
    sw.register('/sw.js')
      .then((reg) => {
        registration = reg;
        // Run an update check immediately
        reg.update().catch(() => {});
      })
      .catch(() => {});

    // Re-check for an update whenever the app comes back to the foreground.
    // This catches the common "PWA open for days" case — when the user
    // re-opens the app from their home screen, we look for new code.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      registration?.update().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    // Periodic check (every 30 min) for very long-running sessions
    const interval = window.setInterval(
      () => registration?.update().catch(() => {}),
      30 * 60 * 1000,
    );

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.clearInterval(interval);
    };
  }, []);
  return null;
}
