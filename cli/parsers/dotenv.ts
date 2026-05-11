import fs from 'node:fs';
import path from 'node:path';
import type { ComponentKind, Connection, VillageComponent, VillageConfig } from '../../src/types';
import { safeId, walk } from '../util';

interface EnvRule {
  match: RegExp;
  externalId: string;
  externalName: string;
  kind: ComponentKind;
}

const ENV_RULES: EnvRule[] = [
  { match: /^DATABASE_URL$|^POSTGRES.*URL$|^PG.*URL$/, externalId: 'ext_postgres', externalName: 'Postgres', kind: 'database' },
  { match: /^MYSQL.*URL$|^MARIADB.*URL$/, externalId: 'ext_mysql', externalName: 'MySQL', kind: 'database' },
  { match: /^MONGO.*URI$|^MONGODB.*URI$|^MONGO.*URL$/, externalId: 'ext_mongo', externalName: 'MongoDB', kind: 'database' },
  { match: /^REDIS.*URL$|^REDIS.*HOST$/, externalId: 'ext_redis', externalName: 'Redis', kind: 'cache' },
  { match: /^AWS_(BUCKET|S3_BUCKET).*$|^S3_BUCKET$/, externalId: 'ext_s3', externalName: 'S3', kind: 'storage' },
  { match: /^DYNAMODB_.*$|^AWS_DYNAMODB.*$/, externalId: 'ext_ddb', externalName: 'DynamoDB', kind: 'database' },
  { match: /^SQS_.*URL$|^AWS_SQS.*$/, externalId: 'ext_sqs', externalName: 'SQS', kind: 'queue' },
  { match: /^STRIPE_(SECRET|API|PUBLISHABLE)_KEY$/, externalId: 'ext_stripe', externalName: 'Stripe', kind: 'external' },
  { match: /^(SENDGRID|RESEND|MAILGUN|POSTMARK)_API_KEY$/, externalId: 'ext_email', externalName: 'Email Provider', kind: 'external' },
  { match: /^TWILIO_(AUTH_TOKEN|ACCOUNT_SID)$/, externalId: 'ext_twilio', externalName: 'Twilio', kind: 'external' },
  { match: /^FIREBASE_.*$/, externalId: 'ext_firebase', externalName: 'Firebase', kind: 'external' },
  { match: /^OPENAI_API_KEY$/, externalId: 'ext_llm', externalName: 'OpenAI', kind: 'external' },
  { match: /^ANTHROPIC_API_KEY$/, externalId: 'ext_anthropic', externalName: 'Anthropic', kind: 'external' },
  { match: /^GEMINI_API_KEY$|^GOOGLE_AI_.*$/, externalId: 'ext_gemini', externalName: 'Gemini', kind: 'external' },
  { match: /^CLERK_.*KEY$|^NEXTAUTH_.*$|^AUTH0_.*$/, externalId: 'ext_auth', externalName: 'Auth Provider', kind: 'auth' },
  { match: /^ELASTIC.*URL$|^MEILI.*HOST$|^ALGOLIA_.*KEY$/, externalId: 'ext_search', externalName: 'Search Engine', kind: 'database' },
  { match: /^KAFKA_.*$/, externalId: 'ext_kafka', externalName: 'Kafka', kind: 'queue' },
  { match: /^RABBITMQ_.*$|^AMQP_URL$/, externalId: 'ext_rabbit', externalName: 'RabbitMQ', kind: 'queue' },
];

export function parseDotenv(root: string): VillageConfig {
  const components: VillageComponent[] = [];
  const connections: Connection[] = [];
  const externalsAdded = new Set<string>();
  let cn = 0;

  const envFiles: string[] = [];
  for (const f of walk(root)) {
    const base = path.basename(f);
    if (/^\.env(\.|$)/.test(base)) envFiles.push(f);
  }

  for (const file of envFiles) {
    let lines: string[];
    try {
      lines = fs.readFileSync(file, 'utf8').split('\n');
    } catch {
      continue;
    }
    const dir = path.relative(root, path.dirname(file)) || '.';
    const consumerId = safeId(`pkg_${dir}`); // assume same id as packageJson parser

    for (const line of lines) {
      const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=/);
      if (!m) continue;
      const key = m[1];
      for (const rule of ENV_RULES) {
        if (!rule.match.test(key)) continue;
        if (!externalsAdded.has(rule.externalId)) {
          components.push({
            id: rule.externalId,
            name: rule.externalName,
            kind: rule.kind,
            provider: 'generic',
            position: [0, 0],
            health: 'healthy',
            meta: { source: '.env (inferred)', via: key },
          });
          externalsAdded.add(rule.externalId);
        }
        connections.push({
          id: `en${++cn}`,
          from: consumerId,
          to: rule.externalId,
          protocol: rule.kind === 'database' ? 'sql' : 'http',
          label: key,
        });
      }
    }
  }

  return {
    name: `dotenv (${envFiles.length} files)`,
    components,
    connections,
  };
}
