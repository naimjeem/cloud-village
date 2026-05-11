package metrics

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
)

type Snapshot struct {
	Health    map[string]string `json:"health"`
	EdgeRates map[string]float64 `json:"edgeRates"`
	Alerts    []Alert           `json:"alerts"`
}

type Alert struct {
	ComponentID string `json:"componentId"`
	Severity    string `json:"severity"`
	Message     string `json:"message"`
}

func emptySnapshot() Snapshot {
	return Snapshot{Health: map[string]string{}, EdgeRates: map[string]float64{}, Alerts: []Alert{}}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func Handler(w http.ResponseWriter, r *http.Request) {
	provider := strings.ToLower(r.URL.Query().Get("provider"))
	if provider == "aws" {
		snap, err := SnapshotAWS(r.Context())
		if err != nil {
			log.Printf("[metrics] aws %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, snap)
		return
	}
	writeJSON(w, http.StatusOK, emptySnapshot())
}
