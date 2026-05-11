import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import type { ComponentKind, Connection, VillageComponent, VillageConfig } from '../../src/types';
import { fileExists, safeId, walk } from '../util';

const KIND_FROM_IMAGE: Array<[RegExp, ComponentKind]> = [
  [/postgres|mysql|mariadb|mongo|cockroach|cassandra|clickhouse|sqlserver|oracle/, 'database'],
  [/redis|memcached|valkey|dragonfly/, 'cache'],
  [/rabbitmq|kafka|nats|pulsar|activemq|emqx/, 'queue'],
  [/nginx|traefik|caddy|envoy|haproxy|kong/, 'gateway'],
  [/prometheus|grafana|loki|jaeger|tempo|otel|elastic|kibana|datadog/, 'monitoring'],
  [/minio|seaweedfs|garage/, 'storage'],
  [/keycloak|authelia|authentik|hydra|dex/, 'auth'],
  [/dynamodb-local|localstack/, 'database'],
];

function inferKind(image: string, name: string): ComponentKind {
  const s = `${image} ${name}`.toLowerCase();
  for (const [re, k] of KIND_FROM_IMAGE) if (re.test(s)) return k;
  return 'compute';
}

export function parseCompose(root: string): VillageConfig {
  const components: VillageComponent[] = [];
  const connections: Connection[] = [];
  const seenIds = new Set<string>();
  let cn = 0;

  const candidates = [
    'docker-compose.yml',
    'docker-compose.yaml',
    'compose.yml',
    'compose.yaml',
  ];
  const found: string[] = [];
  for (const f of walk(root)) {
    const base = path.basename(f);
    if (candidates.includes(base)) found.push(f);
  }

  for (const file of found) {
    let doc: any;
    try {
      doc = YAML.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    const services = doc?.services ?? {};
    const composeName = path.basename(path.dirname(file));
    const ids: Record<string, string> = {};

    for (const [svc, def] of Object.entries<any>(services)) {
      const image = def?.image ?? def?.build?.image ?? '';
      const id = safeId(`compose_${composeName}_${svc}`);
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      ids[svc] = id;
      components.push({
        id,
        name: svc,
        kind: inferKind(image, svc),
        provider: 'docker',
        position: [0, 0],
        health: 'healthy',
        meta: {
          source: 'compose',
          compose: composeName,
          image: image || 'build',
          ports: Array.isArray(def?.ports) ? def.ports.join(', ') : '',
        },
      });
    }

    for (const [svc, def] of Object.entries<any>(services)) {
      const fromId = ids[svc];
      if (!fromId) continue;
      const deps = Array.isArray(def?.depends_on)
        ? def.depends_on
        : def?.depends_on
        ? Object.keys(def.depends_on)
        : [];
      for (const dep of deps) {
        const toId = ids[dep];
        if (toId && fromId !== toId) {
          connections.push({ id: `co${++cn}`, from: fromId, to: toId, protocol: 'tcp' });
        }
      }
    }
  }

  return {
    name: `compose (${components.length} services)`,
    components,
    connections,
  };
}
