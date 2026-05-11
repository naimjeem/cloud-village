package scan

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"

	"golang.org/x/oauth2/google"

	"github.com/cloud-village/backend/internal/village"
)

type GCPArgs struct {
	ProjectID          string
	ServiceAccountJSON string
}

var gcpAssetKind = []struct {
	re   *regexp.Regexp
	kind village.ComponentKind
}{
	{regexp.MustCompile(`Instance$`), village.KindCompute},
	{regexp.MustCompile(`Cluster$`), village.KindCompute},
	{regexp.MustCompile(`Service$`), village.KindCompute},
	{regexp.MustCompile(`Function$`), village.KindCompute},
	{regexp.MustCompile(`Job$`), village.KindCompute},
	{regexp.MustCompile(`Bucket$`), village.KindStorage},
	{regexp.MustCompile(`Repository$`), village.KindStorage},
	{regexp.MustCompile(`Database`), village.KindDatabase},
	{regexp.MustCompile(`SqlInstance`), village.KindDatabase},
	{regexp.MustCompile(`Table$`), village.KindDatabase},
	{regexp.MustCompile(`Topic$`), village.KindQueue},
	{regexp.MustCompile(`Subscription$`), village.KindQueue},
	{regexp.MustCompile(`Queue$`), village.KindQueue},
	{regexp.MustCompile(`LoadBalancer`), village.KindGateway},
	{regexp.MustCompile(`UrlMap`), village.KindGateway},
	{regexp.MustCompile(`ApiGateway`), village.KindGateway},
	{regexp.MustCompile(`Backend(Service|Bucket)`), village.KindGateway},
	{regexp.MustCompile(`Cache$`), village.KindCache},
	{regexp.MustCompile(`Workflow`), village.KindCompute},
	{regexp.MustCompile(`LogSink|LogBucket|MetricDescriptor`), village.KindMonitoring},
	{regexp.MustCompile(`Secret`), village.KindAuth},
	{regexp.MustCompile(`ServiceAccount`), village.KindAuth},
	{regexp.MustCompile(`CryptoKey`), village.KindAuth},
}

func gcpKindFor(assetType string) (village.ComponentKind, bool) {
	tail := assetType
	for i := len(assetType) - 1; i >= 0; i-- {
		if assetType[i] == '/' {
			tail = assetType[i+1:]
			break
		}
	}
	for _, e := range gcpAssetKind {
		if e.re.MatchString(tail) {
			return e.kind, true
		}
	}
	return "", false
}

type gcpAsset struct {
	Name      string `json:"name"`
	AssetType string `json:"assetType"`
	Resource  struct {
		Location string `json:"location"`
	} `json:"resource"`
}

type gcpListResp struct {
	Assets        []gcpAsset `json:"assets"`
	NextPageToken string     `json:"nextPageToken"`
}

func GCP(ctx context.Context, args GCPArgs) (*village.Config, error) {
	project := args.ProjectID
	if project == "" {
		project = os.Getenv("GOOGLE_CLOUD_PROJECT")
	}

	var (
		creds *google.Credentials
		err   error
	)
	const scope = "https://www.googleapis.com/auth/cloud-platform.read-only"
	if args.ServiceAccountJSON != "" {
		creds, err = google.CredentialsFromJSON(ctx, []byte(args.ServiceAccountJSON), scope)
	} else {
		creds, err = google.FindDefaultCredentials(ctx, scope)
	}
	if err != nil {
		return nil, fmt.Errorf("gcp credentials: %w", err)
	}
	if project == "" {
		project = creds.ProjectID
	}
	if project == "" {
		return nil, fmt.Errorf("Set GOOGLE_CLOUD_PROJECT env var or pass projectId in request")
	}

	httpClient := http.DefaultClient
	if creds.TokenSource != nil {
		httpClient = oauth2HTTPClient(ctx, creds)
	}

	var components []village.Component
	ids := NewIDMaker()

	pageToken := ""
	for {
		u, _ := url.Parse(fmt.Sprintf("https://cloudasset.googleapis.com/v1/projects/%s/assets", project))
		q := u.Query()
		q.Set("contentType", "RESOURCE")
		q.Set("pageSize", "500")
		if pageToken != "" {
			q.Set("pageToken", pageToken)
		}
		u.RawQuery = q.Encode()

		req, _ := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
		r, err := httpClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("gcp list: %w", err)
		}
		body, _ := io.ReadAll(r.Body)
		r.Body.Close()
		if r.StatusCode/100 != 2 {
			return nil, fmt.Errorf("gcp list %d: %s", r.StatusCode, string(body))
		}
		var resp gcpListResp
		if err := json.Unmarshal(body, &resp); err != nil {
			return nil, fmt.Errorf("gcp decode: %w", err)
		}
		for _, a := range resp.Assets {
			kind, ok := gcpKindFor(a.AssetType)
			if !ok {
				continue
			}
			name := a.Name
			for i := len(name) - 1; i >= 0; i-- {
				if name[i] == '/' {
					name = name[i+1:]
					break
				}
			}
			id := ids.Make("gcp_"+name, 80)
			components = append(components, village.Component{
				ID: id, Name: name, Kind: kind, Provider: village.ProviderGCP,
				Position: [2]float64{0, 0}, Health: village.HealthHealthy,
				Meta: map[string]any{
					"assetType": a.AssetType,
					"location":  a.Resource.Location,
				},
			})
		}
		if resp.NextPageToken == "" {
			break
		}
		pageToken = resp.NextPageToken
	}

	var computes, targets []village.Component
	for _, c := range components {
		if c.Kind == village.KindCompute {
			computes = append(computes, c)
		}
		switch c.Kind {
		case village.KindDatabase, village.KindStorage, village.KindQueue, village.KindCache:
			targets = append(targets, c)
		}
	}
	var connections []village.Connection
	cn := 0
	const maxEdges = 200
outer:
	for _, c := range computes {
		for _, t := range targets {
			cn++
			connections = append(connections, village.Connection{
				ID: fmt.Sprintf("gcp%d", cn), From: c.ID, To: t.ID, Protocol: "http",
			})
			if len(connections) >= maxEdges {
				break outer
			}
		}
	}

	return &village.Config{
		Name:        fmt.Sprintf("GCP (project %s, %d resources)", project, len(components)),
		Components:  components,
		Connections: connections,
	}, nil
}
