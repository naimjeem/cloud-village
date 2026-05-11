import { MeshReflectorMaterial } from '@react-three/drei';

export function Ground() {
  return (
    <group>
      {/* Outer water ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
        <planeGeometry args={[300, 300]} />
        <MeshReflectorMaterial
          blur={[400, 100]}
          resolution={1024}
          mixBlur={1}
          mixStrength={1.5}
          roughness={0.85}
          depthScale={0.4}
          minDepthThreshold={0.3}
          maxDepthThreshold={1.2}
          color="#26415c"
          metalness={0.4}
          mirror={0.35}
        />
      </mesh>

      {/* Main grass island */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <circleGeometry args={[60, 64]} />
        <meshStandardMaterial color="#4a6e3a" roughness={0.95} metalness={0} />
      </mesh>

      {/* Inner lawn (slightly lighter, sits 0.01 above) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} receiveShadow>
        <circleGeometry args={[48, 64]} />
        <meshStandardMaterial color="#5e8949" roughness={0.92} metalness={0} />
      </mesh>

      {/* Path ring (dirt) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[26, 28, 64]} />
        <meshStandardMaterial color="#8a7152" roughness={1} metalness={0} />
      </mesh>

      {/* Plaza (center disc) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} receiveShadow>
        <circleGeometry args={[4, 32]} />
        <meshStandardMaterial color="#9f8a6c" roughness={0.85} metalness={0} />
      </mesh>
    </group>
  );
}
