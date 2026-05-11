import type { VillageConfig } from '../types';

export const mockVillage: VillageConfig = {
  name: 'Sample SaaS App',
  components: [
    { id: 'user',      name: 'End User',         kind: 'external',   provider: 'generic', position: [-18, -10], health: 'healthy' },
    { id: 'cdn',       name: 'CDN',              kind: 'cdn',        provider: 'aws',     position: [-12, -4],  health: 'healthy' },
    { id: 'gw',        name: 'API Gateway',      kind: 'gateway',    provider: 'aws',     position: [-4, -2],   health: 'healthy' },
    { id: 'auth',      name: 'Auth Service',     kind: 'auth',       provider: 'aws',     position: [-4, 6],    health: 'healthy' },
    { id: 'api',       name: 'API Server',       kind: 'compute',    provider: 'aws',     position: [4, -2],    health: 'healthy' },
    { id: 'worker',    name: 'Worker Lambda',    kind: 'compute',    provider: 'aws',     position: [12, 4],    health: 'degraded' },
    { id: 'queue',     name: 'Job Queue',        kind: 'queue',      provider: 'aws',     position: [10, -2],   health: 'healthy' },
    { id: 'cache',     name: 'Redis Cache',      kind: 'cache',      provider: 'aws',     position: [4, 6],     health: 'healthy' },
    { id: 'db',        name: 'Postgres',         kind: 'database',   provider: 'aws',     position: [12, -8],   health: 'healthy' },
    { id: 'bucket',    name: 'Asset Bucket',     kind: 'storage',    provider: 'aws',     position: [-12, 6],   health: 'healthy' },
    { id: 'monitor',   name: 'Monitoring',       kind: 'monitoring', provider: 'aws',     position: [18, -2],   health: 'healthy' },
  ],
  connections: [
    { id: 'c1',  from: 'user',   to: 'cdn',     protocol: 'http', label: 'GET /' },
    { id: 'c2',  from: 'cdn',    to: 'bucket',  protocol: 'http', label: 'static' },
    { id: 'c3',  from: 'cdn',    to: 'gw',      protocol: 'http', label: '/api/*' },
    { id: 'c4',  from: 'gw',     to: 'auth',    protocol: 'http', label: 'verify' },
    { id: 'c5',  from: 'gw',     to: 'api',     protocol: 'http' },
    { id: 'c6',  from: 'api',    to: 'cache',   protocol: 'tcp',  label: 'GET/SET' },
    { id: 'c7',  from: 'api',    to: 'db',      protocol: 'sql' },
    { id: 'c8',  from: 'api',    to: 'queue',   protocol: 'event', label: 'enqueue' },
    { id: 'c9',  from: 'queue',  to: 'worker',  protocol: 'event' },
    { id: 'c10', from: 'worker', to: 'db',      protocol: 'sql' },
    { id: 'c11', from: 'api',    to: 'monitor', protocol: 'http', label: 'metrics' },
    { id: 'c12', from: 'worker', to: 'monitor', protocol: 'http', label: 'metrics' },
  ],
};
