package httpserver

import (
	"net/http"
	"time"

	"hackercockpit/internal/sse"
	"hackercockpit/internal/terminal"
)

func (s *Server) handleTerminal(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseForm()
	command := r.FormValue("command")

	if command == "" || len(command) > s.cfg.CommandMaxLen {
		writeJSON(w, http.StatusOK, map[string]string{"status": "error", "message": "Invalid command"})
		return
	}
	if terminal.Blocked(command) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "error", "message": "Command blocked for safety"})
		return
	}

	s.auditLog.Log(actorFromRequest(r), "terminal.exec", command)
	result := terminal.Run(r.Context(), command, time.Duration(s.cfg.TerminalTimeoutSec)*time.Second)
	if result.Err != nil {
		writeJSON(w, http.StatusOK, map[string]string{"status": "error", "output": result.Output})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "success", "output": result.Output})
}

// handleTerminalStream is a v0.3 addition: runs a command and pushes each
// line of output over SSE as it's produced, so long-running commands show
// progressive output instead of one blob at the end.
func (s *Server) handleTerminalStream(w http.ResponseWriter, r *http.Request) {
	command := r.URL.Query().Get("command")
	if command == "" || len(command) > s.cfg.CommandMaxLen {
		http.Error(w, "invalid command", http.StatusBadRequest)
		return
	}
	if terminal.Blocked(command) {
		http.Error(w, "command blocked for safety", http.StatusForbidden)
		return
	}

	stream, ok := sse.New(w)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	s.auditLog.Log(actorFromRequest(r), "terminal.stream", command)

	err := terminal.Stream(r.Context(), command, time.Duration(s.cfg.TerminalTimeoutSec)*time.Second, func(line string) {
		stream.Send("line", line)
	})
	if err != nil {
		stream.Send("error", err.Error())
	}
	stream.Send("done", "")
}
