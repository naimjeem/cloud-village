import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { VillageComponent } from '../types';
import { useStore } from '../store';

interface Props {
  component: VillageComponent;
}

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

const LABEL_MAX_CHARS = 22;

// Strip common scanner prefixes + truncate; full name shown in tooltip.
function prettyName(raw: string): string {
  let s = raw;
  for (const prefix of ['ctr_', 'vol_', 'svc_', 'fn_', 'tbl_', 'q_', 'lb_', 'arn:aws:']) {
    if (s.startsWith(prefix)) {
      s = s.slice(prefix.length);
      break;
    }
  }
  // collapse runs of underscores into single space, keep hyphens (identifier-friendly)
  s = s.replace(/_+/g, ' ').trim();
  if (s.length > LABEL_MAX_CHARS) {
    s = s.slice(0, LABEL_MAX_CHARS - 1).trimEnd() + '…';
  }
  return s || raw;
}

const HEALTH_GLOW: Record<VillageComponent['health'], string> = {
  healthy:  '#22c55e',
  degraded: '#f59e0b',
  down:     '#ef4444',
};

// Per-kind material params for PBR feel
const KIND_MAT: Record<VillageComponent['kind'], { roughness: number; metalness: number }> = {
  compute:    { roughness: 0.85, metalness: 0.05 },
  storage:    { roughness: 0.7,  metalness: 0.25 },
  database:   { roughness: 0.4,  metalness: 0.55 },
  queue:      { roughness: 0.8,  metalness: 0.1 },
  gateway:    { roughness: 0.75, metalness: 0.2 },
  cdn:        { roughness: 0.35, metalness: 0.6 },
  monitoring: { roughness: 0.55, metalness: 0.45 },
  auth:       { roughness: 0.8,  metalness: 0.1 },
  cache:      { roughness: 0.6,  metalness: 0.2 },
  external:   { roughness: 0.9,  metalness: 0.0 },
};

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffffffff;
}

export function Building({ component }: Props) {
  const ref = useRef<THREE.Group>(null);
  const select = useStore((s) => s.select);
  const selected = useStore((s) => s.selectedId === component.id);
  const alerts = useStore((s) =>
    s.alerts.filter((a) => a.componentId === component.id)
  );
  const search = useStore((s) => s.search.toLowerCase());
  const matchSearch =
    !search ||
    component.name.toLowerCase().includes(search) ||
    component.kind.toLowerCase().includes(search) ||
    component.id.toLowerCase().includes(search);

  const baseColor = KIND_COLOR[component.kind];
  const healthColor = HEALTH_GLOW[component.health];
  const mat = KIND_MAT[component.kind];

  // Deterministic jitter so buildings don't all look stamped
  const jitter = useMemo(() => {
    const h1 = hashStr(component.id);
    const h2 = hashStr(component.id + 'r');
    return {
      yRot: (h1 - 0.5) * 0.6,
      scaleVar: 0.88 + h2 * 0.24,
    };
  }, [component.id]);

  const pulseAmt = useRef(0);

  useFrame((_, dt) => {
    if (!ref.current) return;
    const hasCritical = alerts.some((a) => a.severity === 'critical');
    const target = hasCritical || component.health === 'down' ? 1 : component.health === 'degraded' ? 0.5 : 0;
    pulseAmt.current = THREE.MathUtils.lerp(pulseAmt.current, target, dt * 4);
    const t = performance.now() * 0.005;
    const scale = jitter.scaleVar * (1 + Math.sin(t) * 0.04 * pulseAmt.current);
    ref.current.scale.setScalar(scale);
  });

  const geo = useMemo(() => buildingGeo(component.kind), [component.kind]);

  return (
    <group
      ref={ref}
      position={[component.position[0], 0, component.position[1]]}
      rotation={[0, jitter.yRot, 0]}
      onClick={(e) => {
        e.stopPropagation();
        select(component.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'default';
      }}
    >
      {/* Stone plinth under every building */}
      <mesh position={[0, 0.06, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.55, 1.7, 0.12, 16]} />
        <meshStandardMaterial color="#8b8478" roughness={0.95} metalness={0.05} />
      </mesh>

      {geo.map((part, i) => (
        <mesh
          key={i}
          position={part.position}
          rotation={part.rotation || [0, 0, 0]}
          castShadow
          receiveShadow
        >
          {part.geometry}
          <meshStandardMaterial
            color={part.color || baseColor}
            roughness={part.roughness ?? mat.roughness}
            metalness={part.metalness ?? mat.metalness}
            emissive={selected ? '#9fdcff' : part.emissive ?? healthColor}
            emissiveIntensity={
              selected
                ? 0.45
                : part.emissive
                ? part.emissiveIntensity ?? 1.4
                : pulseAmt.current * 0.7
            }
            transparent
            opacity={matchSearch ? 1 : 0.18}
          />
        </mesh>
      ))}

      <Html position={[0, 3.6, 0]} center distanceFactor={14} occlude={false}>
        <div
          title={`${component.name}\n${component.kind} · ${component.provider} · ${component.health}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(11,18,32,0.88)',
            color: '#e6edf3',
            padding: '3px 10px 3px 7px',
            borderRadius: 999,
            fontSize: 11,
            whiteSpace: 'nowrap',
            border: `1px solid ${selected ? '#5ec8ff' : '#1f2a44'}`,
            pointerEvents: 'none',
            boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
            fontWeight: 500,
            letterSpacing: 0.2,
            maxWidth: 220,
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: healthColor,
              boxShadow: `0 0 5px ${healthColor}`,
              flexShrink: 0,
            }}
            aria-label={component.health}
          />
          <span style={{ fontSize: 12, lineHeight: 1 }} aria-hidden>
            {KIND_ICON[component.kind]}
          </span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {prettyName(component.name)}
          </span>
        </div>
      </Html>
    </group>
  );
}

interface Part {
  position: [number, number, number];
  rotation?: [number, number, number];
  geometry: JSX.Element;
  color?: string;
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
}

const WINDOW_GLOW = '#ffe7a0';

function buildingGeo(kind: VillageComponent['kind']): Part[] {
  switch (kind) {
    case 'compute':
      // house: box + pitched roof + lit windows
      return [
        { position: [0, 0.75, 0], geometry: <boxGeometry args={[2, 1.5, 2]} /> },
        // 4 windows
        { position: [-0.5, 0.85, 1.01], geometry: <boxGeometry args={[0.35, 0.4, 0.05]} />, color: WINDOW_GLOW, emissive: WINDOW_GLOW, emissiveIntensity: 1.8, roughness: 0.3 },
        { position: [0.5, 0.85, 1.01], geometry: <boxGeometry args={[0.35, 0.4, 0.05]} />, color: WINDOW_GLOW, emissive: WINDOW_GLOW, emissiveIntensity: 1.8, roughness: 0.3 },
        { position: [-0.5, 0.85, -1.01], geometry: <boxGeometry args={[0.35, 0.4, 0.05]} />, color: WINDOW_GLOW, emissive: WINDOW_GLOW, emissiveIntensity: 1.2, roughness: 0.3 },
        { position: [0.5, 0.85, -1.01], geometry: <boxGeometry args={[0.35, 0.4, 0.05]} />, color: WINDOW_GLOW, emissive: WINDOW_GLOW, emissiveIntensity: 1.2, roughness: 0.3 },
        // door
        { position: [0, 0.35, 1.01], geometry: <boxGeometry args={[0.4, 0.7, 0.05]} />, color: '#3a2418', roughness: 0.8 },
        // chimney
        { position: [0.6, 1.95, -0.4], geometry: <boxGeometry args={[0.3, 0.7, 0.3]} />, color: '#8a6e58', roughness: 0.9 },
        // roof
        { position: [0, 1.9, 0], rotation: [0, Math.PI / 4, 0], geometry: <coneGeometry args={[1.7, 1.3, 4]} />, color: '#7a2e22', roughness: 0.85 },
      ];
    case 'storage':
      // silo + roof + bands
      return [
        { position: [0, 1.25, 0], geometry: <cylinderGeometry args={[1.1, 1.1, 2.5, 24]} /> },
        // ring bands
        { position: [0, 0.6, 0], geometry: <cylinderGeometry args={[1.12, 1.12, 0.1, 24]} />, color: '#7a6238', roughness: 0.6, metalness: 0.5 },
        { position: [0, 1.4, 0], geometry: <cylinderGeometry args={[1.12, 1.12, 0.1, 24]} />, color: '#7a6238', roughness: 0.6, metalness: 0.5 },
        { position: [0, 2.2, 0], geometry: <cylinderGeometry args={[1.12, 1.12, 0.1, 24]} />, color: '#7a6238', roughness: 0.6, metalness: 0.5 },
        // hatch
        { position: [0, 2.55, 1.05], geometry: <boxGeometry args={[0.4, 0.4, 0.1]} />, color: '#3a3a3a', roughness: 0.5, metalness: 0.6 },
        // top cap
        { position: [0, 2.85, 0], geometry: <coneGeometry args={[1.1, 0.7, 24]} />, color: '#7a5e2e', roughness: 0.6, metalness: 0.4 },
      ];
    case 'database':
      // stacked vault discs w/ rivets
      return [
        { position: [0, 0.4, 0], geometry: <cylinderGeometry args={[1.25, 1.3, 0.75, 32]} /> },
        { position: [0, 1.15, 0], geometry: <cylinderGeometry args={[1.05, 1.1, 0.75, 32]} /> },
        { position: [0, 1.9, 0], geometry: <cylinderGeometry args={[0.85, 0.9, 0.75, 32]} /> },
        { position: [0, 2.4, 0], geometry: <cylinderGeometry args={[0.55, 0.7, 0.25, 24]} />, color: '#5a4ea8', metalness: 0.7, roughness: 0.3 },
        // pulse beacon
        { position: [0, 2.65, 0], geometry: <sphereGeometry args={[0.18, 16, 16]} />, color: '#a4c4ff', emissive: '#7ba6ff', emissiveIntensity: 1.5, roughness: 0.2 },
      ];
    case 'queue':
      // long post-office box + flag pole + flag + slot
      return [
        { position: [0, 0.6, 0], geometry: <boxGeometry args={[2.8, 1.2, 1.4]} /> },
        { position: [0, 1.32, 0], geometry: <boxGeometry args={[2.85, 0.15, 1.45]} />, color: '#7a4a26', roughness: 0.85 },
        // slot
        { position: [0, 0.85, 0.71], geometry: <boxGeometry args={[0.9, 0.18, 0.05]} />, color: '#222', roughness: 0.6 },
        // pole + flag
        { position: [1.3, 1.85, 0], geometry: <boxGeometry args={[0.08, 1.5, 0.08]} />, color: '#3a3a3a', metalness: 0.6, roughness: 0.4 },
        { position: [1.6, 2.3, 0], geometry: <boxGeometry args={[0.55, 0.35, 0.04]} />, color: '#cf3e3e', roughness: 0.7 },
      ];
    case 'gateway':
      // arched town gate
      return [
        { position: [-1.1, 1.1, 0], geometry: <boxGeometry args={[0.5, 2.2, 0.55]} /> },
        { position: [1.1, 1.1, 0], geometry: <boxGeometry args={[0.5, 2.2, 0.55]} /> },
        { position: [0, 2.25, 0], geometry: <boxGeometry args={[2.6, 0.35, 0.55]} /> },
        // crest
        { position: [0, 2.55, 0], geometry: <boxGeometry args={[1.0, 0.25, 0.6]} />, color: '#7a4a2a' },
        // banners
        { position: [-1.1, 1.5, 0.28], geometry: <boxGeometry args={[0.3, 1.0, 0.04]} />, color: '#cf3e3e', roughness: 0.6 },
        { position: [1.1, 1.5, 0.28], geometry: <boxGeometry args={[0.3, 1.0, 0.04]} />, color: '#cf3e3e', roughness: 0.6 },
      ];
    case 'cdn':
      // tower + dish + blinking beacon
      return [
        { position: [0, 1.5, 0], geometry: <cylinderGeometry args={[0.18, 0.45, 3.0, 12]} /> },
        // lattice rings
        { position: [0, 1.0, 0], geometry: <torusGeometry args={[0.35, 0.04, 6, 16]} />, rotation: [-Math.PI / 2, 0, 0], color: '#8aa3b8', metalness: 0.6, roughness: 0.4 },
        { position: [0, 2.0, 0], geometry: <torusGeometry args={[0.28, 0.04, 6, 16]} />, rotation: [-Math.PI / 2, 0, 0], color: '#8aa3b8', metalness: 0.6, roughness: 0.4 },
        // dish
        { position: [0, 2.8, 0.3], geometry: <sphereGeometry args={[0.35, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />, rotation: [Math.PI / 4, 0, 0], color: '#cbd5e0', metalness: 0.8, roughness: 0.2 },
        // beacon
        { position: [0, 3.35, 0], geometry: <sphereGeometry args={[0.16, 12, 12]} />, color: '#ff4d4d', emissive: '#ff3030', emissiveIntensity: 2.5 },
      ];
    case 'monitoring':
      // tall watchtower w/ lookout
      return [
        { position: [0, 1.25, 0], geometry: <cylinderGeometry args={[0.7, 0.95, 2.5, 16]} /> },
        { position: [0, 2.65, 0], geometry: <cylinderGeometry args={[1.05, 1.05, 0.4, 16]} />, color: '#666', roughness: 0.6, metalness: 0.4 },
        { position: [0, 3.1, 0], geometry: <coneGeometry args={[1.0, 0.55, 16]} />, color: '#3a3a3a', roughness: 0.5 },
        // lookout window glow
        { position: [0, 2.65, 1.06], geometry: <boxGeometry args={[0.5, 0.25, 0.05]} />, color: WINDOW_GLOW, emissive: WINDOW_GLOW, emissiveIntensity: 1.6 },
        // searchlight
        { position: [0, 3.55, 0], geometry: <sphereGeometry args={[0.12, 12, 12]} />, color: '#ffe6a0', emissive: '#ffe6a0', emissiveIntensity: 2.2 },
      ];
    case 'auth':
      // guardhouse w/ slit + lantern
      return [
        { position: [0, 0.7, 0], geometry: <boxGeometry args={[1.7, 1.4, 1.7]} /> },
        { position: [0, 1.55, 0], geometry: <boxGeometry args={[1.85, 0.18, 1.85]} />, color: '#384e34', roughness: 0.9 },
        { position: [0, 0.9, 0.86], geometry: <boxGeometry args={[1.0, 0.2, 0.04]} />, color: '#1c1c1c', roughness: 0.5 },
        // lantern
        { position: [0.95, 1.0, 0.95], geometry: <sphereGeometry args={[0.12, 12, 12]} />, color: '#fff3c4', emissive: '#ffd27a', emissiveIntensity: 2.0 },
      ];
    case 'cache':
      // well w/ roof + bucket
      return [
        { position: [0, 0.4, 0], geometry: <cylinderGeometry args={[0.9, 1.0, 0.85, 20]} /> },
        { position: [0, 0.85, 0], geometry: <torusGeometry args={[0.95, 0.05, 8, 20]} />, rotation: [-Math.PI / 2, 0, 0], color: '#5a4030', roughness: 0.7 },
        { position: [-0.7, 1.15, 0], geometry: <boxGeometry args={[0.1, 1.5, 0.1]} />, color: '#5a3e1e', roughness: 0.95 },
        { position: [0.7, 1.15, 0], geometry: <boxGeometry args={[0.1, 1.5, 0.1]} />, color: '#5a3e1e', roughness: 0.95 },
        { position: [0, 1.95, 0], rotation: [0, 0, 0], geometry: <coneGeometry args={[1.1, 0.5, 4]} />, color: '#7a2e22', roughness: 0.85 },
        // bucket
        { position: [0, 0.95, 0], geometry: <cylinderGeometry args={[0.18, 0.22, 0.2, 12]} />, color: '#3a2418', roughness: 0.8 },
      ];
    case 'external':
      // signpost + traveler
      return [
        { position: [0, 0.6, 0], geometry: <cylinderGeometry args={[0.1, 0.12, 1.2, 8]} />, color: '#5a3e1e' },
        // sign plank
        { position: [0.35, 1.1, 0], geometry: <boxGeometry args={[0.8, 0.3, 0.05]} />, color: '#a07e4a', roughness: 0.85 },
        // traveler head
        { position: [0, 1.5, 0], geometry: <sphereGeometry args={[0.35, 14, 14]} />, color: '#e8c19a', roughness: 0.7 },
      ];
  }
}
