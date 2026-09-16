package auth

import (
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"sync"
	"time"
)

const (
	// CookieName is the session cookie set after a successful login.
	CookieName = "hckpt_session"
	sessionTTL = 12 * time.Hour
)

type session struct {
	username string
	expires  time.Time
}

// SessionManager tracks active logged-in sessions in memory. Sessions do
// not survive a process restart by design — restarting the panel forces
// re-authentication, which is the safer default for an admin tool.
type SessionManager struct {
	mu       sync.Mutex
	sessions map[string]session
}

func NewSessionManager() *SessionManager {
	sm := &SessionManager{sessions: make(map[string]session)}
	go sm.janitor()
	return sm
}

func (sm *SessionManager) janitor() {
	t := time.NewTicker(10 * time.Minute)
	defer t.Stop()
	for range t.C {
		now := time.Now()
		sm.mu.Lock()
		for tok, s := range sm.sessions {
			if now.After(s.expires) {
				delete(sm.sessions, tok)
			}
		}
		sm.mu.Unlock()
	}
}

func newToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

// Create starts a new session for username and sets the cookie on w.
func (sm *SessionManager) Create(w http.ResponseWriter, r *http.Request, username string) error {
	tok, err := newToken()
	if err != nil {
		return err
	}
	exp := time.Now().Add(sessionTTL)
	sm.mu.Lock()
	sm.sessions[tok] = session{username: username, expires: exp}
	sm.mu.Unlock()

	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    tok,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		Secure:   r.TLS != nil,
		Expires:  exp,
	})
	return nil
}

// Username returns the logged-in username for the request, or "" if there
// is no valid session.
func (sm *SessionManager) Username(r *http.Request) string {
	c, err := r.Cookie(CookieName)
	if err != nil {
		return ""
	}
	sm.mu.Lock()
	defer sm.mu.Unlock()
	s, ok := sm.sessions[c.Value]
	if !ok || time.Now().After(s.expires) {
		return ""
	}
	return s.username
}

// Destroy clears the session referenced by the request's cookie, if any.
func (sm *SessionManager) Destroy(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(CookieName); err == nil {
		sm.mu.Lock()
		delete(sm.sessions, c.Value)
		sm.mu.Unlock()
	}
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})
}
