import { useEffect, useRef } from 'react';
import { useStore } from '../store';

const RAIN_COUNT_RAIN = 50;
const RAIN_COUNT_STORM = 110;
const FRAME_INTERVAL_MS = 1000 / 30; // 30 fps cap

/**
 * 2D-view weather overlay. Renders falling rain streaks via a canvas
 * layer, a dim screen tint per weather mode, animated cloud blobs,
 * and lightning flashes during storms.
 */
export function WeatherOverlay() {
  const weather = useStore((s) => s.weatherMode);
  const viewMode = useStore((s) => s.viewMode);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number | undefined>(undefined);
  const nextStrikeRef = useRef(performance.now() + 6000);

  useEffect(() => {
    if (viewMode !== '2d') return;
    if (weather === 'clear' || weather === 'cloudy') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const count = weather === 'storm' ? RAIN_COUNT_STORM : RAIN_COUNT_RAIN;
    const speed = weather === 'storm' ? 16 : 10;
    const slant = weather === 'storm' ? 4 : 2;

    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);

    const drops = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      len: 10 + Math.random() * 18,
      v: speed * (0.7 + Math.random() * 0.6),
    }));

    const onResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);

    let last = performance.now();
    const tick = (now: number) => {
      if (now - last < FRAME_INTERVAL_MS) {
        animRef.current = requestAnimationFrame(tick);
        return;
      }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = weather === 'storm' ? 'rgba(220, 235, 250, 0.55)' : 'rgba(200, 220, 240, 0.4)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      for (const d of drops) {
        d.y += d.v * dt * 60;
        d.x += slant * dt * 60;
        if (d.y > h) {
          d.y = -d.len;
          d.x = Math.random() * w;
        }
        if (d.x > w) d.x = -10;
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - slant, d.y - d.len);
      }
      ctx.stroke();

      if (weather === 'storm' && now >= nextStrikeRef.current) {
        nextStrikeRef.current = now + 3000 + Math.random() * 9000;
        if (flashRef.current) {
          flashRef.current.style.transition = 'none';
          flashRef.current.style.opacity = '0.85';
          requestAnimationFrame(() => {
            if (!flashRef.current) return;
            flashRef.current.style.transition = 'opacity 280ms ease-out';
            flashRef.current.style.opacity = '0';
          });
        }
      }

      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('resize', onResize);
      if (animRef.current !== undefined) cancelAnimationFrame(animRef.current);
      ctx.clearRect(0, 0, w, h);
    };
  }, [weather, viewMode]);

  if (viewMode !== '2d' || weather === 'clear') return null;

  const tint =
    weather === 'storm'
      ? 'rgba(15, 22, 42, 0.42)'
      : weather === 'rain'
      ? 'rgba(35, 45, 70, 0.30)'
      : 'rgba(80, 90, 110, 0.18)';

  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: tint,
          pointerEvents: 'none',
          zIndex: 3,
        }}
      />
      {(weather === 'cloudy' || weather === 'rain' || weather === 'storm') && (
        <CloudDrift weather={weather} />
      )}
      {(weather === 'rain' || weather === 'storm') && (
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 4,
          }}
        />
      )}
      {weather === 'storm' && (
        <div
          ref={flashRef}
          style={{
            position: 'absolute',
            inset: 0,
            background: '#dfe9ff',
            opacity: 0,
            pointerEvents: 'none',
            zIndex: 5,
          }}
        />
      )}
    </>
  );
}

function CloudDrift({ weather }: { weather: 'cloudy' | 'rain' | 'storm' }) {
  const opacity = weather === 'storm' ? 0.55 : weather === 'rain' ? 0.45 : 0.3;
  const color = weather === 'storm' ? '#2a3550' : weather === 'rain' ? '#4a5470' : '#9aa6c0';
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2, overflow: 'hidden' }}>
      <style>{`
        @keyframes vk-cloud-drift {
          from { transform: translateX(-15%); }
          to   { transform: translateX(115%); }
        }
      `}</style>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: `${10 + i * 18}%`,
            left: 0,
            width: 240,
            height: 70,
            borderRadius: '50%',
            background: `radial-gradient(ellipse at 50% 50%, ${color} 0%, rgba(0,0,0,0) 70%)`,
            opacity,
            animation: `vk-cloud-drift ${60 + i * 18}s linear infinite`,
            animationDelay: `${-i * 22}s`,
            willChange: 'transform',
          }}
        />
      ))}
    </div>
  );
}
