package auth

import "testing"

func TestHashAndVerifyPassword(t *testing.T) {
	hash, err := HashPassword("correct horse battery staple")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	if !VerifyPassword("correct horse battery staple", hash) {
		t.Fatal("expected correct password to verify")
	}
	if VerifyPassword("wrong password", hash) {
		t.Fatal("expected wrong password to fail verification")
	}
}

func TestHashPasswordUniqueSalt(t *testing.T) {
	h1, _ := HashPassword("same-password")
	h2, _ := HashPassword("same-password")
	if h1 == h2 {
		t.Fatal("expected two hashes of the same password to differ (random salt)")
	}
}
