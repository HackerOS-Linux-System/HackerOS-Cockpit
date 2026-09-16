package system

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

// Info mirrors the JSON shape the frontend already understands.
type Info struct {
	CPUUsage      string    `json:"cpu_usage"`
	MemoryTotal   string    `json:"memory_total"`
	MemoryUsed    string    `json:"memory_used"`
	MemoryPercent string    `json:"memory_percent"`
	DiskTotal     string    `json:"disk_total"`
	DiskUsed      string    `json:"disk_used"`
	DiskPercent   string    `json:"disk_percent"`
	NetSent       string    `json:"net_sent"`
	NetRecv       string    `json:"net_recv"`
	Uptime        string    `json:"uptime"`
	Hostname      string    `json:"hostname"`
	Kernel        string    `json:"kernel"`
	OS            string    `json:"os"`
	Processes     []Process `json:"processes"`
}

// Process is one row of the top-processes table.
type Process struct {
	PID    string `json:"pid"`
	Name   string `json:"name"`
	CPU    string `json:"cpu"`
	Mem    string `json:"mem"`
	Status string `json:"status"`
}

func run(ctx context.Context, shellCmd string) string {
	cctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	cmd := exec.CommandContext(cctx, "bash", "-c", shellCmd)
	out, err := cmd.Output()
	if err != nil {
		return "N/A"
	}
	return strings.TrimSpace(string(out))
}

// Collect gathers a full snapshot of system metrics.
func Collect(ctx context.Context) Info {
	type result struct {
		key, val string
	}

	jobs := map[string]string{
		"cpu":      `top -bn1 | grep 'Cpu(s)' | awk '{print $2}'`,
		"mem":      `free -m | awk 'NR==2{print $2" "$3}'`,
		"disk":     `df -h / | awk 'NR==2{print $2" "$3" "$5}'`,
		"net":      `cat /proc/net/dev | awk 'NR>2{rx+=$2; tx+=$10} END{print rx" "tx}'`,
		"uptime":   `uptime -p`,
		"hostname": `hostname`,
		"kernel":   `uname -r`,
		"osinfo":   `cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2 | tr -d '"'`,
		"procs":    `ps aux --sort=-%cpu | awk 'NR>1 && NR<=11{print $1" "$2" "$3" "$4" "$8" "$11}'`,
	}

	results := make(chan result, len(jobs))
	for key, cmd := range jobs {
		go func(k, c string) { results <- result{k, run(ctx, c)} }(key, cmd)
	}

	raw := make(map[string]string, len(jobs))
	for range jobs {
		r := <-results
		raw[r.key] = r.val
	}

	memParts := strings.Fields(raw["mem"])
	memTotal, memUsed := "0", "0"
	if len(memParts) == 2 {
		memTotal, memUsed = memParts[0], memParts[1]
	}
	memPercent := "0"
	if raw["mem"] != "N/A" {
		if mt, err1 := strconv.ParseFloat(memTotal, 64); err1 == nil && mt > 0 {
			if mu, err2 := strconv.ParseFloat(memUsed, 64); err2 == nil {
				memPercent = strconv.Itoa(int(mu / mt * 100))
			}
		}
	}

	diskParts := strings.Fields(raw["disk"])
	diskTotal, diskUsed, diskPercent := "0", "0", "0"
	if len(diskParts) >= 3 {
		diskTotal, diskUsed = diskParts[0], diskParts[1]
		diskPercent = strings.TrimSuffix(diskParts[2], "%")
	}

	netParts := strings.Fields(raw["net"])
	netRecv, netSent := "0", "0"
	if len(netParts) == 2 {
		if v, err := strconv.ParseFloat(netParts[0], 64); err == nil {
			netRecv = fmt.Sprintf("%.1f", v/1024/1024)
		}
		if v, err := strconv.ParseFloat(netParts[1], 64); err == nil {
			netSent = fmt.Sprintf("%.1f", v/1024/1024)
		}
	}

	var processes []Process
	if raw["procs"] != "" && raw["procs"] != "N/A" {
		for _, line := range strings.Split(raw["procs"], "\n") {
			if line == "" {
				continue
			}
			p := strings.Fields(line)
			get := func(i int) string {
				if i < len(p) {
					return p[i]
				}
				return ""
			}
			processes = append(processes, Process{
				PID:    get(1),
				Name:   get(5),
				CPU:    orZero(get(2)),
				Mem:    orZero(get(3)),
				Status: get(4),
			})
		}
	}

	osName := raw["osinfo"]
	if osName == "" || osName == "N/A" {
		osName = "HackerOS/Debian"
	}

	return Info{
		CPUUsage:      orZero(raw["cpu"]),
		MemoryTotal:   memTotal,
		MemoryUsed:    memUsed,
		MemoryPercent: memPercent,
		DiskTotal:     diskTotal,
		DiskUsed:      diskUsed,
		DiskPercent:   diskPercent,
		NetSent:       netSent,
		NetRecv:       netRecv,
		Uptime:        orNA(raw["uptime"]),
		Hostname:      orNA(raw["hostname"]),
		Kernel:        orNA(raw["kernel"]),
		OS:            osName,
		Processes:     processes,
	}
}

func orZero(s string) string {
	if s == "" {
		return "0"
	}
	return s
}

func orNA(s string) string {
	if s == "" {
		return "N/A"
	}
	return s
}

// Hostname is a tiny convenience wrapper used by modules that only need
// the machine name without a full Collect() (e.g. the login banner).
func Hostname() string {
	if h, err := os.Hostname(); err == nil {
		return h
	}
	return "hackeros"
}
