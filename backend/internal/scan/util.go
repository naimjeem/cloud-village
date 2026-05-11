package scan

import (
	"fmt"
	"regexp"

	"github.com/cloud-village/backend/internal/village"
)

var idSanitize = regexp.MustCompile(`[^a-zA-Z0-9_]`)

type IDMaker struct {
	seen map[string]bool
}

func NewIDMaker() *IDMaker {
	return &IDMaker{seen: map[string]bool{}}
}

func (m *IDMaker) Make(raw string, maxLen int) string {
	id := idSanitize.ReplaceAllString(raw, "_")
	if maxLen > 0 && len(id) > maxLen {
		id = id[:maxLen]
	}
	base := id
	i := 1
	for m.seen[id] {
		id = fmt.Sprintf("%s_%d", base, i)
		i++
	}
	m.seen[id] = true
	return id
}

func DedupeConnections(list []village.Connection) []village.Connection {
	seen := map[string]bool{}
	out := make([]village.Connection, 0, len(list))
	for _, c := range list {
		k := c.From + "->" + c.To
		if seen[k] {
			continue
		}
		seen[k] = true
		out = append(out, c)
	}
	return out
}
