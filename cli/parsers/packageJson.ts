import fs from 'node:fs';
import path from 'node:path';
import type { ComponentKind, Connection, VillageComponent, VillageConfig } from '../../src/types';
import { safeId, walk } from '../util';

interface DepRule {
  match: RegExp;
  externalId: string;
  externalName: string;
  kind: ComponentKind;
}

const DEP_RULES: DepRule[] = [
  { match: /^(pg|postgres|@prisma\/client|prisma|drizzle-orm|knex|typeorm|sequelize)$/, externalId: 'ext_postgres', externalName: 'Postgres', kind: 'database' },
  { match: /^(mysql2?|@planetscale\/database)$/, externalId: 'ext_mysql', externalName: 'MySQL', kind: 'database' },
  { match: /^(mongoose|mongodb)$/, externalId: 'ext_mongo', externalName: 'MongoDB', kind: 'database' },
  { match: /^(redis|ioredis|bullmq|bull)$/, externalId: 'ext_redis', externalName: 'Redis', kind: 'cache' },
  { match: /^@aws-sdk\/client-dynamodb$/, externalId: 'ext_ddb', externalName: 'DynamoDB', kind: 'database' },
  { match: /^@aws-sdk\/client-s3$/, externalId: 'ext_s3', externalName: 'S3', kind: 'storage' },
  { match: /^@aws-sdk\/client-sqs$/, externalId: 'ext_sqs', externalName: 'SQS', kind: 'queue' },
  { match: /^@aws-sdk\/client-sns$/, externalId: 'ext_sns', externalName: 'SNS', kind: 'queue' },
  { match: /^@aws-sdk\/client-lambda$/, externalId: 'ext_lambda', externalName: 'Lambda', kind: 'compute' },
  { match: /^kafkajs$/, externalId: 'ext_kafka', externalName: 'Kafka', kind: 'queue' },
  { match: /^amqplib$/, externalId: 'ext_rabbit', externalName: 'RabbitMQ', kind: 'queue' },
  { match: /^stripe$/, externalId: 'ext_stripe', externalName: 'Stripe', kind: 'external' },
  { match: /^(resend|@sendgrid\/mail|nodemailer|@aws-sdk\/client-ses|postmark)$/, externalId: 'ext_email', externalName: 'Email Provider', kind: 'external' },
  { match: /^twilio$/, externalId: 'ext_twilio', externalName: 'Twilio', kind: 'external' },
  { match: /^firebase-admin$/, externalId: 'ext_firebase', externalName: 'Firebase', kind: 'external' },
  { match: /^@clerk\/nextjs|@clerk\/clerk-sdk-node|next-auth$/, externalId: 'ext_auth', externalName: 'Auth Provider', kind: 'auth' },
  { match: /^(openai|@anthropic-ai\/sdk|@google\/generative-ai)$/, externalId: 'ext_llm', externalName: 'LLM API', kind: 'external' },
  { match: /^(@elastic\/elasticsearch|meilisearch|algoliasearch)$/, externalId: 'ext_search', externalName: 'Search Engine', kind: 'database' },
];

const FRAMEWORK: Record<string, string> = {
  next: 'Next.js',
  '@remix-run/node': 'Remix',
  nuxt: 'Nuxt',
  vite: 'Vite',
  '@sveltejs/kit': 'SvelteKit',
  express: 'Express',
  fastify: 'Fastify',
  hono: 'Hono',
  '@nestjs/core': 'NestJS',
  koa: 'Koa',
  '@hapi/hapi': 'Hapi',
};

export function parsePackageJsons(root: string): VillageConfig {
  const components: VillageComponent[] = [];
  const connections: Connection[] = [];
  const seenIds = new Set<string>();
  const externalsAdded = new Set<string>();
  let cn = 0;

  const pkgFiles: string[] = [];
  for (const f of walk(root)) {
    if (path.basename(f) === 'package.json' && !f.includes('node_modules')) {
      pkgFiles.push(f);
    }
  }

  for (const file of pkgFiles) {
    let pkg: any;
    try {
      pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    const dir = path.relative(root, path.dirname(file)) || '.';
    const id = safeId(`pkg_${dir}`);
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    const fwks: string[] = [];
    for (const k of Object.keys(allDeps ?? {})) {
      if (FRAMEWORK[k]) fwks.push(FRAMEWORK[k]);
    }

    components.push({
      id,
      name: pkg.name || dir,
      kind: 'compute',
      provider: 'generic',
      position: [0, 0],
      health: 'healthy',
      meta: {
        source: 'package.json',
        path: dir,
        framework: fwks.join(', ') || '—',
        deps: Object.keys(pkg.dependencies ?? {}).length,
      },
    });

    for (const [dep] of Object.entries(allDeps ?? {})) {
      for (const rule of DEP_RULES) {
        if (rule.match.test(dep)) {
          if (!externalsAdded.has(rule.externalId)) {
            components.push({
              id: rule.externalId,
              name: rule.externalName,
              kind: rule.kind,
              provider: 'generic',
              position: [0, 0],
              health: 'healthy',
              meta: { source: 'package.json (inferred)', via: dep },
            });
            externalsAdded.add(rule.externalId);
          }
          connections.push({
            id: `pk${++cn}`,
            from: id,
            to: rule.externalId,
            protocol: rule.kind === 'database' ? 'sql' : 'http',
            label: dep,
          });
        }
      }
    }
  }

  return {
    name: `package.json (${pkgFiles.length} packages)`,
    components,
    connections,
  };
}
