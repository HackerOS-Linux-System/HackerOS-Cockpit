package httpserver

import (
	"net/http"

	"hackercockpit/internal/files"
)

func (s *Server) handleFilesList(w http.ResponseWriter, r *http.Request) {
	dirPath := r.URL.Query().Get("path")
	if dirPath == "" {
		dirPath = "/"
	}
	entries := files.List(dirPath)
	writeJSON(w, http.StatusOK, map[string]any{"files": entries, "path": dirPath})
}

// handleFilesRead is a v0.3 addition: a size-capped text preview so the
// File Explorer can show a file's content without dropping into the
// terminal tab.
func (s *Server) handleFilesRead(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	if path == "" {
		writeJSON(w, http.StatusOK, map[string]string{"status": "error", "message": "missing path"})
		return
	}
	content, truncated, err := files.ReadPreview(path)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]string{"status": "error", "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "success", "content": content, "truncated": truncated})
}
