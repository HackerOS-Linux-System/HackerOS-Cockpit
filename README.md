# HackerCockpit v0.3

> System dashboard dla HackerOS/Debian — przepisany z TypeScript/Bun (v2.0) na **czysty Go** (stdlib, zero zależności), częściowo inspirowany Cockpitem od Red Hata.

```
  ██╗  ██╗ █████╗  ██████╗██╗  ██╗███████╗██████╗
  ██║  ██║██╔══██╗██╔════╝██║ ██╔╝██╔════╝██╔══██╗
  ███████║███████║██║     █████╔╝ █████╗  ██████╔╝
  ██╔══██║██╔══██║██║     ██╔═██╗ ██╔══╝  ██╔══██╗
  ██║  ██║██║  ██║╚██████╗██║  ██╗███████╗██║  ██║
  ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝
```

Historia wersji: **v1 (Python/Flask) → v2 (TypeScript/Bun) → v0.3 (Go)**.
Numeracja zresetowana do `0.x` przy przejściu na Go, żeby odróżnić nową linię
rozwoju (inny język, inna architektura, zestaw modułów istotnie rozbudowany)
od poprzedniej `v2.x`. Pełna historia zmian: [`CHANGELOG.md`](CHANGELOG.md).

## Dlaczego Go?

- **Jedna, samodzielna binarka** — `go:embed` pakuje cały frontend (HTML/CSS/JS)
  do środka. Nie trzeba już kopiować `templates/` i `public/` obok binarki
  (choć nadal można je nadpisać z dysku, patrz niżej).
- **Zero zależności zewnętrznych** — cały projekt korzysta wyłącznie ze
  standardowej biblioteki Go. Kompiluje się offline, bez dostępu do
  `proxy.golang.org` czy jakiegokolwiek menedżera pakietów.
- **Statyczna kompilacja, mały footprint** — `CGO_ENABLED=0 go build` daje
  binarkę ~6 MB, bez zależności od libc w runtime.
- Filozofia zbliżona do oryginału: bez frameworków, prosto na `net/http`,
  tak jak oryginał był prosto na `Bun.serve`.

## Wymagania

- **HackerOS / Debian** (x86_64, powinno działać też na innych dystrybucjach Linuksa)
- **Go** ≥ 1.22 — `apt-get install golang-go` lub [go.dev/dl](https://go.dev/dl/)
- **Hacker Lang** (`hl`) — opcjonalnie, jeśli chcesz użyć `build.hl`
- Standardowe narzędzia CLI, które panel wywołuje w tle: `systemctl`, `dpkg`/`apt-get`,
  `ss`, `ip`, `getent`, `top`, `free`, `df`, `ping`, `dig`. Opcjonalnie: `nmap`, `nikto`,
  `whois`, `ufw`, `docker`/`podman`, `sensors` — brakujące narzędzia po prostu wyłączają
  odpowiedni moduł zamiast wywalać cały panel.

## Struktura projektu

```
HackerOS-Cockpit-main/
├── cmd/hackercockpit/      ← main() — start, banner, graceful shutdown
├── internal/
│   ├── config/             ← konfiguracja przez zmienne środowiskowe
│   ├── system/              ← CPU/RAM/dysk/sieć/procesy (dashboard)
│   ├── services/             ← systemctl status/start/stop/restart
│   ├── network/               ← połączenia (ss) + interfejsy (ip)      [rozbudowane]
│   ├── diagnostics/            ← health-check (disk/mem/cpu/dns/ping/sensors)
│   ├── logs/                    ← podgląd /var/log, fallback do journalctl
│   ├── files/                    ← przeglądarka plików + podgląd treści   [nowe]
│   ├── users/                     ← getent passwd/group jako REST          [naprawione]
│   ├── pkgmanager/                 ← dpkg -l / apt-get install/remove       [naprawione]
│   ├── pentest/                     ← nmap / nikto / whois
│   ├── terminal/                     ← web terminal + streaming po SSE      [rozbudowane]
│   ├── news/                          ← RSS (gaming + cyber) z cache
│   ├── search/                         ← wyszukiwarka server-side (DuckDuckGo) [nowe]
│   ├── firewall/                        ← ufw: status/enable/disable/rules   [nowe]
│   ├── cron/                             ← przegląd/edycja crontaba          [nowe]
│   ├── dockermgr/                         ← docker/podman: lista/start/stop/logi [nowe]
│   ├── auth/                               ← logowanie, sesje, hash haseł     [nowe]
│   ├── audit/                               ← log działań administracyjnych   [nowe]
│   ├── sse/                                  ← pomocnik Server-Sent Events    [nowe]
│   └── httpserver/                            ← routing + handlery HTTP
├── web/
│   ├── embed.go             ← go:embed frontendu do binarki
│   ├── templates/app.html   ← SPA (ten sam motyw wizualny co w v2, rozbudowany)
│   ├── templates/login.html ← ekran logowania (gdy HCKPT_AUTH=1)              [nowe]
│   └── public/               ← statyczne zasoby
├── legacy-typescript/        ← oryginalny kod v2 (TypeScript/Bun), zachowany do referencji
├── build.hl                  ← skrypt budowania (przepisany pod Go)
├── go.mod
├── LICENSE
├── CHANGELOG.md
└── README.md
```

## Uruchomienie (development)

```bash
go run ./cmd/hackercockpit
```

Panel dostępny pod: http://localhost:4545

## Build (pojedyncza binarka)

### Z Hacker Lang (zalecane):
```bash
hl build.hl
./dist/hackercockpit
```

### Ręcznie z Go:
```bash
CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o hackercockpit ./cmd/hackercockpit
./hackercockpit
```

### Testy i analiza statyczna
```bash
go vet ./...
go test ./...
```

## Konfiguracja (zmienne środowiskowe)

Oryginał miał port i ścieżki zaszyte na sztywno w kodzie. W wersji Go wszystko
jest konfigurowalne — nie trzeba przekompilowywać binarki, żeby zmienić port:

| Zmienna | Domyślna wartość | Opis |
|---|---|---|
| `HCKPT_HOST` | `0.0.0.0` | Adres nasłuchu |
| `HCKPT_PORT` | `4545` | Port nasłuchu |
| `HCKPT_AUTH` | `0` | `1`/`true` włącza logowanie (patrz niżej) |
| `HCKPT_DATA_DIR` | `~/.local/share/hackercockpit` | Gdzie trzymane są `auth.json`, `audit.log` |
| `HCKPT_TEMPLATES_DIR` | *(embed)* | Nadpisz wbudowany frontend plikami z dysku |
| `HCKPT_PUBLIC_DIR` | *(embed)* | Jak wyżej, dla zasobów statycznych |
| `HCKPT_LOGO_PATH` | `/usr/share/HackerOS/ICONS/HackerOS.png` | Ikona serwowana pod `/logo` |
| `HCKPT_TERMINAL_TIMEOUT` | `30` (s) | Timeout komend terminala |
| `HCKPT_PENTEST_TIMEOUT` | `300` (s) | Timeout nmap/nikto |
| `HCKPT_SERVICES` | `ssh,apache2,nginx,docker,mysql,postgresql,redis,fail2ban,cron,ufw` | Lista usług na zakładce Services |
| `HCKPT_LOG_FILES` | `/var/log/syslog,/var/log/auth.log,/var/log/kern.log,/var/log/dpkg.log` | Dozwolone pliki logów |
| `HCKPT_FEATURE_SEARCH` / `_NEWS` / `_DOCKER` / `_FIREWALL` / `_CRON` | `1` | Włącz/wyłącz poszczególne moduły v0.3 |

## Funkcje

| Moduł | Opis | Status |
|-------|------|--------|
| 📊 **Dashboard** | CPU, RAM, Disk, Network — live metrics, top procesy | z v2 |
| ⚙ **Services** | Zarządzanie systemctl — start/stop/restart, status przez prawdziwy endpoint | naprawione w v0.3 |
| 📋 **Logs** | Przeglądarka /var/log — syslog, auth.log, kern.log | z v2 |
| 🗂 **File Explorer** | Przeglądarka systemu plików + podgląd zawartości pliku tekstowego | rozbudowane w v0.3 |
| 📦 **Packages** | apt install/remove, lista dpkg przez prawdziwy `GET` | naprawione w v0.3 |
| 👥 **Users & Groups** | getent passwd/group przez prawdziwy `GET` | naprawione w v0.3 |
| 🌐 **Network** | Aktywne połączenia (ss) + lista interfejsów (ip) | rozbudowane w v0.3 |
| 🛡 **Firewall** | ufw: status, enable/disable, dodawanie/usuwanie reguł | **nowe w v0.3** |
| ◷ **Scheduler** | Przegląd i edycja crontaba | **nowe w v0.3** |
| ▣ **Containers** | docker/podman: lista, start/stop/restart, logi | **nowe w v0.3** |
| ⚡ **Pentest** | nmap, nikto, whois | rozbudowane w v0.3 (+whois) |
| 🔍 **Web Search** | Prawdziwe wyniki z DuckDuckGo (server-side), nie tylko nowa karta | naprawione w v0.3 |
| 🎮 **Gaming News** | IGN, GameSpot RSS | z v2 |
| 🛡 **Cyber News** | The Hacker News, KrebsOnSecurity RSS | z v2 |
| 🩺 **Diagnostics** | Disk/RAM/CPU/DNS/Network health check + sensors (jeśli dostępne) | rozbudowane w v0.3 |
| 💻 **Terminal** | Web terminal + tryb strumieniowy (SSE) dla długich komend | rozbudowane w v0.3 |
| ▥ **Audit Log** | Log działań administracyjnych (kto/co/kiedy) | **nowe w v0.3** |
| 🔐 **Auth** | Opcjonalne logowanie, sesje, zmiana hasła | **nowe w v0.3** |

## API Endpoints

| Endpoint | Metoda | Opis |
|----------|--------|------|
| `/api/system` | GET | Metryki systemowe |
| `/api/system/stream` | GET (SSE) | Metryki na żywo, push co 3s — **nowe** |
| `/api/services` | GET | Status wszystkich usług — **naprawione** |
| `/api/services` | POST | Kontrola usług (`service_name`, `action`) |
| `/api/terminal` | POST | Wykonaj komendę (`command`) |
| `/api/terminal/stream` | GET (SSE) | Wykonaj komendę, strumieniuj output — **nowe** |
| `/api/pentest` | POST | nmap/nikto/whois (`tool`, `target`) |
| `/api/packages` | GET | Lista zainstalowanych pakietów — **naprawione** |
| `/api/packages` | POST | apt install/remove (`package_name`, `action`) |
| `/api/users` | GET | Lista użytkowników — **naprawione** |
| `/api/groups` | GET | Lista grup — **naprawione** |
| `/api/logs` | GET | Logi systemowe (`?file=`) |
| `/api/files` | GET | Lista plików (`?path=`) |
| `/api/files/read` | GET | Podgląd treści pliku tekstowego (`?path=`) — **nowe** |
| `/api/network` | GET | Połączenia sieciowe |
| `/api/network/interfaces` | GET | Interfejsy sieciowe — **nowe** |
| `/api/firewall` | GET | Status ufw + reguły — **nowe** |
| `/api/firewall/toggle` | POST | Włącz/wyłącz ufw (`enabled`) — **nowe** |
| `/api/firewall/rule` | POST/DELETE | Dodaj/usuń regułę (`spec` / `?number=`) — **nowe** |
| `/api/cron` | GET/POST/DELETE | Lista/dodaj/usuń zadanie crontaba — **nowe** |
| `/api/containers` | GET | Lista kontenerów — **nowe** |
| `/api/containers/action` | POST | start/stop/restart/rm (`id`, `action`) — **nowe** |
| `/api/containers/logs` | GET | Logi kontenera (`?id=`) — **nowe** |
| `/api/diagnostics` | GET | Health check |
| `/api/search` | POST | Wyszukiwanie (`q`) — **naprawione (realny backend)** |
| `/api/news/gaming` | GET | Gaming RSS |
| `/api/news/cybersecurity` | GET | Cyber RSS |
| `/api/audit` | GET | Ostatnie wpisy audit logu — **nowe** |
| `/api/auth/me` | GET | Status sesji — **nowe** |
| `/api/auth/login` / `/logout` | POST | Logowanie/wylogowanie — **nowe** |
| `/api/auth/password` | POST | Zmiana hasła admina — **nowe** |
| `/healthz` | GET | Health check dla systemd/load balancera — **nowe** |

## Bezpieczeństwo

- Terminal blokuje niebezpieczne komendy (`rm -rf`, `mkfs`, `dd if=`, `wipefs`,
  `shred`, fork bomb) — lista rozszerzona względem v2.
- Walidacja wszystkich inputów (nazwy usług/pakietów/kontenerów, cele pentestu,
  reguły firewalla) przez wyrażenia regularne po stronie serwera.
- Timeouty na wszystkie długo trwające operacje (terminal, pentest, apt, ufw,
  cron), konfigurowalne przez zmienne środowiskowe.
- `apt-get` dostosowany do Debiana (`DEBIAN_FRONTEND=noninteractive`).
- **Nowość v0.3 — opcjonalna autoryzacja** (`HCKPT_AUTH=1`): jedno konto
  administratora, hasło generowane losowo przy pierwszym uruchomieniu
  i wypisywane raz na konsolę, sesje po podpisanym, `HttpOnly` ciasteczku,
  proste ograniczenie liczby prób logowania (5/min/IP).
- **Nowość v0.3 — audit log**: każda wrażliwa akcja (terminal, zmiana usługi/
  pakietu/firewalla/crontaba/kontenera, logowanie) trafia do lokalnego logu
  z znacznikiem czasu i wykonawcą.
- Nagłówki bezpieczeństwa (`X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`) na każdej odpowiedzi.

⚠️ **Uwaga**: to nadal panel z pełnym dostępem administracyjnym (terminal,
apt, systemctl jako root przez `sudo`). Domyślnie auth jest wyłączone — tak
jak w oryginale — żeby zachować identyczne zachowanie "od razu po
uruchomieniu". Na hostach dostępnych z zewnątrz **koniecznie** włącz
`HCKPT_AUTH=1` i postaw za odwróconym proxy z TLS (patrz sekcja niżej).

## Co dalej widzę do rozbudowy

Poniżej pomysły, które **celowo nie weszły** do tej wersji (żeby nie
rozdmuchać v0.3 w nieskończoność), uszeregowane mniej więcej wg wartości/
nakładu:

1. **TLS / HTTPS natywnie** — obecnie panel zakłada, że stoi za reverse
   proxy (nginx/Caddy) albo jest używany tylko lokalnie. Dodanie
   `autocert`/własnych certyfikatów bezpośrednio w `net/http.Server`
   (`ListenAndServeTLS`) zamknęłoby tę lukę bez dodatkowej infrastruktury.
2. **Właściwy KDF do haseł** (argon2id/bcrypt) — obecny hash to iterowane
   SHA-256 napisane na stdlib, bo build nie ma dostępu do
   `golang.org/x/crypto`. Jak tylko projekt będzie mógł pobierać moduły,
   to pierwsza rzecz do wymiany.
3. **RBAC / wiele kont** — dziś jest dokładnie jedno konto administratora.
   Role (operator/viewer), osobne konta, uprawnienia per-moduł.
4. **WebSocket zamiast SSE dla terminala** — SSE działa dobrze dla
   strumienia output, ale nie obsługuje interaktywnego wejścia (np. sesji
   `htop`, promptów `sudo`, pełnego pty). Prawdziwy interaktywny terminal
   (jak w Cockpicie) wymagałby WebSocketa + pty (`os/exec` + `github.com/
   creack/pty` albo ręczna implementacja).
5. **SMART / dyski** — `smartctl -a` per dysk, ostrzeżenia o zdrowiu nośnika.
6. **Zarządzanie kluczami SSH** — `authorized_keys` per user, generowanie
   par kluczy, odwoływanie dostępu.
7. **Menedżer certyfikatów** (Let's Encrypt / własne CA) — przydatne razem
   z punktem 1.
8. **Kopie zapasowe / snapshoty** — integracja z `rsync`/`timeshift`/`restic`,
   harmonogram, przegląd historii backupów.
9. **i18n (PL/EN)** — cały frontend jest dziś twardo po angielsku (motyw
   "hacker terminal"), warto dodać przełącznik języka.
10. **Rotacja audit logu** — dziś to jeden rosnący plik. Przy dużym ruchu
    warto dodać rotację (rozmiar/czas) i kompresję starych wpisów.
11. **Eksport/import konfiguracji** — jeden plik JSON z listą usług,
    dozwolonych logów, reguł firewalla do przenoszenia między hostami.
12. **Panel powiadomień** — dziś błędy/sukcesy to tylko toast znikający po
    chwili. Persistent centrum powiadomień (np. "usługa X padła 10 minut
    temu") wymagałoby jednak jakiegoś backendu zdarzeń (kolejka/polling
    dziennika systemd).
13. **Wykresy historyczne** (CPU/RAM/dysk w czasie) — obecnie dashboard
    pokazuje tylko bieżący stan. Prosta baza szeregów czasowych (SQLite w
    stdlib przez `database/sql` + sterownik czysto-Go) pozwoliłaby na
    wykresy 24h/7d.
14. **Testy end-to-end HTTP** (`net/http/httptest`) dla handlerów — dziś są
    tylko testy jednostkowe walidatorów; warto dołożyć testy całych
    handlerów z podmienionymi zależnościami.
15. **Provider wyszukiwania z kluczem API** — scraping HTML DuckDuckGo
    (obecne rozwiązanie) jest kruchy przy zmianach markupu; docelowo lepiej
    przełączyć się na jeden z płatnych/API-based providerów wyszukiwania.
16. **Wsparcie dla `firewalld`/`nftables`** obok `ufw`, dla dystrybucji,
    które go nie używają.
17. **Multi-host** — dziś to panel jednego hosta (tak jak v2). Warianty typu
    "Cockpit + cockpit-bridge" pozwalające zarządzać flotą maszyn z jednego
    panelu to zupełnie inna skala projektu, ale warto to mieć na radarze.

## Co zostało zarchiwizowane

Oryginalny kod TypeScript/Bun (v2.0) jest zachowany w `legacy-typescript/`
w niezmienionej formie — do wglądu/diffowania. Nie jest częścią aktywnego
builda (`go.mod` go nie widzi, `build.hl` go nie dotyka). Zobacz
[`CHANGELOG.md`](CHANGELOG.md) po pełną listę: co usunięto z aktywnego
builda, co przepisano 1:1, co jest nowe, a co rozbudowane względem v2.
