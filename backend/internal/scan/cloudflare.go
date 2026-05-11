package scan

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"

	"github.com/cloud-village/backend/internal/village"
)

type CloudflareArgs struct {
	APIToken  string
	AccountID string
}

const cfBase = "https://api.cloudflare.com/client/v4"

type cfEnvelope struct {
	Success bool              `json:"success"`
	Errors  []json.RawMessage `json:"errors"`
	Result  json.RawMessage   `json:"result"`
}

func cfGet(ctx context.Context, path, token string, out any) error {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, cfBase+path, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("content-type", "application/json")
	r, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer r.Body.Close()
	body, _ := io.ReadAll(r.Body)
	if r.StatusCode/100 != 2 {
		return fmt.Errorf("Cloudflare %s → %d %s", path, r.StatusCode, string(body))
	}
	var env cfEnvelope
	if err := json.Unmarshal(body, &env); err != nil {
		return fmt.Errorf("Cloudflare %s decode: %w", path, err)
	}
	if !env.Success {
		return fmt.Errorf("Cloudflare %s: %s", path, string(body))
	}
	if out != nil && len(env.Result) > 0 {
		return json.Unmarshal(env.Result, out)
	}
	return nil
}

func Cloudflare(ctx context.Context, args CloudflareArgs) (*village.Config, error) {
	token := args.APIToken
	if token == "" {
		token = os.Getenv("CLOUDFLARE_API_TOKEN")
	}
	if token == "" {
		return nil, fmt.Errorf("Set CLOUDFLARE_API_TOKEN env var or pass apiToken in request")
	}

	acct := args.AccountID
	if acct == "" {
		acct = os.Getenv("CLOUDFLARE_ACCOUNT_ID")
	}
	if acct == "" {
		var accounts []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		}
		if err := cfGet(ctx, "/accounts", token, &accounts); err != nil {
			return nil, err
		}
		if len(accounts) == 0 {
			return nil, fmt.Errorf("No Cloudflare accounts visible to this token")
		}
		acct = accounts[0].ID
	}

	var components []village.Component
	var connections []village.Connection
	ids := NewIDMaker()
	add := func(id, name string, kind village.ComponentKind, meta map[string]any) {
		components = append(components, village.Component{
			ID: id, Name: name, Kind: kind, Provider: village.ProviderCloudflare,
			Position: [2]float64{0, 0}, Health: village.HealthHealthy, Meta: meta,
		})
	}

	// Workers
	func() {
		var scripts []struct {
			ID string `json:"id"`
		}
		if err := cfGet(ctx, "/accounts/"+acct+"/workers/scripts", token, &scripts); err != nil {
			log.Printf("CF Workers: %v", err)
			return
		}
		for _, s := range scripts {
			add(ids.Make("wkr_"+s.ID, 80), s.ID, village.KindCompute, map[string]any{"kind": "worker"})
		}
	}()

	// Pages
	func() {
		var projects []struct {
			Name      string `json:"name"`
			Subdomain string `json:"subdomain"`
		}
		if err := cfGet(ctx, "/accounts/"+acct+"/pages/projects", token, &projects); err != nil {
			log.Printf("CF Pages: %v", err)
			return
		}
		for _, p := range projects {
			add(ids.Make("pg_"+p.Name, 80), p.Name, village.KindCompute, map[string]any{"kind": "pages", "domain": p.Subdomain})
		}
	}()

	// KV
	func() {
		var ns []struct {
			ID    string `json:"id"`
			Title string `json:"title"`
		}
		if err := cfGet(ctx, "/accounts/"+acct+"/storage/kv/namespaces", token, &ns); err != nil {
			log.Printf("CF KV: %v", err)
			return
		}
		for _, n := range ns {
			add(ids.Make("kv_"+n.ID, 80), n.Title, village.KindCache, map[string]any{"kind": "kv"})
		}
	}()

	// R2
	func() {
		var r2 struct {
			Buckets []struct {
				Name string `json:"name"`
			} `json:"buckets"`
		}
		if err := cfGet(ctx, "/accounts/"+acct+"/r2/buckets", token, &r2); err != nil {
			log.Printf("CF R2: %v", err)
			return
		}
		for _, b := range r2.Buckets {
			add(ids.Make("r2_"+b.Name, 80), b.Name, village.KindStorage, map[string]any{"kind": "r2"})
		}
	}()

	// D1
	func() {
		var d1 []struct {
			UUID string `json:"uuid"`
			Name string `json:"name"`
		}
		if err := cfGet(ctx, "/accounts/"+acct+"/d1/database", token, &d1); err != nil {
			log.Printf("CF D1: %v", err)
			return
		}
		for _, d := range d1 {
			add(ids.Make("d1_"+d.UUID, 80), d.Name, village.KindDatabase, map[string]any{"kind": "d1"})
		}
	}()

	// Queues
	func() {
		var qs []struct {
			QueueName string `json:"queue_name"`
		}
		if err := cfGet(ctx, "/accounts/"+acct+"/queues", token, &qs); err != nil {
			log.Printf("CF Queues: %v", err)
			return
		}
		for _, q := range qs {
			add(ids.Make("q_"+q.QueueName, 80), q.QueueName, village.KindQueue, map[string]any{"kind": "queue"})
		}
	}()

	// Zones
	func() {
		var zones []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		}
		if err := cfGet(ctx, "/zones?account.id="+acct+"&per_page=50", token, &zones); err != nil {
			log.Printf("CF Zones: %v", err)
			return
		}
		for _, z := range zones {
			add(ids.Make("zn_"+z.ID, 80), z.Name, village.KindGateway, map[string]any{"kind": "zone"})
		}
	}()

	// Heuristic edges: Worker → bindables; Zone → Worker
	var workers, bindables, zones []village.Component
	for _, c := range components {
		k, _ := c.Meta["kind"].(string)
		switch k {
		case "worker":
			workers = append(workers, c)
		case "kv", "r2", "d1", "queue":
			bindables = append(bindables, c)
		case "zone":
			zones = append(zones, c)
		}
	}
	cn := 0
	for _, w := range workers {
		for _, b := range bindables {
			cn++
			connections = append(connections, village.Connection{
				ID: fmt.Sprintf("cf%d", cn), From: w.ID, To: b.ID, Protocol: "http",
			})
		}
	}
	for _, z := range zones {
		for _, w := range workers {
			cn++
			connections = append(connections, village.Connection{
				ID: fmt.Sprintf("cf%d", cn), From: z.ID, To: w.ID, Protocol: "http", Label: "route",
			})
		}
	}

	short := acct
	if len(short) > 8 {
		short = short[:8]
	}
	return &village.Config{
		Name:        fmt.Sprintf("Cloudflare (account %s, %d resources)", short, len(components)),
		Components:  components,
		Connections: connections,
	}, nil
}
