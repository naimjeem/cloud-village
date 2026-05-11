package scan

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore"
	"github.com/Azure/azure-sdk-for-go/sdk/azidentity"
	"github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/resources/armresources"

	"github.com/cloud-village/backend/internal/village"
)

type AzureArgs struct {
	SubscriptionID string
	TenantID       string
	ClientID       string
	ClientSecret   string
}

var azureTypeToKind = map[string]village.ComponentKind{
	"microsoft.compute/virtualmachines":             village.KindCompute,
	"microsoft.compute/virtualmachinescalesets":     village.KindCompute,
	"microsoft.web/sites":                           village.KindCompute,
	"microsoft.web/serverfarms":                     village.KindCompute,
	"microsoft.containerservice/managedclusters":    village.KindCompute,
	"microsoft.containerinstance/containergroups":   village.KindCompute,
	"microsoft.app/containerapps":                   village.KindCompute,
	"microsoft.batch/batchaccounts":                 village.KindCompute,
	"microsoft.logic/workflows":                     village.KindCompute,
	"microsoft.storage/storageaccounts":             village.KindStorage,
	"microsoft.containerregistry/registries":        village.KindStorage,
	"microsoft.sql/servers":                         village.KindDatabase,
	"microsoft.sql/servers/databases":               village.KindDatabase,
	"microsoft.dbforpostgresql/servers":             village.KindDatabase,
	"microsoft.dbforpostgresql/flexibleservers":     village.KindDatabase,
	"microsoft.dbformysql/servers":                  village.KindDatabase,
	"microsoft.dbformysql/flexibleservers":          village.KindDatabase,
	"microsoft.documentdb/databaseaccounts":         village.KindDatabase,
	"microsoft.servicebus/namespaces":               village.KindQueue,
	"microsoft.eventhub/namespaces":                 village.KindQueue,
	"microsoft.eventgrid/topics":                    village.KindQueue,
	"microsoft.network/loadbalancers":               village.KindGateway,
	"microsoft.network/applicationgateways":         village.KindGateway,
	"microsoft.apimanagement/service":               village.KindGateway,
	"microsoft.network/frontdoors":                  village.KindGateway,
	"microsoft.cdn/profiles":                        village.KindCDN,
	"microsoft.insights/components":                 village.KindMonitoring,
	"microsoft.operationalinsights/workspaces":      village.KindMonitoring,
	"microsoft.aad/domainservices":                  village.KindAuth,
	"microsoft.keyvault/vaults":                     village.KindAuth,
	"microsoft.cache/redis":                         village.KindCache,
}

func Azure(ctx context.Context, args AzureArgs) (*village.Config, error) {
	subID := args.SubscriptionID
	if subID == "" {
		subID = os.Getenv("AZURE_SUBSCRIPTION_ID")
	}
	if subID == "" {
		return nil, fmt.Errorf("Set AZURE_SUBSCRIPTION_ID env var or pass subscriptionId in request")
	}

	var cred azcore.TokenCredential
	if args.TenantID != "" && args.ClientID != "" && args.ClientSecret != "" {
		c, err := azidentity.NewClientSecretCredential(args.TenantID, args.ClientID, args.ClientSecret, nil)
		if err != nil {
			return nil, fmt.Errorf("azure client secret credential: %w", err)
		}
		cred = c
	} else {
		c, err := azidentity.NewDefaultAzureCredential(nil)
		if err != nil {
			return nil, fmt.Errorf("azure credential: %w", err)
		}
		cred = c
	}
	client, err := armresources.NewClient(subID, cred, nil)
	if err != nil {
		return nil, fmt.Errorf("azure client: %w", err)
	}

	var components []village.Component
	ids := NewIDMaker()

	pager := client.NewListPager(nil)
	for pager.More() {
		page, err := pager.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("azure list: %w", err)
		}
		for _, r := range page.Value {
			if r.Type == nil || r.Name == nil || r.ID == nil {
				continue
			}
			key := strings.ToLower(*r.Type)
			kind, ok := azureTypeToKind[key]
			if !ok {
				continue
			}
			id := ids.Make("az_"+*r.Name, 80)
			location := ""
			if r.Location != nil {
				location = *r.Location
			}
			rg := ""
			if parts := strings.SplitN(*r.ID, "/resourceGroups/", 2); len(parts) == 2 {
				if rest := strings.SplitN(parts[1], "/", 2); len(rest) > 0 {
					rg = rest[0]
				}
			}
			components = append(components, village.Component{
				ID: id, Name: *r.Name, Kind: kind, Provider: village.ProviderAzure,
				Position: [2]float64{0, 0}, Health: village.HealthHealthy,
				Meta: map[string]any{
					"type":     *r.Type,
					"location": location,
					"rg":       rg,
				},
			})
		}
	}

	// Heuristic edges within resource group
	byRG := map[string][]village.Component{}
	for _, c := range components {
		rg, _ := c.Meta["rg"].(string)
		if rg == "" {
			continue
		}
		byRG[rg] = append(byRG[rg], c)
	}
	var connections []village.Connection
	cn := 0
	for _, members := range byRG {
		var computes, targets []village.Component
		for _, m := range members {
			switch m.Kind {
			case village.KindCompute:
				computes = append(computes, m)
			case village.KindDatabase, village.KindStorage, village.KindCache, village.KindQueue:
				targets = append(targets, m)
			}
		}
		for _, c := range computes {
			for _, t := range targets {
				cn++
				connections = append(connections, village.Connection{
					ID: fmt.Sprintf("az%d", cn), From: c.ID, To: t.ID, Protocol: "http",
				})
			}
		}
	}

	short := subID
	if len(short) > 8 {
		short = short[:8]
	}
	return &village.Config{
		Name:        fmt.Sprintf("Azure (sub %s, %d resources)", short, len(components)),
		Components:  components,
		Connections: connections,
	}, nil
}
