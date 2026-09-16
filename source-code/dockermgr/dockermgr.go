package dockermgr

import (
	"context"
	"fmt"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

// Container is one row in the container list.
type Container struct {
	ID     string `json:"id"`
	Image  string `json:"image"`
	Status string `json:"status"`
	Name   string `json:"name"`
}

func binary() string {
	if _, err := exec.LookPath("docker"); err == nil {
		return "docker"
	}
	if _, err := exec.LookPath("podman"); err == nil {
		return "podman"
	}
	return ""
}

// Available reports whether a container engine was found, and which one.
func Available() (string, bool) {
	b := binary()
	return b, b != ""
}

// List returns all containers (running + stopped).
func List(ctx context.Context) ([]Container, error) {
	bin := binary()
	if bin == "" {
		return nil, fmt.Errorf("no container engine (docker/podman) found on this host")
	}
	cctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	out, err := exec.CommandContext(cctx, bin, "ps", "-a", "--format", "{{.ID}}\t{{.Image}}\t{{.Status}}\t{{.Names}}").Output()
	if err != nil {
		return nil, err
	}
	var containers []Container
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if line == "" {
			continue
		}
		f := strings.Split(line, "\t")
		get := func(i int) string {
			if i < len(f) {
				return f[i]
			}
			return ""
		}
		containers = append(containers, Container{ID: get(0), Image: get(1), Status: get(2), Name: get(3)})
	}
	if containers == nil {
		containers = []Container{}
	}
	return containers, nil
}

var idRe = regexp.MustCompile(`^[a-zA-Z0-9_.\-]+$`)

// ValidID performs light validation on a container id/name before exec.
func ValidID(id string) bool {
	return len(id) > 0 && len(id) <= 128 && idRe.MatchString(id)
}

// Control runs start/stop/restart/rm on a container.
func Control(ctx context.Context, id, action string) (string, error) {
	bin := binary()
	if bin == "" {
		return "", fmt.Errorf("no container engine found")
	}
	if !ValidID(id) {
		return "", fmt.Errorf("invalid container id")
	}
	switch action {
	case "start", "stop", "restart", "rm":
	default:
		return "", fmt.Errorf("invalid action")
	}
	cctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	out, err := exec.CommandContext(cctx, bin, action, id).CombinedOutput()
	return string(out), err
}

// Logs returns the last N lines of a container's logs.
func Logs(ctx context.Context, id string, lines int) (string, error) {
	bin := binary()
	if bin == "" {
		return "", fmt.Errorf("no container engine found")
	}
	if !ValidID(id) {
		return "", fmt.Errorf("invalid container id")
	}
	cctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	out, err := exec.CommandContext(cctx, bin, "logs", "--tail", fmt.Sprintf("%d", lines), id).CombinedOutput()
	return string(out), err
}
