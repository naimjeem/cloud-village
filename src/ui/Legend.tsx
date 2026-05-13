import { useState } from 'react';

type BuildingItem = {
  kind: string;
  icon: string;
  label: string;
  description: string;
  color: string;
};

const BUILDINGS: BuildingItem[] = [
  { kind: 'compute', icon: '🏠', label: 'Compute', description: 'Services, containers, functions', color: '#d97757' },
  { kind: 'storage', icon: '🛢', label: 'Storage', description: 'Object stores, buckets, volumes', color: '#c9a96e' },
  { kind: 'database', icon: '🗄', label: 'Database', description: 'SQL, NoSQL, key-value', color: '#7b6cf6' },
  { kind: 'queue', icon: '📮', label: 'Queue', description: 'Message queues, event bus', color: '#e8b04f' },
  { kind: 'gateway', icon: '🚪', label: 'Gateway', description: 'Load balancers, API gateways', color: '#a05a3a' },
  { kind: 'cdn', icon: '📡', label: 'CDN', description: 'Edge caching, distribution', color: '#6ab7d9' },
  { kind: 'monitoring', icon: '🔭', label: 'Monitoring', description: 'Logs, metrics, tracing', color: '#9aa0a6' },
  { kind: 'auth', icon: '🛡', label: 'Auth', description: 'Identity, secrets, IAM', color: '#5fa362' },
  { kind: 'cache', icon: '💧', label: 'Cache', description: 'Redis, Memcached, KV', color: '#8fc1e6' },
  { kind: 'external', icon: '🚶', label: 'External', description: 'Third-party services', color: '#cccccc' },
];

const HEALTH: Array<{ label: string; color: string; description: string }> = [
  { label: 'Healthy', color: '#22c55e', description: 'Running normally' },
  { label: 'Degraded', color: '#f59e0b', description: 'Reduced capacity or warnings' },
  { label: 'Down', color: '#ef4444', description: 'Failing or offline' },
];

const FLOWS: Array<{ label: string; color: string; description: string }> = [
  { label: 'Request', color: '#5ec8ff', description: 'Inbound call along an edge' },
  { label: 'Response', color: '#7cffb2', description: 'Reply traveling back' },
  { label: 'Event', color: '#ffd166', description: 'Async / pub-sub message' },
];

export function Legend() {
  const [open, setOpen] = useState(true);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 12,
        left: 12,
        background: 'rgba(11,18,32,0.92)',
        border: '1px solid #1f2a44',
        borderRadius: 10,
        color: '#e6edf3',
        zIndex: 10,
        width: open ? 320 : 'auto',
        boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          background: 'transparent',
          border: 'none',
          color: '#e6edf3',
          padding: '8px 12px',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: 0.4,
        }}
        aria-expanded={open}
      >
        <span>🗺 Legend</span>
        <span style={{ fontSize: 14, color: '#9aa0a6', lineHeight: 1 }}>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div style={{ padding: '4px 12px 12px' }}>
          <Section title="Buildings">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                rowGap: 6,
                columnGap: 10,
              }}
            >
              {BUILDINGS.map((b) => (
                <div
                  key={b.kind}
                  title={b.description}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}
                >
                  <Swatch color={b.color} />
                  <span style={{ fontSize: 13, lineHeight: 1 }}>{b.icon}</span>
                  <span style={{ fontSize: 11, color: '#e6edf3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.label}
                  </span>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Health">
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {HEALTH.map((h) => (
                <div key={h.label} title={h.description} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Dot color={h.color} glow />
                  <span style={{ fontSize: 11 }}>{h.label}</span>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Traffic">
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {FLOWS.map((f) => (
                <div key={f.label} title={f.description} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Particle color={f.color} />
                  <span style={{ fontSize: 11 }}>{f.label}</span>
                </div>
              ))}
            </div>
          </Section>

          <div
            style={{
              borderTop: '1px solid #1f2a44',
              marginTop: 10,
              paddingTop: 8,
              fontSize: 10,
              color: '#9aa0a6',
              lineHeight: 1.5,
            }}
          >
            Click a building for details · road thickness = traffic volume
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div
        style={{
          fontSize: 10,
          color: '#5ec8ff',
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function Swatch({ color }: { color: string }) {
  return (
    <span
      style={{
        width: 10,
        height: 10,
        background: color,
        borderRadius: 3,
        display: 'inline-block',
        flexShrink: 0,
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)',
      }}
    />
  );
}

function Dot({ color, glow }: { color: string; glow?: boolean }) {
  return (
    <span
      style={{
        width: 9,
        height: 9,
        background: color,
        borderRadius: '50%',
        display: 'inline-block',
        flexShrink: 0,
        boxShadow: glow ? `0 0 6px ${color}` : undefined,
      }}
    />
  );
}

function Particle({ color }: { color: string }) {
  return (
    <span
      style={{
        width: 14,
        height: 4,
        background: `linear-gradient(90deg, transparent 0%, ${color} 50%, transparent 100%)`,
        borderRadius: 2,
        display: 'inline-block',
        flexShrink: 0,
      }}
    />
  );
}
