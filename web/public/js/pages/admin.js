import { h, icon, get, post, put, del, fail, toast, card, tabs, table, empty, pageHead, field, mount, clear, statusDot, confirmDialog, promptDialog, modal, dt, loading, copyText, download, switchEl } from "../core.js";
import { t } from "../i18n.js";

// ═══ Access: panel accounts, API tokens, sessions ═══════════════════════
export async function access(root, ctx) {
  let tabId = "accounts"; const holder = h("div");
  root.append(pageHead(t("Access"), t("Who may sign in to this panel, with which role."), tabs([["accounts", t("Accounts")], ["tokens", t("API tokens")], ["sessions", t("Sessions")]], tabId, (id) => { tabId = id; draw(); })), holder);
  const roles = ["viewer", "operator", "admin"];
  const roleHelp = h("div", { class: "callout" }, icon("info"), h("div", null, h("b", null, "viewer"), ` — ${t("read-only dashboards")} · `, h("b", null, "operator"), ` — ${t("+ services, packages, cron, firewall, backups, files")} · `, h("b", null, "admin"), ` — ${t("+ terminal, users, tokens, settings, audit")}`));
  async function draw() {
    mount(holder, loading(3));
    try {
      if (tabId === "accounts") {
        const d = await get("/api/admin/users");
        mount(holder, h("div", { class: "stack" }, roleHelp, h("div", null, h("button", { class: "btn primary", onclick: create }, icon("plus"), t("New account"))), card(null, table([
          { label: t("User"), render: (u) => h("div", { class: "namecell" }, h("div", { class: "avatar" }, u.username.slice(0, 2)), h("b", null, u.username), u.username === ctx.user ? h("span", { class: "badge ghost" }, t("you")) : null) },
          { label: t("Role"), render: (u) => h("select", { class: "select sm", disabled: u.username === ctx.user, onchange: async (e) => { try { await put(`/api/admin/users/${u.username}`, { role: e.target.value, disabled: u.disabled }); toast(t("Role updated")); } catch (er) { fail(er); draw(); } } }, roles.map((r) => h("option", { value: r, selected: r === u.role }, r))) },
          { label: t("Active"), render: (u) => switchEl(!u.disabled, async (on) => { try { await put(`/api/admin/users/${u.username}`, { role: u.role, disabled: !on }); } catch (er) { fail(er); draw(); } }) },
          { label: t("Created"), mono: true, render: (u) => dt(u.created) },
          { label: t("Scope"), render: (u) => u.role !== "operator" ? h("span", { class: "dim" }, "–") :
            h("button", { class: "btn sm ghost", onclick: () => scopeModal(u) }, icon("layers"), u.scopes ? t("Restricted") : t("Full access")) },
          { label: "", render: (u) => h("div", { class: "actions" }, h("button", { class: "btn sm", onclick: async () => { const p = await promptDialog(t("Reset password"), u.username, { type: "password", hint: t("At least 10 characters. All sessions of this user end.") }); if (p) { try { await post(`/api/admin/users/${u.username}/password`, { password: p }); toast(t("Password reset")); } catch (er) { fail(er); } } } }, icon("key-round")),
            u.username !== ctx.user ? h("button", { class: "btn sm danger", onclick: async () => { if (await confirmDialog(t("Delete account"), u.username, { danger: true })) { try { await del(`/api/admin/users/${u.username}`); draw(); } catch (er) { fail(er); } } } }, icon("trash-2")) : null) },
        ], d.users), { flush: true })));
      } else if (tabId === "tokens") {
        const d = await get("/api/admin/tokens");
        mount(holder, h("div", { class: "stack" }, h("div", { class: "callout" }, icon("info"), t("API tokens authenticate scripts and other HackerCockpit hosts via the Authorization: Bearer header. A token never outranks its owner.")), h("div", null, h("button", { class: "btn primary", onclick: newToken }, icon("plus"), t("New token"))),
          card(null, table([{ label: t("Name"), render: (k) => h("b", null, k.name) }, { label: t("Role"), render: (k) => h("span", { class: "badge" }, k.role) }, { label: t("Owner"), key: "owner" }, { label: t("Created"), mono: true, render: (k) => dt(k.created) }, { label: t("Last used"), mono: true, render: (k) => (k.last_used && !k.last_used.startsWith("0001") ? dt(k.last_used) : "–") },
            { label: "", render: (k) => h("div", { class: "actions" }, h("button", { class: "btn sm danger", onclick: async () => { if (await confirmDialog(t("Revoke token"), k.name, { danger: true })) { await del(`/api/admin/tokens/${k.id}`); draw(); } } }, icon("trash-2"))) }], d.tokens, { empty: empty("key-round", t("No API tokens")) }), { flush: true })));
      } else {
        const d = await get("/api/auth/sessions");
        mount(holder, card(null, table([{ label: t("User"), key: "username" }, { label: "IP", mono: true, key: "ip" }, { label: t("Browser"), render: (s) => h("span", { class: "dim" }, (s.agent || "").slice(0, 60)) }, { label: t("Started"), mono: true, render: (s) => dt(s.created) }, { label: t("Last seen"), mono: true, render: (s) => dt(s.last_seen) },
          { label: "", render: (s) => (s.current ? h("span", { class: "badge solid" }, t("this session")) : h("div", { class: "actions" }, h("button", { class: "btn sm danger", onclick: async () => { await del(`/api/auth/sessions/${s.id}`); draw(); } }, t("End")))) }], d.sessions, { empty: empty("users", t("No sessions")) }), { flush: true }));
      }
    } catch (e) { mount(holder, h("div", { class: "callout" }, icon("info"), e.message)); }
  }
  async function scopeModal(u) {
    let set, backups;
    try { [set, backups] = await Promise.all([get("/api/settings"), get("/api/backups").catch(() => ({ profiles: [] }))]); } catch (e) { return fail(e); }
    const cur = u.scopes || {};
    const enabled = h("input", { type: "checkbox", checked: !!u.scopes });
    const box = (list, picked, label, labelFor) => {
      const wrap = h("div", { class: "pill-list" });
      const state = new Set(picked || []);
      list.forEach((name) => {
        const shown = labelFor ? labelFor(name) : name;
        const b = h("button", { type: "button", class: `btn sm ${state.has(name) ? "primary" : "ghost"}`, onclick: () => { state.has(name) ? state.delete(name) : state.add(name); b.className = `btn sm ${state.has(name) ? "primary" : "ghost"}`; } }, shown);
        wrap.append(b);
      });
      if (!list.length) wrap.append(h("span", { class: "dim" }, t("(none configured)")));
      wrap.getSelected = () => [...state];
      return { el: h("div", { class: "field" }, h("label", null, label), wrap), get: wrap.getSelected };
    };
    const svc = box(set.settings.services, cur.services, t("Allowed services"));
    const logs = box(set.settings.allowed_logs, cur.log_files, t("Allowed log files"));
    const roots = box(set.settings.file_roots, cur.file_roots, t("Allowed file roots"));
    const bkIds = (backups.profiles || []).map((p) => p.id);
    const bkNames = Object.fromEntries((backups.profiles || []).map((p) => [p.id, p.name]));
    const bk = box(bkIds, cur.backups, t("Allowed backup profiles"), (id) => bkNames[id] || id);
    const toggle = () => [svc, logs, roots, bk].forEach((x) => x.el.classList.toggle("hidden", !enabled.checked));
    modal({ title: `${t("Scope")} — ${u.username}`, wide: true,
      body: h("div", { class: "stack" },
        h("div", { class: "callout" }, icon("info"), t("Leave a category empty to allow everything in it (no narrowing). Selections can never exceed the panel-wide lists in Settings.")),
        h("label", { class: "check" }, h("input", { type: "checkbox", checked: enabled.checked, onchange: (e) => { enabled.checked = e.target.checked; toggle(); } }), t("Restrict this account to a subset of resources")),
        svc.el, logs.el, roots.el, bk.el),
      actions: [{ label: t("Cancel") }, { label: t("Save"), kind: "primary", run: async () => {
        const body = enabled.checked ? { enabled: true, services: svc.get(), log_files: logs.get(), file_roots: roots.get(), backups: bk.get() } : { enabled: false };
        await put(`/api/admin/users/${u.username}/scopes`, body); toast(t("Scope updated")); draw();
      } }] });
    toggle();
  }

  function create() {
    const u = h("input", { class: "input" }), p = h("input", { class: "input", type: "password", autocomplete: "new-password" }), r = h("select", { class: "select" }, roles.map((x) => h("option", { value: x, selected: x === "operator" }, x)));
    modal({ title: t("New panel account"), body: h("div", { class: "stack" }, field(t("Username"), u), field(t("Password"), p, t("At least 10 characters")), field(t("Role"), r)), actions: [{ label: t("Cancel") }, { label: t("Create"), kind: "primary", run: async () => { await post("/api/admin/users", { username: u.value.trim(), password: p.value, role: r.value }); toast(t("Account created")); draw(); } }] });
  }
  function newToken() {
    const n = h("input", { class: "input", placeholder: "monitoring" }), r = h("select", { class: "select" }, roles.map((x) => h("option", { value: x, selected: x === "viewer" }, x)));
    modal({ title: t("New API token"), body: h("div", { class: "stack" }, field(t("Name"), n), field(t("Role"), r)), actions: [{ label: t("Cancel") }, { label: t("Create"), kind: "primary", run: async () => {
      const res = await post("/api/admin/tokens", { name: n.value.trim(), role: r.value });
      modal({ title: t("Copy your token now"), body: h("div", { class: "stack" }, h("div", { class: "callout bad" }, icon("triangle-alert"), res.message), h("pre", { class: "pre" }, res.token)), actions: [{ label: t("Copy"), kind: "primary", close: false, run: () => { copyText(res.token); return false; } }, { label: t("Done") }] }); draw(); } }] });
  }
  draw();
}

// ═══ Settings ═══════════════════════════════════════════════════════════
export async function settings(root) {
  const d = await get("/api/settings"); const s = d.settings, ro = d.readonly;
  const lines = (arr) => (arr || []).join("\n"); const split = (v) => v.split("\n").map((x) => x.trim()).filter(Boolean);
  const services = h("textarea", { class: "textarea" }, lines(s.services)), logs = h("textarea", { class: "textarea" }, lines(s.allowed_logs)), roots = h("textarea", { class: "textarea" }, lines(s.file_roots)), notify = h("textarea", { class: "textarea" }, lines(s.notify_services));
  const disk = h("input", { class: "input", type: "number", min: 1, max: 100, value: s.disk_warn_pct }), mem = h("input", { class: "input", type: "number", min: 1, max: 100, value: s.mem_warn_pct }), cert = h("input", { class: "input", type: "number", min: 1, max: 365, value: s.cert_warn_days }), hook = h("input", { class: "input mono", placeholder: "https://hooks.slack.com/… or Discord webhook", value: s.webhook_url });
  let hosts = s.hosts.map((x) => ({ name: x.name, url: x.url, token: "", has_token: x.has_token, insecure: x.insecure })); const hostBox = h("div");
  const drawHosts = () => mount(hostBox, h("div", { class: "stack" }, hosts.map((x, i) => h("div", { class: "form-grid" }, h("input", { class: "input", placeholder: t("Name"), value: x.name, oninput: (e) => (x.name = e.target.value) }), h("input", { class: "input mono", placeholder: "https://host:4545", value: x.url, oninput: (e) => (x.url = e.target.value) }),
    h("input", { class: "input mono", type: "password", placeholder: x.has_token ? "•••••• (unchanged)" : "hck_… token", oninput: (e) => (x.token = e.target.value) }), h("div", { class: "row" }, h("label", { class: "check" }, h("input", { type: "checkbox", checked: x.insecure, onchange: (e) => (x.insecure = e.target.checked) }), t("self-signed TLS")), h("button", { class: "btn sm danger", onclick: () => { hosts.splice(i, 1); drawHosts(); } }, icon("trash-2"))))),
    h("div", null, h("button", { class: "btn sm", onclick: () => { hosts.push({ name: "", url: "https://", token: "", insecure: false }); drawHosts(); } }, icon("plus"), t("Add host")))));
  drawHosts();

  // Email alerts
  const em = s.email || {};
  const emEnabled = h("input", { type: "checkbox", checked: !!em.enabled });
  const emHost = h("input", { class: "input mono", value: em.host || "", placeholder: "smtp.example.com" });
  const emPort = h("input", { class: "input", type: "number", value: em.port || 587 });
  const emSec = h("select", { class: "select" }, [["starttls", "STARTTLS (587)"], ["tls", "TLS (465)"], ["none", t("none (internal relay)")]].map(([v, l]) => h("option", { value: v, selected: (em.security || "starttls") === v }, l)));
  const emUser = h("input", { class: "input", value: em.username || "", autocomplete: "off" });
  const emPass = h("input", { class: "input", type: "password", placeholder: em.has_password ? "•••••• (unchanged)" : "", autocomplete: "new-password" });
  const emFrom = h("input", { class: "input mono", value: em.from || "", placeholder: "hackercockpit@example.com" });
  const emTo = h("textarea", { class: "textarea", placeholder: "you@example.com" }, (em.to || []).join("\n"));
  const emLevel = h("select", { class: "select" }, [["warn", t("warning and critical")], ["crit", t("critical only")], ["info", t("everything, including recoveries")]].map(([v, l]) => h("option", { value: v, selected: (em.min_level || "warn") === v }, l)));
  const emFields = [emHost, emPort, emSec, emUser, emPass, emFrom, emTo, emLevel];
  const emToggle = () => emFields.forEach((f) => (f.disabled = !emEnabled.checked));
  emEnabled.addEventListener("change", emToggle); emToggle();
  const emailBody = () => ({ enabled: emEnabled.checked, host: emHost.value.trim(), port: +emPort.value, security: emSec.value,
    username: emUser.value.trim(), password: emPass.value, from: emFrom.value.trim(), to: split(emTo.value), min_level: emLevel.value });
  const save = async () => {
    try { await put("/api/settings", { services: split(services.value), allowed_logs: split(logs.value), file_roots: split(roots.value), notify_services: split(notify.value), webhook_url: hook.value.trim(), email: emailBody(), disk_warn_pct: +disk.value, mem_warn_pct: +mem.value, cert_warn_days: +cert.value, hosts: hosts.map(({ name, url, token, insecure }) => ({ name, url, token, insecure })) }); toast(t("Settings saved")); } catch (e) { fail(e); }
  };
  const importFile = h("input", { type: "file", accept: "application/json", class: "hidden", onchange: async (e) => {
    const f = e.target.files[0]; if (!f) return; let doc; try { doc = JSON.parse(await f.text()); } catch { return fail(new Error(t("Not valid JSON"))); }
    const cS = h("input", { type: "checkbox", checked: true }), cB = h("input", { type: "checkbox", checked: true }), cF = h("input", { type: "checkbox" }), cK = h("input", { type: "checkbox" });
    const keyCount = (doc.system_users || []).reduce((n, u) => n + (u.ssh_keys || []).length, 0);
    modal({ title: t("Import configuration"), body: h("div", { class: "stack" }, h("p", { class: "muted" }, t("Choose what to apply from this file. Fleet hosts and secrets are never imported.")), h("label", { class: "check" }, cS, t("Panel settings")), h("label", { class: "check" }, cB, t("Backup profiles ({n})", { n: (doc.backup_profiles || []).length })), h("label", { class: "check" }, cF, t("Firewall rules ({n})", { n: (doc.firewall_rules || []).length })),
      h("label", { class: "check" }, cK, t("SSH keys ({n}) — only added to accounts that already exist here", { n: keyCount }))),
      actions: [{ label: t("Cancel") }, { label: t("Import"), kind: "primary", run: async () => { const r = await post("/api/settings/import", { ...doc, apply: { settings: cS.checked, backups: cB.checked, firewall: cF.checked, ssh_keys: cK.checked } }); toast(t("Import finished")); modal({ title: t("Import report"), body: h("pre", { class: "pre" }, JSON.stringify(r.report, null, 2)), actions: [{ label: t("Close"), kind: "primary" }] }); } }] });
    e.target.value = "";
  } });
  const note = (k, v) => [h("dt", null, k), h("dd", null, String(v))];
  const historyBody = h("div", null, loading(3));
  root.append(pageHead(t("Settings"), t("Runtime configuration, stored in settings.json. Start-up options (auth, TLS, listen address) are environment variables."), h("button", { class: "btn primary", onclick: save }, icon("save"), t("Save changes"))),
    h("div", { class: "stack" }, h("div", { class: "grid g2" },
      card(t("Managed services"), field(t("One systemd unit per line"), services, t("Shown on the Services page and the only ones that can be controlled."))),
      card(t("Readable log files"), field(t("One absolute path per line"), logs, t("Only these files can be opened on the Logs page.")))),
    h("div", { class: "grid g2" },
      card(t("File browser roots"), field(t("One directory per line"), roots, t("Symlinks that leave these roots are refused."))),
      card(t("Alerts"), h("div", { class: "stack" }, field(t("Watch these services (one per line)"), notify), h("div", { class: "form-grid" }, field(t("Disk warning %"), disk), field(t("Memory warning %"), mem), field(t("Certificate warning (days)"), cert)),
        field(t("Webhook URL"), hook, t("Slack- and Discord-compatible JSON is posted here.")), h("div", null, h("button", { class: "btn sm", onclick: async () => { try { await post("/api/settings/test-webhook", { url: hook.value.trim() }); toast(t("Webhook answered OK")); } catch (e) { fail(e); } } }, t("Send test"))))) ),
    card(t("Email alerts"), h("div", { class: "stack" },
      h("label", { class: "check" }, emEnabled, t("Send an e-mail for warning/critical notifications")),
      h("div", { class: "form-grid" }, field(t("SMTP host"), emHost), field(t("Port"), emPort), field(t("Security"), emSec)),
      h("div", { class: "form-grid" }, field(t("Username"), emUser), field(t("Password"), emPass)),
      h("div", { class: "form-grid" }, field(t("From address"), emFrom), field(t("Minimum level"), emLevel)),
      field(t("Recipients (one per line)"), emTo),
      h("div", null, h("button", { class: "btn sm", onclick: async () => { try { await post("/api/settings/test-email", emailBody()); toast(t("Test e-mail sent")); } catch (e) { fail(e); } } }, t("Send test"))))),
    card(t("Fleet hosts"), hostBox, { sub: t("Remote HackerCockpit instances polled with API tokens") }),
    h("div", { class: "grid g2" },
      card(t("Export & import"), h("div", { class: "stack" }, h("p", { class: "muted" }, t("Move your configuration to another host: settings, backup profiles and firewall rules in one JSON file.")), h("div", { class: "row" }, h("button", { class: "btn", onclick: async () => { try { const x = await get("/api/settings/export"); download("hackercockpit-config.json", JSON.stringify(x, null, 2)); } catch (e) { fail(e); } } }, icon("download"), t("Export")), h("button", { class: "btn", onclick: () => importFile.click() }, icon("upload"), t("Import…")), importFile))),
      card(t("Server"), h("dl", { class: "kv" }, note(t("Version"), ro.version), note(t("Listening on"), ro.listen), note(t("Authentication"), ro.auth ? t("enabled") : t("disabled")), note("TLS", ro.tls ? t("enabled") : t("disabled")), note(t("Reverse proxy trusted"), ro.trust_proxy ? t("yes") : t("no")), note(t("Search provider"), ro.search_provider), note(t("Data directory"), ro.data_dir)))),
    card(t("Change history"), historyBody, { sub: t("Last 25 changes — roll back to undo a mistake") })));
  loadHistory();

  async function loadHistory() {
    mount(historyBody, loading(3));
    try {
      const d = await get("/api/settings/history");
      mount(historyBody, table([
        { label: t("When"), mono: true, render: (e) => dt(e.time) },
        { label: t("By"), render: (e) => h("span", { class: "badge ghost" }, e.actor || t("system")) },
        { label: "", render: (e) => h("div", { class: "actions" }, h("button", { class: "btn sm ghost", onclick: () => previewVersion(e) }, icon("eye"), t("Preview")),
          h("button", { class: "btn sm", onclick: async () => { if (await confirmDialog(t("Roll back settings"), t("Restore the configuration from {t}? The current configuration is saved to history first, so this can be undone.", { t: dt(e.time) }))) { try { await post(`/api/settings/rollback/${e.id}`); toast(t("Settings restored")); location.reload(); } catch (er) { fail(er); } } } }, icon("history"), t("Roll back"))) },
      ], d.history, { empty: empty("history", t("No changes recorded yet")) }));
    } catch (e) { mount(historyBody, h("div", { class: "callout bad" }, e.message)); }
  }
  function previewVersion(e) {
    modal({ title: dt(e.time), wide: true, body: h("pre", { class: "pre" }, JSON.stringify(e.settings, null, 2)), actions: [{ label: t("Close"), kind: "primary" }] });
  }
}
