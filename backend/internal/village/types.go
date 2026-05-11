package village

type ComponentKind string

const (
	KindCompute    ComponentKind = "compute"
	KindStorage    ComponentKind = "storage"
	KindDatabase   ComponentKind = "database"
	KindQueue      ComponentKind = "queue"
	KindGateway    ComponentKind = "gateway"
	KindCDN        ComponentKind = "cdn"
	KindMonitoring ComponentKind = "monitoring"
	KindAuth       ComponentKind = "auth"
	KindCache      ComponentKind = "cache"
	KindExternal   ComponentKind = "external"
)

type CloudProvider string

const (
	ProviderAWS        CloudProvider = "aws"
	ProviderGCP        CloudProvider = "gcp"
	ProviderAzure      CloudProvider = "azure"
	ProviderCloudflare CloudProvider = "cloudflare"
	ProviderDocker     CloudProvider = "docker"
	ProviderGeneric    CloudProvider = "generic"
)

type HealthStatus string

const (
	HealthHealthy  HealthStatus = "healthy"
	HealthDegraded HealthStatus = "degraded"
	HealthDown     HealthStatus = "down"
)

type Component struct {
	ID       string         `json:"id"`
	Name     string         `json:"name"`
	Kind     ComponentKind  `json:"kind"`
	Provider CloudProvider  `json:"provider"`
	Position [2]float64     `json:"position"`
	Meta     map[string]any `json:"meta,omitempty"`
	Health   HealthStatus   `json:"health"`
}

type Connection struct {
	ID       string `json:"id"`
	From     string `json:"from"`
	To       string `json:"to"`
	Protocol string `json:"protocol,omitempty"`
	Label    string `json:"label,omitempty"`
}

type Config struct {
	Name        string       `json:"name"`
	Components  []Component  `json:"components"`
	Connections []Connection `json:"connections"`
}
