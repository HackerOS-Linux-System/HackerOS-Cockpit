package httpserver

import "net/http"

var gamingFeeds = []string{
	"https://www.ign.com/rss/articles.xml",
	"https://www.gamespot.com/feeds/news/",
}

var cyberFeeds = []string{
	"https://thehackernews.com/feeds/posts/default",
	"https://krebsonsecurity.com/feed/",
}

func (s *Server) handleNewsGaming(w http.ResponseWriter, r *http.Request) {
	articles := s.newsCache.Get(r.Context(), "gaming", gamingFeeds)
	writeJSON(w, http.StatusOK, map[string]any{"news": articles})
}

func (s *Server) handleNewsCyber(w http.ResponseWriter, r *http.Request) {
	articles := s.newsCache.Get(r.Context(), "cybersecurity", cyberFeeds)
	writeJSON(w, http.StatusOK, map[string]any{"news": articles})
}
