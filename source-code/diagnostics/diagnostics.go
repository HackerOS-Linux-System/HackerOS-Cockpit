package diagnostics

import (
	"context"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

// Report is the JSON shape the dashboard's diagnostics grid consumes.
type Report struct {
	DiskOK      bool   `json:"disk_ok"`
	DiskPct     string `json:"disk_pct"`
	MemoryOK    bool   `json:"memory_ok"`
	MemoryPct   string `json:"memory_pct"`
	CPUOk       bool   `json:"cpu_ok"`
	CPULoad     string `json:"cpu_load"`
	DNSOk       bool   `json:"dns_ok"`
	NetworkOk   bool   `json:"network_ok"`
	SensorsInfo string `json:"sensors_info,omitempty"` // v0.3: present only if lm-sensors exists
}

func run(ctx context.Context, shellCmd string) string {
	cctx, cancel := context.WithTimeout(ctx, 6*time.Second)
	defer cancel()
	out, err := exec.CommandContext(cctx, "bash", "-c", shellCmd).Output()
	if err != nil {
		return "N/A"
	}
	return strings.TrimSpace(string(out))
}

// Run executes every health check concurrently and aggregates the result.
func Run(ctx context.Context) Report {
	type kv struct{ k, v string }
	jobs := map[string]string{
		"disk": `df / | awk 'NR==2{print $5}' | tr -d '%'`,
		"mem":  `free | awk 'NR==2{printf "%.0f", $3/$2*100}'`,
		"cpu":  `uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | tr -d ','`,
		"dns":  `dig +short google.com @8.8.8.8 2>/dev/null | head -1`,
		"ping": `ping -c 1 -W 2 8.8.8.8 2>/dev/null && echo ok || echo fail`,
	}
	ch := make(chan kv, len(jobs))
	for k, c := range jobs {
		go func(k, c string) { ch <- kv{k, run(ctx, c)} }(k, c)
	}
	raw := map[string]string{}
	for range jobs {
		r := <-ch
		raw[r.k] = r.v
	}

	diskPctInt, _ := strconv.Atoi(raw["disk"])
	memPctInt, _ := strconv.Atoi(raw["mem"])
	cpuLoadF, _ := strconv.ParseFloat(raw["cpu"], 64)

	rep := Report{
		DiskOK:    diskPctInt < 90,
		DiskPct:   raw["disk"],
		MemoryOK:  memPctInt < 90,
		MemoryPct: raw["mem"],
		CPUOk:     cpuLoadF < 4.0,
		CPULoad:   raw["cpu"],
		DNSOk:     raw["dns"] != "" && raw["dns"] != "N/A",
		NetworkOk: strings.TrimSpace(raw["ping"]) == "ok",
	}

	if _, err := exec.LookPath("sensors"); err == nil {
		rep.SensorsInfo = run(ctx, "sensors 2>/dev/null | head -40")
	}

	return rep
}
