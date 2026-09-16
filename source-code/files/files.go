package files

import (
	"fmt"
	"os"
	"path/filepath"
	"unicode/utf8"
)

// Entry is one row in a directory listing.
type Entry struct {
	Name     string `json:"name"`
	IsDir    bool   `json:"isDir"`
	Size     string `json:"size"`
	Modified string `json:"modified"`
}

// List returns the contents of dirPath, resolved to an absolute path.
// Errors are swallowed (returns an empty slice) to match the original
// server's "fail closed, don't 500" behaviour.
func List(dirPath string) []Entry {
	safe, err := filepath.Abs(dirPath)
	if err != nil || safe == "" || safe[0] != '/' {
		return []Entry{}
	}
	dirEntries, err := os.ReadDir(safe)
	if err != nil {
		return []Entry{}
	}
	out := make([]Entry, 0, len(dirEntries))
	for _, de := range dirEntries {
		info, err := de.Info()
		if err != nil {
			out = append(out, Entry{Name: de.Name(), IsDir: false, Size: "?", Modified: "?"})
			continue
		}
		size := "-"
		if !info.IsDir() {
			size = formatSize(info.Size())
		}
		out = append(out, Entry{
			Name:     de.Name(),
			IsDir:    info.IsDir(),
			Size:     size,
			Modified: info.ModTime().UTC().Format("2006-01-02 15:04"),
		})
	}
	return out
}

func formatSize(bytes int64) string {
	switch {
	case bytes < 1024:
		return fmt.Sprintf("%dB", bytes)
	case bytes < 1048576:
		return fmt.Sprintf("%.1fKB", float64(bytes)/1024)
	case bytes < 1073741824:
		return fmt.Sprintf("%.1fMB", float64(bytes)/1048576)
	default:
		return fmt.Sprintf("%.1fGB", float64(bytes)/1073741824)
	}
}

const maxPreviewBytes = 200 * 1024 // 200KB cap, v0.3 text preview

// ReadPreview returns up to maxPreviewBytes of a file's content if it looks
// like valid UTF-8 text. Returns (content, truncated, error).
func ReadPreview(path string) (string, bool, error) {
	safe, err := filepath.Abs(path)
	if err != nil || safe == "" || safe[0] != '/' {
		return "", false, fmt.Errorf("invalid path")
	}
	info, err := os.Stat(safe)
	if err != nil {
		return "", false, err
	}
	if info.IsDir() {
		return "", false, fmt.Errorf("is a directory")
	}
	f, err := os.Open(safe)
	if err != nil {
		return "", false, err
	}
	defer f.Close()

	buf := make([]byte, maxPreviewBytes)
	n, _ := f.Read(buf)
	buf = buf[:n]
	if !utf8.Valid(buf) {
		return "", false, fmt.Errorf("binary file — preview unavailable")
	}
	truncated := info.Size() > int64(n)
	return string(buf), truncated, nil
}
