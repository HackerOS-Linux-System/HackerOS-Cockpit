package cron

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

// Job is one non-comment, non-empty crontab line.
type Job struct {
	Index int    `json:"index"`
	Line  string `json:"line"`
}

// List returns the current process user's crontab entries.
func List(ctx context.Context) []Job {
	cctx, cancel := context.WithTimeout(ctx, 6*time.Second)
	defer cancel()
	out, err := exec.CommandContext(cctx, "crontab", "-l").Output()
	if err != nil {
		return []Job{}
	}
	var jobs []Job
	i := 0
	for _, line := range strings.Split(string(out), "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		jobs = append(jobs, Job{Index: i, Line: trimmed})
		i++
	}
	if jobs == nil {
		jobs = []Job{}
	}
	return jobs
}

// Add appends a new line to the crontab. The line is passed through as-is
// (standard 5-field cron syntax + command) and only lightly sanity-checked.
func Add(ctx context.Context, line string) error {
	line = strings.TrimSpace(line)
	if line == "" || len(line) > 500 || strings.Contains(line, "\n") {
		return fmt.Errorf("invalid cron line")
	}
	existing := List(ctx)
	var sb strings.Builder
	for _, j := range existing {
		sb.WriteString(j.Line)
		sb.WriteByte('\n')
	}
	sb.WriteString(line)
	sb.WriteByte('\n')

	cctx, cancel := context.WithTimeout(ctx, 6*time.Second)
	defer cancel()
	cmd := exec.CommandContext(cctx, "crontab", "-")
	cmd.Stdin = strings.NewReader(sb.String())
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("%s: %s", err, string(out))
	}
	return nil
}

// RemoveAt deletes the job at the given index (as returned by List).
func RemoveAt(ctx context.Context, index int) error {
	existing := List(ctx)
	var sb strings.Builder
	found := false
	for _, j := range existing {
		if j.Index == index {
			found = true
			continue
		}
		sb.WriteString(j.Line)
		sb.WriteByte('\n')
	}
	if !found {
		return fmt.Errorf("job not found")
	}
	cctx, cancel := context.WithTimeout(ctx, 6*time.Second)
	defer cancel()
	cmd := exec.CommandContext(cctx, "crontab", "-")
	cmd.Stdin = strings.NewReader(sb.String())
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("%s: %s", err, string(out))
	}
	return nil
}
