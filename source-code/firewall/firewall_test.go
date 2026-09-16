package firewall

import "testing"

func TestValidRule(t *testing.T) {
	cases := map[string]bool{
		"22/tcp":           true,
		"443":              true,
		"192.168.1.0/24":   true,
		"":                 false,
		"22/tcp; rm -rf /": false,
	}
	for spec, want := range cases {
		if got := ValidRule(spec); got != want {
			t.Errorf("ValidRule(%q) = %v, want %v", spec, got, want)
		}
	}
}
