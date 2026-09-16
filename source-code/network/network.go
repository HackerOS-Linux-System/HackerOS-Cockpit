package network

import (
	"context"
	"os/exec"
	"strings"
	"time"
)

// Connection is one row of the active-connections table.
type Connection struct {
	Proto  string `json:"proto"`
	Local  string `json:"local"`
	Remote string `json:"remote"`
	Status string `json:"status"`
}

// Connections lists up to 20 active TCP/UDP sockets, same shape/limit as
// the original implementation.
func Connections(ctx context.Context) []Connection {
	cctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	script := `ss -tuanp 2>/dev/null | awk 'NR>1 && $5!="*:*" && $6!="*:*" {print $1" "$5" "$6" "$2}' | head -20`
	out, err := exec.CommandContext(cctx, "bash", "-c", script).Output()
	if err != nil {
		return []Connection{}
	}
	var conns []Connection
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if line == "" {
			continue
		}
		p := strings.Fields(line)
		get := func(i int) string {
			if i < len(p) {
				return p[i]
			}
			return ""
		}
		conns = append(conns, Connection{Proto: get(0), Local: get(1), Remote: get(2), Status: get(3)})
	}
	if conns == nil {
		conns = []Connection{}
	}
	return conns
}

// Interface is a summary line for one NIC (v0.3 addition, powers the new
// "Interfaces" panel on the Network page).
type Interface struct {
	Name  string `json:"name"`
	State string `json:"state"`
	Addrs string `json:"addrs"`
}

// Interfaces lists local network interfaces with their state and addresses.
func Interfaces(ctx context.Context) []Interface {
	cctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	script := `ip -o -4 addr show 2>/dev/null; echo "---"; ip -o link show 2>/dev/null`
	out, err := exec.CommandContext(cctx, "bash", "-c", script).Output()
	if err != nil {
		return []Interface{}
	}
	sections := strings.SplitN(string(out), "---", 2)
	addrsByIf := map[string][]string{}
	if len(sections) > 0 {
		for _, line := range strings.Split(strings.TrimSpace(sections[0]), "\n") {
			f := strings.Fields(line)
			if len(f) >= 4 {
				addrsByIf[f[1]] = append(addrsByIf[f[1]], f[3])
			}
		}
	}
	var ifaces []Interface
	if len(sections) > 1 {
		for _, line := range strings.Split(strings.TrimSpace(sections[1]), "\n") {
			f := strings.Fields(line)
			if len(f) < 3 {
				continue
			}
			name := strings.TrimSuffix(f[1], ":")
			state := "DOWN"
			if strings.Contains(line, "UP") {
				state = "UP"
			}
			ifaces = append(ifaces, Interface{
				Name:  name,
				State: state,
				Addrs: strings.Join(addrsByIf[name], ", "),
			})
		}
	}
	if ifaces == nil {
		ifaces = []Interface{}
	}
	return ifaces
}
