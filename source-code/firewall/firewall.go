package firewall

import (
	"context"
	"fmt"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

// Status describes ufw's current state and rule set.
type Status struct {
	Available bool     `json:"available"`
	Active    bool     `json:"active"`
	Rules     []string `json:"rules"`
	Raw       string   `json:"raw"`
}

// Get returns the current ufw status (numbered rule list).
func Get(ctx context.Context) Status {
	if _, err := exec.LookPath("ufw"); err != nil {
		return Status{Available: false, Rules: []string{}}
	}
	cctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	out, err := exec.CommandContext(cctx, "sudo", "ufw", "status", "numbered").CombinedOutput()
	text := string(out)
	if err != nil && text == "" {
		return Status{Available: true, Active: false, Rules: []string{}, Raw: "unable to query ufw (needs sudo)"}
	}
	active := strings.Contains(text, "Status: active")
	var rules []string
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "[") {
			rules = append(rules, line)
		}
	}
	if rules == nil {
		rules = []string{}
	}
	return Status{Available: true, Active: active, Rules: rules, Raw: text}
}

// SetEnabled turns the firewall on or off.
func SetEnabled(ctx context.Context, enabled bool) (string, error) {
	arg := "enable"
	if !enabled {
		arg = "disable"
	}
	cctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	// `ufw enable` prompts for confirmation on a real TTY; --force skips it.
	out, err := exec.CommandContext(cctx, "sudo", "ufw", "--force", arg).CombinedOutput()
	return string(out), err
}

var ruleRe = regexp.MustCompile(`^[\w./]+(:[0-9]{1,5}(:[0-9]{1,5})?)?(/(tcp|udp))?$`)

// ValidRule performs light validation on a rule spec like "22/tcp" or
// "192.168.1.0/24" before it's ever handed to a shell.
func ValidRule(spec string) bool {
	return len(spec) > 0 && len(spec) <= 60 && ruleRe.MatchString(spec)
}

// AddRule allows a port/service/subnet spec.
func AddRule(ctx context.Context, spec string) (string, error) {
	if !ValidRule(spec) {
		return "", fmt.Errorf("invalid rule spec")
	}
	cctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	out, err := exec.CommandContext(cctx, "sudo", "ufw", "allow", spec).CombinedOutput()
	return string(out), err
}

// DeleteRule removes a rule by its numbered index (as shown in Get()).
func DeleteRule(ctx context.Context, number int) (string, error) {
	if number <= 0 || number > 9999 {
		return "", fmt.Errorf("invalid rule number")
	}
	cctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	cmd := exec.CommandContext(cctx, "sudo", "ufw", "--force", "delete", fmt.Sprintf("%d", number))
	out, err := cmd.CombinedOutput()
	return string(out), err
}
