package httpserver

import (
	"net/http"

	"hackercockpit/internal/logs"
)

func (s *Server) handleLogs(w http.ResponseWriter, r *http.Request) {
	logFile := r.URL.Query().Get("file")
	if logFile == "" {
		logFile = "/var/log/syslog"
	}
	allowed := false
	for _, a := range s.cfg.AllowedLogs {
		if a == logFile {
			allowed = true
			break
		}
	}
	if !allowed {
		logFile = "/var/log/syslog"
	}
	lines := logs.Tail(r.Context(), logFile, 150)
	writeJSON(w, http.StatusOK, map[string]any{"logs": lines})
}
