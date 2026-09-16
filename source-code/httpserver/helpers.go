package httpserver

import (
	"encoding/json"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"

	"hackercockpit/web"
)

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func mustSub(f fs.FS, dir string) fs.FS {
	sub, err := fs.Sub(f, dir)
	if err != nil {
		panic(err)
	}
	return sub
}

// loadTemplate returns the named template's bytes, preferring an on-disk
// copy under cfg.TemplatesDir (lets an operator customize the panel without
// recompiling) and falling back to the copy embedded in the binary.
func (s *Server) loadTemplate(name string) ([]byte, error) {
	diskPath := filepath.Join(s.cfg.TemplatesDir, name)
	if data, err := os.ReadFile(diskPath); err == nil {
		return data, nil
	}
	return web.Templates.ReadFile("templates/" + name)
}

func (s *Server) handleIndex(w http.ResponseWriter, r *http.Request) {
	data, err := s.loadTemplate("app.html")
	if err != nil {
		http.Error(w, "template not found", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write(data)
}

func (s *Server) handleLoginPage(w http.ResponseWriter, r *http.Request) {
	if !s.cfg.AuthEnabled {
		http.Redirect(w, r, "/", http.StatusFound)
		return
	}
	data, err := s.loadTemplate("login.html")
	if err != nil {
		http.Error(w, "template not found", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write(data)
}
