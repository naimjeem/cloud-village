import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store';

export function FlowParticles() {
  const flows = useStore((s) => s.flows);
  const village = useStore((s) => s.village);
  const tickFlows = useStore((s) => s.tickFlows);

  const compMap = useMemo(() => {
    const m = new Map<string, [number, number]>();
    for (const c of village.components) m.set(c.id, c.position);
    return m;
  }, [village.components]);

  const connMap = useMemo(() => {
    const m = new Map<string, { a: [number, number]; b: [number, number] }>();
    for (const c of village.connections) {
      const a = compMap.get(c.from);
      const b = compMap.get(c.to);
      if (a && b) m.set(c.id, { a, b });
    }
    return m;
  }, [village.connections, compMap]);

  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, dt) => {
    tickFlows(Math.min(dt, 0.05));
  });

  return (
    <group ref={groupRef}>
      {flows.map((f) => {
        const seg = connMap.get(f.connectionId);
        if (!seg) return null;
        const x = seg.a[0] + (seg.b[0] - seg.a[0]) * f.progress;
        const z = seg.a[1] + (seg.b[1] - seg.a[1]) * f.progress;
        // arc up: peak at progress=0.5
        const y = 0.4 + Math.sin(f.progress * Math.PI) * 0.8;
        return (
          <mesh key={f.id} position={[x, y, z]}>
            <sphereGeometry args={[0.18, 12, 12]} />
            <meshStandardMaterial
              color={f.color}
              emissive={f.color}
              emissiveIntensity={1.2}
              toneMapped={false}
            />
          </mesh>
        );
      })}
    </group>
  );
}
