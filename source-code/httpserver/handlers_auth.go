package httpserver

import (
	"net/http"
	"time"
)

func (s *Server) handleAuthMe(w http.ResponseWriter, r *http.Request) {
	resp := map[string]any{"auth_enabled": s.cfg.AuthEnabled}
	if s.cfg.AuthEnabled {
		resp["username"] = s.sessions.Username(r)
	}
	writeJSON(w, http.StatusOK, resp)
}

// loginAttempts is a very small in-memory brute-force throttle: no more
// than 5 attempts per source IP per minute. It resets on process restart,
// which is an acceptable trade-off for a single-operator admin panel.
type loginAttempts struct {
	byIP map[string][]time.Time
}

var attempts = loginAttempts{byIP: make(map[string][]time.Time)}

func (s *Server) handleAuthLogin(w http.ResponseWriter, r *http.Request) {
	if !s.cfg.AuthEnabled {
		writeJSON(w, http.StatusOK, map[string]string{"status": "error", "message": "auth is disabled"})
		return
	}

	ip := r.RemoteAddr
	now := time.Now()
	var recent []time.Time
	for _, t := range attempts.byIP[ip] {
		if now.Sub(t) < time.Minute {
			recent = append(recent, t)
		}
	}
	if len(recent) >= 5 {
		writeJSON(w, http.StatusTooManyRequests, map[string]string{"status": "error", "message": "too many attempts, slow down"})
		return
	}
	attempts.byIP[ip] = append(recent, now)

	_ = r.ParseForm()
	username := r.FormValue("username")
	password := r.FormValue("password")

	if !s.store.Verify(username, password) {
		s.auditLog.Log(username, "auth.login_failed", ip)
		writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "error", "message": "Invalid credentials"})
		return
	}
	if err := s.sessions.Create(w, r, username); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "could not start session"})
		return
	}
	s.auditLog.Log(username, "auth.login", ip)
	writeJSON(w, http.StatusOK, map[string]string{"status": "success"})
}

func (s *Server) handleAuthLogout(w http.ResponseWriter, r *http.Request) {
	actor := s.sessions.Username(r)
	s.sessions.Destroy(w, r)
	if actor != "" {
		s.auditLog.Log(actor, "auth.logout", "")
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "success"})
}

func (s *Server) handleAuthChangePassword(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseForm()
	newPassword := r.FormValue("new_password")
	if len(newPassword) < 8 {
		writeJSON(w, http.StatusOK, map[string]string{"status": "error", "message": "password must be at least 8 characters"})
		return
	}
	if err := s.store.SetPassword(newPassword); err != nil {
		writeJSON(w, http.StatusOK, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	s.auditLog.Log(actorFromRequest(r), "auth.password_changed", "")
	writeJSON(w, http.StatusOK, map[string]string{"status": "success", "message": "Password updated"})
}
