package httpserver

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"

	"hackercockpit/internal/audit"
	"hackercockpit/internal/auth"
	"hackercockpit/internal/config"
	"hackercockpit/internal/news"
	"hackercockpit/web"
)

// Server holds every dependency the HTTP handlers need.
type Server struct {
	cfg       *config.Config
	store     *auth.Store
	sessions  *auth.SessionManager
	auditLog  *audit.Logger
	newsCache *news.Cache
	mux       *http.ServeMux
}

// New builds a Server, bootstrapping the credential store if auth is
// enabled. genPassword is non-empty exactly once — the first time an admin
// account is created — and must be shown to the operator and then discarded.
func New(cfg *config.Config) (srv *Server, genPassword string, err error) {
	s := &Server{
		cfg:       cfg,
		sessions:  auth.NewSessionManager(),
		auditLog:  audit.New(cfg.DataDir),
		newsCache: news.NewCache(60 * time.Minute),
		mux:       http.NewServeMux(),
	}

	if cfg.AuthEnabled {
		store, gen, err := auth.NewStore(cfg.DataDir)
		if err != nil {
			return nil, "", fmt.Errorf("auth store: %w", err)
		}
		s.store = store
		genPassword = gen
	}

	s.routes()
	return s, genPassword, nil
}

// Handler returns the root http.Handler, wrapped in global middleware.
func (s *Server) Handler() http.Handler {
	return securityHeaders(requestLog(s.mux))
}

func (s *Server) routes() {
	// ── Pages (SPA + login) ──────────────────────────────────────────────
	s.mux.HandleFunc("GET /login", s.handleLoginPage)
	s.mux.HandleFunc("GET /public/", s.handlePublic)
	s.mux.HandleFunc("GET /logo", s.handleLogo)
	for _, page := range []string{
		"/", "/services", "/logs", "/files", "/packages", "/users", "/pentest", "/search",
		"/gaming", "/cybersecurity", "/network", "/diagnostics", "/terminal",
		"/firewall", "/cron", "/containers", "/audit", // v0.3
	} {
		s.mux.Handle("GET "+page, s.requireAuthPage(http.HandlerFunc(s.handleIndex)))
	}

	// ── Auth ──────────────────────────────────────────────────────────────
	s.mux.HandleFunc("GET /api/auth/me", s.handleAuthMe)
	s.mux.HandleFunc("POST /api/auth/login", s.handleAuthLogin)
	s.mux.HandleFunc("POST /api/auth/logout", s.handleAuthLogout)
	s.mux.Handle("POST /api/auth/password", s.requireAuthAPI(http.HandlerFunc(s.handleAuthChangePassword)))

	// ── System / dashboard ───────────────────────────────────────────────
	s.mux.Handle("GET /api/system", s.requireAuthAPI(http.HandlerFunc(s.handleSystem)))
	s.mux.Handle("GET /api/system/stream", s.requireAuthAPI(http.HandlerFunc(s.handleSystemStream))) // v0.3 SSE

	// ── Services ─────────────────────────────────────────────────────────
	s.mux.Handle("GET /api/services", s.requireAuthAPI(http.HandlerFunc(s.handleServicesList)))
	s.mux.Handle("POST /api/services", s.requireAuthAPI(http.HandlerFunc(s.handleServicesControl)))

	// ── Logs ─────────────────────────────────────────────────────────────
	s.mux.Handle("GET /api/logs", s.requireAuthAPI(http.HandlerFunc(s.handleLogs)))

	// ── Files ────────────────────────────────────────────────────────────
	s.mux.Handle("GET /api/files", s.requireAuthAPI(http.HandlerFunc(s.handleFilesList)))
	s.mux.Handle("GET /api/files/read", s.requireAuthAPI(http.HandlerFunc(s.handleFilesRead))) // v0.3

	// ── Packages ─────────────────────────────────────────────────────────
	s.mux.Handle("GET /api/packages", s.requireAuthAPI(http.HandlerFunc(s.handlePackagesList))) // v0.3 fix
	s.mux.Handle("POST /api/packages", s.requireAuthAPI(http.HandlerFunc(s.handlePackagesManage)))

	// ── Users & groups ───────────────────────────────────────────────────
	s.mux.Handle("GET /api/users", s.requireAuthAPI(http.HandlerFunc(s.handleUsersList)))   // v0.3 fix
	s.mux.Handle("GET /api/groups", s.requireAuthAPI(http.HandlerFunc(s.handleGroupsList))) // v0.3 fix

	// ── Network ──────────────────────────────────────────────────────────
	s.mux.Handle("GET /api/network", s.requireAuthAPI(http.HandlerFunc(s.handleNetwork)))
	s.mux.Handle("GET /api/network/interfaces", s.requireAuthAPI(http.HandlerFunc(s.handleNetworkInterfaces))) // v0.3

	// ── Firewall (v0.3) ──────────────────────────────────────────────────
	s.mux.Handle("GET /api/firewall", s.requireAuthAPI(http.HandlerFunc(s.handleFirewallStatus)))
	s.mux.Handle("POST /api/firewall/toggle", s.requireAuthAPI(http.HandlerFunc(s.handleFirewallToggle)))
	s.mux.Handle("POST /api/firewall/rule", s.requireAuthAPI(http.HandlerFunc(s.handleFirewallAddRule)))
	s.mux.Handle("DELETE /api/firewall/rule", s.requireAuthAPI(http.HandlerFunc(s.handleFirewallDeleteRule)))

	// ── Scheduler / cron (v0.3) ──────────────────────────────────────────
	s.mux.Handle("GET /api/cron", s.requireAuthAPI(http.HandlerFunc(s.handleCronList)))
	s.mux.Handle("POST /api/cron", s.requireAuthAPI(http.HandlerFunc(s.handleCronAdd)))
	s.mux.Handle("DELETE /api/cron", s.requireAuthAPI(http.HandlerFunc(s.handleCronRemove)))

	// ── Containers (v0.3) ────────────────────────────────────────────────
	s.mux.Handle("GET /api/containers", s.requireAuthAPI(http.HandlerFunc(s.handleContainersList)))
	s.mux.Handle("POST /api/containers/action", s.requireAuthAPI(http.HandlerFunc(s.handleContainersAction)))
	s.mux.Handle("GET /api/containers/logs", s.requireAuthAPI(http.HandlerFunc(s.handleContainersLogs)))

	// ── Diagnostics ──────────────────────────────────────────────────────
	s.mux.Handle("GET /api/diagnostics", s.requireAuthAPI(http.HandlerFunc(s.handleDiagnostics)))

	// ── Terminal ─────────────────────────────────────────────────────────
	s.mux.Handle("POST /api/terminal", s.requireAuthAPI(http.HandlerFunc(s.handleTerminal)))
	s.mux.Handle("GET /api/terminal/stream", s.requireAuthAPI(http.HandlerFunc(s.handleTerminalStream))) // v0.3 SSE

	// ── Pentest ──────────────────────────────────────────────────────────
	s.mux.Handle("POST /api/pentest", s.requireAuthAPI(http.HandlerFunc(s.handlePentest)))

	// ── Search (v0.3, real backend) ──────────────────────────────────────
	s.mux.Handle("POST /api/search", s.requireAuthAPI(http.HandlerFunc(s.handleSearch)))

	// ── News ─────────────────────────────────────────────────────────────
	s.mux.Handle("GET /api/news/gaming", s.requireAuthAPI(http.HandlerFunc(s.handleNewsGaming)))
	s.mux.Handle("GET /api/news/cybersecurity", s.requireAuthAPI(http.HandlerFunc(s.handleNewsCyber)))

	// ── Audit log (v0.3) ─────────────────────────────────────────────────
	s.mux.Handle("GET /api/audit", s.requireAuthAPI(http.HandlerFunc(s.handleAuditList)))

	// ── Health check (for load balancers / systemd) ─────────────────────
	s.mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
}

// ── Middleware ────────────────────────────────────────────────────────────

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "SAMEORIGIN")
		h.Set("Referrer-Policy", "no-referrer")
		next.ServeHTTP(w, r)
	})
}

func requestLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start).Round(time.Millisecond))
	})
}

type ctxKey string

const ctxUsername ctxKey = "username"

// requireAuthAPI protects a JSON API route: when auth is disabled it's a
// no-op; when enabled, a missing/expired session yields 401 JSON instead of
// an HTML redirect (the SPA's fetch() wrapper handles the redirect itself).
func (s *Server) requireAuthAPI(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !s.cfg.AuthEnabled {
			next.ServeHTTP(w, r)
			return
		}
		username := s.sessions.Username(r)
		if username == "" {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"status": "error", "message": "authentication required"})
			return
		}
		ctx := context.WithValue(r.Context(), ctxUsername, username)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// requireAuthPage protects the SPA's index page with a redirect to /login.
func (s *Server) requireAuthPage(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !s.cfg.AuthEnabled {
			next.ServeHTTP(w, r)
			return
		}
		if s.sessions.Username(r) == "" {
			http.Redirect(w, r, "/login", http.StatusFound)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func actorFromRequest(r *http.Request) string {
	if u, ok := r.Context().Value(ctxUsername).(string); ok && u != "" {
		return u
	}
	return "anonymous@" + r.RemoteAddr
}

func (s *Server) handlePublic(w http.ResponseWriter, r *http.Request) {
	http.StripPrefix("/public/", http.FileServer(http.FS(mustSub(web.Public, "public")))).ServeHTTP(w, r)
}

func (s *Server) handleLogo(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, s.cfg.LogoPath)
}
