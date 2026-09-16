package httpserver

import (
	"encoding/json"
	"net/http"
	"time"

	"hackercockpit/internal/sse"
	"hackercockpit/internal/system"
)

func (s *Server) handleSystem(w http.ResponseWriter, r *http.Request) {
	info := system.Collect(r.Context())
	writeJSON(w, http.StatusOK, info)
}

// handleSystemStream pushes a fresh system.Info snapshot every 3s over SSE.
// v0.3 addition — the dashboard still polls /api/system by default so
// nothing breaks for clients that don't use it, but it's what a future
// "live mode" toggle in the UI is wired against.
func (s *Server) handleSystemStream(w http.ResponseWriter, r *http.Request) {
	stream, ok := sse.New(w)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	ctx := r.Context()
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()

	send := func() bool {
		info := system.Collect(ctx)
		data, err := json.Marshal(info)
		if err != nil {
			return false
		}
		stream.Send("system", string(data))
		return true
	}
	if !send() {
		return
	}
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if !send() {
				return
			}
		}
	}
}
