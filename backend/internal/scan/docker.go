package scan

import (
	"context"
	"fmt"
	"log"
	"regexp"
	"sort"
	"strings"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/volume"
	"github.com/docker/docker/client"

	"github.com/cloud-village/backend/internal/village"
)

type DockerArgs struct {
	SocketPath string
}

// DockerScanCache holds the per-component-id mapping from the last successful
// Docker scan so the metrics layer can reproduce stable component / connection
// IDs without re-running the full scan.
type DockerScanCache struct {
	SocketPath          string
	ComponentIDByCtrID  map[string]string // docker container ID → village component ID
	NetworksByComponent map[string][]string // network name → component IDs in that network
	ConnectionIDByPair  map[string]string // "fromID->toID" → connection ID
}

var lastDockerScan *DockerScanCache

func GetDockerCache() *DockerScanCache { return lastDockerScan }

var (
	reDatabase   = regexp.MustCompile(`postgres|mysql|mariadb|mongo|cockroach|cassandra|clickhouse`)
	reCache      = regexp.MustCompile(`redis|memcached`)
	reQueue      = regexp.MustCompile(`rabbitmq|kafka|nats|pulsar`)
	reGateway    = regexp.MustCompile(`nginx|traefik|caddy|envoy|haproxy`)
	reMonitoring = regexp.MustCompile(`prometheus|grafana|loki|jaeger|tempo|otel|elastic|kibana`)
	reStorage    = regexp.MustCompile(`minio|seaweedfs`)
	reAuth       = regexp.MustCompile(`keycloak|auth`)
)

func inferDockerKind(image, name string) village.ComponentKind {
	s := strings.ToLower(image + " " + name)
	switch {
	case reDatabase.MatchString(s):
		return village.KindDatabase
	case reCache.MatchString(s):
		return village.KindCache
	case reQueue.MatchString(s):
		return village.KindQueue
	case reGateway.MatchString(s):
		return village.KindGateway
	case reMonitoring.MatchString(s):
		return village.KindMonitoring
	case reStorage.MatchString(s):
		return village.KindStorage
	case reAuth.MatchString(s):
		return village.KindAuth
	}
	return village.KindCompute
}

func Docker(ctx context.Context, args DockerArgs) (*village.Config, error) {
	socket := args.SocketPath
	if socket == "" {
		socket = "/var/run/docker.sock"
	}
	cli, err := client.NewClientWithOpts(
		client.WithHost("unix://"+socket),
		client.WithAPIVersionNegotiation(),
	)
	if err != nil {
		return nil, fmt.Errorf("Cannot connect to Docker socket. Is Docker running? (%w)", err)
	}
	defer cli.Close()

	containers, err := cli.ContainerList(ctx, container.ListOptions{All: true})
	if err != nil {
		return nil, fmt.Errorf("Cannot connect to Docker socket. Is Docker running? (%w)", err)
	}
	sort.SliceStable(containers, func(i, j int) bool {
		ni, nj := containers[i].ID, containers[j].ID
		if len(containers[i].Names) > 0 {
			ni = containers[i].Names[0]
		}
		if len(containers[j].Names) > 0 {
			nj = containers[j].Names[0]
		}
		return ni < nj
	})

	var components []village.Component
	ids := NewIDMaker()

	// Volumes
	vols, err := cli.VolumeList(ctx, volume.ListOptions{})
	if err != nil {
		log.Printf("docker volumes: %v", err)
	} else {
		for _, v := range vols.Volumes {
			if v == nil {
				continue
			}
			id := ids.Make("vol_"+v.Name, 60)
			components = append(components, village.Component{
				ID: id, Name: v.Name, Kind: village.KindStorage, Provider: village.ProviderDocker,
				Position: [2]float64{0, 0}, Health: village.HealthHealthy,
				Meta: map[string]any{"driver": v.Driver},
			})
		}
	}

	// Containers
	networkContainers := map[string][]string{}
	ctrIDByName := map[string]string{}
	componentIDByCtrID := map[string]string{}
	for _, c := range containers {
		name := c.ID
		if len(c.Names) > 0 {
			name = strings.TrimPrefix(c.Names[0], "/")
		}
		id := ids.Make("ctr_"+name, 60)
		ctrIDByName[name] = id
		componentIDByCtrID[c.ID] = id
		kind := inferDockerKind(c.Image, name)
		health := village.HealthDegraded
		switch c.State {
		case "running":
			health = village.HealthHealthy
		case "exited":
			health = village.HealthDown
		}
		ports := make([]string, 0, len(c.Ports))
		for _, p := range c.Ports {
			s := fmt.Sprintf("%d", p.PrivatePort)
			if p.PublicPort != 0 {
				s += fmt.Sprintf("→%d", p.PublicPort)
			}
			s += "/" + p.Type
			ports = append(ports, s)
		}
		components = append(components, village.Component{
			ID: id, Name: name, Kind: kind, Provider: village.ProviderDocker,
			Position: [2]float64{0, 0}, Health: health,
			Meta: map[string]any{
				"image": c.Image,
				"state": c.State,
				"ports": strings.Join(ports, ", "),
			},
		})
		if c.NetworkSettings != nil {
			for net := range c.NetworkSettings.Networks {
				networkContainers[net] = append(networkContainers[net], id)
			}
		}
	}

	var connections []village.Connection
	cn := 0
	connectionIDByPair := map[string]string{}
	networksByComponent := map[string][]string{}
	netNames := make([]string, 0, len(networkContainers))
	for n := range networkContainers {
		netNames = append(netNames, n)
	}
	sort.Strings(netNames)
	for _, net := range netNames {
		if net == "bridge" || net == "host" || net == "none" {
			continue
		}
		list := append([]string(nil), networkContainers[net]...)
		sort.Strings(list)
		networksByComponent[net] = list
		for i := 0; i < len(list); i++ {
			for j := i + 1; j < len(list); j++ {
				cn++
				cid := fmt.Sprintf("dn%d", cn)
				connections = append(connections, village.Connection{
					ID: cid, From: list[i], To: list[j], Protocol: "tcp", Label: net,
				})
				connectionIDByPair[list[i]+"->"+list[j]] = cid
				connectionIDByPair[list[j]+"->"+list[i]] = cid
			}
		}
	}

	// Mount edges: container → volume
	for _, c := range containers {
		name := c.ID
		if len(c.Names) > 0 {
			name = strings.TrimPrefix(c.Names[0], "/")
		}
		ctrID, ok := ctrIDByName[name]
		if !ok {
			continue
		}
		for _, m := range c.Mounts {
			if string(m.Type) == "volume" && m.Name != "" {
				volID := idSanitize.ReplaceAllString("vol_"+m.Name, "_")
				if len(volID) > 60 {
					volID = volID[:60]
				}
				cn++
				connections = append(connections, village.Connection{
					ID: fmt.Sprintf("dm%d", cn), From: ctrID, To: volID, Protocol: "tcp", Label: "mount",
				})
			}
		}
	}

	lastDockerScan = &DockerScanCache{
		SocketPath:          socket,
		ComponentIDByCtrID:  componentIDByCtrID,
		NetworksByComponent: networksByComponent,
		ConnectionIDByPair:  connectionIDByPair,
	}

	return &village.Config{
		Name:        fmt.Sprintf("Docker local (%d resources)", len(components)),
		Components:  components,
		Connections: connections,
	}, nil
}
