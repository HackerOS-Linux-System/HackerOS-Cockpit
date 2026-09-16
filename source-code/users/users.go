package users

import (
	"context"
	"os/exec"
	"strings"
	"time"
)

// User is one row of the "system users" table.
type User struct {
	Username string `json:"username"`
	UID      string `json:"uid"`
	Home     string `json:"home"`
}

// Group is one row of the "groups" table.
type Group struct {
	Groupname string `json:"groupname"`
	GID       string `json:"gid"`
}

func runGetent(ctx context.Context, script string) string {
	cctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	out, err := exec.CommandContext(cctx, "bash", "-c", script).Output()
	if err != nil {
		return ""
	}
	return string(out)
}

// List returns all local + NSS-resolved users.
func List(ctx context.Context) []User {
	out := runGetent(ctx, `getent passwd | awk -F: '{print $1":"$3":"$6}'`)
	var users []User
	for _, line := range strings.Split(out, "\n") {
		if line == "" {
			continue
		}
		f := strings.SplitN(line, ":", 3)
		u := User{}
		if len(f) > 0 {
			u.Username = f[0]
		}
		if len(f) > 1 {
			u.UID = f[1]
		}
		if len(f) > 2 {
			u.Home = f[2]
		}
		users = append(users, u)
	}
	if users == nil {
		users = []User{}
	}
	return users
}

// Groups returns all local + NSS-resolved groups.
func Groups(ctx context.Context) []Group {
	out := runGetent(ctx, `getent group | awk -F: '{print $1":"$3}'`)
	var groups []Group
	for _, line := range strings.Split(out, "\n") {
		if line == "" {
			continue
		}
		f := strings.SplitN(line, ":", 2)
		g := Group{}
		if len(f) > 0 {
			g.Groupname = f[0]
		}
		if len(f) > 1 {
			g.GID = f[1]
		}
		groups = append(groups, g)
	}
	if groups == nil {
		groups = []Group{}
	}
	return groups
}
