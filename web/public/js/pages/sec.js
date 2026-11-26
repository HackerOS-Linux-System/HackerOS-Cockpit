import { h, icon, get, post, del, fail, toast, bytes, rate, card, tabs, table, empty, pageHead, field, mount, clear, statusDot, confirmDialog, promptDialog, modal, stream, liveOutput, dt, loading, copyText, withConfirm, switchEl } from "../core.js";
import { t } from "../i18n.js";
import { lineChart } from "../charts.js";
import { runStreamModal } from "./common.js";

// ═══ Network ════════════════════════════════════════════════════════════
export async function network(root, ctx) {
  let tabId = "interfaces"; const holder = h("div"); let data = null;
  const tabsEl = tabs([["interfaces", t("Interfaces")], ["connections", t("Connections")], ["listening", t("Listening ports")], ["routes", t("Routes & DNS")], ["tools", t("Tools")]], tabId, (id) => { tabId = id; draw(); });
  root.append(pageHead(t("Network"), null, tabsEl, h("button", { class: "btn", onclick: () => load() }, icon("refresh-cw"))), holder);
  const sock = (c) => [{ label: t("Proto"), render: (x) => h("span", { class: "badge" }, x.proto) }, { label: t("State"), key: "state" }, { label: t("Local"), mono: true, key: "local" }, { label: t("Remote"), mono: true, key: "remote" }, { label: t("Process"), key: "process" }];
  function draw() {
    if (!data) return mount(holder, loading(3));
    if (tabId === "interfaces") {
      mount(holder, h("div", { class: "stack" },
        h("div", { class: "grid g3" }, data.interfaces.map((i) => card(i.name, h("dl", { class: "kv" }, h("dt", null, t("State")), h("dd", null, i.state), h("dt", null, "MAC"), h("dd", null, i.mac || "–"), h("dt", null, "MTU"), h("dd", null, i.mtu), h("dt", null, t("Addresses")), h("dd", null, i.addrs.join("\n") || "–"), h("dt", null, "RX / TX"), h("dd", null, `${bytes(i.rx_bytes)} / ${bytes(i.tx_bytes)}`)), { actions: statusDot(i.state === "UP" ? "ok" : "") }))),
        ifaceHistoryCard(data.interfaces)));
      return;
    }
    else if (tabId === "connections") mount(holder, h("div", { class: "stack" },
      data.connections_truncated ? h("div", { class: "callout" }, icon("info"), t("Showing the first 300 connections — more exist.")) : null,
      card(null, table(sock(), data.connections, { empty: empty("network", t("No active connections")) }), { flush: true })));
    else if (tabId === "listening") mount(holder, card(null, table(sock(), data.listening, { empty: empty("radar", t("Nothing listening")) }), { flush: true }));
    else if (tabId === "routes") mount(holder, h("div", { class: "grid g-main" }, card(t("Routing table"), table([{ label: t("Destination"), mono: true, key: "dest" }, { label: t("Gateway"), mono: true, key: "gateway" }, { label: t("Device"), key: "dev" }, { label: t("Metric"), mono: true, key: "metric" }], data.routes), { flush: true }), card("DNS", h("dl", { class: "kv" }, h("dt", null, t("Nameservers")), h("dd", null, data.dns.join("\n") || "–"), h("dt", null, t("Search domains")), h("dd", null, data.search.join("\n") || "–")))));
    else {
      const host = h("input", { class: "input", placeholder: "example.com", autofocus: true }); const tool = h("select", { class: "select" }, ["ping", "traceroute", "dig"].map((x) => h("option", { value: x }, x))); const out = h("pre", { class: "pre" }, t("Output appears here."));
      const runIt = async () => { mount(out, t("Running…")); try { const d = await post("/api/network/tool", { tool: tool.value, host: host.value.trim() }); out.textContent = d.output || t("(no output)"); } catch (e) { out.textContent = e.message; } };
      host.addEventListener("keydown", (e) => e.key === "Enter" && runIt());
      mount(holder, h("div", { class: "stack" }, h("div", { class: "toolbar" }, tool, host, h("button", { class: "btn primary", disabled: !ctx.can("operator"), onclick: runIt }, icon("play"), t("Run"))), out));
    }
  }
  async function load() { try { data = await get("/api/network"); draw(); } catch (e) { fail(e); } }
  draw(); load();
}

// ═══ Firewall ═══════════════════════════════════════════════════════════
// ifaceHistoryCard renders a throughput chart for one interface, picked
// from a dropdown, backed by /api/metrics/iface/{name}.
function ifaceHistoryCard(interfaces) {
  const up = interfaces.filter((i) => i.state === "UP" && i.name !== "lo");
  if (!up.length) return null;
  let current = up[0].name, range = "1h";
  const chartEl = h("div");
  const pick = h("select", { class: "select sm" }, up.map((i) => h("option", { value: i.name }, i.name)));
  const rangeTabs = tabs([["1h", "1h"], ["6h", "6h"], ["24h", "24h"]], range, (r) => { range = r; load(); });
  pick.addEventListener("change", () => { current = pick.value; load(); });
  const wrap = card(t("Interface throughput"), chartEl, { sub: t("bytes per second"), actions: h("div", { class: "row" }, pick, rangeTabs) });
  async function load() {
    mount(chartEl, loading(1));
    try {
      const d = await get(`/api/metrics/iface/${encodeURIComponent(current)}?range=${range}`);
      if (!d.points || d.points.length < 2) { mount(chartEl, empty("activity", t("Not enough history yet"), t("Come back in a minute or two."))); return; }
      lineChart(chartEl, [{ cls: "s1", label: "RX", values: d.points.map((p) => ({ t: p.t, v: p.rx })), area: true }, { cls: "s3", label: "TX", values: d.points.map((p) => ({ t: p.t, v: p.tx })) }], { fmt: (v) => rate(v).replace(" ", "") });
    } catch (e) { mount(chartEl, h("div", { class: "callout bad" }, e.message)); }
  }
  load();
  return wrap;
}

export async function firewall(root, ctx) {
  const op = ctx.can("operator"); const body = h("div", null, loading(3)); let zone = "";
  root.append(pageHead(t("Firewall"), t("Managed through ufw (full), firewalld (allow, deny and reject rules, per zone) or nftables (read-only). Rules that could lock you out ask for confirmation."), h("button", { class: "btn", onclick: () => load() }, icon("refresh-cw"))), body);
  const call = async (fn, okMsg) => { try { const r = await withConfirm(fn); if (r !== null) { toast(okMsg || t("done")); } load(); } catch (e) { fail(e); } };
  function addForm(fw) {
    const a = h("select", { class: "select" }, (fw.backend === "firewalld" ? ["allow", "deny", "reject"] : ["allow", "deny", "reject", "limit"]).map((x) => h("option", { value: x }, t(x)))), dir = h("select", { class: "select" }, [["in", t("incoming")], ["out", t("outgoing")]].map(([v, l]) => h("option", { value: v }, l)));
    const proto = h("select", { class: "select" }, [["", t("any")], ["tcp", "TCP"], ["udp", "UDP"]].map(([v, l]) => h("option", { value: v }, l))); const port = h("input", { class: "input mono", placeholder: "22 / 8000:8100" }); const from = h("input", { class: "input mono", placeholder: t("any / 10.0.0.0/8") }); const com = h("input", { class: "input", placeholder: t("optional note") });
    const zoneField = fw.backend === "firewalld" && fw.zones?.length ? h("select", { class: "select" }, fw.zones.map((z) => h("option", { value: z, selected: z === (zone || fw.active_zone) }, z))) : null;
    modal({ title: t("New rule"), body: h("div", { class: "stack" }, h("div", { class: "form-grid" }, field(t("Action"), a), field(t("Direction"), dir), field(t("Protocol"), proto)), h("div", { class: "form-grid" }, field(t("Port"), port), field(t("From address"), from)), zoneField ? field(t("Zone"), zoneField) : null, field(t("Note"), com)),
      actions: [{ label: t("Cancel") }, { label: t("Add rule"), kind: "primary", run: () => call((c) => post("/api/firewall/rules", { action: a.value, direction: dir.value, proto: proto.value, port: port.value.trim(), from: from.value.trim(), comment: com.value.trim(), zone: zoneField ? zoneField.value : undefined, confirm: c }), t("Rule added")) }] });
  }
  async function load() {
    try {
      const { firewall: fw } = await get(`/api/firewall${zone ? `?zone=${encodeURIComponent(zone)}` : ""}`);
      const zonePicker = fw.backend === "firewalld" && fw.zones?.length > 1 ? h("select", { class: "select sm", onchange: (e) => { zone = e.target.value; load(); } }, fw.zones.map((z) => h("option", { value: z, selected: z === (zone || fw.active_zone) }, z))) : null;
      const head = card(t("Status"), h("div", { class: "row" }, h("span", { class: "badge solid" }, fw.backend), h("span", { class: "row" }, statusDot(fw.active ? "ok" : "bad"), fw.active ? t("active") : t("inactive")), zonePicker, h("span", { class: "spacer" }),
        fw.defaults?.incoming ? h("span", { class: "chip" }, `${t("default in")}: ${fw.defaults.incoming}`) : null, fw.defaults?.outgoing ? h("span", { class: "chip" }, `${t("default out")}: ${fw.defaults.outgoing}`) : null,
        op && !fw.read_only && fw.available ? [switchEl(fw.active, (on) => call((c) => post("/api/firewall/toggle", { enabled: on, confirm: c }), on ? t("Firewall enabled") : t("Firewall disabled"))), h("button", { class: "btn sm primary", onclick: () => addForm(fw) }, icon("plus"), t("Add rule"))] : null));
      const dpol = op && fw.backend === "ufw" ? card(t("Default policy"), h("div", { class: "form-grid" }, ["incoming", "outgoing"].map((d) => field(d === "incoming" ? t("Incoming") : t("Outgoing"), h("select", { class: "select", onchange: (e) => call((c) => post("/api/firewall/default", { direction: d, policy: e.target.value, confirm: c }), t("Policy updated")) }, ["allow", "deny", "reject"].map((p) => h("option", { value: p, selected: fw.defaults?.[d] === p }, t(p)))))))) : null;
      const rules = fw.read_only ? card(t("Ruleset"), h("pre", { class: "pre" }, fw.raw || t("(empty)"))) : card(t("Rules"), table([{ label: "#", mono: true, render: (r) => h("span", { class: "mono", style: null }, r.id.startsWith("rich:") ? t("custom") : r.id) }, { label: t("To"), mono: true, key: "to" }, { label: t("Action"), render: (r) => h("span", { class: `badge ${/DENY|REJECT/.test(r.action) ? "bad" : ""}` }, r.action) }, { label: t("From"), mono: true, key: "from" }, { label: t("Direction"), key: "dir" },
        { label: "", render: (r) => op ? h("div", { class: "actions" }, h("button", { class: "btn sm danger", onclick: async () => { if (await confirmDialog(t("Delete rule"), r.raw, { danger: true })) call(() => del(`/api/firewall/rules/${encodeURIComponent(r.id)}`), t("Rule removed")); } }, icon("trash-2"))) : null }], fw.rules, { empty: empty("shield-check", fw.available ? t("No rules yet") : t("No supported firewall"), fw.message) }), { flush: true });
      mount(body, h("div", { class: "stack" }, fw.message && fw.available ? h("div", { class: "callout" }, icon("info"), fw.message) : null, head, dpol, rules));
    } catch (e) { mount(body, h("div", { class: "callout bad" }, e.message)); }
  }
  load();
}

// ═══ Certificates ═══════════════════════════════════════════════════════
export async function certs(root, ctx) {
  const body = h("div", null, loading(3)); const admin = ctx.can("admin");
  const stream_ = (title, path, b) => runStreamModal(title, path, b, { onFinish: load });
  function issue() {
    const dom = h("input", { class: "input", placeholder: "example.com, www.example.com" }), mail = h("input", { class: "input", type: "email", placeholder: "you@example.com" }), mode = h("select", { class: "select" }, [["standalone", t("standalone (port 80 must be free)")], ["webroot", "webroot"]].map(([v, l]) => h("option", { value: v }, l))); const web = h("input", { class: "input mono", placeholder: "/var/www/html" }); const dry = h("input", { type: "checkbox", checked: true });
    modal({ title: t("Issue a Let’s Encrypt certificate"), body: h("div", { class: "stack" }, field(t("Domains"), dom), field(t("Contact e-mail"), mail), h("div", { class: "form-grid" }, field(t("Method"), mode), field(t("Webroot"), web)), h("label", { class: "check" }, dry, t("Dry run first (no certificate is issued)"))),
      actions: [{ label: t("Cancel") }, { label: t("Continue"), kind: "primary", run: () => { stream_(t("certbot"), "/api/certs/certbot/stream", { domains: dom.value.split(/[ ,]+/).filter(Boolean), email: mail.value.trim(), mode: mode.value, webroot: web.value.trim(), dry_run: dry.checked }); } }] });
  }
  function selfSigned() {
    const name = h("input", { class: "input", value: "panel" }), hosts = h("input", { class: "input", value: "localhost, 127.0.0.1" }), days = h("input", { class: "input", type: "number", value: 365 });
    modal({ title: t("Generate a self-signed certificate"), body: h("div", { class: "stack" }, field(t("Name"), name), field(t("Host names / IPs"), hosts), field(t("Valid for (days)"), days)), actions: [{ label: t("Cancel") }, { label: t("Generate"), kind: "primary", run: async () => { const r = await post("/api/certs/selfsigned", { name: name.value.trim(), hosts: hosts.value.split(/[ ,]+/).filter(Boolean), days: +days.value }); modal({ title: t("Certificate created"), body: h("div", { class: "stack" }, h("p", { class: "muted" }, r.message), h("pre", { class: "pre" }, `HCKPT_TLS_CERT=${r.cert}\nHCKPT_TLS_KEY=${r.key}`)), actions: [{ label: t("Close"), kind: "primary" }] }); load(); } }] });
  }
  root.append(pageHead(t("Certificates"), t("X.509 certificates found in the configured directories, with expiry tracking."),
    admin ? [h("button", { class: "btn", onclick: selfSigned }, icon("badge-check"), t("Self-signed")), h("button", { class: "btn", onclick: () => stream_(t("Renew certificates"), "/api/certs/renew/stream", { dry_run: false }) }, icon("refresh-cw"), t("Renew all")), h("button", { class: "btn primary", onclick: issue }, icon("plus"), t("Issue with certbot"))] : null), body);
  async function load() {
    try {
      const d = await get("/api/certs");
      mount(body, h("div", { class: "stack" }, d.panel_tls ? h("div", { class: "callout" }, icon("lock"), t("The panel itself is served over TLS ({p}).", { p: d.panel_cert })) : h("div", { class: "callout" }, icon("lock-open"), t("The panel is served without TLS. Generate a certificate and set HCKPT_TLS_CERT / HCKPT_TLS_KEY, or use a TLS reverse proxy.")),
        card(null, table([{ label: t("Name"), render: (c) => h("div", null, h("b", null, c.subject || "–"), h("div", { class: "dim mono" }, c.path)) }, { label: t("Covers"), render: (c) => h("span", { class: "muted" }, c.names.slice(0, 3).join(", ") + (c.names.length > 3 ? ` +${c.names.length - 3}` : "")) },
          { label: t("Issuer"), render: (c) => (c.self_signed ? h("span", { class: "badge ghost" }, t("self-signed")) : c.issuer) }, { label: t("Expires"), mono: true, key: "not_after" },
          { label: t("Left"), num: true, render: (c) => h("span", { class: `badge ${c.days_left < 14 ? "bad" : ""}` }, c.expired ? t("expired") : t("{n} days", { n: c.days_left })) }], d.certs, { empty: empty("badge-check", t("No certificates found"), d.dirs.join("  ·  ")) }), { flush: true })));
    } catch (e) { mount(body, h("div", { class: "callout bad" }, e.message)); }
  }
  load();
}

// ═══ System users & groups & SSH keys ═══════════════════════════════════
export async function sysusers(root, ctx) {
  const admin = ctx.can("admin"); let tabId = "users"; let data = null; const holder = h("div");
  root.append(pageHead(t("System accounts"), t("Linux users and groups on this machine (not panel logins)."), tabs([["users", t("Users")], ["groups", t("Groups")]], tabId, (id) => { tabId = id; draw(); }),
    admin ? h("button", { class: "btn primary", onclick: create }, icon("plus"), t("New user")) : null), holder);
  const act = async (name, action, value) => { try { await post(`/api/sysusers/${encodeURIComponent(name)}/action`, { action, value }); toast(t("done")); load(); } catch (e) { fail(e); } };
  function create() {
    const name = h("input", { class: "input", placeholder: "alice" }), full = h("input", { class: "input" }), shell = h("select", { class: "select" }, data.shells.map((s) => h("option", { value: s, selected: s === "/bin/bash" }, s))), pw = h("input", { class: "input", type: "password", autocomplete: "new-password" }), grp = h("input", { class: "input", placeholder: "sudo, docker" });
    modal({ title: t("New user"), body: h("div", { class: "stack" }, h("div", { class: "form-grid" }, field(t("Username"), name), field(t("Full name"), full)), h("div", { class: "form-grid" }, field(t("Shell"), shell), field(t("Password"), pw, t("Optional; leave empty for a locked-password account"))), field(t("Extra groups"), grp)),
      actions: [{ label: t("Cancel") }, { label: t("Create"), kind: "primary", run: async () => { await post("/api/sysusers", { name: name.value.trim(), full_name: full.value.trim(), shell: shell.value, password: pw.value, groups: grp.value.split(/[ ,]+/).filter(Boolean) }); toast(t("User created")); load(); } }] });
  }
  async function keys(u) {
    const bodyEl = h("div", null, loading(2)); const ta = h("textarea", { class: "textarea", placeholder: "ssh-ed25519 AAAA… comment" });
    const refresh = async () => { try { const d = await get(`/api/sysusers/${encodeURIComponent(u.username)}/keys`); mount(bodyEl, table([{ label: t("Type"), key: "type", mono: true }, { label: t("Fingerprint"), mono: true, key: "fingerprint" }, { label: t("Comment"), key: "comment" }, { label: "", render: (k) => h("div", { class: "actions" }, h("button", { class: "btn sm danger", onclick: async () => { if (await confirmDialog(t("Revoke key"), k.fingerprint, { danger: true })) { await del(`/api/sysusers/${encodeURIComponent(u.username)}/keys?fingerprint=${encodeURIComponent(k.fingerprint)}`); refresh(); } } }, icon("trash-2"))) }], d.keys, { empty: empty("key-round", t("No authorised keys")) })); } catch (e) { mount(bodyEl, h("div", { class: "callout bad" }, e.message)); } };
    modal({ title: `${t("SSH keys")} — ${u.username}`, wide: true, body: h("div", { class: "stack" }, bodyEl, h("div", { class: "hr" }), field(t("Add a public key"), ta),
      h("div", { class: "row" }, h("button", { class: "btn primary", onclick: async () => { try { await post(`/api/sysusers/${encodeURIComponent(u.username)}/keys`, { key: ta.value }); ta.value = ""; toast(t("Key added")); refresh(); } catch (e) { fail(e); } } }, icon("plus"), t("Authorise key")),
        h("button", { class: "btn", onclick: async () => { try { const r = await post("/api/sshkeys/generate", { comment: `${u.username}@hackercockpit` }); ta.value = r.pair.public; modal({ title: t("New key pair"), body: h("div", { class: "stack" }, h("div", { class: "callout bad" }, icon("triangle-alert"), r.message), field(t("Private key"), h("textarea", { class: "textarea", readOnly: true }, r.pair.private)), h("button", { class: "btn", onclick: () => copyText(r.pair.private) }, icon("copy"), t("Copy private key"))), actions: [{ label: t("Close"), kind: "primary" }] }); } catch (e) { fail(e); } } }, icon("fingerprint"), t("Generate pair")))), actions: [{ label: t("Close"), kind: "primary" }] });
    refresh();
  }
  function groupsOf(u) { return data.groups.filter((g) => g.members.includes(u.username)).map((g) => g.groupname); }
  function draw() {
    if (!data) return mount(holder, loading(4));
    if (tabId === "users") mount(holder, card(null, table([
      { label: t("User"), render: (u) => h("div", { class: "namecell" }, h("div", { class: "avatar" }, u.username.slice(0, 2)), h("div", null, h("b", null, u.username), h("div", { class: "dim" }, u.gecos || ""))) }, { label: "UID", mono: true, key: "uid" },
      { label: t("Groups"), render: (u) => h("div", { class: "pill-list" }, groupsOf(u).slice(0, 4).map((g) => h("span", { class: "badge ghost" }, g))) }, { label: t("Shell"), mono: true, key: "shell" },
      { label: t("State"), render: (u) => (u.locked === true ? h("span", { class: "badge bad" }, icon("lock"), t("locked")) : u.system ? h("span", { class: "badge ghost" }, t("system")) : h("span", { class: "badge" }, t("active"))) },
      { label: "", render: (u) => admin && u.uid !== 0 ? h("div", { class: "actions" }, h("button", { class: "btn sm", onclick: () => keys(u) }, icon("key-round"), "SSH"),
        h("button", { class: "btn sm ghost", onclick: () => act(u.username, u.locked ? "unlock" : "lock") }, icon(u.locked ? "lock-open" : "lock")),
        h("button", { class: "btn sm ghost", onclick: async () => { const p = await promptDialog(t("Set password"), u.username, { type: "password", hint: t("At least 8 characters.") }); if (p) act(u.username, "password", p); } }, icon("pencil")),
        h("button", { class: "btn sm ghost", onclick: async () => { const g = await promptDialog(t("Add to group"), u.username, { hint: t("Group name, e.g. sudo") }); if (g) act(u.username, "addgroup", g.trim()); } }, icon("users")),
        !u.system ? h("button", { class: "btn sm danger", onclick: async () => { if (await confirmDialog(t("Delete user"), t("Delete {u}? The home directory is kept.", { u: u.username }), { danger: true })) { try { await del(`/api/sysusers/${encodeURIComponent(u.username)}`); load(); } catch (e) { fail(e); } } } }, icon("trash-2")) : null) : null },
    ], data.users.filter((u) => !u.system || u.uid === 0 || u.shell.includes("sh") && !/nologin|false/.test(u.shell)), { empty: empty("users", t("No users")) }), { flush: true }));
    else mount(holder, card(null, table([{ label: t("Group"), render: (g) => h("b", null, g.groupname) }, { label: "GID", mono: true, key: "gid" }, { label: t("Members"), render: (g) => h("div", { class: "pill-list" }, g.members.map((m) => h("span", { class: "badge ghost" }, m))) },
      { label: "", render: (g) => admin && g.gid >= 1000 ? h("div", { class: "actions" }, h("button", { class: "btn sm danger", onclick: async () => { if (await confirmDialog(t("Delete group"), g.groupname, { danger: true })) { try { await del(`/api/sysgroups/${encodeURIComponent(g.groupname)}`); load(); } catch (e) { fail(e); } } } }, icon("trash-2"))) : null }], data.groups.filter((g) => g.gid >= 1000 || g.members.length || ["sudo", "docker", "wheel", "adm"].includes(g.groupname))), { flush: true }));
  }
  async function load() { try { data = await get("/api/sysusers"); draw(); } catch (e) { mount(holder, h("div", { class: "callout bad" }, e.message)); } }
  load();
}

// ═══ Pentest ════════════════════════════════════════════════════════════
export async function pentest(root) {
  const info = await get("/api/pentest/tools").catch(() => ({ available: {}, profiles: {} }));
  const tool = h("select", { class: "select" }, Object.keys(info.profiles).sort().map((x) => h("option", { value: x }, `${x}${info.available[x] ? "" : "  (" + t("not installed") + ")"}`)));
  const prof = h("select", { class: "select" }); const target = h("input", { class: "input mono", placeholder: "scanme.nmap.org  ·  192.168.1.0/24  ·  https://example.com" });
  const fillProfiles = () => { mount(prof, (info.profiles[tool.value] || []).sort().map((p) => h("option", { value: p }, p))); }; tool.addEventListener("change", fillProfiles); fillProfiles();
  const out = liveOutput(); out.el.classList.add("tall"); out.el.textContent = t("Scan output appears here."); let job = null; const btn = h("button", { class: "btn primary" }, icon("crosshair"), t("Start scan"));
  btn.addEventListener("click", () => {
    if (job) { job.abort(); return; }
    out.clear(); btn.replaceChildren(icon("square"), t("Stop")); btn.classList.add("danger");
    job = stream("/api/pentest/stream", { tool: tool.value, profile: prof.value, target: target.value.trim() }, { onLine: out.push, onDone: ({ ok, error }) => { if (!ok && error) out.push(`\n[${error}]`); job = null; btn.replaceChildren(icon("crosshair"), t("Start scan")); btn.classList.remove("danger"); } });
  });
  root.append(pageHead(t("Pentest toolkit"), t("nmap · nikto · whois with fixed, validated profiles.")), h("div", { class: "stack" }, h("div", { class: "callout bad" }, icon("triangle-alert"), t("Only scan systems you own or have explicit written permission to test. Every scan is written to the audit log.")),
    h("div", { class: "toolbar" }, tool, prof, target, btn), out.el));
  return () => job?.abort();
}

// ═══ Audit ══════════════════════════════════════════════════════════════
export async function audit(root) {
  const q = h("input", { class: "input", placeholder: t("Filter by user, action or detail…") }); const body = h("div", null, loading(4)); let tm;
  root.append(pageHead(t("Audit log"), t("Every sensitive action performed through the panel, newest first. Rotated automatically at 5 MB.")), h("div", { class: "toolbar" }, q, h("button", { class: "btn", onclick: () => load() }, icon("refresh-cw"))), card(null, body, { flush: true }));
  q.addEventListener("input", () => { clearTimeout(tm); tm = setTimeout(load, 300); });
  const re = /^(\S+) \[([^\]]*)\] ([^:]+): ?(.*)$/;
  async function load() {
    try { const d = await get(`/api/audit?limit=400&q=${encodeURIComponent(q.value)}`); const rows = d.entries.slice().reverse().map((l) => { const m = re.exec(l); return m ? { time: m[1], who: m[2], action: m[3], detail: m[4] } : { time: "", who: "", action: "", detail: l }; });
      mount(body, table([{ label: t("Time"), mono: true, render: (r) => (r.time ? dt(r.time) : "") }, { label: t("User"), render: (r) => h("span", { class: "badge ghost" }, r.who) }, { label: t("Action"), render: (r) => h("b", { class: "mono" }, r.action) }, { label: t("Detail"), render: (r) => h("span", { class: "muted mono" }, r.detail) }], rows, { empty: empty("clipboard-list", t("No entries")) })); } catch (e) { fail(e); }
  }
  load();
}
