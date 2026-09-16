package terminal

import "testing"

func TestBlocked(t *testing.T) {
	cases := map[string]bool{
		"rm -rf /":                    true,
		"echo hello":                  false,
		"mkfs.ext4 /dev/sda1":         true,
		"dd if=/dev/zero of=/dev/sda": true,
		"ls -la /home":                false,
		"wipefs -a /dev/sda":          true,
		":(){ :|:& };:":               true,
	}
	for cmd, want := range cases {
		if got := Blocked(cmd); got != want {
			t.Errorf("Blocked(%q) = %v, want %v", cmd, got, want)
		}
	}
}
