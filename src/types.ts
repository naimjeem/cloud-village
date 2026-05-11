export type ComponentKind =
  | 'compute'      // EC2/Lambda/CloudRun → house/factory
  | 'storage'      // S3/GCS/Blob → warehouse
  | 'database'     // RDS/SQL → vault
  | 'queue'        // SQS/PubSub/ServiceBus → post office
  | 'gateway'      // API Gateway/ALB → town gate
  | 'cdn'          // CloudFront/CDN → radio tower
  | 'monitoring'   // CloudWatch/Stackdriver → watchtower
  | 'auth'         // Cognito/IAM → guardhouse
  | 'cache'        // Redis/Memcached → well
  | 'external';    // user/3rd-party → road traveler

export type CloudProvider = 'aws' | 'gcp' | 'azure' | 'cloudflare' | 'docker' | 'generic';

export type HealthStatus = 'healthy' | 'degraded' | 'down';

export interface VillageComponent {
  id: string;
  name: string;
  kind: ComponentKind;
  provider: CloudProvider;
  position: [number, number]; // x,z on ground plane
  meta?: Record<string, string | number>;
  health: HealthStatus;
}

export interface Connection {
  id: string;
  from: string; // component id
  to: string;
  protocol?: 'http' | 'grpc' | 'sql' | 'event' | 'tcp';
  label?: string;
}

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface Alert {
  id: string;
  componentId: string;
  severity: AlertSeverity;
  message: string;
  timestamp: number;
}

export interface FlowEvent {
  id: string;
  connectionId: string;
  // 0..1 progress along edge
  progress: number;
  speed: number;       // units/sec
  color?: string;
  kind: 'request' | 'response' | 'event';
}

export interface VillageConfig {
  name: string;
  components: VillageComponent[];
  connections: Connection[];
}
