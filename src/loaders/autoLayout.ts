import type { ComponentKind, Connection, VillageComponent } from '../types';

const COLUMN_BY_KIND: Record<ComponentKind, number> = {
  external:   0,
  cdn:        1,
  gateway:    2,
  auth:       3,
  compute:    4,
  cache:      5,
  queue:      6,
  database:   7,
  storage:    8,
  monitoring: 9,
};

/**
 * Assign positions for any component with [0,0] (or missing). Layered grid
 * by kind; within each column, sort by connection degree desc to put hubs
 * near vertical center, then space out evenly.
 */
export function autoLayout(
  components: VillageComponent[],
  connections: Connection[]
): VillageComponent[] {
  const needsLayout = components.some(
    (c) => c.position[0] === 0 && c.position[1] === 0
  );
  if (!needsLayout) return components;

  const degree = new Map<string, number>();
  for (const c of connections) {
    degree.set(c.from, (degree.get(c.from) ?? 0) + 1);
    degree.set(c.to, (degree.get(c.to) ?? 0) + 1);
  }

  const byCol = new Map<number, VillageComponent[]>();
  for (const c of components) {
    const col = COLUMN_BY_KIND[c.kind] ?? 4;
    (byCol.get(col) ?? byCol.set(col, []).get(col)!).push(c);
  }

  const colSpacing = 7;
  const rowSpacing = 5;

  const out = components.map((c) => ({ ...c }));
  const idIdx = new Map(out.map((c, i) => [c.id, i] as const));

  for (const [col, members] of byCol.entries()) {
    members.sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0));
    const x = (col - 4.5) * colSpacing;
    const n = members.length;
    members.forEach((c, i) => {
      const z = (i - (n - 1) / 2) * rowSpacing;
      const idx = idIdx.get(c.id)!;
      out[idx].position = [x, z];
    });
  }

  return out;
}
