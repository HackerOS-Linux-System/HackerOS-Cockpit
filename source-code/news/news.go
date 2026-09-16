package news

import (
	"context"
	"io"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
)

// Article is one RSS item.
type Article struct {
	Title   string `json:"title"`
	Link    string `json:"link"`
	Summary string `json:"summary"`
}

var (
	itemRe  = regexp.MustCompile(`(?s)<item>(.*?)</item>`)
	titleCD = regexp.MustCompile(`(?s)<title><!\[CDATA\[(.*?)\]\]></title>`)
	titlePl = regexp.MustCompile(`(?s)<title>(.*?)</title>`)
	linkRe  = regexp.MustCompile(`(?s)<link>(.*?)</link>`)
	guidRe  = regexp.MustCompile(`(?s)<guid>(https?://[^<]+)</guid>`)
	descCD  = regexp.MustCompile(`(?s)<description><!\[CDATA\[(.*?)\]\]></description>`)
	descPl  = regexp.MustCompile(`(?s)<description>(.*?)</description>`)
	tagRe   = regexp.MustCompile(`<[^>]+>`)
)

func fetchRSS(ctx context.Context, url string) []Article {
	cctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(cctx, http.MethodGet, url, nil)
	if err != nil {
		return nil
	}
	req.Header.Set("User-Agent", "HackerCockpit/0.3")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil
	}
	text := string(body)

	var items []Article
	for _, m := range itemRe.FindAllStringSubmatch(text, -1) {
		block := m[1]
		title := firstMatch(titleCD, block)
		if title == "" {
			title = firstMatch(titlePl, block)
		}
		link := firstMatch(linkRe, block)
		if link == "" {
			link = firstMatch(guidRe, block)
		}
		summary := firstMatch(descCD, block)
		if summary == "" {
			summary = firstMatch(descPl, block)
		}
		summary = tagRe.ReplaceAllString(summary, "")
		if len(summary) > 200 {
			summary = summary[:200]
		}
		title = strings.TrimSpace(title)
		if title != "" {
			items = append(items, Article{Title: title, Link: strings.TrimSpace(link), Summary: strings.TrimSpace(summary)})
		}
		if len(items) >= 8 {
			break
		}
	}
	return items
}

func firstMatch(re *regexp.Regexp, s string) string {
	m := re.FindStringSubmatch(s)
	if len(m) < 2 {
		return ""
	}
	return m[1]
}

type cacheEntry struct {
	data []Article
	ts   time.Time
}

// Cache is a small TTL cache so repeated tab visits don't hammer feeds.
type Cache struct {
	mu  sync.Mutex
	m   map[string]cacheEntry
	ttl time.Duration
}

func NewCache(ttl time.Duration) *Cache {
	return &Cache{m: make(map[string]cacheEntry), ttl: ttl}
}

// Get returns cached or freshly-fetched, merged articles for the given
// cache key and source URLs (capped at 12, matching the original).
func (c *Cache) Get(ctx context.Context, key string, urls []string) []Article {
	c.mu.Lock()
	if e, ok := c.m[key]; ok && time.Since(e.ts) < c.ttl {
		c.mu.Unlock()
		return e.data
	}
	c.mu.Unlock()

	type res struct{ items []Article }
	ch := make(chan res, len(urls))
	for _, u := range urls {
		go func(u string) { ch <- res{fetchRSS(ctx, u)} }(u)
	}
	var all []Article
	for range urls {
		all = append(all, (<-ch).items...)
	}
	if len(all) > 12 {
		all = all[:12]
	}
	if all == nil {
		all = []Article{}
	}

	c.mu.Lock()
	c.m[key] = cacheEntry{data: all, ts: time.Now()}
	c.mu.Unlock()
	return all
}
