package httpserver

import (
	"net/http"

	"hackercockpit/internal/network"
)

func (s *Server) handleNetwork(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"connections": network.Connections(r.Context())})
}

// handleNetworkInterfaces is a v0.3 addition.
func (s *Server) handleNetworkInterfaces(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"interfaces": network.Interfaces(r.Context())})
}
