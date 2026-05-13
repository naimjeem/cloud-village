import { useMemo, useState } from 'react';
import { useStore } from '../store';
import type { HealthStatus } from '../types';

type Tab = 'summary' | 'components' | 'edges' | 'alerts';
type ComponentSort = 'name' | 'kind' | 'health' | 'traffic';

export function MetricsPanel() {
  const open = useStore((s) => s.metricsPanelOpen);
  const toggle = useStore((s) => s.toggleMetricsPanel);
  const village = useStore((s) => s.village);
  const alerts = useStore((s) => s.alerts);
  const edgeTraffic = useStore((s) => s.edgeTraffic);
  const lastScanProvider = useStore((s) => s.lastScanProvider);
  const select = useStore((s) => s.select);
  const selectedId = useStore((s) => s.selectedId);

  const [tab, setTab] = useState<Tab>('summary');
  const [sortBy, setSortBy] = useState<ComponentSort>('traffic');

  const totals = useMemo(() => {
    let healthy = 0, degraded = 0, down = 0;
    for (const c of village.components) {
      if (c.health === 'healthy') healthy++;
      else if (c.health === 'degraded') degraded++;
      else if (c.health === 'down') down++;
    }
    return { healthy, degraded, down };
  }, [village.components]);

  const trafficByComp = useMemo(() => {
    const m: Record<string, number> = {};
    for (const conn of village.connections) {
      const t = edgeTraffic[conn.id] ?? 0;
      m[conn.from] = (m[conn.from] ?? 0) + t;
      m[conn.to] = (m[conn.to] ?? 0) + t;
    }
    return m;
  }, [village.connections, edgeTraffic]);

  const sortedComponents = useMemo(() => {
    const list = village.components.slice();
    const healthRank = { healthy: 0, degraded: 1, down: 2 } as const;
    list.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'kind') return a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name);
      if (sortBy === 'health') return healthRank[b.health] - healthRank[a.health];
      const ta = trafficByComp[a.id] ?? 0;
      const tb = trafficByComp[b.id] ?? 0;
      return tb - ta;
    });
    return list;
  }, [village.components, trafficByComp, sortBy]);

  const topEdges = useMemo(() => {
    const arr = village.connections
      .map((c) => ({
        conn: c,
        traffic: edgeTraffic[c.id] ?? 0,
        from: village.components.find((x) => x.id === c.from)?.name ?? c.from,
        to: village.components.find((x) => x.id === c.to)?.name ?? c.to,
      }))
      .filter((e) => e.traffic > 0)
      .sort((a, b) => b.traffic - a.traffic)
      .slice(0, 20);
    return arr;
  }, [village.connections, village.components, edgeTraffic]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: selectedId ? 340 : 0,
        bottom: 0,
        width: 380,
        background: 'rgba(11,18,32,0.96)',
        borderLeft: '1px solid #1f2a44',
        color: '#e6edf3',
        zIndex: 9,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          borderBottom: '1px solid #1f2a44',
        }}
      >
        <div>
          <strong style={{ fontSize: 14 }}>📊 Metrics</strong>
          <div style={{ fontSize: 11, color: '#9aa0a6', marginTop: 2 }}>
            Source: {lastScanProvider ?? 'demo (no live scan)'}
          </div>
        </div>
        <button
          onClick={toggle}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#9aa0a6',
            cursor: 'pointer',
            fontSize: 18,
          }}
        >
          ×
        </button>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid #1f2a44' }}>
        {(['summary', 'components', 'edges', 'alerts'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              background: tab === t ? '#1f2a44' : 'transparent',
              color: tab === t ? '#5ec8ff' : '#9aa0a6',
              border: 'none',
              borderBottom: tab === t ? '2px solid #5ec8ff' : '2px solid transparent',
              padding: '8px 0',
              cursor: 'pointer',
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            {t}
            {t === 'alerts' && alerts.length > 0 && (
              <span
                style={{
                  marginLeft: 6,
                  background: '#ef4444',
                  color: '#fff',
                  padding: '1px 6px',
                  borderRadius: 999,
                  fontSize: 10,
                }}
              >
                {alerts.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
        {tab === 'summary' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Card label="Components" value={String(village.components.length)} />
              <Card label="Connections" value={String(village.connections.length)} />
              <Card label="Active edges" value={String(Object.keys(edgeTraffic).length)} accent="#5ec8ff" />
              <Card label="Active alerts" value={String(alerts.length)} accent={alerts.length ? '#ef4444' : undefined} />
            </div>

            <div style={{ marginTop: 16 }}>
              <SectionTitle>Health distribution</SectionTitle>
              <HealthBar healthy={totals.healthy} degraded={totals.degraded} down={totals.down} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: '#9aa0a6' }}>
                <span><Dot color="#22c55e" /> {totals.healthy} healthy</span>
                <span><Dot color="#f59e0b" /> {totals.degraded} degraded</span>
                <span><Dot color="#ef4444" /> {totals.down} down</span>
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <SectionTitle>Top kinds</SectionTitle>
              <KindBreakdown components={village.components} />
            </div>
          </>
        )}

        {tab === 'components' && (
          <>
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              {(['traffic', 'health', 'name', 'kind'] as ComponentSort[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  style={{
                    background: sortBy === s ? '#5ec8ff' : '#1f2a44',
                    color: sortBy === s ? '#0b1220' : '#9aa0a6',
                    border: 'none',
                    padding: '4px 10px',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 10,
                    textTransform: 'uppercase',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
            <table style={tableStyle}>
              <thead>
                <tr style={trHead}>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Kind</th>
                  <th style={thStyle}>Health</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Traffic</th>
                </tr>
              </thead>
              <tbody>
                {sortedComponents.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => select(c.id)}
                    style={{ cursor: 'pointer', borderBottom: '1px solid #1f2a44' }}
                  >
                    <td style={tdStyle} title={c.id}>{c.name}</td>
                    <td style={{ ...tdStyle, color: '#9aa0a6' }}>{c.kind}</td>
                    <td style={tdStyle}><HealthDot value={c.health} /></td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: '#5ec8ff' }}>
                      {fmtTraffic(trafficByComp[c.id] ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {tab === 'edges' && (
          topEdges.length === 0 ? (
            <Empty>No active traffic. Toggle 📈 Live metrics or ▶ Simulate.</Empty>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr style={trHead}>
                  <th style={thStyle}>From → To</th>
                  <th style={thStyle}>Protocol</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Traffic</th>
                </tr>
              </thead>
              <tbody>
                {topEdges.map((e) => (
                  <tr key={e.conn.id} style={{ borderBottom: '1px solid #1f2a44' }}>
                    <td style={tdStyle}>{e.from} → {e.to}</td>
                    <td style={{ ...tdStyle, color: '#9aa0a6' }}>{e.conn.protocol ?? '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: '#5ec8ff' }}>
                      {fmtTraffic(e.traffic)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {tab === 'alerts' && (
          alerts.length === 0 ? (
            <Empty>No active alerts.</Empty>
          ) : (
            <div>
              {alerts.slice().reverse().map((a) => {
                const comp = village.components.find((c) => c.id === a.componentId);
                const sevColor = a.severity === 'critical' ? '#ef4444' : a.severity === 'warning' ? '#f59e0b' : '#5ec8ff';
                return (
                  <div
                    key={a.id}
                    onClick={() => comp && select(comp.id)}
                    style={{
                      borderLeft: `3px solid ${sevColor}`,
                      padding: '8px 10px',
                      marginBottom: 6,
                      background: '#1f2a44',
                      borderRadius: 4,
                      cursor: comp ? 'pointer' : 'default',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                      <strong style={{ color: sevColor, textTransform: 'uppercase' }}>{a.severity}</strong>
                      <span style={{ color: '#9aa0a6' }}>{new Date(a.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>
                      {comp?.name ?? a.componentId} — {a.message}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}

function Card({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div
      style={{
        background: '#1f2a44',
        borderRadius: 6,
        padding: '10px 12px',
        border: '1px solid #2a3a5a',
      }}
    >
      <div style={{ fontSize: 10, color: '#9aa0a6', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: accent ?? '#e6edf3', marginTop: 4 }}>{value}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, color: '#5ec8ff', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
      {children}
    </div>
  );
}

function HealthBar({ healthy, degraded, down }: { healthy: number; degraded: number; down: number }) {
  const total = Math.max(1, healthy + degraded + down);
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#1f2a44' }}>
      {healthy > 0 && <div style={{ width: pct(healthy), background: '#22c55e' }} />}
      {degraded > 0 && <div style={{ width: pct(degraded), background: '#f59e0b' }} />}
      {down > 0 && <div style={{ width: pct(down), background: '#ef4444' }} />}
    </div>
  );
}

function KindBreakdown({ components }: { components: ReturnType<typeof useStore.getState>['village']['components'] }) {
  const counts: Record<string, number> = {};
  for (const c of components) counts[c.kind] = (counts[c.kind] ?? 0) + 1;
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...sorted.map(([, v]) => v));
  return (
    <div>
      {sorted.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <span style={{ fontSize: 11, color: '#9aa0a6', width: 80 }}>{k}</span>
          <div style={{ flex: 1, height: 6, background: '#1f2a44', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${(v / max) * 100}%`, height: '100%', background: '#5ec8ff' }} />
          </div>
          <span style={{ fontSize: 11, color: '#e6edf3', width: 24, textAlign: 'right' }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

function HealthDot({ value }: { value: HealthStatus }) {
  const colors: Record<HealthStatus, string> = { healthy: '#22c55e', degraded: '#f59e0b', down: '#ef4444' };
  return <span style={{ color: colors[value] }}>● {value}</span>;
}

function Dot({ color }: { color: string }) {
  return <span style={{ color }}>●</span>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ color: '#9aa0a6', fontSize: 12, textAlign: 'center', marginTop: 20 }}>{children}</div>;
}

function fmtTraffic(v: number): string {
  if (v <= 0) return '—';
  if (v < 10) return v.toFixed(1);
  return Math.round(v).toString();
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 12,
};

const trHead: React.CSSProperties = {
  textAlign: 'left',
  color: '#9aa0a6',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  borderBottom: '1px solid #1f2a44',
};

const thStyle: React.CSSProperties = {
  padding: '6px 4px',
  fontWeight: 500,
};

const tdStyle: React.CSSProperties = {
  padding: '6px 4px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: 130,
};
