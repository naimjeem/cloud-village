import type {
  CloudProvider,
  ComponentKind,
  Connection,
  VillageComponent,
  VillageConfig,
} from '../types';
import { autoLayout } from './autoLayout';

interface TfStateResource {
  module?: string;
  mode: string;
  type: string;
  name: string;
  instances: Array<{
    attributes?: Record<string, any>;
    dependencies?: string[];
  }>;
}

interface TfState {
  version: number;
  resources?: TfStateResource[];
  // v3 schema: resources are nested inside modules[]
  modules?: Array<{
    path?: string[];
    resources?: Record<
      string,
      {
        type: string;
        primary?: { id?: string; attributes?: Record<string, any> };
        depends_on?: string[];
      }
    >;
  }>;
  // remote-state stub indicator
  backend?: unknown;
}

const TYPE_TO_KIND: Record<string, ComponentKind> = {
  // compute
  aws_ecs_service: 'compute',
  aws_lambda_function: 'compute',
  aws_instance: 'compute',
  aws_ecs_task_definition: 'compute',
  aws_sfn_state_machine: 'compute',
  aws_app_runner_service: 'compute',
  aws_batch_job_definition: 'compute',

  // storage
  aws_s3_bucket: 'storage',
  aws_ecr_repository: 'storage',
  aws_efs_file_system: 'storage',

  // database
  aws_dynamodb_table: 'database',
  aws_db_instance: 'database',
  aws_rds_cluster: 'database',
  aws_redshift_cluster: 'database',
  aws_docdb_cluster: 'database',
  aws_neptune_cluster: 'database',

  // queue
  aws_sqs_queue: 'queue',
  aws_sns_topic: 'queue',
  aws_kinesis_stream: 'queue',
  aws_eventbridge_bus: 'queue',
  aws_msk_cluster: 'queue',

  // gateway
  aws_lb: 'gateway',
  aws_alb: 'gateway',
  aws_api_gateway_rest_api: 'gateway',
  aws_apigatewayv2_api: 'gateway',

  // cdn
  aws_cloudfront_distribution: 'cdn',

  // monitoring
  aws_cloudwatch_log_group: 'monitoring',
  aws_cloudwatch_metric_alarm: 'monitoring',

  // auth
  aws_cognito_user_pool: 'auth',
  aws_iam_role: 'auth',

  // cache
  aws_elasticache_cluster: 'cache',
  aws_elasticache_replication_group: 'cache',
};

function detectProvider(type: string): CloudProvider {
  if (type.startsWith('aws_')) return 'aws';
  if (type.startsWith('google_')) return 'gcp';
  if (type.startsWith('azurerm_') || type.startsWith('azure_')) return 'azure';
  return 'generic';
}

function shortName(r: TfStateResource): string {
  const inst = r.instances[0]?.attributes ?? {};
  return (
    inst.name ||
    inst.bucket ||
    inst.repository_name ||
    inst.function_name ||
    inst.table_name ||
    `${r.type.replace(/^[a-z]+_/, '')}.${r.name}`
  );
}

function makeId(r: TfStateResource, taken: Set<string>): string {
  const base = `${r.module ?? 'root'}.${r.type}.${r.name}`
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '');
  let id = base;
  let i = 1;
  while (taken.has(id)) id = `${base}_${i++}`;
  taken.add(id);
  return id;
}

export function parseTerraformState(text: string): VillageConfig {
  let state: TfState;
  try {
    state = JSON.parse(text);
  } catch (e) {
    throw new Error(`Invalid JSON: ${(e as Error).message}`);
  }

  // Normalize v3 (modules[].resources{}) → v4 (resources[])
  let resources = state.resources;
  if (!resources && state.modules) {
    resources = [];
    for (const m of state.modules) {
      const modulePath =
        m.path && m.path.length > 1 ? `module.${m.path.slice(1).join('.module.')}` : '';
      for (const [key, r] of Object.entries(m.resources ?? {})) {
        const [type, name] = key.includes('.')
          ? [key.split('.')[0], key.split('.').slice(1).join('.')]
          : [r.type, key];
        resources.push({
          module: modulePath || undefined,
          mode: 'managed',
          type,
          name,
          instances: [
            {
              attributes: r.primary?.attributes,
              dependencies: r.depends_on,
            },
          ],
        });
      }
    }
  }

  if (!resources || resources.length === 0) {
    if (state.backend) {
      throw new Error(
        'This is a remote-state stub (S3/HTTP backend), not the actual state. Run:\n' +
          '  cd <terraform dir> && terraform state pull > pulled.tfstate\n' +
          'then load pulled.tfstate.'
      );
    }
    throw new Error('No resources found in tfstate (empty state).');
  }
  state = { ...state, resources };

  const ids = new Set<string>();
  const components: VillageComponent[] = [];
  const idByAddress = new Map<string, string>();
  const arnToId = new Map<string, string>();

  for (const r of state.resources ?? []) {
    if (r.mode !== 'managed') continue;
    const kind = TYPE_TO_KIND[r.type];
    if (!kind) continue;
    const id = makeId(r, ids);
    const inst = r.instances[0]?.attributes ?? {};
    const addr = `${r.module ? r.module + '.' : ''}${r.type}.${r.name}`;
    idByAddress.set(addr, id);
    if (inst.arn) arnToId.set(inst.arn as string, id);
    components.push({
      id,
      name: shortName(r),
      kind,
      provider: detectProvider(r.type),
      position: [0, 0],
      health: 'healthy',
      meta: pickMeta(r.type, inst),
    });
  }

  const connections = inferConnections(state, idByAddress, arnToId);

  // auto-layout
  const positioned = autoLayout(components, connections);

  return {
    name: `Terraform import (${components.length} resources)`,
    components: positioned,
    connections,
  };
}

function pickMeta(type: string, inst: Record<string, any>): Record<string, string | number> | undefined {
  const m: Record<string, string | number> = {};
  if (inst.region) m.region = inst.region;
  if (inst.engine) m.engine = inst.engine;
  if (inst.cpu) m.cpu = inst.cpu;
  if (inst.memory) m.memory = inst.memory;
  if (inst.runtime) m.runtime = inst.runtime;
  if (inst.handler) m.handler = inst.handler;
  if (type === 'aws_ecs_service' && inst.desired_count != null) m.desired_count = inst.desired_count;
  if (type === 'aws_dynamodb_table' && inst.billing_mode) m.billing = inst.billing_mode;
  if (type === 'aws_s3_bucket' && inst.bucket) m.bucket = inst.bucket;
  return Object.keys(m).length ? m : undefined;
}

function inferConnections(
  state: TfState,
  idByAddress: Map<string, string>,
  arnToId: Map<string, string>
): Connection[] {
  const connections: Connection[] = [];
  let cn = 0;

  // 1) explicit dependencies between known resources
  for (const r of state.resources ?? []) {
    if (r.mode !== 'managed') continue;
    const fromAddr = `${r.module ? r.module + '.' : ''}${r.type}.${r.name}`;
    const fromId = idByAddress.get(fromAddr);
    if (!fromId) continue;
    const deps = r.instances[0]?.dependencies ?? [];
    for (const dep of deps) {
      const toId = idByAddress.get(dep);
      if (toId && toId !== fromId) {
        connections.push({
          id: `c${++cn}`,
          from: toId,
          to: fromId,
          protocol: protocolForKinds(state, dep, fromAddr),
        });
      }
    }
  }

  // 2) IAM policies referencing ARNs of other resources → edges from role users to resource
  for (const r of state.resources ?? []) {
    if (r.mode !== 'managed') continue;
    if (r.type !== 'aws_iam_role_policy' && r.type !== 'aws_iam_policy') continue;
    const inst = r.instances[0]?.attributes ?? {};
    const policyDoc = typeof inst.policy === 'string' ? inst.policy : '';
    if (!policyDoc) continue;
    const referenced = new Set<string>();
    for (const arn of arnToId.keys()) {
      if (policyDoc.includes(arn)) referenced.add(arn);
    }
    if (!referenced.size) continue;

    // find the role this policy belongs to
    const roleAddr =
      (typeof inst.role === 'string' && inst.role.startsWith('arn:'))
        ? findArnAddress(state, inst.role)
        : null;

    // find ECS services / Lambdas that use this role
    const consumerIds = findConsumersOfRole(state, idByAddress, inst.role);
    if (!consumerIds.length) continue;

    for (const cid of consumerIds) {
      for (const arn of referenced) {
        const tid = arnToId.get(arn);
        if (!tid || tid === cid) continue;
        connections.push({ id: `c${++cn}`, from: cid, to: tid });
      }
    }
  }

  // 3) ALB listener rules → target groups → ECS services
  const targetGroupToService = new Map<string, string>();
  for (const r of state.resources ?? []) {
    if (r.type !== 'aws_ecs_service') continue;
    const inst = r.instances[0]?.attributes ?? {};
    const lbs = inst.load_balancer ?? [];
    const addr = `${r.module ? r.module + '.' : ''}${r.type}.${r.name}`;
    const sid = idByAddress.get(addr);
    if (!sid) continue;
    for (const lb of lbs) {
      if (lb.target_group_arn) targetGroupToService.set(lb.target_group_arn, sid);
    }
  }
  for (const r of state.resources ?? []) {
    if (r.type !== 'aws_lb_listener_rule' && r.type !== 'aws_alb_listener_rule') continue;
    const inst = r.instances[0]?.attributes ?? {};
    const actions = inst.action ?? [];
    const lbArn = inst.listener_arn as string | undefined;
    const lbId = lbArn ? findLbIdForListener(state, idByAddress, lbArn) : null;
    if (!lbId) continue;
    for (const a of actions) {
      const tg = a.target_group_arn;
      if (tg && targetGroupToService.has(tg)) {
        connections.push({
          id: `c${++cn}`,
          from: lbId,
          to: targetGroupToService.get(tg)!,
          protocol: 'http',
        });
      }
    }
  }

  // dedupe
  const seen = new Set<string>();
  return connections.filter((c) => {
    const k = `${c.from}->${c.to}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function protocolForKinds(_state: TfState, _from: string, _to: string): Connection['protocol'] {
  return 'http';
}

function findArnAddress(state: TfState, arn: string): string | null {
  for (const r of state.resources ?? []) {
    const a = r.instances[0]?.attributes ?? {};
    if (a.arn === arn) return `${r.module ? r.module + '.' : ''}${r.type}.${r.name}`;
  }
  return null;
}

function findConsumersOfRole(
  state: TfState,
  idByAddress: Map<string, string>,
  roleNameOrArn: any
): string[] {
  if (!roleNameOrArn) return [];
  const ids: string[] = [];
  for (const r of state.resources ?? []) {
    const inst = r.instances[0]?.attributes ?? {};
    const addr = `${r.module ? r.module + '.' : ''}${r.type}.${r.name}`;
    if (r.type === 'aws_ecs_task_definition') {
      if (inst.task_role_arn === roleNameOrArn || inst.execution_role_arn === roleNameOrArn) {
        // find ECS service that references this task def
        const td = inst.arn as string | undefined;
        if (td) {
          for (const r2 of state.resources ?? []) {
            if (r2.type !== 'aws_ecs_service') continue;
            const a2 = r2.instances[0]?.attributes ?? {};
            const addr2 = `${r2.module ? r2.module + '.' : ''}${r2.type}.${r2.name}`;
            if (a2.task_definition === td || (typeof a2.task_definition === 'string' && a2.task_definition.startsWith(td))) {
              const sid = idByAddress.get(addr2);
              if (sid) ids.push(sid);
            }
          }
        }
      }
    }
    if (r.type === 'aws_lambda_function' && inst.role === roleNameOrArn) {
      const lid = idByAddress.get(addr);
      if (lid) ids.push(lid);
    }
    if (r.type === 'aws_ecs_service' && inst.iam_role === roleNameOrArn) {
      const sid = idByAddress.get(addr);
      if (sid) ids.push(sid);
    }
  }
  return ids;
}

function findLbIdForListener(
  state: TfState,
  idByAddress: Map<string, string>,
  listenerArn: string
): string | null {
  for (const r of state.resources ?? []) {
    if (r.type !== 'aws_lb_listener' && r.type !== 'aws_alb_listener') continue;
    const inst = r.instances[0]?.attributes ?? {};
    if (inst.arn !== listenerArn) continue;
    const lbArn = inst.load_balancer_arn as string | undefined;
    if (!lbArn) return null;
    for (const r2 of state.resources ?? []) {
      if (r2.type !== 'aws_lb' && r2.type !== 'aws_alb') continue;
      const a2 = r2.instances[0]?.attributes ?? {};
      if (a2.arn !== lbArn) continue;
      const addr = `${r2.module ? r2.module + '.' : ''}${r2.type}.${r2.name}`;
      return idByAddress.get(addr) ?? null;
    }
  }
  return null;
}
