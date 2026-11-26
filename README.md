# HackerOS Cockpit — wersja H# (0.5.0 „Graphite”)

System dashboard dla HackerOS/Debian, **przepisywany z Go na H#**. Backend jest w 100% w H#,
a cały frontend (HTML/CSS/JS, fonty, ikony) jest **wbudowany w binarkę** — tak jak `go:embed` w wersji Go.

> **Stan: buduje się i działa natywnie** (h# 0.9.0, backend C++/g++). Zweryfikowano: kompilacja `--release`,
> serwowanie wbudowanego UI, logowanie/sesje (PBKDF2), ~20 endpointów API, 127 asercji natywnych (`bit test`).
> Nadal niesprawdzone na prawdziwym hoście: terminal PTY/WebSocket, SSE, narzędzia zewnętrzne (ufw, docker, certbot, restic…).
> Szczegóły i różnice względem Go: [`PORTING.md`](PORTING.md). TLS: przez nginx/Caddy — patrz [`deploy/`](deploy/).

## Budowanie

Wymagany [H#](https://github.com/HackerOS-Linux-System/H-Sharp) i opcjonalnie `bit`:

```bash
bit                      # = pre-build (osadza web/ w src/assets.h#) + h# compile --release
# albo ręcznie:
sh tools/gen-assets.sh
h# compile src/main.h# -o hackercockpit --release
```

```bash
./hackercockpit                                   # tylko 127.0.0.1, bez logowania
HCKPT_HOST=0.0.0.0 HCKPT_AUTH=1 ./hackercockpit   # z siecią — wymagane uwierzytelnianie
```

Przy pierwszym starcie z `HCKPT_AUTH=1` konto `admin` i losowe hasło są wypisane **raz** na stdout.
Zmienne `HCKPT_*` są takie same jak w wersji Go (patrz `src/config.h#`); dodatkowo `HCKPT_PBKDF2_ITER`
(liczba iteracji dla nowych haseł, domyślnie 310000).

## Testy

```bash
bit check     # typecheck wszystkich modułów  (sh tests/run.sh check)
bit test      # testy kompilowane natywnie (h# run) (sh tests/run.sh)
```

## Struktura

```
Bit.hk                manifest bit (pre-build: osadzenie UI)
src/
  main.h#             start, CLI (backup run, version), proces kolektora
  server.h#           pętla accept (fork/połączenie), uwierzytelnianie (sesja/Bearer), tablica tras
  http.h# ctx.h#      parser HTTP/1.1, odpowiedzi, nagłówki bezpieczeństwa, kontekst żądania
  net.h# sys.h# ws.h# gniazda libc, popen/poll + SSE, WebSocket (cała warstwa natywna)
  auth.h# crypto.h#   PBKDF2, role, sesje, limiter, TOTP, tokeny API, zakresy
  settings.h# notify.h# audit.h# config.h# util.h# system.h#
  h_auth.h# h_admin.h# h_sys.h#        handlery: auth/2FA/użytkownicy, tokeny/zakresy/ustawienia, usługi/SSE
  m_ops.h#            logi, pliki, pakiety
  m_users.h# m_net.h# m_fw.h# m_cron.h# m_docker.h# m_certs.h#
  m_disks.h# m_metrics.h# m_backup.h# m_misc.h# m_term.h#
  assets.h#           GENEROWANY z web/ (tools/gen-assets.sh)
web/                  frontend — niezmieniony
deploy/               nginx, Caddy, unit systemd, opis TLS
tests/                crypto, util, auth, e2e (cały przepływ HTTP, ~127 asercji)
tools/                gen-assets.sh, escape-braces.py, interpreter-short-circuit.patch (przestarzała — interpretera już nie ma)
legacy-go/            oryginalny kod Go (referencja)
```

Uwaga dla piszących kod: w literałach stringów klamry są podwojone (`"{{"`), bo `{x}` to w H# interpolacja — patrz `PORTING.md`.

Licencja: GPL-3.0 (bez zmian, patrz `LICENSE`).
