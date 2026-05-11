import { useMemo } from 'react';
import type { VillageComponent } from '../types';

interface PropsProps {
  components: VillageComponent[];
  nightBoost?: boolean;
}

/**
 * Decorative ambient props: trees, lamp posts, hedges.
 * Placed deterministically using a seeded RNG so the layout is stable per render.
 */
export function Props({ components, nightBoost }: PropsProps) {
  const items = useMemo(() => generateProps(components), [components]);
  return (
    <group>
      {items.map((p, i) => {
        if (p.type === 'tree') return <Tree key={i} pos={p.pos} scale={p.scale} />;
        if (p.type === 'bush') return <Bush key={i} pos={p.pos} scale={p.scale} />;
        if (p.type === 'lamp') return <Lamp key={i} pos={p.pos} bright={!!nightBoost} />;
        return null;
      })}
    </group>
  );
}

type Prop =
  | { type: 'tree'; pos: [number, number, number]; scale: number }
  | { type: 'bush'; pos: [number, number, number]; scale: number }
  | { type: 'lamp'; pos: [number, number, number] };

function generateProps(components: VillageComponent[]): Prop[] {
  const occupied = new Set<string>();
  for (const c of components) {
    const k = `${Math.round(c.position[0])}_${Math.round(c.position[1])}`;
    occupied.add(k);
  }
  // simple PRNG seeded by component count
  let seed = components.length * 9301 + 49297;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  const props: Prop[] = [];
  const radius = 44;
  // 40 trees scattered in outer ring
  for (let i = 0; i < 40; i++) {
    const angle = rand() * Math.PI * 2;
    const r = 30 + rand() * 14;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const k = `${Math.round(x)}_${Math.round(z)}`;
    if (occupied.has(k)) continue;
    props.push({ type: 'tree', pos: [x, 0, z], scale: 0.7 + rand() * 0.7 });
  }
  // 25 bushes
  for (let i = 0; i < 25; i++) {
    const angle = rand() * Math.PI * 2;
    const r = 10 + rand() * 36;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const k = `${Math.round(x)}_${Math.round(z)}`;
    if (occupied.has(k)) continue;
    if (Math.hypot(x, z) > radius) continue;
    props.push({ type: 'bush', pos: [x, 0, z], scale: 0.5 + rand() * 0.5 });
  }
  // 8 lamp posts along path ring
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const r = 27;
    props.push({ type: 'lamp', pos: [Math.cos(angle) * r, 0, Math.sin(angle) * r] });
  }
  return props;
}

function Tree({ pos, scale }: { pos: [number, number, number]; scale: number }) {
  return (
    <group position={pos} scale={scale} castShadow>
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.16, 1.0, 8]} />
        <meshStandardMaterial color="#5b3a22" roughness={1} />
      </mesh>
      <mesh position={[0, 1.5, 0]} castShadow>
        <coneGeometry args={[0.7, 1.4, 12]} />
        <meshStandardMaterial color="#2f6b3c" roughness={0.9} />
      </mesh>
      <mesh position={[0, 2.05, 0]} castShadow>
        <coneGeometry args={[0.55, 1.0, 12]} />
        <meshStandardMaterial color="#3a824a" roughness={0.9} />
      </mesh>
    </group>
  );
}

function Bush({ pos, scale }: { pos: [number, number, number]; scale: number }) {
  return (
    <group position={pos} scale={scale}>
      <mesh position={[0, 0.25, 0]} castShadow>
        <sphereGeometry args={[0.4, 12, 10]} />
        <meshStandardMaterial color="#4a8a4a" roughness={1} />
      </mesh>
      <mesh position={[0.3, 0.18, 0.1]} castShadow>
        <sphereGeometry args={[0.28, 10, 8]} />
        <meshStandardMaterial color="#5fa057" roughness={1} />
      </mesh>
    </group>
  );
}

function Lamp({ pos, bright }: { pos: [number, number, number]; bright: boolean }) {
  return (
    <group position={pos}>
      <mesh position={[0, 0.05, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.22, 0.1, 12]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.5} metalness={0.6} />
      </mesh>
      <mesh position={[0, 1.2, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.05, 2.3, 8]} />
        <meshStandardMaterial color="#1f1f1f" roughness={0.4} metalness={0.7} />
      </mesh>
      <mesh position={[0, 2.4, 0]} castShadow>
        <sphereGeometry args={[0.18, 12, 10]} />
        <meshStandardMaterial
          color="#fff3c4"
          emissive="#ffd27a"
          emissiveIntensity={bright ? 3.8 : 1.4}
          roughness={0.4}
        />
      </mesh>
      <pointLight
        position={[0, 2.4, 0]}
        intensity={bright ? 1.6 : 0.35}
        distance={bright ? 9 : 5}
        color="#ffcf80"
        castShadow={false}
      />
    </group>
  );
}
