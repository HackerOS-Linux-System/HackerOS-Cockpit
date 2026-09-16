package sse

import (
	"fmt"
	"net/http"
)

// Writer wraps an http.ResponseWriter configured for an SSE stream.
type Writer struct {
	w  http.ResponseWriter
	fl http.Flusher
}

// New prepares w for SSE and returns a Writer, or ok=false if the
// ResponseWriter doesn't support flushing (should not happen with the
// standard net/http server).
func New(w http.ResponseWriter) (*Writer, bool) {
	fl, ok := w.(http.Flusher)
	if !ok {
		return nil, false
	}
	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-cache")
	h.Set("Connection", "keep-alive")
	h.Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	fl.Flush()
	return &Writer{w: w, fl: fl}, true
}

// Send writes one SSE "event: <name>\ndata: <payload>\n\n" frame and flushes.
func (s *Writer) Send(event, data string) {
	if event != "" {
		fmt.Fprintf(s.w, "event: %s\n", event)
	}
	for _, line := range splitLines(data) {
		fmt.Fprintf(s.w, "data: %s\n", line)
	}
	fmt.Fprint(s.w, "\n")
	s.fl.Flush()
}

func splitLines(s string) []string {
	var lines []string
	start := 0
	for i, c := range s {
		if c == '\n' {
			lines = append(lines, s[start:i])
			start = i + 1
		}
	}
	lines = append(lines, s[start:])
	return lines
}
