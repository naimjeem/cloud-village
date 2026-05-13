import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import type { VillageComponent, Connection } from '../types';

const KIND_COLOR: Record<VillageComponent['kind'], string> = {
  compute:    '#d97757',
  storage:    '#c9a96e',
  database:   '#7b6cf6',
  queue:      '#e8b04f',
  gateway:    '#a05a3a',
  cdn:        '#6ab7d9',
  monitoring: '#9aa0a6',
  auth:       '#5fa362',
  cache:      '#8fc1e6',
  external:   '#cccccc',
};

const KIND_ICON: Record<VillageComponent['kind'], string> = {
  compute:    '🏠',
  storage:    '🛢',
  database:   '🗄',
  queue:      '📮',
  gateway:    '🚪',
  cdn:        '📡',
  monitoring: '🔭',
  auth:       '🛡',
  cache:      '💧',
  external:   '🚶',
};

const HEALTH_COLOR: Record<VillageComponent['health'], string> = {
  healthy:  '#22c55e',
  degraded: '#f59e0b',
  down:     '#ef4444',
};

const PROTOCOL_COLOR: Record<NonNullable<Connection['protocol']>, string> = {
  http:  '#5ec8ff',
  grpc:  '#a78bfa',
  sql:   '#7b6cf6',
  event: '#ffd166',
  tcp:   '#9aa0a6',
};

const NODE_W = 130;
const NODE_H = 44;
const WORLD_SCALE = 22; // multiply Component.position by this to get SVG units

export function Village2D() {
  const village = useStore((s) => s.village);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const search = useStore((s) => s.search.toLowerCase());
  const edgeTraffic = useStore((s) => s.edgeTraffic);
  const alerts = useStore((s) => s.alerts);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const dragState = useRef<{ active: boolean; sx: number; sy: number; px: number; py: number; moved: boolean } | null>(null);

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // node positions in SVG coords (centered around 0,0)
  const nodes = useMemo(() => {
    return village.components.map((c) => ({
      ...c,
      sx: c.position[0] * WORLD_SCALE,
      sy: c.position[1] * WORLD_SCALE,
    }));
  }, [village.components]);

  const nodeById = useMemo(() => {
    const m: Record<string, typeof nodes[number]> = {};
    for (const n of nodes) m[n.id] = n;
    return m;
  }, [nodes]);

  // compute bbox + initial fit
  const bbox = useMemo(() => {
    if (!nodes.length) return { minX: -200, maxX: 200, minY: -200, maxY: 200 };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.sx - NODE_W / 2);
      maxX = Math.max(maxX, n.sx + NODE_W / 2);
      minY = Math.min(minY, n.sy - NODE_H / 2);
      maxY = Math.max(maxY, n.sy + NODE_H / 2);
    }
    return { minX, maxX, minY, maxY };
  }, [nodes]);

  // auto-fit on village change
  useEffect(() => {
    const pad = 80;
    const w = bbox.maxX - bbox.minX + pad * 2;
    const h = bbox.maxY - bbox.minY + pad * 2;
    if (w <= 0 || h <= 0) return;
    const fit = Math.min(viewport.w / w, viewport.h / h);
    const cx = (bbox.minX + bbox.maxX) / 2;
    const cy = (bbox.minY + bbox.maxY) / 2;
    setZoom(Math.min(2, Math.max(0.2, fit)));
    setPan({ x: viewport.w / 2 - cx * Math.min(2, Math.max(0.2, fit)), y: viewport.h / 2 - cy * Math.min(2, Math.max(0.2, fit)) });
  }, [bbox, viewport.w, viewport.h, village.name]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const next = Math.min(4, Math.max(0.15, zoom * factor));
    // zoom around cursor
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const wx = (cx - pan.x) / zoom;
    const wy = (cy - pan.y) / zoom;
    setZoom(next);
    setPan({ x: cx - wx * next, y: cy - wy * next });
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    dragState.current = { active: true, sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y, moved: false };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    const d = dragState.current;
    if (!d || !d.active) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) > 3) d.moved = true;
    setPan({ x: d.px + dx, y: d.py + dy });
  };
  const onMouseUp = () => {
    if (dragState.current) dragState.current.active = false;
  };
  const onBackgroundClick = () => {
    if (dragState.current?.moved) return;
    select(null);
  };

  const resetView = () => {
    const pad = 80;
    const w = bbox.maxX - bbox.minX + pad * 2;
    const h = bbox.maxY - bbox.minY + pad * 2;
    const fit = Math.min(viewport.w / w, viewport.h / h);
    const z = Math.min(2, Math.max(0.2, fit));
    const cx = (bbox.minX + bbox.maxX) / 2;
    const cy = (bbox.minY + bbox.maxY) / 2;
    setZoom(z);
    setPan({ x: viewport.w / 2 - cx * z, y: viewport.h / 2 - cy * z });
  };

  return (
    <div
      ref={wrapRef}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(ellipse at center, #1a2540 0%, #0b1220 70%)',
        cursor: dragState.current?.active ? 'grabbing' : 'grab',
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      <svg
        width={viewport.w}
        height={viewport.h}
        onClick={onBackgroundClick}
        style={{ display: 'block' }}
      >
        <defs>
          {Object.entries(PROTOCOL_COLOR).map(([k, c]) => (
            <marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={c} />
            </marker>
          ))}
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform={`translate(${pan.x % (40 * zoom)} ${pan.y % (40 * zoom)}) scale(${zoom})`}>
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1f2a44" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect x={0} y={0} width={viewport.w} height={viewport.h} fill="url(#grid)" />

        <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
          {/* connections */}
          {village.connections.map((conn) => {
            const a = nodeById[conn.from];
            const b = nodeById[conn.to];
            if (!a || !b) return null;
            const proto = (conn.protocol ?? 'http') as keyof typeof PROTOCOL_COLOR;
            const color = PROTOCOL_COLOR[proto] ?? '#5ec8ff';
            const traffic = edgeTraffic[conn.id] ?? 0;
            const width = 1 + Math.min(4, traffic * 0.5);
            const selectedEdge = selectedId && (selectedId === conn.from || selectedId === conn.to);
            const dimmed = !!search && !(matchSearchComp(a, search) || matchSearchComp(b, search));
            const mx = (a.sx + b.sx) / 2;
            const my = (a.sy + b.sy) / 2 - Math.hypot(b.sx - a.sx, b.sy - a.sy) * 0.08;
            return (
              <g key={conn.id} opacity={dimmed ? 0.12 : selectedEdge ? 1 : 0.55}>
                <path
                  d={`M ${a.sx} ${a.sy} Q ${mx} ${my} ${b.sx} ${b.sy}`}
                  fill="none"
                  stroke={color}
                  strokeWidth={width}
                  markerEnd={`url(#arrow-${proto})`}
                />
                {conn.label && zoom > 0.6 && (
                  <text x={mx} y={my - 4} fontSize={10} fill="#9aa0a6" textAnchor="middle" pointerEvents="none">
                    {conn.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* nodes */}
          {nodes.map((n) => {
            const selected = selectedId === n.id;
            const dimmed = !!search && !matchSearchComp(n, search);
            const hasCritical = alerts.some((a) => a.componentId === n.id && a.severity === 'critical');
            const kindColor = KIND_COLOR[n.kind];
            const healthColor = HEALTH_COLOR[n.health];
            return (
              <g
                key={n.id}
                transform={`translate(${n.sx - NODE_W / 2} ${n.sy - NODE_H / 2})`}
                opacity={dimmed ? 0.2 : 1}
                style={{ cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (dragState.current?.moved) return;
                  select(n.id);
                }}
              >
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={8}
                  fill={kindColor}
                  fillOpacity={0.92}
                  stroke={selected ? '#5ec8ff' : hasCritical ? '#ef4444' : healthColor}
                  strokeWidth={selected ? 3 : 2}
                />
                <circle cx={10} cy={10} r={4} fill={healthColor}>
                  {hasCritical && (
                    <animate attributeName="r" values="4;6;4" dur="1s" repeatCount="indefinite" />
                  )}
                </circle>
                <text x={NODE_W / 2} y={20} fontSize={14} textAnchor="middle" pointerEvents="none">
                  {KIND_ICON[n.kind]}
                </text>
                <text
                  x={NODE_W / 2}
                  y={36}
                  fontSize={11}
                  fontWeight={600}
                  fill="#0b1220"
                  textAnchor="middle"
                  pointerEvents="none"
                >
                  <title>{n.name} · {n.kind} · {n.provider} · {n.health}</title>
                  {truncateName(n.name)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      <div
        style={{
          position: 'absolute',
          bottom: 12,
          right: 12,
          display: 'flex',
          gap: 6,
          background: 'rgba(11,18,32,0.85)',
          border: '1px solid #1f2a44',
          borderRadius: 8,
          padding: 6,
          zIndex: 4,
        }}
      >
        <ViewBtn onClick={() => setZoom((z) => Math.min(4, z * 1.2))}>＋</ViewBtn>
        <ViewBtn onClick={() => setZoom((z) => Math.max(0.15, z * 0.8))}>−</ViewBtn>
        <ViewBtn onClick={resetView}>⤧ fit</ViewBtn>
        <span style={{ fontSize: 10, color: '#9aa0a6', alignSelf: 'center', padding: '0 6px' }}>
          {Math.round(zoom * 100)}%
        </span>
      </div>
    </div>
  );
}

function ViewBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        background: '#1f2a44',
        border: '1px solid #2a3a5a',
        color: '#e6edf3',
        padding: '4px 10px',
        borderRadius: 4,
        cursor: 'pointer',
        fontSize: 12,
        lineHeight: 1,
      }}
    >
      {children}
    </button>
  );
}

function matchSearchComp(c: VillageComponent, q: string): boolean {
  return (
    c.name.toLowerCase().includes(q) ||
    c.kind.toLowerCase().includes(q) ||
    c.id.toLowerCase().includes(q)
  );
}

function truncateName(raw: string): string {
  let s = raw;
  for (const prefix of ['ctr_', 'vol_', 'svc_', 'fn_', 'tbl_', 'q_', 'lb_', 'arn:aws:']) {
    if (s.startsWith(prefix)) {
      s = s.slice(prefix.length);
      break;
    }
  }
  s = s.replace(/_+/g, ' ').trim();
  if (s.length > 16) s = s.slice(0, 15).trimEnd() + '…';
  return s || raw;
}
