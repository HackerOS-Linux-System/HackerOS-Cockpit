package httpserver

import (
	"net/http"

	"hackercockpit/internal/diagnostics"
)

func (s *Server) handleDiagnostics(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, diagnostics.Run(r.Context()))
}
