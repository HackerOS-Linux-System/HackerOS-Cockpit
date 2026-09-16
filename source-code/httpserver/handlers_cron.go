package httpserver

import (
	"net/http"
	"strconv"

	"hackercockpit/internal/cron"
)

func (s *Server) handleCronList(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"jobs": cron.List(r.Context())})
}

func (s *Server) handleCronAdd(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseForm()
	line := r.FormValue("line")
	if err := cron.Add(r.Context(), line); err != nil {
		writeJSON(w, http.StatusOK, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	s.auditLog.Log(actorFromRequest(r), "cron.add", line)
	writeJSON(w, http.StatusOK, map[string]string{"status": "success", "message": "Job added"})
}

func (s *Server) handleCronRemove(w http.ResponseWriter, r *http.Request) {
	index, err := strconv.Atoi(r.URL.Query().Get("index"))
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]string{"status": "error", "message": "invalid index"})
		return
	}
	if err := cron.RemoveAt(r.Context(), index); err != nil {
		writeJSON(w, http.StatusOK, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	s.auditLog.Log(actorFromRequest(r), "cron.remove", strconv.Itoa(index))
	writeJSON(w, http.StatusOK, map[string]string{"status": "success", "message": "Job removed"})
}
