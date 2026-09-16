package terminal

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os/exec"
	"regexp"
	"time"
)

var blocked = regexp.MustCompile(`(?i)\b(rm\s+-rf|mkfs|dd\s+if=|wipefs|shred\s+)|:\(\)\s*\{\s*:\s*\|\s*:&?\s*\}\s*;\s*:`)

// Blocked reports whether cmd contains a known-destructive pattern.
func Blocked(cmd string) bool {
	return blocked.MatchString(cmd)
}

// Result is the outcome of a single command execution.
type Result struct {
	Output string
	Err    error
}

// Run executes command through bash -c with a timeout, returning combined
// stdout+stderr — mirroring the original `stdout + stderr` concatenation.
func Run(ctx context.Context, command string, timeout time.Duration) Result {
	cctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	out, err := exec.CommandContext(cctx, "bash", "-c", command).CombinedOutput()
	return Result{Output: string(out), Err: err}
}

// Stream executes command and calls onLine for every line of combined
// output as it arrives — used by the v0.3 SSE terminal so long-running
// commands (apt upgrades, big greps, pentest tools launched manually) show
// progressive output instead of one big blob at the end.
func Stream(ctx context.Context, command string, timeout time.Duration, onLine func(string)) error {
	cctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	cmd := exec.CommandContext(cctx, "bash", "-c", command)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	cmd.Stderr = cmd.Stdout // combine, same semantics as Run()

	if err := cmd.Start(); err != nil {
		return err
	}

	reader := bufio.NewReader(stdout)
	for {
		line, readErr := reader.ReadString('\n')
		if len(line) > 0 {
			onLine(line)
		}
		if readErr != nil {
			if readErr != io.EOF {
				onLine(fmt.Sprintf("[stream error: %s]", readErr))
			}
			break
		}
	}

	return cmd.Wait()
}
