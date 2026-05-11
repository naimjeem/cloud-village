import { useStore } from '../store';

const SEVERITY_COLOR = {
  info: '#5ec8ff',
  warning: '#f59e0b',
  critical: '#ef4444',
};

const SEVERITY_ICON = {
  info: 'ℹ',
  warning: '⚠',
  critical: '⛔',
};

const MAX_VISIBLE = 4;
const PANEL_WIDTH = 340;
const PANEL_GAP = 16;

export function AlertToasts() {
  const alerts = useStore((s) => s.alerts);
  const village = useStore((s) => s.village);
  const dismiss = useStore((s) => s.dismissAlert);
  const panelOpen = useStore((s) => s.selectedId !== null);

  const nameOf = (id: string) =>
    village.components.find((c) => c.id === id)?.name ?? id;

  // newest on top, cap visible count
  const ordered = [...alerts].reverse();
  const visible = ordered.slice(0, MAX_VISIBLE);
  const hidden = ordered.length - visible.length;

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: panelOpen ? PANEL_WIDTH + PANEL_GAP : 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 10,
        width: 320,
        maxWidth: 'calc(100vw - 24px)',
        transition: 'right 220ms cubic-bezier(0.4, 0, 0.2, 1)',
        pointerEvents: 'none',
      }}
    >
      {visible.map((a, idx) => (
        <div
          key={a.id}
          style={{
            background: 'rgba(11,18,32,0.94)',
            border: `1px solid ${SEVERITY_COLOR[a.severity]}33`,
            borderLeft: `4px solid ${SEVERITY_COLOR[a.severity]}`,
            padding: '10px 12px 10px 14px',
            borderRadius: 8,
            color: '#e6edf3',
            fontSize: 13,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.3)',
            animation: 'tslideIn 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            pointerEvents: 'auto',
            opacity: idx === MAX_VISIBLE - 1 && hidden > 0 ? 0.85 : 1,
            transform: `scale(${1 - idx * 0.02})`,
            transformOrigin: 'top right',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                color: SEVERITY_COLOR[a.severity],
                fontSize: 14,
                width: 18,
                textAlign: 'center',
                flexShrink: 0,
              }}
            >
              {SEVERITY_ICON[a.severity]}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: 8,
                }}
              >
                <strong
                  style={{
                    color: SEVERITY_COLOR[a.severity],
                    fontSize: 11,
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {a.severity}
                </strong>
                <span
                  style={{
                    color: '#9aa0a6',
                    fontSize: 11,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                  }}
                  title={nameOf(a.componentId)}
                >
                  {nameOf(a.componentId)}
                </span>
              </div>
              <div
                style={{
                  marginTop: 3,
                  fontSize: 12,
                  lineHeight: 1.4,
                  color: '#dde3ea',
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}
                title={a.message}
              >
                {a.message}
              </div>
            </div>
            <button
              onClick={() => dismiss(a.id)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#6b7380',
                cursor: 'pointer',
                fontSize: 16,
                lineHeight: 1,
                padding: 2,
                flexShrink: 0,
                borderRadius: 4,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#e6edf3')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#6b7380')}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      ))}
      {hidden > 0 && (
        <div
          style={{
            alignSelf: 'flex-end',
            background: 'rgba(11,18,32,0.85)',
            border: '1px solid #1f2a44',
            color: '#9aa0a6',
            fontSize: 11,
            padding: '3px 10px',
            borderRadius: 999,
            pointerEvents: 'auto',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
          }}
        >
          +{hidden} more
        </div>
      )}
      <style>{`
        @keyframes tslideIn {
          from { transform: translateX(20px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
