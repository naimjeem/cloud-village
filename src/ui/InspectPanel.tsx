import { useStore } from '../store';

export function InspectPanel() {
  const selectedId = useStore((s) => s.selectedId);
  const village = useStore((s) => s.village);
  const select = useStore((s) => s.select);
  const setHealth = useStore((s) => s.setHealth);
  const spawnAlert = useStore((s) => s.spawnAlert);
  const spawnFlow = useStore((s) => s.spawnFlow);

  if (!selectedId) return null;
  const c = village.components.find((x) => x.id === selectedId);
  if (!c) return null;

  const incoming = village.connections.filter((x) => x.to === c.id);
  const outgoing = village.connections.filter((x) => x.from === c.id);

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 340,
        background: 'rgba(11,18,32,0.95)',
        borderLeft: '1px solid #1f2a44',
        padding: 16,
        overflowY: 'auto',
        color: '#e6edf3',
        fontSize: 13,
        zIndex: 5,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>{c.name}</h2>
        <button
          onClick={() => select(null)}
          style={{ background: 'transparent', border: 'none', color: '#9aa0a6', cursor: 'pointer', fontSize: 18 }}
        >
          ×
        </button>
      </div>
      <div style={{ color: '#9aa0a6', fontSize: 12, marginTop: 4 }}>
        {c.kind} · {c.provider} · <Health value={c.health} />
      </div>

      <Section title="Incoming">
        {incoming.length === 0 ? <Empty /> : incoming.map((conn) => (
          <ConnRow
            key={conn.id}
            label={`${nameOf(village, conn.from)} → ${conn.protocol ?? 'edge'}`}
            onPlay={() => spawnFlow(conn.id, 'request')}
          />
        ))}
      </Section>

      <Section title="Outgoing">
        {outgoing.length === 0 ? <Empty /> : outgoing.map((conn) => (
          <ConnRow
            key={conn.id}
            label={`${conn.protocol ?? 'edge'} → ${nameOf(village, conn.to)}`}
            onPlay={() => spawnFlow(conn.id, 'request')}
          />
        ))}
      </Section>

      <Section title="Actions">
        <Button onClick={() => spawnAlert(c.id, 'critical', `${c.name} is unreachable`)}>
          Trigger critical alert
        </Button>
        <Button onClick={() => spawnAlert(c.id, 'warning', `${c.name} latency spike`)}>
          Trigger warning
        </Button>
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <Pill active={c.health === 'healthy'} onClick={() => setHealth(c.id, 'healthy')}>healthy</Pill>
          <Pill active={c.health === 'degraded'} onClick={() => setHealth(c.id, 'degraded')}>degraded</Pill>
          <Pill active={c.health === 'down'} onClick={() => setHealth(c.id, 'down')}>down</Pill>
        </div>
      </Section>

      {c.meta && (
        <Section title="Metadata">
          <pre style={{ fontSize: 11, color: '#9aa0a6', whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(c.meta, null, 2)}
          </pre>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 11, color: '#5ec8ff', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
        {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Empty() {
  return <div style={{ color: '#9aa0a6', fontSize: 12 }}>None</div>;
}

function ConnRow({ label, onPlay }: { label: string; onPlay: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #1f2a44' }}>
      <span style={{ fontSize: 12 }}>{label}</span>
      <button
        onClick={onPlay}
        style={{ background: '#1f2a44', border: 'none', color: '#5ec8ff', cursor: 'pointer', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}
      >
        ▶ flow
      </button>
    </div>
  );
}

function Button({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        background: '#1f2a44',
        border: '1px solid #2a3a5a',
        color: '#e6edf3',
        padding: '6px 10px',
        marginTop: 6,
        borderRadius: 4,
        cursor: 'pointer',
        fontSize: 12,
        textAlign: 'left',
      }}
    >
      {children}
    </button>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? '#5ec8ff' : '#1f2a44',
        color: active ? '#0b1220' : '#e6edf3',
        border: 'none',
        padding: '4px 10px',
        borderRadius: 999,
        cursor: 'pointer',
        fontSize: 11,
      }}
    >
      {children}
    </button>
  );
}

function Health({ value }: { value: 'healthy' | 'degraded' | 'down' }) {
  const colors = { healthy: '#22c55e', degraded: '#f59e0b', down: '#ef4444' };
  return <span style={{ color: colors[value] }}>● {value}</span>;
}

function nameOf(v: ReturnType<typeof useStore.getState>['village'], id: string) {
  return v.components.find((c) => c.id === id)?.name ?? id;
}
