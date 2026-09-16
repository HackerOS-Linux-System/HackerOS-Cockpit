package httpserver

import (
	"net/http"

	"hackercockpit/internal/search"
)

func (s *Server) handleSearch(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseForm()
	q := r.FormValue("q")
	if q == "" {
		writeJSON(w, http.StatusOK, map[string]any{"results": []search.Result{}})
		return
	}
	results, err := search.Search(r.Context(), q)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"results": []search.Result{}, "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"results": results})
}
