package httpserver

import (
	"net/http"
	"strconv"

	"hackercockpit/internal/firewall"
)

func (s *Server) handleFirewallStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, firewall.Get(r.Context()))
}

func (s *Server) handleFirewallToggle(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseForm()
	enabled := r.FormValue("enabled") == "true"
	out, err := firewall.SetEnabled(r.Context(), enabled)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]string{"status": "error", "message": out + " " + err.Error()})
		return
	}
	action := "firewall.enable"
	if !enabled {
		action = "firewall.disable"
	}
	s.auditLog.Log(actorFromRequest(r), action, "")
	writeJSON(w, http.StatusOK, map[string]string{"status": "success", "message": "Firewall state updated"})
}

func (s *Server) handleFirewallAddRule(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseForm()
	spec := r.FormValue("spec")
	out, err := firewall.AddRule(r.Context(), spec)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	s.auditLog.Log(actorFromRequest(r), "firewall.allow", spec)
	writeJSON(w, http.StatusOK, map[string]string{"status": "success", "message": "Rule added: " + out})
}

func (s *Server) handleFirewallDeleteRule(w http.ResponseWriter, r *http.Request) {
	number, err := strconv.Atoi(r.URL.Query().Get("number"))
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]string{"status": "error", "message": "invalid rule number"})
		return
	}
	out, err := firewall.DeleteRule(r.Context(), number)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]string{"status": "error", "message": out + " " + err.Error()})
		return
	}
	s.auditLog.Log(actorFromRequest(r), "firewall.delete", strconv.Itoa(number))
	writeJSON(w, http.StatusOK, map[string]string{"status": "success", "message": "Rule removed"})
}
