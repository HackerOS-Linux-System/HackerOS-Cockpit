package services

import (
	"context"
	"fmt"
	"os/exec"
	"regexp"
	"time"
)

var nameRe = regexp.MustCompile(`^[\w.\-]+$`)

// ValidName reports whether name is a safe systemd unit name to pass to
// systemctl (mirrors the original validateInput default pattern).
func ValidName(name string) bool {
	return len(name) > 0 && len(name) <= 100 && nameRe.MatchString(name)
}

// Status reports whether a single unit is active.
func Status(ctx context.Context, name string) bool {
	if !ValidName(name) {
		return false
	}
	cctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	out, err := exec.CommandContext(cctx, "systemctl", "is-active", name).Output()
	if err != nil {
		return false
	}
	return string(out) == "active\n" || string(out) == "active"
}

// AllStatus reports active/inactive for every service in names.
func AllStatus(ctx context.Context, names []string) map[string]bool {
	out := make(map[string]bool, len(names))
	type res struct {
		name   string
		active bool
	}
	ch := make(chan res, len(names))
	for _, n := range names {
		go func(n string) { ch <- res{n, Status(ctx, n)} }(n)
	}
	for range names {
		r := <-ch
		out[r.name] = r.active
	}
	return out
}

// Control performs start/stop/restart on a unit via `sudo systemctl`.
func Control(ctx context.Context, name, action string) error {
	if !ValidName(name) {
		return fmt.Errorf("invalid service name")
	}
	switch action {
	case "start", "stop", "restart":
	default:
		return fmt.Errorf("invalid action")
	}
	cctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	cmd := exec.CommandContext(cctx, "sudo", "systemctl", action, name)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("%s: %s", err, string(out))
	}
	return nil
}
