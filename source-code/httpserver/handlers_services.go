package httpserver

import (
	"net/http"

	"hackercockpit/internal/services"
)

func (s *Server) handleServicesList(w http.ResponseWriter, r *http.Request) {
	statuses := services.AllStatus(r.Context(), s.cfg.Services)
	writeJSON(w, http.StatusOK, map[string]any{"services": statuses})
}

func (s *Server) handleServicesControl(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseForm()
	name := r.FormValue("service_name")
	action := r.FormValue("action")

	if err := services.Control(r.Context(), name, action); err != nil {
		writeJSON(w, http.StatusOK, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	s.auditLog.Log(actorFromRequest(r), "service."+action, name)
	writeJSON(w, http.StatusOK, map[string]string{"status": "success", "message": "Service " + name + " " + action + "ed"})
}
