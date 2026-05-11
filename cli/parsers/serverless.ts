import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import type { Connection, VillageComponent, VillageConfig } from '../../src/types';
import { safeId, walk } from '../util';

export function parseServerless(root: string): VillageConfig {
  const components: VillageComponent[] = [];
  const connections: Connection[] = [];
  const seenIds = new Set<string>();
  let cn = 0;

  const files: string[] = [];
  for (const f of walk(root)) {
    const base = path.basename(f);
    if (base === 'serverless.yml' || base === 'serverless.yaml') files.push(f);
  }

  for (const file of files) {
    let doc: any;
    try {
      doc = YAML.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    const stackName = doc?.service ?? path.basename(path.dirname(file));
    const fnIds: Record<string, string> = {};

    for (const [name, fn] of Object.entries<any>(doc?.functions ?? {})) {
      const id = safeId(`sls_${stackName}_${name}`);
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      fnIds[name] = id;
      components.push({
        id,
        name: `${stackName}/${name}`,
        kind: 'compute',
        provider: 'aws',
        position: [0, 0],
        health: 'healthy',
        meta: {
          source: 'serverless.yml',
          handler: fn?.handler ?? '',
          runtime: doc?.provider?.runtime ?? '',
          memory: fn?.memorySize ?? doc?.provider?.memorySize ?? 0,
        },
      });
    }

    // resources: AWS::DynamoDB::Table → database
    for (const [logicalName, res] of Object.entries<any>(doc?.resources?.Resources ?? {})) {
      const type = res?.Type ?? '';
      const props = res?.Properties ?? {};
      let kind: VillageComponent['kind'] | null = null;
      let name = props?.TableName || props?.BucketName || props?.QueueName || logicalName;
      if (type === 'AWS::DynamoDB::Table') kind = 'database';
      else if (type === 'AWS::S3::Bucket') kind = 'storage';
      else if (type === 'AWS::SQS::Queue') kind = 'queue';
      else if (type === 'AWS::SNS::Topic') kind = 'queue';
      if (!kind) continue;
      const id = safeId(`sls_${stackName}_${logicalName}`);
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      components.push({
        id,
        name,
        kind,
        provider: 'aws',
        position: [0, 0],
        health: 'healthy',
        meta: { source: 'serverless.yml', type },
      });
      // every function in this stack → resource
      for (const fid of Object.values(fnIds)) {
        connections.push({ id: `sl${++cn}`, from: fid, to: id, protocol: 'http' });
      }
    }
  }

  return {
    name: `serverless (${components.length} resources)`,
    components,
    connections,
  };
}
