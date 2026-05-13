import { useEffect } from 'react';
import { useStore, type WeatherMode } from '../store';
import type { Alert, VillageComponent } from '../types';

/**
 * Cloud-architecture-aware weather mapping:
 *  - storm  → any component down OR any firing critical alert
 *  - rain   → ≥30% components degraded OR ≥3 active alerts
 *  - cloudy → any degraded OR any active alerts OR sustained high traffic
 *  - clear  → fully healthy + quiet
 *
 * The mapping doubles as visual telemetry: a glance at the sky tells the
 * operator the overall fleet state without reading any panel.
 */
export function deriveWeather(
  components: VillageComponent[],
  alerts: Alert[],
  trafficLevel: number
): WeatherMode {
  let down = 0;
  let degraded = 0;
  for (const c of components) {
    if (c.health === 'down') down++;
    else if (c.health === 'degraded') degraded++;
  }
  const critical = alerts.filter((a) => a.severity === 'critical').length;

  if (down > 0 || critical > 0) return 'storm';

  const degRatio = components.length ? degraded / components.length : 0;
  if (degRatio >= 0.3 || alerts.length >= 3) return 'rain';

  if (degraded > 0 || alerts.length > 0 || trafficLevel > 6) return 'cloudy';

  return 'clear';
}

/**
 * Compute weather every ~2s from a snapshot of store state. We deliberately
 * do NOT depend on edgeTraffic via React deps because traffic decays every
 * animation frame, which would re-fire the effect ~60 times per second and
 * thrash. Instead we sample on a fixed interval.
 */
export function useWeatherAuto() {
  const weatherAuto = useStore((s) => s.weatherAuto);

  useEffect(() => {
    if (!weatherAuto) return;
    const tick = () => {
      const s = useStore.getState();
      if (!s.weatherAuto) return;
      const trafficLevel = Object.values(s.edgeTraffic).reduce((a, b) => a + b, 0);
      const next = deriveWeather(s.village.components, s.alerts, trafficLevel);
      if (next !== s.weatherMode) useStore.setState({ weatherMode: next });
    };
    tick();
    const id = window.setInterval(tick, 2000);
    return () => window.clearInterval(id);
  }, [weatherAuto]);
}
