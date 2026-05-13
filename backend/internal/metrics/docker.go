package metrics

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	dtypes "github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"

	"github.com/cloud-village/backend/internal/scan"
)

const (
	dockerCPUDegradePct = 85.0
	dockerCPUDownPct    = 99.0
	dockerNetSampleRate = 1024.0
)

type dockerNetSample struct {
	at      time.Time
	rxBytes uint64
	txBytes uint64
}

var (
	dockerNetMu   sync.Mutex
	dockerNetPrev = map[string]dockerNetSample{}
)

func SnapshotDocker(ctx context.Context) (Snapshot, error) {
	cache := scan.GetDockerCache()
	if cache == nil {
		return emptySnapshot(), fmt.Errorf("no Docker scan in cache yet — run a Docker scan first")
	}
	cli, err := client.NewClientWithOpts(
		client.WithHost("unix://"+cache.SocketPath),
		client.WithAPIVersionNegotiation(),
	)
	if err != nil {
		return emptySnapshot(), fmt.Errorf("docker connect: %w", err)
	}
	defer cli.Close()

	containers, err := cli.ContainerList(ctx, container.ListOptions{All: true})
	if err != nil {
		return emptySnapshot(), fmt.Errorf("docker list: %w", err)
	}

	out := emptySnapshot()

	rateByCompID := map[string]float64{}
	for _, c := range containers {
		compID, ok := cache.ComponentIDByCtrID[c.ID]
		if !ok {
			continue
		}

		switch c.State {
		case "running":
			out.Health[compID] = "healthy"
		case "exited", "dead":
			out.Health[compID] = "down"
		default:
			out.Health[compID] = "degraded"
		}

		if c.State != "running" {
			continue
		}

		stats, statsErr := cli.ContainerStatsOneShot(ctx, c.ID)
		if statsErr != nil {
			continue
		}
		var s dtypes.StatsJSON
		decErr := json.NewDecoder(stats.Body).Decode(&s)
		stats.Body.Close()
		if decErr != nil {
			continue
		}

		cpu := dockerCPUPercent(s)

		var rx, tx uint64
		for _, n := range s.Networks {
			rx += n.RxBytes
			tx += n.TxBytes
		}
		dockerNetMu.Lock()
		now := time.Now()
		if prev, ok := dockerNetPrev[c.ID]; ok {
			dt := now.Sub(prev.at).Seconds()
			if dt > 0 {
				deltaBytes := float64(rx-prev.rxBytes) + float64(tx-prev.txBytes)
				rateByCompID[compID] = deltaBytes / dt / dockerNetSampleRate
			}
		}
		dockerNetPrev[c.ID] = dockerNetSample{at: now, rxBytes: rx, txBytes: tx}
		dockerNetMu.Unlock()

		if cpu >= dockerCPUDownPct {
			out.Health[compID] = "down"
			out.Alerts = append(out.Alerts, Alert{
				ComponentID: compID,
				Severity:    "critical",
				Message:     fmt.Sprintf("CPU saturated %.0f%%", cpu),
			})
		} else if cpu >= dockerCPUDegradePct {
			out.Health[compID] = "degraded"
			out.Alerts = append(out.Alerts, Alert{
				ComponentID: compID,
				Severity:    "warning",
				Message:     fmt.Sprintf("CPU %.0f%%", cpu),
			})
		}
	}

	for _, comps := range cache.NetworksByComponent {
		for i := 0; i < len(comps); i++ {
			for j := i + 1; j < len(comps); j++ {
				connID := cache.ConnectionIDByPair[comps[i]+"->"+comps[j]]
				if connID == "" {
					continue
				}
				r := rateByCompID[comps[i]] + rateByCompID[comps[j]]
				if r > 0 {
					out.EdgeRates[connID] = r
				}
			}
		}
	}

	return out, nil
}

func dockerCPUPercent(s dtypes.StatsJSON) float64 {
	cpuDelta := float64(s.CPUStats.CPUUsage.TotalUsage) - float64(s.PreCPUStats.CPUUsage.TotalUsage)
	sysDelta := float64(s.CPUStats.SystemUsage) - float64(s.PreCPUStats.SystemUsage)
	if cpuDelta <= 0 || sysDelta <= 0 {
		return 0
	}
	online := float64(s.CPUStats.OnlineCPUs)
	if online == 0 {
		online = float64(len(s.CPUStats.CPUUsage.PercpuUsage))
	}
	if online == 0 {
		online = 1
	}
	return (cpuDelta / sysDelta) * online * 100.0
}
