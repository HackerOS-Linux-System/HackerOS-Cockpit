package httpserver

import "net/http"

func (s *Server) handleAuditList(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"entries": s.auditLog.Tail(300)})
}
