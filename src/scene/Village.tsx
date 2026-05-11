import { Canvas, useFrame } from '@react-three/fiber';
import {
  OrbitControls,
  Sky,
  Environment,
  SoftShadows,
  Cloud,
  Clouds,
  ContactShadows,
  AdaptiveDpr,
  AdaptiveEvents,
  Stars,
} from '@react-three/drei';
import {
  EffectComposer,
  Bloom,
  Vignette,
  SMAA,
  BrightnessContrast,
  HueSaturation,
  ToneMapping,
} from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Ground } from './Ground';
import { Building } from './Building';
import { Roads } from './Roads';
import { FlowParticles } from './FlowParticles';
import { Props } from './Props';
import { useStore, type TimePhase } from '../store';

interface PhaseConfig {
  sunPos: [number, number, number];
  sunColor: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  ambColor: string;
  ambIntensity: number;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  envPreset: 'dawn' | 'sunset' | 'night' | 'park' | 'city' | 'forest';
  exposure: number;
  showStars: boolean;
}

const PHASE: Record<TimePhase, PhaseConfig> = {
  dawn: {
    sunPos: [-20, 8, -18],
    sunColor: '#ffc890',
    sunIntensity: 1.8,
    hemiSky: '#ffd0a8',
    hemiGround: '#3a4a6a',
    hemiIntensity: 0.5,
    ambColor: '#e6c8a8',
    ambIntensity: 0.22,
    fogColor: '#c9b69e',
    fogNear: 40,
    fogFar: 140,
    envPreset: 'dawn',
    exposure: 1.0,
    showStars: false,
  },
  day: {
    sunPos: [22, 32, 8],
    sunColor: '#fff4e0',
    sunIntensity: 2.6,
    hemiSky: '#cfe8ff',
    hemiGround: '#3a4a6a',
    hemiIntensity: 0.6,
    ambColor: '#f3e3c8',
    ambIntensity: 0.22,
    fogColor: '#9bb0c8',
    fogNear: 50,
    fogFar: 150,
    envPreset: 'park',
    exposure: 1.15,
    showStars: false,
  },
  dusk: {
    sunPos: [-24, 5, 14],
    sunColor: '#ff8a5a',
    sunIntensity: 1.5,
    hemiSky: '#ff9c66',
    hemiGround: '#3a2a4a',
    hemiIntensity: 0.45,
    ambColor: '#d8907a',
    ambIntensity: 0.2,
    fogColor: '#c08070',
    fogNear: 35,
    fogFar: 130,
    envPreset: 'sunset',
    exposure: 1.05,
    showStars: false,
  },
  night: {
    sunPos: [-18, -2, -20],
    sunColor: '#9ab4d6',
    sunIntensity: 0.22,
    hemiSky: '#1a2a5a',
    hemiGround: '#06101e',
    hemiIntensity: 0.22,
    ambColor: '#2a3858',
    ambIntensity: 0.08,
    fogColor: '#1a2238',
    fogNear: 30,
    fogFar: 110,
    envPreset: 'night',
    exposure: 0.85,
    showStars: true,
  },
};

const PHASE_ORDER: TimePhase[] = ['dawn', 'day', 'dusk', 'night'];

function lerpColor(out: THREE.Color, from: THREE.Color, to: THREE.Color, t: number) {
  out.copy(from).lerp(to, t);
}

function TimeOfDayController({
  dirLightRef,
  hemiLightRef,
  ambLightRef,
  fogRef,
}: {
  dirLightRef: React.RefObject<THREE.DirectionalLight>;
  hemiLightRef: React.RefObject<THREE.HemisphereLight>;
  ambLightRef: React.RefObject<THREE.AmbientLight>;
  fogRef: React.RefObject<THREE.Fog>;
}) {
  const phase = useStore((s) => s.timePhase);
  const autoCycle = useStore((s) => s.autoCycle);
  const cyclePhase = useStore((s) => s.cyclePhase);

  // Animated phase progress: smooth lerp 0..1 between current rendered phase and target
  const current = useRef<TimePhase>(phase);
  const blend = useRef(1);
  const fromCfg = useRef<PhaseConfig>(PHASE[phase]);
  const toCfg = useRef<PhaseConfig>(PHASE[phase]);

  useEffect(() => {
    if (phase === current.current) return;
    fromCfg.current = mixedConfig(fromCfg.current, toCfg.current, blend.current);
    toCfg.current = PHASE[phase];
    current.current = phase;
    blend.current = 0;
  }, [phase]);

  // Auto cycle: every 12s advance to next phase
  useEffect(() => {
    if (!autoCycle) return;
    const t = setInterval(() => cyclePhase(), 12000);
    return () => clearInterval(t);
  }, [autoCycle, cyclePhase]);

  const tmpA = useMemo(() => new THREE.Color(), []);
  const tmpB = useMemo(() => new THREE.Color(), []);
  const tmpOut = useMemo(() => new THREE.Color(), []);

  useFrame((state, dt) => {
    blend.current = Math.min(1, blend.current + dt * 0.6);
    const t = blend.current;
    const from = fromCfg.current;
    const to = toCfg.current;

    if (dirLightRef.current) {
      const d = dirLightRef.current;
      d.position.set(
        THREE.MathUtils.lerp(from.sunPos[0], to.sunPos[0], t),
        THREE.MathUtils.lerp(from.sunPos[1], to.sunPos[1], t),
        THREE.MathUtils.lerp(from.sunPos[2], to.sunPos[2], t)
      );
      tmpA.set(from.sunColor);
      tmpB.set(from.sunColor === to.sunColor ? from.sunColor : to.sunColor);
      tmpB.set(to.sunColor);
      lerpColor(tmpOut, tmpA, tmpB, t);
      d.color.copy(tmpOut);
      d.intensity = THREE.MathUtils.lerp(from.sunIntensity, to.sunIntensity, t);
    }
    if (hemiLightRef.current) {
      tmpA.set(from.hemiSky);
      tmpB.set(to.hemiSky);
      lerpColor(tmpOut, tmpA, tmpB, t);
      hemiLightRef.current.color.copy(tmpOut);
      tmpA.set(from.hemiGround);
      tmpB.set(to.hemiGround);
      lerpColor(tmpOut, tmpA, tmpB, t);
      hemiLightRef.current.groundColor.copy(tmpOut);
      hemiLightRef.current.intensity = THREE.MathUtils.lerp(
        from.hemiIntensity, to.hemiIntensity, t
      );
    }
    if (ambLightRef.current) {
      tmpA.set(from.ambColor);
      tmpB.set(to.ambColor);
      lerpColor(tmpOut, tmpA, tmpB, t);
      ambLightRef.current.color.copy(tmpOut);
      ambLightRef.current.intensity = THREE.MathUtils.lerp(
        from.ambIntensity, to.ambIntensity, t
      );
    }
    if (fogRef.current) {
      tmpA.set(from.fogColor);
      tmpB.set(to.fogColor);
      lerpColor(tmpOut, tmpA, tmpB, t);
      fogRef.current.color.copy(tmpOut);
      fogRef.current.near = THREE.MathUtils.lerp(from.fogNear, to.fogNear, t);
      fogRef.current.far = THREE.MathUtils.lerp(from.fogFar, to.fogFar, t);
    }
    state.gl.toneMappingExposure = THREE.MathUtils.lerp(from.exposure, to.exposure, t);
  });

  return null;
}

function mixedConfig(a: PhaseConfig, b: PhaseConfig, t: number): PhaseConfig {
  return {
    sunPos: [
      THREE.MathUtils.lerp(a.sunPos[0], b.sunPos[0], t),
      THREE.MathUtils.lerp(a.sunPos[1], b.sunPos[1], t),
      THREE.MathUtils.lerp(a.sunPos[2], b.sunPos[2], t),
    ],
    sunColor: blendHex(a.sunColor, b.sunColor, t),
    sunIntensity: THREE.MathUtils.lerp(a.sunIntensity, b.sunIntensity, t),
    hemiSky: blendHex(a.hemiSky, b.hemiSky, t),
    hemiGround: blendHex(a.hemiGround, b.hemiGround, t),
    hemiIntensity: THREE.MathUtils.lerp(a.hemiIntensity, b.hemiIntensity, t),
    ambColor: blendHex(a.ambColor, b.ambColor, t),
    ambIntensity: THREE.MathUtils.lerp(a.ambIntensity, b.ambIntensity, t),
    fogColor: blendHex(a.fogColor, b.fogColor, t),
    fogNear: THREE.MathUtils.lerp(a.fogNear, b.fogNear, t),
    fogFar: THREE.MathUtils.lerp(a.fogFar, b.fogFar, t),
    envPreset: t > 0.5 ? b.envPreset : a.envPreset,
    exposure: THREE.MathUtils.lerp(a.exposure, b.exposure, t),
    showStars: t > 0.5 ? b.showStars : a.showStars,
  };
}

function blendHex(a: string, b: string, t: number): string {
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  ca.lerp(cb, t);
  return `#${ca.getHexString()}`;
}

export function Village() {
  const village = useStore((s) => s.village);
  const select = useStore((s) => s.select);
  const phase = useStore((s) => s.timePhase);
  const cfg = PHASE[phase];

  const dirLightRef = useRef<THREE.DirectionalLight>(null);
  const hemiLightRef = useRef<THREE.HemisphereLight>(null);
  const ambLightRef = useRef<THREE.AmbientLight>(null);
  const fogRef = useRef<THREE.Fog>(null);

  return (
    <Canvas
      shadows
      camera={{ position: [22, 22, 28], fov: 42 }}
      onPointerMissed={() => select(null)}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: cfg.exposure }}
      style={{ background: 'linear-gradient(to bottom, #1d2542 0%, #2c3a5e 60%, #5a6e8f 100%)' }}
    >
      <fog ref={fogRef} attach="fog" args={[cfg.fogColor, cfg.fogNear, cfg.fogFar]} />

      <Suspense fallback={null}>
        <Environment preset={cfg.envPreset} key={cfg.envPreset} />
      </Suspense>

      <Sky
        distance={450000}
        sunPosition={cfg.sunPos}
        inclination={0.48}
        azimuth={0.25}
        turbidity={phase === 'night' ? 0.1 : 6}
        rayleigh={phase === 'night' ? 0.5 : 2}
        mieCoefficient={0.005}
        mieDirectionalG={0.85}
      />

      {cfg.showStars && (
        <Stars radius={150} depth={80} count={4000} factor={5} saturation={0} fade speed={0.5} />
      )}

      <SoftShadows size={28} samples={12} focus={0.6} />

      <hemisphereLight
        ref={hemiLightRef}
        args={[cfg.hemiSky, cfg.hemiGround, cfg.hemiIntensity]}
      />
      <ambientLight ref={ambLightRef} intensity={cfg.ambIntensity} color={cfg.ambColor} />
      <directionalLight
        ref={dirLightRef}
        position={cfg.sunPos}
        intensity={cfg.sunIntensity}
        color={cfg.sunColor}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.5}
        shadow-camera-far={120}
        shadow-camera-left={-50}
        shadow-camera-right={50}
        shadow-camera-top={50}
        shadow-camera-bottom={-50}
        shadow-bias={-0.0005}
        shadow-normalBias={0.04}
      />
      <directionalLight position={[-12, 18, -10]} intensity={0.25} color="#7aa9d6" />

      <TimeOfDayController
        dirLightRef={dirLightRef}
        hemiLightRef={hemiLightRef}
        ambLightRef={ambLightRef}
        fogRef={fogRef}
      />

      <Ground />
      <Props components={village.components} nightBoost={phase === 'night'} />

      <Roads components={village.components} connections={village.connections} />
      {village.components.map((c) => (
        <Building key={c.id} component={c} />
      ))}

      <ContactShadows
        position={[0, 0.01, 0]}
        opacity={0.55}
        scale={140}
        blur={2.4}
        far={20}
        resolution={1024}
        color="#1a2238"
      />

      <Suspense fallback={null}>
        <Clouds material={THREE.MeshBasicMaterial}>
          <Cloud
            seed={1}
            segments={28}
            volume={6}
            opacity={phase === 'night' ? 0.18 : 0.45}
            position={[-30, 22, -20]}
            color={phase === 'night' ? '#9aaecf' : '#ffe9d2'}
            bounds={[8, 1.5, 4]}
          />
          <Cloud
            seed={2}
            segments={22}
            volume={4}
            opacity={phase === 'night' ? 0.15 : 0.4}
            position={[30, 26, 10]}
            color={phase === 'night' ? '#9aaecf' : '#ffe9d2'}
            bounds={[8, 1.5, 4]}
          />
          <Cloud
            seed={3}
            segments={18}
            volume={3}
            opacity={phase === 'night' ? 0.12 : 0.35}
            position={[5, 30, -35]}
            color={phase === 'night' ? '#aab8d4' : '#fff2dd'}
            bounds={[10, 2, 4]}
          />
        </Clouds>
      </Suspense>

      <FlowParticles />

      <OrbitControls
        target={[0, 1, 0]}
        enableDamping
        dampingFactor={0.08}
        maxPolarAngle={Math.PI / 2.2}
        minDistance={10}
        maxDistance={90}
      />

      <AdaptiveDpr pixelated />
      <AdaptiveEvents />

      <EffectComposer multisampling={0}>
        <Bloom
          intensity={phase === 'night' ? 1.0 : 0.55}
          luminanceThreshold={phase === 'night' ? 0.6 : 0.82}
          luminanceSmoothing={0.25}
          mipmapBlur
        />
        <HueSaturation saturation={phase === 'night' ? -0.05 : 0.08} hue={0} />
        <BrightnessContrast brightness={-0.02} contrast={0.08} />
        <Vignette eskil={false} offset={0.18} darkness={phase === 'night' ? 0.75 : 0.55} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <SMAA />
      </EffectComposer>
    </Canvas>
  );
}
