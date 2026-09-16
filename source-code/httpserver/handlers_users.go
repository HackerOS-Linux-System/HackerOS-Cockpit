package httpserver

import (
	"net/http"

	"hackercockpit/internal/users"
)

// handleUsersList / handleGroupsList are the v0.3 fix for a v2 bug: the
// frontend faked these by sending raw shell commands through /api/terminal.
func (s *Server) handleUsersList(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"users": users.List(r.Context())})
}

func (s *Server) handleGroupsList(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"groups": users.Groups(r.Context())})
}
