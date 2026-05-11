import { useMemo } from 'react';
import * as THREE from 'three';
import type { Connection, VillageComponent } from '../types';
import { useStore } from '../store';

interface Props {
  components: VillageComponent[];
  connections: Connection[];
}

export function Roads({ components, connections }: Props) {
  const byId = useMemo(() => {
    const m = new Map<string, VillageComponent>();
    for (const c of components) m.set(c.id, c);
    return m;
  }, [components]);

  const traffic = useStore((s) => s.edgeTraffic);
  const search = useStore((s) => s.search.toLowerCase());

  return (
    <group>
      {connections.map((conn) => {
        const a = byId.get(conn.from);
        const b = byId.get(conn.to);
        if (!a || !b) return null;
        const t = traffic[conn.id] ?? 0;
        const matchSearch =
          !search ||
          a.name.toLowerCase().includes(search) ||
          b.name.toLowerCase().includes(search) ||
          (conn.label?.toLowerCase().includes(search) ?? false);
        return (
          <RoadSegment
            key={conn.id}
            a={a.position}
            b={b.position}
            traffic={t}
            dimmed={!matchSearch}
          />
        );
      })}
    </group>
  );
}

function RoadSegment({
  a,
  b,
  traffic,
  dimmed,
}: {
  a: [number, number];
  b: [number, number];
  traffic: number;
  dimmed: boolean;
}) {
  const { position, rotation, length } = useMemo(() => {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    const angle = Math.atan2(dz, dx);
    return {
      position: [(a[0] + b[0]) / 2, 0.02, (a[1] + b[1]) / 2] as [number, number, number],
      rotation: [-Math.PI / 2, 0, -angle] as [number, number, number],
      length: len,
    };
  }, [a, b]);

  // heatmap: color brown→orange→red as traffic rises
  const intensity = Math.min(1, traffic / 4);
  const baseColor = new THREE.Color('#8a7a5a').lerp(new THREE.Color('#ff6a3a'), intensity);
  const width = 0.5 + intensity * 0.6;

  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[length, width]} />
      <meshStandardMaterial
        color={baseColor}
        emissive={baseColor}
        emissiveIntensity={intensity * 0.4}
        transparent
        opacity={dimmed ? 0.18 : 0.95}
      />
    </mesh>
  );
}
