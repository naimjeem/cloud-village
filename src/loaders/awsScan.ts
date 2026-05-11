import type { VillageConfig } from '../types';
import { autoLayout } from './autoLayout';

export type ScanProvider = 'aws' | 'cloudflare' | 'docker' | 'azure' | 'gcp';

export interface LiveScanRequest {
  provider: ScanProvider;
  // aws
  region?: string;
  profile?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  // cloudflare
  apiToken?: string;
  accountId?: string;
  // docker
  socketPath?: string;
  // azure
  subscriptionId?: string;
  azureTenantId?: string;
  azureClientId?: string;
  azureClientSecret?: string;
  // gcp
  projectId?: string;
  gcpServiceAccountJson?: string;
}

const BACKEND = (import.meta as any).env?.VITE_BACKEND_URL ?? 'http://localhost:8787';

export async function liveScan(req: LiveScanRequest): Promise<VillageConfig> {
  const res = await fetch(`${BACKEND}/api/scan`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${res.status} ${t}`);
  }
  const cfg = (await res.json()) as VillageConfig;
  return { ...cfg, components: autoLayout(cfg.components, cfg.connections) };
}

export interface MetricsSnapshot {
  health: Record<string, 'healthy' | 'degraded' | 'down'>;
  edgeRates: Record<string, number>; // connectionId → req/s
  alerts: Array<{ componentId: string; severity: 'info' | 'warning' | 'critical'; message: string }>;
}

export async function fetchMetrics(provider?: ScanProvider): Promise<MetricsSnapshot> {
  const url = provider ? `${BACKEND}/api/metrics?provider=${provider}` : `${BACKEND}/api/metrics`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}
