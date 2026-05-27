# HackerCockpit v2.0

> System dashboard dla HackerOS/Debian — przepisany z Pythona/Flask do TypeScript/Bun

```
  ██╗  ██╗ █████╗  ██████╗██╗  ██╗███████╗██████╗
  ██║  ██║██╔══██╗██╔════╝██║ ██╔╝██╔════╝██╔══██╗
  ███████║███████║██║     █████╔╝ █████╗  ██████╔╝
  ██╔══██║██╔══██║██║     ██╔═██╗ ██╔══╝  ██╔══██╗
  ██║  ██║██║  ██║╚██████╗██║  ██╗███████╗██║  ██║
  ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝
```

## Wymagania

- **HackerOS / Debian** (x86_64)
- **Bun** ≥ 1.0 — [bun.sh/install](https://bun.sh/install)
- **Hacker Lang** (`hl`) — jeśli chcesz użyć `build.hl`

## Struktura projektu

```
hacker-cockpit/
├── source-code/
│   └── server.ts       ← główny serwer TypeScript (Bun)
├── templates/
│   └── app.html        ← Single Page Application (SPA)
├── public/             ← statyczne zasoby (CSS, JS, obrazy)
├── build.hl            ← skrypt budowania w Hacker Lang
├── package.json
└── README.md
```

## Uruchomienie (development)

```bash
bun run source-code/server.ts
```

Panel dostępny pod: http://localhost:4545

## Build (binarka ELF)

### Z Hacker Lang (zalecane):
```bash
hl build.hl
./dist/hacker-cockpit
```

### Ręcznie z Bun:
```bash
bun build --compile --target=bun-linux-x64 source-code/server.ts --outfile hacker-cockpit
./hacker-cockpit
```

## Funkcje

| Moduł | Opis |
|-------|------|
| 📊 **Dashboard** | CPU, RAM, Disk, Network — live metrics, top procesy |
| ⚙ **Services** | Zarządzanie systemctl — start/stop/restart |
| 📋 **Logs** | Przeglądarka /var/log — syslog, auth.log, kern.log |
| 🗂 **File Explorer** | Przeglądarka systemu plików |
| 📦 **Packages** | apt install/remove, lista dpkg |
| 👥 **Users & Groups** | getent passwd/group |
| 🌐 **Network** | Aktywne połączenia (ss) |
| ⚡ **Pentest** | nmap, nikto |
| 🔍 **Web Search** | DuckDuckGo |
| 🎮 **Gaming News** | IGN, GameSpot RSS |
| 🛡 **Cyber News** | The Hacker News, KrebsOnSecurity RSS |
| 🩺 **Diagnostics** | Disk/RAM/CPU/DNS/Network health check |
| 💻 **Terminal** | Web terminal z historią komend |

## API Endpoints

| Endpoint | Metoda | Opis |
|----------|--------|------|
| `/api/system` | GET | Metryki systemowe |
| `/api/services` | POST | Kontrola usług |
| `/api/terminal` | POST | Wykonaj komendę |
| `/api/pentest` | POST | nmap/nikto |
| `/api/packages` | POST | apt install/remove |
| `/api/logs` | GET | Logi systemowe |
| `/api/files` | GET | Lista plików |
| `/api/network` | GET | Połączenia sieciowe |
| `/api/diagnostics` | GET | Health check |
| `/api/news/gaming` | GET | Gaming RSS |
| `/api/news/cybersecurity` | GET | Cyber RSS |

## Bezpieczeństwo

- Terminal blokuje niebezpieczne komendy (rm -rf, mkfs, dd if=)
- Walidacja wszystkich inputów
- Timeout 30s na komendy terminalowe
- apt dostosowany do Debiana (DEBIAN_FRONTEND=noninteractive)
