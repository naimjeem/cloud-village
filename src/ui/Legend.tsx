const items: Array<[string, string]> = [
  ['🏠 compute', '#d97757'],
  ['🛢 storage', '#c9a96e'],
  ['🗄 database', '#7b6cf6'],
  ['📮 queue', '#e8b04f'],
  ['🚪 gateway', '#a05a3a'],
  ['📡 cdn', '#6ab7d9'],
  ['🔭 monitoring', '#9aa0a6'],
  ['🛡 auth', '#5fa362'],
  ['💧 cache', '#8fc1e6'],
  ['🚶 external', '#cccccc'],
];

export function Legend() {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 12,
        left: 12,
        background: 'rgba(11,18,32,0.85)',
        border: '1px solid #1f2a44',
        borderRadius: 8,
        padding: 10,
        fontSize: 11,
        color: '#e6edf3',
        zIndex: 10,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '4px 14px',
      }}
    >
      {items.map(([label, color]) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, background: color, borderRadius: 2, display: 'inline-block' }} />
          {label}
        </div>
      ))}
    </div>
  );
}
