import { useEffect } from 'react';
import { useStore } from '../store';

export function KeyboardShortcuts() {
  const togglePause = useStore((s) => s.togglePause);
  const select = useStore((s) => s.select);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === ' ') {
        e.preventDefault();
        togglePause();
      } else if (e.key === 'Escape') {
        select(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [togglePause, select]);

  return null;
}
