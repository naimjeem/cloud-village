import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import type { ComponentKind, Connection, VillageComponent, VillageConfig } from '../../src/types';
import { safeId, walk } from '../util';

const K8S_KIND_MAP: Record<string, ComponentKind> = {
  Deployment: 'compute',
  StatefulSet: 'compute',
  DaemonSet: 'compute',
  Job: 'compute',
  CronJob: 'compute',
  Pod: 'compute',
  Service: 'gateway',
  Ingress: 'gateway',
  PersistentVolumeClaim: 'storage',
  ConfigMap: 'auth',
  Secret: 'auth',
};

export function parseK8s(root: string): VillageConfig {
  const components: VillageComponent[] = [];
  const connections: Connection[] = [];
  const seenIds = new Set<string>();
  let cn = 0;

  const files: string[] = [];
  for (const f of walk(root)) {
    if (!/\.(ya?ml)$/.test(f)) continue;
    // heuristic: only inside dirs likely to hold k8s
    if (!/(k8s|kube|manifests|deploy|charts|kustomize)/i.test(f)) continue;
    files.push(f);
  }

  const svcByApp: Record<string, string> = {};

  for (const file of files) {
    let docs: any[];
    try {
      docs = YAML.parseAllDocuments(fs.readFileSync(file, 'utf8')).map((d) => d.toJS());
    } catch {
      continue;
    }
    for (const doc of docs) {
      if (!doc?.kind || !doc?.metadata?.name) continue;
      const kind = K8S_KIND_MAP[doc.kind];
      if (!kind) continue;
      const ns = doc.metadata.namespace ?? 'default';
      const name = doc.metadata.name;
      const id = safeId(`k8s_${doc.kind}_${ns}_${name}`);
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      components.push({
        id,
        name: `${name}`,
        kind,
        provider: 'generic',
        position: [0, 0],
        health: 'healthy',
        meta: {
          source: 'k8s',
          kind: doc.kind,
          namespace: ns,
        },
      });
      const app =
        doc.spec?.selector?.matchLabels?.app ??
        doc.metadata?.labels?.app ??
        doc.spec?.selector?.app;
      if (app && doc.kind === 'Service') svcByApp[app] = id;
    }
  }

  // Connect Services → Deployments by app label
  for (const c of components) {
    if (c.meta?.kind === 'Deployment' || c.meta?.kind === 'StatefulSet') {
      const app = c.name;
      const sid = svcByApp[app];
      if (sid && sid !== c.id) {
        connections.push({ id: `kn${++cn}`, from: sid, to: c.id, protocol: 'http' });
      }
    }
  }

  return {
    name: `k8s (${components.length} resources)`,
    components,
    connections,
  };
}
