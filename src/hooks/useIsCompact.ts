import { useEffect, useState } from 'react';

/**
 * Tracks whether the viewport is narrower than `threshold` (default 760px).
 * Used to switch UI to a compact / mobile-friendly layout.
 */
export function useIsCompact(threshold = 760) {
  const [compact, setCompact] = useState(
    typeof window !== 'undefined' ? window.innerWidth < threshold : false
  );
  useEffect(() => {
    const onResize = () => setCompact(window.innerWidth < threshold);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [threshold]);
  return compact;
}
