package pkgmanager

import (
	"context"
	"fmt"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

var nameRe = regexp.MustCompile(`^[\w.\-]+$`)

// ValidName mirrors the original validateInput default pattern.
func ValidName(name string) bool {
	return len(name) > 0 && len(name) <= 100 && nameRe.MatchString(name)
}

// List returns up to 500 installed package names (dpkg -l, status "ii").
func List(ctx context.Context) []string {
	cctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	script := `dpkg -l 2>/dev/null | awk '/^ii/{print $2}' | head -500`
	out, err := exec.CommandContext(cctx, "bash", "-c", script).Output()
	if err != nil {
		return []string{}
	}
	var pkgs []string
	for _, l := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if l != "" {
			pkgs = append(pkgs, l)
		}
	}
	if pkgs == nil {
		pkgs = []string{}
	}
	return pkgs
}

// Manage installs or removes a package via apt-get, Debian-frontend
// non-interactive, same as the original.
func Manage(ctx context.Context, name, action string) error {
	if !ValidName(name) {
		return fmt.Errorf("invalid package name")
	}
	var verb string
	switch action {
	case "install":
		verb = "install -y"
	case "remove":
		verb = "remove -y"
	default:
		return fmt.Errorf("invalid action")
	}
	cctx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()
	cmd := exec.CommandContext(cctx, "bash", "-c",
		fmt.Sprintf("sudo DEBIAN_FRONTEND=noninteractive apt-get %s %s", verb, shellQuote(name)))
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("%s: %s", err, string(out))
	}
	return nil
}

func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}
