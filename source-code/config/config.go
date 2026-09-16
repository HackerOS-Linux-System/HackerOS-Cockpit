package config

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// Config holds every tunable knob of the application.
type Config struct {
	Host string
	Port int

	TemplatesDir string
	PublicDir    string
	DataDir      string // where session secret, auth store and audit log live
	LogoPath     string

	// Auth
	AuthEnabled bool

	// Timeouts
	TerminalTimeoutSec int
	PentestTimeoutSec  int
	CommandMaxLen      int

	// Feature toggles
	SearchEnabled   bool
	NewsEnabled     bool
	DockerEnabled   bool
	FirewallEnabled bool
	CronEnabled     bool

	// Domain lists
	Services    []string
	AllowedLogs []string
}

func envStr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}

func envBool(key string, def bool) bool {
	if v := os.Getenv(key); v != "" {
		switch strings.ToLower(v) {
		case "1", "true", "yes", "on":
			return true
		case "0", "false", "no", "off":
			return false
		}
	}
	return def
}

func envList(key string, def []string) []string {
	if v := os.Getenv(key); v != "" {
		parts := strings.Split(v, ",")
		out := make([]string, 0, len(parts))
		for _, p := range parts {
			p = strings.TrimSpace(p)
			if p != "" {
				out = append(out, p)
			}
		}
		if len(out) > 0 {
			return out
		}
	}
	return def
}

// exeDir returns the directory the running binary lives in — used to locate
// bundled assets when they are not embedded (e.g. during `go run`).
func exeDir() string {
	exe, err := os.Executable()
	if err != nil {
		wd, _ := os.Getwd()
		return wd
	}
	resolved, err := filepath.EvalSymlinks(exe)
	if err != nil {
		resolved = exe
	}
	return filepath.Dir(resolved)
}

// Load builds a Config from the environment, applying HackerCockpit defaults.
func Load() *Config {
	base := exeDir()

	cfg := &Config{
		Host: envStr("HCKPT_HOST", "0.0.0.0"),
		Port: envInt("HCKPT_PORT", 4545),

		TemplatesDir: envStr("HCKPT_TEMPLATES_DIR", filepath.Join(base, "web", "templates")),
		PublicDir:    envStr("HCKPT_PUBLIC_DIR", filepath.Join(base, "web", "public")),
		DataDir:      envStr("HCKPT_DATA_DIR", envStr("HOME", ".")+"/.local/share/hackercockpit"),
		LogoPath:     envStr("HCKPT_LOGO_PATH", "/usr/share/HackerOS/ICONS/HackerOS.png"),

		AuthEnabled: envBool("HCKPT_AUTH", false),

		TerminalTimeoutSec: envInt("HCKPT_TERMINAL_TIMEOUT", 30),
		PentestTimeoutSec:  envInt("HCKPT_PENTEST_TIMEOUT", 300),
		CommandMaxLen:      envInt("HCKPT_COMMAND_MAX_LEN", 500),

		SearchEnabled:   envBool("HCKPT_FEATURE_SEARCH", true),
		NewsEnabled:     envBool("HCKPT_FEATURE_NEWS", true),
		DockerEnabled:   envBool("HCKPT_FEATURE_DOCKER", true),
		FirewallEnabled: envBool("HCKPT_FEATURE_FIREWALL", true),
		CronEnabled:     envBool("HCKPT_FEATURE_CRON", true),

		Services: envList("HCKPT_SERVICES", []string{
			"ssh", "apache2", "nginx", "docker", "mysql", "postgresql", "redis", "fail2ban", "cron", "ufw",
		}),
		AllowedLogs: envList("HCKPT_LOG_FILES", []string{
			"/var/log/syslog", "/var/log/auth.log", "/var/log/kern.log", "/var/log/dpkg.log",
		}),
	}

	_ = os.MkdirAll(cfg.DataDir, 0o700)

	return cfg
}
