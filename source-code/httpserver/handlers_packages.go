package httpserver

import (
	"net/http"

	"hackercockpit/internal/pkgmanager"
)

// handlePackagesList is the v0.3 fix for a v2 bug: getPackages() existed
// server-side but was never exposed over HTTP.
func (s *Server) handlePackagesList(w http.ResponseWriter, r *http.Request) {
	pkgs := pkgmanager.List(r.Context())
	writeJSON(w, http.StatusOK, map[string]any{"packages": pkgs})
}

func (s *Server) handlePackagesManage(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseForm()
	name := r.FormValue("package_name")
	action := r.FormValue("action")

	if err := pkgmanager.Manage(r.Context(), name, action); err != nil {
		writeJSON(w, http.StatusOK, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	s.auditLog.Log(actorFromRequest(r), "package."+action, name)
	writeJSON(w, http.StatusOK, map[string]string{"status": "success", "message": "Package " + name + " " + action + "ed"})
}
