package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/cloud-village/backend/internal/metrics"
	"github.com/cloud-village/backend/internal/scan"
	"github.com/cloud-village/backend/internal/village"
)

type scanRequest struct {
	Provider              string `json:"provider"`
	Region                string `json:"region,omitempty"`
	Profile               string `json:"profile,omitempty"`
	AccessKeyID           string `json:"accessKeyId,omitempty"`
	SecretAccessKey       string `json:"secretAccessKey,omitempty"`
	SessionToken          string `json:"sessionToken,omitempty"`
	APIToken              string `json:"apiToken,omitempty"`
	AccountID             string `json:"accountId,omitempty"`
	SocketPath            string `json:"socketPath,omitempty"`
	SubscriptionID        string `json:"subscriptionId,omitempty"`
	AzureTenantID         string `json:"azureTenantId,omitempty"`
	AzureClientID         string `json:"azureClientId,omitempty"`
	AzureClientSecret     string `json:"azureClientSecret,omitempty"`
	ProjectID             string `json:"projectId,omitempty"`
	GCPServiceAccountJSON string `json:"gcpServiceAccountJson,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func scanHandler(w http.ResponseWriter, r *http.Request) {
	var body scanRequest
	if r.ContentLength > 0 {
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2<<20)).Decode(&body); err != nil {
			writeErr(w, http.StatusBadRequest, "invalid json: "+err.Error())
			return
		}
	}
	ctx := r.Context()
	var (
		cfg any
		err error
	)
	switch body.Provider {
	case "aws":
		if body.Region == "" {
			writeErr(w, http.StatusBadRequest, "region required for aws")
			return
		}
		cfg, err = scan.AWS(ctx, scan.AWSArgs{
			Region:          body.Region,
			Profile:         body.Profile,
			AccessKeyID:     body.AccessKeyID,
			SecretAccessKey: body.SecretAccessKey,
			SessionToken:    body.SessionToken,
		})
	case "cloudflare":
		cfg, err = scan.Cloudflare(ctx, scan.CloudflareArgs{APIToken: body.APIToken, AccountID: body.AccountID})
	case "docker":
		cfg, err = scan.Docker(ctx, scan.DockerArgs{SocketPath: body.SocketPath})
	case "azure":
		cfg, err = scan.Azure(ctx, scan.AzureArgs{
			SubscriptionID: body.SubscriptionID,
			TenantID:       body.AzureTenantID,
			ClientID:       body.AzureClientID,
			ClientSecret:   body.AzureClientSecret,
		})
	case "gcp":
		cfg, err = scan.GCP(ctx, scan.GCPArgs{
			ProjectID:          body.ProjectID,
			ServiceAccountJSON: body.GCPServiceAccountJSON,
		})
	default:
		writeErr(w, http.StatusBadRequest, "Unsupported provider: "+body.Provider)
		return
	}
	if err != nil {
		log.Printf("[scan] %s %v", body.Provider, err)
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if c, ok := cfg.(*village.Config); ok && c != nil {
		if c.Components == nil {
			c.Components = []village.Component{}
		}
		if c.Connections == nil {
			c.Connections = []village.Connection{}
		}
	}
	writeJSON(w, http.StatusOK, cfg)
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8787"
	}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: []string{"*"},
		AllowedMethods: []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders: []string{"*"},
	}))

	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	})
	r.Post("/api/scan", scanHandler)
	r.Get("/api/metrics", metrics.Handler)

	log.Printf("[cloud-village] backend listening on :%s", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatal(err)
	}
}
