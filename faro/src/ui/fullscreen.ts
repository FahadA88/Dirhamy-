import { useEffect, useState } from 'react';

// A table fills the felt either way, but on a phone the browser's own address bar and home
// indicator strip are still there eating the top and bottom of a screen that was never generous
// with vertical space to begin with — the difference between a table and a table under glass.
//
// iOS Safari has never implemented Element.requestFullscreen() for anything but a <video>, so
// `supported` is what a caller checks before showing a toggle at all — a button that would
// silently do nothing on the platform most players are actually on is worse than no button.
export function useFullscreen() {
  const supported = typeof document !== 'undefined' && document.fullscreenEnabled === true;
  const [isFullscreen, setIsFullscreen] = useState(() => !!document.fullscreenElement);

  useEffect(() => {
    if (!supported) return;
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [supported]);

  const toggle = () => {
    if (!supported) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void document.documentElement.requestFullscreen().catch(() => {});
    }
  };

  return { supported, isFullscreen, toggle };
}
