import type { Connection, VillageComponent, VillageConfig } from '../src/types';

export function mergeVillages(name: string, parts: VillageConfig[]): VillageConfig {
  const components = new Map<string, VillageComponent>();
  const connections = new Map<string, Connection>();

  for (const p of parts) {
    for (const c of p.components) {
      const existing = components.get(c.id);
      if (existing) {
        existing.meta = { ...existing.meta, ...c.meta };
        if (existing.kind === 'compute' && c.kind !== 'compute') existing.kind = c.kind;
      } else {
        components.set(c.id, { ...c });
      }
    }
    for (const e of p.connections) {
      const k = `${e.from}->${e.to}`;
      if (!connections.has(k)) connections.set(k, { ...e });
    }
  }

  // drop edges that point to non-existent ids
  const ids = new Set(components.keys());
  const final: Connection[] = [];
  for (const e of connections.values()) {
    if (ids.has(e.from) && ids.has(e.to)) final.push(e);
  }

  return {
    name,
    components: Array.from(components.values()),
    connections: final,
  };
}
