import { useEffect, useRef } from 'react';
import { useStore } from '../store';

export function SearchBar() {
  const search = useStore((s) => s.search);
  const setSearch = useStore((s) => s.setSearch);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        ref.current?.focus();
      }
      if (e.key === 'Escape' && document.activeElement === ref.current) {
        ref.current?.blur();
        setSearch('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setSearch]);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10,
        background: 'rgba(11,18,32,0.92)',
        border: '1px solid #1f2a44',
        borderRadius: 8,
        padding: '4px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <span style={{ fontSize: 12, color: '#9aa0a6' }}>🔍</span>
      <input
        ref={ref}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Filter (press /)"
        style={{
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: '#e6edf3',
          fontSize: 12,
          width: 220,
        }}
      />
      {search && (
        <button
          onClick={() => setSearch('')}
          style={{ background: 'transparent', border: 'none', color: '#9aa0a6', cursor: 'pointer', fontSize: 14 }}
        >
          ×
        </button>
      )}
    </div>
  );
}
