import { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore, type WeatherMode } from '../store';

interface Props {
  dirLightRef: React.RefObject<THREE.DirectionalLight>;
  fogRef: React.RefObject<THREE.Fog>;
}

const SPREAD_X = 80;
const SPREAD_Z = 80;
const TOP_Y = 35;
const BOTTOM_Y = 0;

const DROPLENGTH: Record<WeatherMode, number> = { clear: 0, cloudy: 0, rain: 1.6, storm: 2.4 };
const DROPCOUNT: Record<WeatherMode, number> = { clear: 0, cloudy: 0, rain: 220, storm: 420 };
const DROPSPEED: Record<WeatherMode, number> = { clear: 0, cloudy: 0, rain: 24, storm: 38 };
const FOG_TINT: Record<WeatherMode, { color: string; near: number; far: number; intensityMul: number }> = {
  clear:  { color: '',         near: 0,  far: 0,   intensityMul: 1.0 },
  cloudy: { color: '#6f7d96',  near: -10, far: -30, intensityMul: 0.78 },
  rain:   { color: '#4d5b75',  near: -20, far: -50, intensityMul: 0.55 },
  storm:  { color: '#26304a',  near: -30, far: -70, intensityMul: 0.35 },
};

// raindrop buffer geometry: 2 vertices per drop (head + tail)
function makeRainGeo(count: number) {
  const positions = new Float32Array(count * 6);
  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * SPREAD_X * 2;
    const z = (Math.random() - 0.5) * SPREAD_Z * 2;
    const y = Math.random() * TOP_Y;
    positions[i * 6 + 0] = x;
    positions[i * 6 + 1] = y;
    positions[i * 6 + 2] = z;
    positions[i * 6 + 3] = x;
    positions[i * 6 + 4] = y - 1;
    positions[i * 6 + 5] = z;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geo;
}

export function WeatherSystem({ dirLightRef, fogRef }: Props) {
  const weather = useStore((s) => s.weatherMode);
  const phase = useStore((s) => s.timePhase);

  // build largest geometry once; we render only first `activeCount * 2` vertices
  const MAX = DROPCOUNT.storm;
  const rainGeo = useMemo(() => makeRainGeo(MAX), []);
  const linesRef = useRef<THREE.LineSegments>(null);
  const lightningRef = useRef({
    nextStrikeAt: performance.now() + 6000,
    intensityBoost: 0,
    baselineIntensity: 1,
  });

  // for fog target
  const fogTargetColor = useRef(new THREE.Color());
  const fogTargetNear = useRef(0);
  const fogTargetFar = useRef(0);
  const rainAccum = useRef(0);
  const RAIN_STEP = 1 / 30; // throttle rain GPU upload to 30Hz

  useEffect(() => {
    const t = FOG_TINT[weather];
    if (t.color) fogTargetColor.current.set(t.color);
    fogTargetNear.current = t.near;
    fogTargetFar.current = t.far;
    // capture current sun intensity as baseline for lightning math
    if (dirLightRef.current) lightningRef.current.baselineIntensity = dirLightRef.current.intensity;
  }, [weather, phase, dirLightRef]);

  const activeCount = DROPCOUNT[weather];
  const dropLen = DROPLENGTH[weather];
  const speed = DROPSPEED[weather];

  // hide whole lineSegments when no precipitation
  useEffect(() => {
    if (linesRef.current) linesRef.current.visible = activeCount > 0;
  }, [activeCount]);

  // update line draw range to match active count
  useEffect(() => {
    rainGeo.setDrawRange(0, activeCount * 2);
  }, [activeCount, rainGeo]);

  useFrame((state, dt) => {
    // 1) advance raindrops (throttled to ~30Hz)
    rainAccum.current += dt;
    if (linesRef.current && activeCount > 0 && rainAccum.current >= RAIN_STEP) {
      const stepDt = rainAccum.current;
      rainAccum.current = 0;
      const arr = rainGeo.attributes.position.array as Float32Array;
      const fall = speed * stepDt;
      for (let i = 0; i < activeCount; i++) {
        const base = i * 6;
        let y = arr[base + 1];
        y -= fall;
        let yTail = y - dropLen;
        if (y < BOTTOM_Y) {
          const x = (Math.random() - 0.5) * SPREAD_X * 2;
          const z = (Math.random() - 0.5) * SPREAD_Z * 2;
          y = TOP_Y + Math.random() * 6;
          yTail = y - dropLen;
          arr[base + 0] = x;
          arr[base + 2] = z;
          arr[base + 3] = x;
          arr[base + 5] = z;
        }
        arr[base + 1] = y;
        arr[base + 4] = yTail;
      }
      rainGeo.attributes.position.needsUpdate = true;
    }

    // 2) fog tint lerp toward weather target
    if (fogRef.current && weather !== 'clear') {
      const f = fogRef.current;
      f.color.lerp(fogTargetColor.current, dt * 1.2);
      // tint adjusts near/far additively relative to current values; clamp
      const targetNear = Math.max(8, f.near + fogTargetNear.current * dt * 0.5);
      const targetFar = Math.max(targetNear + 20, f.far + fogTargetFar.current * dt * 0.5);
      f.near = THREE.MathUtils.lerp(f.near, targetNear, dt * 2);
      f.far = THREE.MathUtils.lerp(f.far, targetFar, dt * 2);
    }

    // 3) dim sun while raining/storming, brighten back on clear
    if (dirLightRef.current) {
      const mul = FOG_TINT[weather].intensityMul;
      const baseline = lightningRef.current.baselineIntensity;
      const target = baseline * mul + lightningRef.current.intensityBoost;
      dirLightRef.current.intensity = THREE.MathUtils.lerp(dirLightRef.current.intensity, target, dt * 3);
      // decay lightning boost
      lightningRef.current.intensityBoost = Math.max(0, lightningRef.current.intensityBoost - dt * 18);
    }

    // 4) lightning strikes in storm
    if (weather === 'storm') {
      const now = performance.now();
      if (now >= lightningRef.current.nextStrikeAt) {
        lightningRef.current.intensityBoost = 6 + Math.random() * 4;
        lightningRef.current.nextStrikeAt = now + 3000 + Math.random() * 9000;
      }
    } else {
      // push next strike out
      lightningRef.current.nextStrikeAt = performance.now() + 6000;
    }

    // 5) flicker last frame of lightning by tiny secondary spike
    if (lightningRef.current.intensityBoost > 0 && Math.random() < 0.25) {
      lightningRef.current.intensityBoost *= 0.6;
    }

    // touch state to suppress unused-var lint
    void state;
  });

  return (
    <lineSegments ref={linesRef} geometry={rainGeo} frustumCulled={false}>
      <lineBasicMaterial
        color={weather === 'storm' ? '#bcd0e6' : '#c8d4e6'}
        transparent
        opacity={weather === 'storm' ? 0.55 : 0.4}
        depthWrite={false}
      />
    </lineSegments>
  );
}
