import { create } from 'zustand';
import type { Alert, FlowEvent, VillageConfig, HealthStatus } from './types';
import { mockVillage } from './data/mockVillage';

const STORAGE_KEY = 'cloud-village:lastVillage';
const DECAY_PER_SEC = 0.6; // traffic stat exponential decay

let flowCounter = 0;
let alertCounter = 0;

function loadInitial(): VillageConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return mockVillage;
    const parsed = JSON.parse(raw);
    if (parsed?.components && parsed?.connections) return parsed as VillageConfig;
  } catch {}
  return mockVillage;
}

export type TimePhase = 'dawn' | 'day' | 'dusk' | 'night';

interface State {
  village: VillageConfig;
  selectedId: string | null;
  alerts: Alert[];
  flows: FlowEvent[];
  paused: boolean;
  search: string;
  edgeTraffic: Record<string, number>; // connection id → recent activity score 0..N
  lastScanProvider: 'aws' | 'cloudflare' | 'docker' | 'azure' | 'gcp' | null;
  timePhase: TimePhase;
  autoCycle: boolean; // smoothly animate phase
  metricsPanelOpen: boolean;
  viewMode: '3d' | '2d';

  setLastScanProvider: (p: State['lastScanProvider']) => void;
  toggleMetricsPanel: () => void;
  setViewMode: (m: State['viewMode']) => void;
  toggleViewMode: () => void;
  setVillage: (v: VillageConfig, persist?: boolean) => void;
  select: (id: string | null) => void;
  setSearch: (q: string) => void;
  spawnFlow: (connectionId: string, kind?: FlowEvent['kind']) => void;
  spawnAlert: (componentId: string, severity: Alert['severity'], message: string) => void;
  dismissAlert: (id: string) => void;
  setHealth: (componentId: string, h: HealthStatus) => void;
  togglePause: () => void;
  tickFlows: (dt: number) => void;
  exportJson: () => string;
  resetTraffic: () => void;
  cyclePhase: () => void;
  toggleAutoCycle: () => void;
}

const PHASE_ORDER: TimePhase[] = ['dawn', 'day', 'dusk', 'night'];

export const useStore = create<State>((set, get) => ({
  village: loadInitial(),
  selectedId: null,
  alerts: [],
  flows: [],
  paused: false,
  search: '',
  edgeTraffic: {},
  lastScanProvider: null,
  timePhase: 'day',
  autoCycle: false,
  metricsPanelOpen: false,
  viewMode: '3d',

  setLastScanProvider: (p) => set({ lastScanProvider: p }),
  toggleMetricsPanel: () => set({ metricsPanelOpen: !get().metricsPanelOpen }),
  setViewMode: (m) => set({ viewMode: m }),
  toggleViewMode: () => set({ viewMode: get().viewMode === '3d' ? '2d' : '3d' }),

  setVillage: (v, persist = true) => {
    set({ village: v, selectedId: null, alerts: [], flows: [], edgeTraffic: {} });
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(v)); } catch {}
    }
  },

  select: (id) => set({ selectedId: id }),
  setSearch: (q) => set({ search: q }),

  spawnFlow: (connectionId, kind = 'request') => {
    const colorMap = { request: '#5ec8ff', response: '#7cffb2', event: '#ffd166' };
    const flow: FlowEvent = {
      id: `f${++flowCounter}`,
      connectionId,
      progress: 0,
      speed: 0.6 + Math.random() * 0.4,
      color: colorMap[kind],
      kind,
    };
    set({
      flows: [...get().flows, flow],
      edgeTraffic: {
        ...get().edgeTraffic,
        [connectionId]: (get().edgeTraffic[connectionId] ?? 0) + 1,
      },
    });
  },

  spawnAlert: (componentId, severity, message) => {
    const a: Alert = {
      id: `a${++alertCounter}`,
      componentId,
      severity,
      message,
      timestamp: Date.now(),
    };
    set({ alerts: [...get().alerts, a] });
    setTimeout(() => get().dismissAlert(a.id), 6000);
  },

  dismissAlert: (id) =>
    set({ alerts: get().alerts.filter((a) => a.id !== id) }),

  setHealth: (componentId, h) =>
    set({
      village: {
        ...get().village,
        components: get().village.components.map((c) =>
          c.id === componentId ? { ...c, health: h } : c
        ),
      },
    }),

  togglePause: () => set({ paused: !get().paused }),

  tickFlows: (dt) => {
    if (get().paused) return;
    const next: FlowEvent[] = [];
    for (const f of get().flows) {
      const p = f.progress + f.speed * dt;
      if (p < 1) next.push({ ...f, progress: p });
    }
    // decay traffic stats
    const decayed: Record<string, number> = {};
    const decayFactor = Math.exp(-DECAY_PER_SEC * dt);
    for (const [k, v] of Object.entries(get().edgeTraffic)) {
      const nv = v * decayFactor;
      if (nv > 0.01) decayed[k] = nv;
    }
    set({ flows: next, edgeTraffic: decayed });
  },

  exportJson: () => JSON.stringify(get().village, null, 2),
  resetTraffic: () => set({ edgeTraffic: {}, flows: [] }),

  cyclePhase: () => {
    const i = PHASE_ORDER.indexOf(get().timePhase);
    const next = PHASE_ORDER[(i + 1) % PHASE_ORDER.length];
    set({ timePhase: next });
  },
  toggleAutoCycle: () => set({ autoCycle: !get().autoCycle }),
}));
