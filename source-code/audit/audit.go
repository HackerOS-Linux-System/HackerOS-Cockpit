package audit

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Logger appends timestamped, single-line audit entries to a file.
type Logger struct {
	mu   sync.Mutex
	path string
}

// New opens (creating if needed) the audit log under dataDir/audit.log.
func New(dataDir string) *Logger {
	return &Logger{path: filepath.Join(dataDir, "audit.log")}
}

// Log appends one entry: "<RFC3339> [actor] action: detail".
func (l *Logger) Log(actor, action, detail string) {
	l.mu.Lock()
	defer l.mu.Unlock()

	f, err := os.OpenFile(l.path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return
	}
	defer f.Close()

	if actor == "" {
		actor = "anonymous"
	}
	line := fmt.Sprintf("%s [%s] %s: %s\n", time.Now().UTC().Format(time.RFC3339), actor, action, oneLine(detail))
	_, _ = f.WriteString(line)
}

// Tail returns the last N lines of the audit log (best-effort, simple
// implementation — fine for the modest sizes an admin-panel audit log
// reaches; see README for rotation notes).
func (l *Logger) Tail(n int) []string {
	l.mu.Lock()
	defer l.mu.Unlock()

	data, err := os.ReadFile(l.path)
	if err != nil {
		return []string{}
	}
	lines := splitLines(string(data))
	if len(lines) > n {
		lines = lines[len(lines)-n:]
	}
	return lines
}

func splitLines(s string) []string {
	var out []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == '\n' {
			if i > start {
				out = append(out, s[start:i])
			}
			start = i + 1
		}
	}
	if start < len(s) {
		out = append(out, s[start:])
	}
	return out
}

func oneLine(s string) string {
	out := make([]rune, 0, len(s))
	for _, r := range s {
		if r == '\n' || r == '\r' {
			out = append(out, ' ')
			continue
		}
		out = append(out, r)
	}
	return string(out)
}
