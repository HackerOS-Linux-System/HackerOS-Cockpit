package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"strings"
)

// This package intentionally avoids third-party dependencies (the build
// environment for HackerCockpit has no module proxy access by design —
// it is meant to compile straight from the Debian/HackerOS base image).
// The KDF below is a simple salted, iterated SHA-256 construction. It is
// adequate for a local admin panel but is NOT a substitute for a vetted
// password hashing library. See README "Plany rozbudowy" for the
// recommendation to swap this for argon2id once golang.org/x/crypto (or
// an equivalent vendored copy) is available in the build environment.
const (
	saltLen    = 16
	iterations = 200_000
)

func deriveKey(password string, salt []byte) []byte {
	h := sha256.New()
	h.Write(salt)
	h.Write([]byte(password))
	sum := h.Sum(nil)
	for i := 0; i < iterations; i++ {
		h.Reset()
		h.Write(sum)
		h.Write(salt)
		sum = h.Sum(nil)
	}
	return sum
}

// HashPassword returns an encoded "hckpt1$<salt-hex>$<hash-hex>" string
// suitable for storage.
func HashPassword(password string) (string, error) {
	salt := make([]byte, saltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key := deriveKey(password, salt)
	return fmt.Sprintf("hckpt1$%s$%s", hex.EncodeToString(salt), hex.EncodeToString(key)), nil
}

// VerifyPassword checks a plaintext password against an encoded hash
// produced by HashPassword, in constant time.
func VerifyPassword(password, encoded string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 3 || parts[0] != "hckpt1" {
		return false
	}
	salt, err := hex.DecodeString(parts[1])
	if err != nil {
		return false
	}
	want, err := hex.DecodeString(parts[2])
	if err != nil {
		return false
	}
	got := deriveKey(password, salt)
	return subtle.ConstantTimeCompare(got, want) == 1
}
