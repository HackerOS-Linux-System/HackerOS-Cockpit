package auth

import (
	"crypto/rand"
	"encoding/base32"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

type credentials struct {
	Username     string `json:"username"`
	PasswordHash string `json:"password_hash"`
}

// Store manages the single local admin account used when auth is enabled.
// It is intentionally minimal — one operator account, no roles — matching
// the scope of a self-hosted node dashboard. Multi-user/RBAC is listed as
// a future expansion in README.md.
type Store struct {
	mu   sync.RWMutex
	path string
	cred credentials
}

// NewStore loads (or bootstraps) the credential store under dataDir.
// If no store file exists yet, a random password is generated for the
// "admin" user and printed to stdout exactly once — the operator is
// expected to change it afterwards (see /api/auth/password).
func NewStore(dataDir string) (*Store, string, error) {
	path := filepath.Join(dataDir, "auth.json")
	s := &Store{path: path}

	if data, err := os.ReadFile(path); err == nil {
		if err := json.Unmarshal(data, &s.cred); err != nil {
			return nil, "", fmt.Errorf("auth: corrupt store: %w", err)
		}
		return s, "", nil
	}

	generated, err := randomPassword()
	if err != nil {
		return nil, "", err
	}
	hash, err := HashPassword(generated)
	if err != nil {
		return nil, "", err
	}
	s.cred = credentials{Username: "admin", PasswordHash: hash}
	if err := s.persist(); err != nil {
		return nil, "", err
	}
	return s, generated, nil
}

func (s *Store) persist() error {
	data, err := json.MarshalIndent(s.cred, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, data, 0o600)
}

// Verify checks a username/password pair against the stored credentials.
func (s *Store) Verify(username, password string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if username != s.cred.Username {
		return false
	}
	return VerifyPassword(password, s.cred.PasswordHash)
}

// Username returns the configured admin username.
func (s *Store) Username() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.cred.Username
}

// SetPassword updates the stored password hash.
func (s *Store) SetPassword(newPassword string) error {
	hash, err := HashPassword(newPassword)
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cred.PasswordHash = hash
	return s.persist()
}

func randomPassword() (string, error) {
	buf := make([]byte, 15)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(buf), nil
}
