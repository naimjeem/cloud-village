import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { fetchMetrics } from '../loaders/awsScan';

const POLL_MS = 4000;
const ALERT_DEDUP_MS = 60_000;

/**
 * When `on` is true, poll backend metrics endpoint and drive:
 *  - component.health
 *  - edge traffic (spawn flows proportional to req rate)
 *  - alerts (deduped per componentId+message within ALERT_DEDUP_MS window)
 *
 * Falls back to client-side simulator only if no scan provider is set
 * (i.e. user hasn't done a real scan yet — legacy demo mode).
 */
export function useMetricsPolling(on: boolean) {
  const village = useStore((s) => s.village);
  const setHealth = useStore((s) => s.setHealth);
  const spawnFlow = useStore((s) => s.spawnFlow);
  const spawnAlert = useStore((s) => s.spawnAlert);
  const lastAlertAt = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!on) return;
    let cancelled = false;
    let timer: number | undefined;

    const tick = async () => {
      if (cancelled) return;
      const provider = useStore.getState().lastScanProvider ?? undefined;
      try {
        const snap = await fetchMetrics(provider);

        for (const [cid, h] of Object.entries(snap.health)) setHealth(cid, h);

        for (const [eid, rate] of Object.entries(snap.edgeRates)) {
          const count = Math.min(5, Math.max(1, Math.round(rate * 2)));
          for (let i = 0; i < count; i++) {
            setTimeout(() => spawnFlow(eid, 'request'), i * 200);
          }
        }

        // dedup alerts in rolling window
        const now = Date.now();
        for (const [k, t] of lastAlertAt.current) {
          if (now - t > ALERT_DEDUP_MS) lastAlertAt.current.delete(k);
        }
        for (const a of snap.alerts) {
          const key = `${a.componentId}::${a.severity}::${a.message}`;
          const seen = lastAlertAt.current.get(key);
          if (seen && now - seen < ALERT_DEDUP_MS) continue;
          lastAlertAt.current.set(key, now);
          spawnAlert(a.componentId, a.severity, a.message);
        }

        // only run simulator when no real scan happened AND backend returned empty
        const empty =
          Object.keys(snap.health).length === 0 &&
          Object.keys(snap.edgeRates).length === 0 &&
          snap.alerts.length === 0;
        if (empty && !provider) simulateOnce(village, spawnFlow, spawnAlert, setHealth);
      } catch {
        // backend unreachable → simulate only if no real scan ever happened
        if (!provider) simulateOnce(village, spawnFlow, spawnAlert, setHealth);
      }
      if (!cancelled) timer = window.setTimeout(tick, POLL_MS);
    };
    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      lastAlertAt.current.clear();
    };
  }, [on, village, setHealth, spawnFlow, spawnAlert]);
}

function simulateOnce(
  village: ReturnType<typeof useStore.getState>['village'],
  spawnFlow: (id: string, kind?: 'request' | 'response' | 'event') => void,
  spawnAlert: (id: string, sev: 'info' | 'warning' | 'critical', msg: string) => void,
  setHealth: (id: string, h: 'healthy' | 'degraded' | 'down') => void
) {
  const n = Math.max(1, Math.floor(village.connections.length * 0.3));
  for (let i = 0; i < n; i++) {
    const c = village.connections[Math.floor(Math.random() * village.connections.length)];
    if (c) spawnFlow(c.id, Math.random() < 0.2 ? 'event' : 'request');
  }
  if (Math.random() < 0.05 && village.components.length) {
    const comp = village.components[Math.floor(Math.random() * village.components.length)];
    const sev: 'warning' | 'critical' = Math.random() < 0.2 ? 'critical' : 'warning';
    spawnAlert(comp.id, sev, sev === 'critical' ? 'Health check failing' : 'Latency above SLO');
    if (sev === 'critical') setHealth(comp.id, 'degraded');
    setTimeout(() => setHealth(comp.id, 'healthy'), 5000);
  }
}
