package logs

import (
	"context"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

// Tail returns up to `lines` most recent lines of logFile, or of
// `journalctl` if the file can't be read.
func Tail(ctx context.Context, logFile string, lines int) []string {
	cctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	out, err := exec.CommandContext(cctx, "bash", "-c", "tail -n "+strconv.Itoa(lines)+" "+shellQuote(logFile)+" 2>/dev/null").Output()
	if err == nil && strings.TrimSpace(string(out)) != "" {
		return splitNonEmpty(string(out))
	}

	cctx2, cancel2 := context.WithTimeout(ctx, 8*time.Second)
	defer cancel2()
	out2, err2 := exec.CommandContext(cctx2, "journalctl", "-n", strconv.Itoa(lines), "--no-pager").Output()
	if err2 == nil {
		return splitNonEmpty(string(out2))
	}
	return []string{"Error: cannot read logs"}
}

func splitNonEmpty(s string) []string {
	var out []string
	for _, l := range strings.Split(s, "\n") {
		if l != "" {
			out = append(out, l)
		}
	}
	if out == nil {
		out = []string{}
	}
	return out
}

// shellQuote is a minimal single-quote escaper — logFile always comes from
// a server-side allow-list, but we quote defensively anyway.
func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}
