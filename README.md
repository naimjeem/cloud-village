# Cloud Village

> Interactive 3D cloud architecture map. Renders services as buildings in a stylized village. Live-scan AWS / Cloudflare / Azure / GCP / Docker. Watch traffic flow as particles along roads, alerts pulse buildings, day-night cycle, soft shadows, bloom.

![status](https://img.shields.io/badge/status-alpha-yellow)
![license](https://img.shields.io/badge/license-MIT-blue)
![stack](https://img.shields.io/badge/stack-React%20%2B%20three.js%20%2B%20Go-1f6feb)

![Cloud Village intro](docs/cloud-village-intro.gif)

> 📽 [Full 1080p MP4](docs/cloud-village-intro.mp4) · [Static poster](docs/cloud-village.png)

---

## Features

- **3D village** — services rendered as houses, vaults, silos, towers, gates. Per-kind PBR materials, soft shadows, bloom, HDRI lighting.
- **Day / night cycle** — dawn → day → dusk → night with stars, lamp glow, fog, lerped lighting. Manual or auto-advance (12 s per phase).
- **Five sources** — mock demo, JSON upload, Terraform `tfstate`, source-tree generator, or **live cloud scan** via the Go backend.
- **Live metrics** — polls backend every 4 s for CloudWatch alarms + ALB request rates → drives health states, edge particles, deduped alerts.
- **Animated traffic** — request / response / event particles arc along edges. Road color thickens + shifts brown → red as traffic rises, decays over time.
- **Click-to-inspect panel** — incoming / outgoing connections, replayable flows, alert triggers, health override, metadata view.
- **Settings UI** — store provider credentials (AWS keys, Cloudflare token, Azure service principal, GCP service account JSON) in browser `localStorage`. Used as scan-time overrides.

---

## Quick start

```sh
npm install
npm run dev                          # frontend  → http://localhost:5173
cd backend && go run .               # backend   → http://localhost:8787  (optional, needed for ☁ Live scan / 📈 Live metrics)
```

Requirements: **Node 18+**, **Go 1.22+**.

First load shows a mock SaaS village. Try ☁ Live scan, 📂 JSON, or generate from a real project.

---

## Generate village from any project

```sh
npm run generate -- /path/to/project
# writes /path/to/project/village.json

npm run generate -- /path/to/project -o /tmp/out.json
npm run generate -- . --skip k8s,serverless
```

Parsers (run by default):

| Parser | Reads | Produces |
|--------|-------|----------|
| **compose** | `docker-compose.yml` / `compose.yml` | service per `services.*`, edges from `depends_on`, kind from image |
| **pkg** | every `package.json` | compute node, externals inferred from deps (`pg`, `redis`, `mongoose`, `@aws-sdk/*`, `stripe`, `resend`, `openai`, …) |
| **env** | every `.env*` | externals from var names (`DATABASE_URL`, `REDIS_URL`, `STRIPE_*_KEY`, `OPENAI_API_KEY`, …) |
| **serverless** | `serverless.yml` | Lambda fn + DDB/S3/SQS/SNS resources + edges |
| **k8s** | yaml under `k8s/` `kube/` `manifests/` `deploy/` `charts/` `kustomize/` | Deployment / Service / StatefulSet / Job, Service→Deployment edges by `app` label |

Output is auto-laid-out (grid by kind, hubs centered by connection degree). Load via 📂 JSON.

---

## Loading architecture

| Source | Trigger | Description |
|--------|---------|-------------|
| Demo | default on first run | Mock SaaS village |
| Source-gen | `npm run generate -- <path>` | Auto-build from project source (compose, package.json, .env, serverless, k8s) |
| JSON | **📂 JSON** | Upload `VillageConfig` JSON. Schema below. |
| Terraform | **🧱 tfstate** | Upload `terraform.tfstate`. Extracts AWS resources, infers edges from IAM policies + ALB target groups + dependencies. |
| Live cloud | **☁ Live scan** | Calls backend `/api/scan` for AWS / Cloudflare / Docker / Azure / GCP. Creds come from **⚙ Settings** + backend env. |

Last loaded village persists in `localStorage` (`cloud-village:lastVillage`).

### JSON schema

```json
{
  "name": "string",
  "components": [
    {
      "id": "...", "name": "...",
      "kind": "compute|storage|database|queue|gateway|cdn|monitoring|auth|cache|external",
      "provider": "aws|gcp|azure|cloudflare|docker|generic",
      "position": [x, z], "health": "healthy|degraded|down",
      "meta": { "any": "string|number" }
    }
  ],
  "connections": [
    { "id": "...", "from": "id", "to": "id", "protocol": "http|grpc|sql|event|tcp", "label": "optional" }
  ]
}
```

Components with `position: [0, 0]` (or missing) get an auto-layout slot based on `kind` columns and connection degree.

---

## Building map

| Cloud kind | Building |
|------------|----------|
| compute    | house + pitched roof + lit windows |
| storage    | banded silo |
| database   | stacked vault discs + pulse beacon |
| queue      | post office + flag |
| gateway    | arched town gate w/ banners |
| cdn        | radio tower + dish + beacon |
| monitoring | watchtower + searchlight |
| auth       | guardhouse + lantern |
| cache      | well |
| external   | signpost / traveler |

---

## UI controls (toolbar)

| Button | Action |
|--------|--------|
| ▶ Simulate | Replay flows on every edge |
| ⚠ Alert | Spawn random alert on a component |
| ⏸ / ▶ Pause | Pause all animation |
| ↺ Reset | Reload mock village |
| 📂 JSON | Upload `VillageConfig` JSON |
| 🧱 tfstate | Upload Terraform state |
| ☁ Live scan | Open scan modal |
| ⚙ Settings | Open credentials modal |
| ⬇ Export | Download current village JSON |
| 🌅 / 🌞 / 🌆 / 🌙 | Cycle time-of-day phase |
| ⟳ Auto | Auto-advance phase every 12 s |
| 📈 Live metrics | Toggle backend metrics polling |

### Keyboard

| Key | Action |
|-----|--------|
| `/` | Focus search bar |
| `Esc` | Deselect / clear search |
| `Space` | Pause / resume animation |

---

## Animations

- **Request / response / event particles** arc along edges (blue / green / yellow).
- **Critical alerts** pulse the building red + slide a toast in (auto-dismiss 6 s, deduped 60 s window).
- **Health states** — green (healthy) / amber (degraded) / red (down) emissive glow.
- **Traffic heatmap** — roads thicken + shift brown → orange → red based on recent flow count, decays exponentially.
- **Day / night** — sun pos / color / intensity, hemisphere + ambient colors, fog, exposure, sky turbidity, bloom threshold, star field, lamp emissive — all lerp between phases. Auto-cycle: 12 s per phase.
- **Postprocessing** — Bloom + HueSaturation + BrightnessContrast + Vignette + ACES filmic tonemap + SMAA.
- **Live metrics mode** — client polls `/api/metrics` every 4 s. Falls back to client-side simulator only if no real scan has run.

---

## Backend

Go module at `backend/` exposing a small HTTP API.

```
backend/main.go                       # chi router, /health /api/scan /api/metrics
backend/internal/village/types.go     # VillageConfig / Component / Connection
backend/internal/scan/aws.go          # AWS SDK Go v2 (ECS, Lambda, DDB, ALB, S3, ECR, SQS, SNS, SFN, CloudFront, APIGW, CWLogs)
backend/internal/scan/cloudflare.go   # Cloudflare REST API
backend/internal/scan/docker.go       # Local Docker engine via docker SDK
backend/internal/scan/azure.go        # Azure Resource Manager SDK
backend/internal/scan/gcp.go          # GCP Cloud Asset Inventory (REST + google ADC)
backend/internal/metrics/aws.go       # CloudWatch alarms + ALB RequestCountPerTarget
backend/internal/metrics/handler.go   # /api/metrics provider switch
```

Endpoints:

- `GET  /health` — `{ok: true}`
- `POST /api/scan` — body `{ provider, ... }` → `VillageConfig`
- `GET  /api/metrics?provider=aws` — `{ health, edgeRates, alerts }`

### Credential resolution

| Provider | Precedence (highest first) |
|----------|----------------------------|
| **AWS** | ⚙ Settings static keys → ⚙ Settings profile → scan-body keys/profile → SDK default chain (env vars, `~/.aws/credentials`, SSO, IMDS) |
| **Cloudflare** | ⚙ Settings API token → scan-body token → `CLOUDFLARE_API_TOKEN` env |
| **Docker** | ⚙ Settings socket path → scan-body socket → `/var/run/docker.sock` |
| **Azure** | ⚙ Settings service principal (`tenantId` + `clientId` + `clientSecret`) → `DefaultAzureCredential` (env, `az login`, managed identity) |
| **GCP** | ⚙ Settings service-account JSON → Application Default Credentials (`gcloud auth application-default login`) |

Credentials entered in ⚙ Settings are stored in browser `localStorage` (key `cloud-village-creds`) in plaintext. Use read-only credentials only. For shared machines, prefer shell env vars on the backend.

### AWS IAM read-only perms

```
ecs:List*, ecs:Describe*
lambda:ListFunctions
dynamodb:ListTables, dynamodb:DescribeTable
elasticloadbalancing:Describe*
s3:ListAllMyBuckets
ecr:DescribeRepositories
sqs:ListQueues, sqs:GetQueueAttributes
sns:ListTopics
states:ListStateMachines
cloudfront:ListDistributions
apigateway:GET
logs:DescribeLogGroups
cloudwatch:DescribeAlarms, cloudwatch:GetMetricData
```

### Resource → kind per provider

| Provider | Mapping |
|----------|---------|
| AWS        | ECS / Lambda / SFN → compute, DDB → database, S3 / ECR → storage, SQS / SNS → queue, ALB / APIGW → gateway, CloudFront → cdn, CWLogs → monitoring |
| Cloudflare | Worker / Pages → compute, KV → cache, R2 → storage, D1 → database, Queues → queue, Zones → gateway |
| Docker     | postgres / mysql / mongo → database, redis → cache, rabbitmq / kafka → queue, nginx / traefik → gateway, prometheus / grafana → monitoring, others → compute |
| Azure      | VM / App / AKS / Functions → compute, Storage / ACR → storage, SQL / Postgres / MySQL / Cosmos → database, ServiceBus / EventHub → queue, LB / AppGW / APIM → gateway, CDN → cdn, Insights → monitoring, KeyVault → auth, Redis → cache |
| GCP        | GCE / GKE / CloudRun / Functions → compute, GCS / AR → storage, SQL / Spanner → database, PubSub / Tasks → queue, LB / APIGW → gateway, Memorystore → cache, Secret / IAM → auth |

---

## Tech stack

- **Frontend** — React 18, TypeScript, Vite
- **3D** — three.js via `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`
- **State** — `zustand`
- **Backend** — Go 1.22+, `chi` router, AWS SDK Go v2, Azure SDK, Docker SDK, `golang.org/x/oauth2/google`

---

## Security

- ⚙ Settings stores credentials in browser `localStorage` in plaintext. Anyone with access to the browser, browser extension permissions, or via XSS can read them. **Use read-only credentials only.**
- Never paste production write-capable keys.
- Backend forwards credentials directly to provider SDKs — it does not log or persist them.
- For shared / multi-user setups, prefer backend env vars or SSO-issued temporary credentials over the ⚙ Settings dialog.
- IAM perms in this README are read-only by design. Audit before granting.

---

## Roadmap

- [x] Phase 1 — 3D village render + mock data
- [x] Phase 2 — Click panel, health states
- [x] Phase 3 — Particle flow animation + alerts
- [x] Phase 4 — JSON config loader
- [x] Phase 5 — Terraform `tfstate` parser
- [x] Phase 6 — Live cloud scan backend (Go + chi + AWS SDK Go v2)
- [x] Phase 7 — Cloudflare, Docker, Azure, GCP scanners
- [x] Phase 8 — CloudWatch alarms + ALB request-rate metrics ingest
- [x] Phase 9 — Realistic rendering pass (HDRI, bloom, soft shadows, day/night, props)
- [x] Phase 10 — ⚙ Settings credential vault (per-provider)
- [ ] Phase 11 — Prometheus / Datadog metrics adapters
- [ ] Phase 12 — Code-split bundle (lazy-load three.js + postprocessing)
- [ ] Phase 13 — GLTF asset kit support (Quaternius / Kenney)
- [ ] Phase 14 — Multi-account / multi-region AWS scan in one render

---

## Contributing

PRs welcome. Keep parsers / scanners pure functions where possible. New backend providers go under `backend/internal/scan/<name>.go` and register in `main.go`. New frontend kinds go under `src/scene/Building.tsx` `buildingGeo()` switch.

```sh
npm run dev                # frontend
cd backend && go run .     # backend

# type-check / vet before PR
npx tsc --noEmit -p tsconfig.json
cd backend && go vet ./...
```

---

## License

MIT — see [LICENSE](LICENSE).

Built by [Naimuddin Shahjalal Bhuyan](https://naimjeem.me).
