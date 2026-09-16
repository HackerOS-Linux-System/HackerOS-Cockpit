package httpserver

import (
	"net/http"

	"hackercockpit/internal/dockermgr"
)

func (s *Server) handleContainersList(w http.ResponseWriter, r *http.Request) {
	containers, err := dockermgr.List(r.Context())
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"containers": containers})
}

func (s *Server) handleContainersAction(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseForm()
	id := r.FormValue("id")
	action := r.FormValue("action")
	out, err := dockermgr.Control(r.Context(), id, action)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]string{"status": "error", "message": out + " " + err.Error()})
		return
	}
	s.auditLog.Log(actorFromRequest(r), "container."+action, id)
	writeJSON(w, http.StatusOK, map[string]string{"status": "success", "message": "Container " + action + "ed"})
}

func (s *Server) handleContainersLogs(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	logsOut, err := dockermgr.Logs(r.Context(), id, 200)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "success", "logs": logsOut})
}
