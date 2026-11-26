# Deployment & TLS

The H# build has **no built-in TLS** (compiled H# cannot link a TLS library).
Terminate TLS in a reverse proxy and let the panel trust it:

```
HCKPT_HOST=127.0.0.1  HCKPT_AUTH=1  HCKPT_TRUST_PROXY=1  HCKPT_COOKIE_SECURE=1
```

* `nginx.conf` — TLS + WebSocket (terminal) + SSE (no buffering).
* `Caddyfile` — automatic Let's Encrypt certificates.
* `hackercockpit.service` — systemd unit.

Self-signed certificate for a LAN setup: *Certificates → Generate self-signed* in
the UI (needs `openssl`), then point nginx at the generated `cert.pem`/`key.pem`.
