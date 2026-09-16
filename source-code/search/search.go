package search

import (
	"context"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// Result is one search hit.
type Result struct {
	Title   string `json:"title"`
	URL     string `json:"url"`
	Snippet string `json:"snippet"`
}

var (
	resultBlockRe = regexp.MustCompile(`(?s)<div class="result results_links[^"]*"[^>]*>(.*?)</div>\s*</div>\s*</div>`)
	linkRe        = regexp.MustCompile(`(?s)class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>`)
	snippetRe     = regexp.MustCompile(`(?s)class="result__snippet"[^>]*>(.*?)</a>`)
	tagRe         = regexp.MustCompile(`<[^>]+>`)
)

// Search queries DuckDuckGo's HTML endpoint and returns up to 10 results.
func Search(ctx context.Context, query string) ([]Result, error) {
	cctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	form := url.Values{"q": {query}}
	req, err := http.NewRequestWithContext(cctx, http.MethodPost,
		"https://html.duckduckgo.com/html/", strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) HackerCockpit/0.3")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return nil, err
	}
	html := string(body)

	links := linkRe.FindAllStringSubmatch(html, -1)
	snippets := snippetRe.FindAllStringSubmatch(html, -1)

	var results []Result
	for i, l := range links {
		if len(results) >= 10 {
			break
		}
		title := clean(l[2])
		target := resolveDDGRedirect(l[1])
		if title == "" || target == "" {
			continue
		}
		snippet := ""
		if i < len(snippets) {
			snippet = clean(snippets[i][1])
		}
		results = append(results, Result{Title: title, URL: target, Snippet: snippet})
	}
	if results == nil {
		results = []Result{}
	}
	return results, nil
}

func clean(s string) string {
	return strings.TrimSpace(tagRe.ReplaceAllString(s, ""))
}

// resolveDDGRedirect unwraps DuckDuckGo's //duckduckgo.com/l/?uddg=<url>
// tracking redirect down to the real target URL.
func resolveDDGRedirect(href string) string {
	if strings.HasPrefix(href, "//") {
		href = "https:" + href
	}
	u, err := url.Parse(href)
	if err != nil {
		return href
	}
	if strings.Contains(u.Host, "duckduckgo.com") && u.Path == "/l/" {
		if target := u.Query().Get("uddg"); target != "" {
			if decoded, err := url.QueryUnescape(target); err == nil {
				return decoded
			}
		}
	}
	return href
}
