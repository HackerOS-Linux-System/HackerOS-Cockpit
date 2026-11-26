import { h, icon, get, post, put, del, fail, toast, bytes, card, tabs, table, empty, pageHead, field, mount, clear, statusDot, confirmDialog, promptDialog, modal, stream, liveOutput, dt, loading, debounce, copyText, switchEl } from "../core.js";
import { t } from "../i18n.js";
import { Terminal } from "../term.js";
import { runStreamModal, levelClass, cronHuman } from "./common.js";

// ═══ Services ═══════════════════════════════════════════════════════════
export async function services(root, ctx) {
  const body = h("div", null, loading(4));
  root.append(pageHead(t("Services"), t("systemd units you chose to manage. Edit the list under Settings."), h("button", { class: "btn", onclick: () => refresh() }, icon("refresh-cw"), t("Refresh"))), card(null, body, { flush: true }));
  const act = async (name, action) => { try { await post("/api/services/action", { name, action }); toast(`${name}: ${t(action)}`); refresh(); } catch (e) { fail(e); } };
  async function refresh() {
    try {
      const d = await get("/api/services"); const op = ctx.can("operator");
      mount(body, table([
        { label: t("Service"), render: (s) => h("div", { class: "namecell" }, statusDot(s.active ? "ok" : s.state === "failed" ? "bad" : ""), h("div", null, h("b", null, s.name), h("div", { class: "dim", style: null }, s.description || ""))) },
        { label: t("State"), render: (s) => h("span", { class: `badge ${s.state === "failed" ? "bad" : ""}` }, s.enabled === "not-found" ? t("not installed") : `${s.state}${s.sub ? " · " + s.sub : ""}`) },
        { label: t("Boot"), render: (s) => h("span", { class: "badge ghost" }, s.enabled) },
        { label: "PID", key: "main_pid", mono: true }, { label: t("Memory"), num: true, mono: true, render: (s) => (s.memory ? bytes(+s.memory) : "–") },
        { label: "", render: (s) => s.enabled === "not-found" ? null : h("div", { class: "actions" },
          h("a", { class: "btn sm ghost", href: `#/logs?unit=${encodeURIComponent(s.name)}` }, icon("scroll-text"), t("Logs")),
          op ? [h("button", { class: "btn sm", onclick: () => act(s.name, s.active ? "stop" : "start") }, s.active ? t("Stop") : t("Start")),
            h("button", { class: "btn sm", onclick: () => act(s.name, "restart") }, icon("rotate-cw"), t("Restart")),
            h("select", { class: "select sm", style: null, onchange: (e) => { if (e.target.value) act(s.name, e.target.value); e.target.value = ""; } }, h("option", { value: "" }, t("More")), ["reload", "enable", "disable"].map((a) => h("option", { value: a }, t(a))))] : null) },
      ], d.services, { empty: empty("server-cog", t("No services configured")) }));
    } catch (e) { fail(e); }
  }
  refresh(); const iv = setInterval(refresh, 15000); return () => clearInterval(iv);
}

// ═══ Logs ═══════════════════════════════════════════════════════════════
export async function logs(root, ctx) {
  const src = await get("/api/logs/sources").catch(() => ({ files: [], units: [] }));
  const q = ctx.query;
  const source = h("select", { class: "select" }, h("option", { value: "" }, t("systemd journal")), src.files.map((f) => h("option", { value: f }, f)));
  const unit = h("input", { class: "input", list: "units", placeholder: "ssh.service", value: q.unit || "" });
  const units = h("datalist", { id: "units" }, src.units.map((u) => h("option", { value: u })));
  const prio = h("select", { class: "select" }, [["", t("any level")], ["err", t("errors")], ["warning", t("warnings +")], ["info", t("info +")]].map(([v, l]) => h("option", { value: v }, l)));
  const since = h("select", { class: "select" }, [["", t("all time")], ["15 minutes ago", t("15 min")], ["1 hour ago", t("1 hour")], ["24 hours ago", t("24 hours")], ["7 days ago", t("7 days")]].map(([v, l]) => h("option", { value: v }, l)));
  const lines = h("select", { class: "select" }, [100, 200, 500, 1000, 3000].map((n) => h("option", { value: n, selected: n === 200 }, `${n} ${t("lines")}`)));
  const grep = h("input", { class: "input", placeholder: t("Filter (case-insensitive)…") });
  const view = h("pre", { class: "pre tall" }); const meta = h("span", { class: "dim mono" });
  let follow = null;
  const params = () => { const p = new URLSearchParams(); if (source.value) p.set("file", source.value); else { if (unit.value) p.set("unit", unit.value); if (prio.value) p.set("priority", prio.value); if (since.value) p.set("since", since.value); } if (grep.value) p.set("grep", grep.value); p.set("lines", lines.value); return p.toString(); };
  const paint = (arr) => { clear(view); const g = grep.value.toLowerCase(); arr.forEach((l) => view.append(lineEl(l, g))); view.scrollTop = view.scrollHeight; };
  function lineEl(l, g) {
    const el = h("span", { class: levelClass(l) }); const i = g ? l.toLowerCase().indexOf(g) : -1;
    if (i >= 0) el.append(l.slice(0, i), h("span", { class: "hl" }, l.slice(i, i + g.length)), l.slice(i + g.length), "\n"); else el.append(l + "\n"); return el;
  }
  async function load() { stopFollow(); mount(view, loading(3)); try { const d = await get(`/api/logs?${params()}`); paint(d.lines); meta.textContent = `${d.source} · ${d.lines.length} ${t("lines")}`; } catch (e) { mount(view, h("span", { class: "out-err" }, e.message)); } }
  const followBtn = h("button", { class: "btn", onclick: () => (follow ? stopFollow() : startFollow()) }, icon("play"), t("Follow"));
  function startFollow() { follow = stream(`/api/logs/follow?${params()}`, {}, { onLine: (l) => { const at = view.scrollTop + view.clientHeight >= view.scrollHeight - 30; view.append(lineEl(l, grep.value.toLowerCase())); if (at) view.scrollTop = view.scrollHeight; }, onDone: ({ ok, error }) => { if (!ok && error && error !== t("Cancelled")) fail(new Error(error)); } }); followBtn.replaceChildren(icon("square"), t("Stop")); followBtn.classList.add("primary"); }
  function stopFollow() { if (follow) { follow.abort(); follow = null; } followBtn.replaceChildren(icon("play"), t("Follow")); followBtn.classList.remove("primary"); }
  const toggleJournal = () => { const j = !source.value; [unit, prio, since].forEach((x) => { x.disabled = !j; }); };
  source.addEventListener("change", () => { toggleJournal(); load(); });
  [unit, prio, since, lines].forEach((x) => x.addEventListener("change", load)); grep.addEventListener("input", debounce(load, 400));
  root.append(pageHead(t("Logs"), t("Read log files and the systemd journal. Only files on the allow-list are readable.")),
    h("div", { class: "toolbar" }, h("div", { style: null }, source), unit, units, prio, since, lines), h("div", { class: "toolbar" }, grep, h("button", { class: "btn", onclick: load }, icon("refresh-cw"), t("Refresh")), followBtn, h("span", { class: "spacer" }), meta), view);
  toggleJournal(); load(); return () => stopFollow();
}

// ═══ Terminal ═══════════════════════════════════════════════════════════
export async function terminal(root, ctx) {
  const f = ctx.features; let tab = f.pty ? "pty" : "quick"; const holder = h("div"); let cleanup = null;
  const show = (id) => { cleanup?.(); tab = id; clear(holder); cleanup = id === "pty" ? ptyTab(holder) : quickTab(holder); };
  root.append(pageHead(t("Terminal"), t("Full shell access as the panel user. Everything you run is written to the audit log."),
    tabs([f.pty && ["pty", t("Interactive")], ["quick", t("Command runner")]].filter(Boolean), tab, show)), holder);
  show(tab); return () => cleanup?.();
}

function ptyTab(host) {
  const status = h("span", { class: "dim mono" }, t("connecting…")); const box = h("div", { class: "term-host" });
  // A session name lets several tabs (or a reconnect after a dropped
  // connection) share one running shell, like tmux. Blank = your personal
  // default session; naming one gets you an independent shell beside it.
  const sessionInput = h("input", { class: "input sm mono", style: "width:130px", placeholder: t("default"), maxlength: 40, "aria-label": t("Session name") });
  const reconnect = h("button", { class: "btn sm", onclick: () => connect() }, icon("rotate-cw"), t("Reconnect"));
  const sessionsBtn = h("button", { class: "btn sm ghost", onclick: () => showSessions() }, icon("layers"), t("Sessions"));
  host.append(h("div", { class: "console" }, h("div", { class: "console-bar" }, h("span", { class: "lights" }, h("i"), h("i"), h("i")), h("span", null, "bash"), h("span", { class: "spacer" }), sessionInput, sessionsBtn, status, reconnect), box));
  let ws = null, term = null;
  const ro = new ResizeObserver(() => term?.fit()); ro.observe(box);
  sessionInput.addEventListener("keydown", (e) => { if (e.key === "Enter") connect(); });
  function connect() {
    ws?.close(); term?.destroy(); clear(box); status.textContent = t("connecting…");
    term = new Terminal(box, { onData: (b) => ws?.readyState === 1 && ws.send(b), onResize: (c, r) => ws?.readyState === 1 && ws.send(JSON.stringify({ type: "resize", cols: c, rows: r })) });
    term.fit();
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const sess = sessionInput.value.trim();
    ws = new WebSocket(`${proto}://${location.host}/api/terminal/ws?cols=${term.cols}&rows=${term.rows}${sess ? `&session=${encodeURIComponent(sess)}` : ""}`); ws.binaryType = "arraybuffer";
    ws.onopen = () => { status.textContent = `● ${t("connected")} · ${term.cols}×${term.rows}`; term.focus(); };
    ws.onmessage = (e) => term.write(new Uint8Array(e.data));
    ws.onclose = () => { status.textContent = `○ ${t("disconnected")}`; };
    ws.onerror = () => { status.textContent = `○ ${t("connection failed")}`; };
  }
  async function showSessions() {
    const bodyEl = h("div", null, loading(2));
    async function load() {
      try {
        const d = await get("/api/terminal/sessions");
        mount(bodyEl, table([
          { label: t("Session"), render: (x) => h("b", { class: "mono" }, x.name) },
          { label: t("Viewers"), num: true, mono: true, key: "viewers" },
          { label: t("Started"), mono: true, render: (x) => dt(x.started) },
          { label: t("Size"), mono: true, render: (x) => `${x.cols}×${x.rows}` },
          { label: "", render: (x) => h("div", { class: "actions" }, h("button", { class: "btn sm danger", onclick: async () => {
            if (await confirmDialog(t("Kill session"), x.name, { danger: true })) { try { await del(`/api/terminal/sessions/${encodeURIComponent(x.name)}`); load(); } catch (e) { fail(e); } } } }, icon("trash-2"))) },
        ], d.sessions, { empty: empty("terminal-square", t("No open sessions")) }));
      } catch (e) { mount(bodyEl, h("div", { class: "callout bad" }, e.message)); }
    }
    modal({ title: t("Open terminal sessions"), wide: true, body: h("div", { class: "stack" },
      h("div", { class: "callout" }, icon("info"), t("Sessions stay alive for 30 minutes after the last viewer leaves, so you can reconnect to the same shell. Type a name above and press Enter to attach to (or create) a specific one.")), bodyEl),
      actions: [{ label: t("Close"), kind: "primary" }] });
    load();
  }
  connect();
  return () => { ro.disconnect(); ws?.close(); term?.destroy(); };
}

function quickTab(host) {
  const out = h("div", { class: "console-out" }); let cwd = "~"; const ps1 = h("span", { class: "ps1" }, "$");
  const input = h("input", { placeholder: t("Type a command and press Enter"), autocomplete: "off", spellcheck: "false", autofocus: true });
  let hist = [], hi = 0, job = null;
  get("/api/terminal/history").then((d) => { hist = d.history || []; hi = hist.length; cwd = d.cwd; setPs(); }).catch(() => {});
  const setPs = () => { ps1.textContent = `${cwd} $`; };
  const echo = (cmd) => out.append(h("div", { class: "cmd-echo" }, h("b", null, `${cwd} $ `), cmd));
  const line = (txt, cls) => { const el = h("div", { class: cls || "" }, txt || " "); out.append(el); out.scrollTop = out.scrollHeight; };
  const run = () => {
    const cmd = input.value.trim(); if (!cmd) return; input.value = ""; hist.push(cmd); hi = hist.length; echo(cmd);
    if (cmd === "clear") { clear(out); return; }
    input.disabled = true;
    job = stream("/api/terminal/stream", { command: cmd }, {
      onLine: (l) => { if (l.startsWith("\x00cwd:")) { cwd = l.slice(5); setPs(); } else line(l); },
      onDone: ({ ok, error }) => { if (!ok && error) line(error, "out-err"); input.disabled = false; input.focus(); job = null; },
    });
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") run();
    else if (e.key === "ArrowUp") { e.preventDefault(); if (hi > 0) input.value = hist[--hi]; }
    else if (e.key === "ArrowDown") { e.preventDefault(); input.value = hi < hist.length - 1 ? hist[++hi] : ((hi = hist.length), ""); }
    else if (e.key === "c" && e.ctrlKey && job) job.abort();
  });
  host.append(h("div", { class: "console" }, h("div", { class: "console-bar" }, h("span", { class: "lights" }, h("i"), h("i"), h("i")), h("span", null, t("command runner · working directory is remembered")), h("span", { class: "spacer" }), h("kbd", null, "Ctrl C"), h("span", null, t("cancels"))), out, h("div", { class: "console-in" }, ps1, input)));
  line(t("Each command runs in a fresh bash; `cd` is remembered. For editors and TUIs use the Interactive tab."), "dim");
  return () => job?.abort();
}

// ═══ Files ══════════════════════════════════════════════════════════════
export async function files(root, ctx) {
  let path = ctx.query.path || ""; let showHidden = false;
  const crumbs = h("div", { class: "crumb-path" }), body = h("div", null, loading(5));
  const go = (p) => { path = p; load(); };
  const preview = async (full, name) => {
    try {
      const d = await get(`/api/files/read?path=${encodeURIComponent(full)}`);
      modal({ title: name, wide: true, body: h("div", { class: "stack" }, d.truncated ? h("div", { class: "callout" }, icon("info"), t("Preview truncated to the first 200 KB.")) : null, h("pre", { class: "pre" }, d.content)),
        actions: [{ label: t("Copy"), close: false, run: () => { copyText(d.content); return false; } }, { label: t("Download"), kind: "primary", run: () => { location.href = `/api/files/download?path=${encodeURIComponent(full)}`; } }] });
    } catch (e) { if (e.status === 400 && /binary|regular/.test(e.message)) location.href = `/api/files/download?path=${encodeURIComponent(full)}`; else fail(e); }
  };
  async function load() {
    mount(body, loading(5));
    try {
      const d = await get(`/api/files?path=${encodeURIComponent(path)}`); path = d.path; history.replaceState(null, "", `#/files?path=${encodeURIComponent(path)}`);
      const parts = path.split("/").filter(Boolean); let acc = "";
      mount(crumbs, h("button", { onclick: () => go("/") }, "/"), parts.map((p) => { acc += "/" + p; const a = acc; return [h("i", null, "›"), h("button", { onclick: () => go(a) }, p)]; }));
      const rows = d.entries.filter((e) => showHidden || !e.name.startsWith("."));
      mount(body, table([
        { label: t("Name"), render: (e) => h("div", { class: "namecell" }, icon(e.isDir ? "folder" : "file-text", "fileicon"), h("b", { style: null }, e.name), e.isLink ? h("span", { class: "badge ghost" }, "link") : null) },
        { label: t("Size"), num: true, mono: true, key: "sizeText" }, { label: t("Modified"), mono: true, key: "modified" }, { label: t("Mode"), mono: true, key: "mode" },
      ], rows, { onRow: (e) => { const full = (path === "/" ? "" : path) + "/" + e.name; e.isDir ? go(full) : preview(full, e.name); }, empty: empty("folder", t("Empty directory")) }));
    } catch (e) { mount(body, h("div", { class: "callout bad" }, icon("lock"), e.message)); }
  }
  root.append(pageHead(t("Files"), t("Browse the file system within the allowed roots. Reads are audited; secrets such as /etc/shadow and private keys are always blocked.")),
    h("div", { class: "toolbar" }, h("button", { class: "btn", onclick: () => go((path.replace(/\/[^/]+\/?$/, "")) || "/") }, icon("arrow-up"), t("Up")), h("div", { style: null, class: "spacer" }, crumbs),
      h("label", { class: "check" }, h("input", { type: "checkbox", onchange: (e) => { showHidden = e.target.checked; load(); } }), t("Hidden files"))), card(null, body, { flush: true }));
  load();
}

// ═══ Packages ═══════════════════════════════════════════════════════════
export async function packages(root, ctx) {
  const op = ctx.can("operator"); let tabId = "installed"; const holder = h("div");
  const run = (title, action, name, after) => runStreamModal(title, "/api/packages/stream", { action, name }, { onFinish: () => after?.() });
  const tabsEl = tabs([["installed", t("Installed")], ["search", t("Find & install")], ["upgrades", t("Updates")], ["maint", t("Maintenance")]], tabId, (id) => { tabId = id; draw(); });
  root.append(pageHead(t("Packages"), t("APT package management for Debian-based systems."), tabsEl), holder);

  function draw() {
    clear(holder);
    if (tabId === "installed") {
      let off = 0, qv = ""; const lim = 50; const bodyEl = h("div", null, loading(4)); const pager = h("div", { class: "row" });
      const load = async () => { try { const d = await get(`/api/packages?q=${encodeURIComponent(qv)}&offset=${off}&limit=${lim}`);
        mount(bodyEl, table([{ label: t("Package"), render: (p) => h("b", { class: "mono" }, p.name) }, { label: t("Version"), mono: true, key: "version" }, { label: t("Description"), render: (p) => h("span", { class: "muted" }, p.summary || "") },
          { label: "", render: (p) => h("div", { class: "actions" }, h("button", { class: "btn sm ghost", onclick: () => info(p.name) }, icon("info")), op ? h("button", { class: "btn sm danger", onclick: async () => { if (await confirmDialog(t("Remove package"), t("Remove {p}?", { p: p.name }), { danger: true })) run(t("Removing {p}", { p: p.name }), "remove", p.name, load); } }, icon("trash-2")) : null) }], d.packages));
        mount(pager, h("span", { class: "dim mono" }, `${d.total ? off + 1 : 0}–${Math.min(off + lim, d.total)} / ${d.total}`), h("button", { class: "btn sm", disabled: off === 0, onclick: () => { off = Math.max(0, off - lim); load(); } }, "‹"), h("button", { class: "btn sm", disabled: off + lim >= d.total, onclick: () => { off += lim; load(); } }, "›")); } catch (e) { fail(e); } };
      holder.append(h("div", { class: "toolbar" }, h("input", { class: "input", style: null, placeholder: t("Filter installed packages…"), oninput: debounce((e) => { qv = e.target.value; off = 0; load(); }, 300) }), h("span", { class: "spacer" }), pager), card(null, bodyEl, { flush: true })); load();
    } else if (tabId === "search") {
      const res = h("div", null, h("div", { class: "empty" }, icon("search"), h("div", null, t("Search the APT cache by package name")))); const inp = h("input", { class: "input", placeholder: t("e.g. htop, nginx, ripgrep"), autofocus: true });
      const doSearch = async () => { if (inp.value.trim().length < 2) return; mount(res, loading(3)); try { const d = await get(`/api/packages/search?q=${encodeURIComponent(inp.value.trim())}`);
        mount(res, table([{ label: t("Package"), render: (p) => h("b", { class: "mono" }, p.name) }, { label: t("Description"), render: (p) => h("span", { class: "muted" }, p.summary) }, { label: "", render: (p) => op ? h("div", { class: "actions" }, h("button", { class: "btn sm primary", onclick: () => run(t("Installing {p}", { p: p.name }), "install", p.name) }, icon("download"), t("Install"))) : null }], d.packages, { empty: empty("search", t("No matches")) })); } catch (e) { mount(res, h("div", { class: "callout bad" }, e.message)); } };
      inp.addEventListener("keydown", (e) => e.key === "Enter" && doSearch());
      holder.append(h("div", { class: "toolbar" }, inp, h("button", { class: "btn primary", onclick: doSearch }, icon("search"), t("Search"))), card(null, res, { flush: true }));
    } else if (tabId === "upgrades") {
      const bodyEl = h("div", null, loading(3));
      get("/api/packages/upgradable").then((d) => { mount(bodyEl, table([{ label: t("Package"), render: (p) => h("b", { class: "mono" }, p.name) }, { label: t("Installed"), mono: true, key: "current" }, { label: t("Available"), mono: true, key: "candidate" }, { label: t("Source"), key: "source" }], d.upgradable, { empty: empty("circle-check", t("Everything is up to date"), t("Run “Refresh lists” under Maintenance to check again.")) })); }).catch(fail);
      holder.append(h("div", { class: "toolbar" }, op ? h("button", { class: "btn primary", onclick: () => run(t("Upgrading system"), "upgrade", "", draw) }, icon("upload"), t("Upgrade all")) : null), card(null, bodyEl, { flush: true }));
    } else {
      holder.append(h("div", { class: "grid g3" }, [["update", "refresh-cw", t("Refresh lists"), t("apt-get update — fetch the latest package indexes.")], ["upgrade", "upload", t("Upgrade all"), t("apt-get upgrade -y — install all available updates.")], ["autoremove", "trash-2", t("Autoremove"), t("Remove packages that are no longer needed.")]].map(([a, ic, title, desc]) =>
        card(title, h("div", { class: "stack" }, h("p", { class: "muted", style: null }, desc), op ? h("div", null, h("button", { class: "btn primary", onclick: () => run(title, a, "") }, icon(ic), t("Run"))) : null)))));
    }
  }
  async function info(name) { try { const d = await get(`/api/packages/info?name=${encodeURIComponent(name)}`); modal({ title: name, wide: true, body: h("pre", { class: "pre" }, d.info), actions: [{ label: t("Close"), kind: "primary" }] }); } catch (e) { fail(e); } }
  draw();
}

// ═══ Containers ═════════════════════════════════════════════════════════
export async function containers(root, ctx) {
  const op = ctx.can("operator"); let tabId = "containers"; const holder = h("div");
  root.append(pageHead(t("Containers"), t("Docker / Podman containers and images."), tabs([["containers", t("Containers")], ["images", t("Images")], ["stats", t("Live stats")]], tabId, (id) => { tabId = id; draw(); }), h("button", { class: "btn", onclick: () => draw() }, icon("refresh-cw"))), holder);
  const act = async (id, action) => { try { await post("/api/containers/action", { id, action }); toast(t("done")); draw(); } catch (e) { fail(e); } };
  const text = async (title, url, key) => { try { const d = await get(url); modal({ title, wide: true, body: h("pre", { class: "pre" }, d[key] || t("(empty)")), actions: [{ label: t("Close"), kind: "primary" }] }); } catch (e) { fail(e); } };
  async function draw() {
    mount(holder, loading(4));
    try {
      if (tabId === "containers") {
        const d = await get("/api/containers");
        if (!d.engine) { mount(holder, h("div", { class: "card" }, empty("boxes", t("No container engine found"), t("Install docker or podman to manage containers here.")))); return; }
        mount(holder, card(null, table([
          { label: t("Name"), render: (c) => h("div", { class: "namecell" }, statusDot(c.state === "running" ? "ok" : c.state === "paused" ? "warn" : ""), h("b", null, c.name)) }, { label: t("Image"), mono: true, key: "image" },
          { label: t("Status"), render: (c) => h("span", { class: "badge" }, c.status) }, { label: t("Ports"), mono: true, render: (c) => h("span", { class: "dim" }, c.ports || "–") },
          { label: "", render: (c) => h("div", { class: "actions" }, h("button", { class: "btn sm ghost", onclick: () => text(`${c.name} — ${t("logs")}`, `/api/containers/logs?id=${encodeURIComponent(c.id)}&lines=300`, "logs") }, icon("scroll-text")),
            op ? [h("button", { class: "btn sm ghost", onclick: () => text(`${c.name} — inspect`, `/api/containers/inspect?id=${encodeURIComponent(c.id)}`, "inspect") }, icon("eye")),
              c.state === "running" ? [h("button", { class: "btn sm", onclick: () => act(c.id, "restart") }, icon("rotate-cw")), h("button", { class: "btn sm", onclick: () => act(c.id, "stop") }, icon("square"))] : h("button", { class: "btn sm", onclick: () => act(c.id, "start") }, icon("play")),
              h("button", { class: "btn sm danger", onclick: async () => { if (await confirmDialog(t("Remove container"), t("Remove {p}? Stopped containers only.", { p: c.name }), { danger: true })) act(c.id, "rm"); } }, icon("trash-2"))] : null) },
        ], d.containers, { empty: empty("boxes", t("No containers")) }), { flush: true }));
      } else if (tabId === "images") {
        const d = await get("/api/containers/images");
        mount(holder, card(null, table([{ label: t("Repository"), render: (i) => h("b", { class: "mono" }, i.repo) }, { label: "Tag", mono: true, key: "tag" }, { label: "ID", mono: true, key: "id" }, { label: t("Size"), mono: true, key: "size" }, { label: t("Created"), key: "age" },
          { label: "", render: (i) => op ? h("div", { class: "actions" }, h("button", { class: "btn sm danger", onclick: async () => { if (await confirmDialog(t("Remove image"), `${i.repo}:${i.tag}`, { danger: true })) { try { await del(`/api/containers/images?id=${encodeURIComponent(i.id)}`); draw(); } catch (e) { fail(e); } } } }, icon("trash-2"))) : null }], d.images, { empty: empty("layers", t("No images")) }), { flush: true }));
      } else {
        const d = await get("/api/containers/stats");
        mount(holder, card(null, table([{ label: t("Container"), render: (s) => h("b", null, s.name) }, { label: "CPU", mono: true, key: "cpu" }, { label: t("Memory"), mono: true, key: "mem" }, { label: "MEM %", mono: true, key: "mem_pct" }, { label: t("Net I/O"), mono: true, key: "net" }], d.stats, { empty: empty("activity", t("No running containers")) }), { flush: true }));
      }
    } catch (e) { mount(holder, h("div", { class: "callout bad" }, icon("triangle-alert"), e.message)); }
  }
  draw();
}

// ═══ Cron ═══════════════════════════════════════════════════════════════
export async function cron(root, ctx) {
  const op = ctx.can("operator"); const body = h("div", null, loading(3)), extra = h("div");
  const presets = [["*/5 * * * *", t("every 5 minutes")], ["0 * * * *", t("every hour")], ["0 3 * * *", t("every day at 03:00")], ["0 4 * * 0", t("every Sunday at 04:00")], ["0 5 1 * *", t("monthly, 1st at 05:00")], ["", t("custom…")]];
  const form = (initial, onSave, title) => {
    const preset = h("select", { class: "select" }, presets.map(([v, l]) => h("option", { value: v }, l))); const sched = h("input", { class: "input mono", placeholder: "*/10 * * * *" }); const cmd = h("input", { class: "input mono", placeholder: "/usr/local/bin/task.sh >> /var/log/task.log 2>&1" });
    const comment = h("input", { class: "input", placeholder: t("Optional note (saved as a # comment)") }); const human = h("div", { class: "hint" });
    const sync = () => { human.textContent = cronHuman(sched.value.trim()); }; sched.addEventListener("input", sync);
    preset.addEventListener("change", () => { if (preset.value) { sched.value = preset.value; sync(); } });
    if (initial) { const f = initial.schedule.startsWith("@") ? null : initial.schedule; sched.value = initial.schedule; cmd.value = initial.command; sync(); void f; } else { preset.value = presets[2][0]; sched.value = presets[2][0]; sync(); }
    modal({ title, body: h("div", { class: "stack" }, initial ? null : field(t("Preset"), preset), field(t("Schedule"), sched, null), human, field(t("Command"), cmd), initial ? null : field(t("Note"), comment)),
      actions: [{ label: t("Cancel") }, { label: t("Save"), kind: "primary", run: () => onSave(`${sched.value.trim()} ${cmd.value.trim()}`, comment?.value) }] });
  };
  root.append(pageHead(t("Scheduled tasks"), t("Your crontab. Comments, variables and layout are preserved exactly."), op ? h("button", { class: "btn primary", onclick: () => form(null, async (line, c) => { await post("/api/cron", { line, comment: c }); toast(t("Job added")); load(); }, t("New job")) }, icon("plus"), t("New job")) : null), card(null, body, { flush: true }), extra);
  async function load() {
    try {
      const d = await get("/api/cron"); const jobs = d.entries.filter((e) => e.kind === "job"), envs = d.entries.filter((e) => e.kind === "env");
      mount(body, table([
        { label: t("Schedule"), render: (e) => h("div", null, h("div", { class: `mono ${e.enabled ? "" : "dim"}` }, e.schedule), h("div", { class: "dim" }, cronHuman(e.schedule))) },
        { label: t("Command"), render: (e) => h("code", { class: `mono ${e.enabled ? "" : "dim"}`, style: null }, e.command.replace(/\s*#\s*hckpt-managed:\S+$/, "")) },
        { label: t("Origin"), render: (e) => e.managed ? h("span", { class: "badge" }, icon("archive"), t("Backup schedule")) : null },
        { label: t("Enabled"), render: (e) => op ? switchEl(e.enabled, async () => { try { await post(`/api/cron/${e.index}/toggle`, { fp: e.fp }); load(); } catch (er) { fail(er); load(); } }) : h("span", null, e.enabled ? "✓" : "–") },
        { label: "", render: (e) => op && !e.managed ? h("div", { class: "actions" }, h("button", { class: "btn sm", onclick: () => form(e, async (line) => { await put(`/api/cron/${e.index}`, { fp: e.fp, line }); load(); }, t("Edit job")) }, icon("pencil")),
          h("button", { class: "btn sm danger", onclick: async () => { if (await confirmDialog(t("Delete job"), e.command, { danger: true })) { try { await del(`/api/cron/${e.index}?fp=${e.fp}`); load(); } catch (er) { fail(er); } } } }, icon("trash-2"))) : null },
      ], jobs, { empty: empty("calendar-clock", t("No scheduled jobs")) }));
      mount(extra, envs.length ? card(t("Variables"), h("div", { class: "pill-list" }, envs.map((e) => h("span", { class: "code" }, e.raw))), { sub: t("read-only") }) : null);
    } catch (e) { mount(body, h("div", { class: "callout bad" }, e.message)); }
  }
  load();
}

// ═══ Backups ════════════════════════════════════════════════════════════
export async function backups(root, ctx) {
  const op = ctx.can("operator"); const list = h("div", null, loading(3)), hist = h("div");
  root.append(pageHead(t("Backups"), t("rsync, tar, restic and Timeshift profiles with optional schedules (installed into your crontab)."), op ? h("button", { class: "btn primary", onclick: () => edit(null) }, icon("plus"), t("New profile")) : null), list, h("div", { style: null, class: "hr" }), hist);
  function edit(p) {
    const cur = p || { name: "", tool: "rsync", source: "/home", dest: "/mnt/backup", excludes: [], delete: false, password_file: "", schedule: "" };
    const name = h("input", { class: "input", value: cur.name }), tool = h("select", { class: "select" }, ["rsync", "tar", "restic", "timeshift"].map((x) => h("option", { value: x, selected: x === cur.tool }, x)));
    const src = h("input", { class: "input mono", value: cur.source }), dst = h("input", { class: "input mono", value: cur.dest }), pw = h("input", { class: "input mono", value: cur.password_file, placeholder: "/root/.restic-pass" });
    const ex = h("textarea", { class: "textarea", placeholder: "*.tmp\nnode_modules\n.cache" }, (cur.excludes || []).join("\n")); const sch = h("input", { class: "input mono", value: cur.schedule, placeholder: "0 2 * * *" });
    const del_ = h("input", { type: "checkbox", checked: cur.delete }); const rows = { src: field(t("Source"), src), dst: field(t("Destination"), dst, t("Directory (rsync/tar) or repository path (restic)")), pw: field(t("Password file"), pw, t("restic: absolute path of a file that contains the repository password")), ex: field(t("Exclude patterns (one per line)"), ex), del: h("label", { class: "check" }, del_, t("rsync: delete files at the destination that no longer exist in the source")) };
    const vis = () => { const tl = tool.value; rows.src.classList.toggle("hidden", tl === "timeshift"); rows.dst.classList.toggle("hidden", tl === "timeshift"); rows.pw.classList.toggle("hidden", tl !== "restic"); rows.ex.classList.toggle("hidden", tl === "timeshift"); rows.del.classList.toggle("hidden", tl !== "rsync"); }; tool.addEventListener("change", vis); vis();
    modal({ title: p ? t("Edit profile") : t("New backup profile"), wide: true, body: h("div", { class: "stack" }, h("div", { class: "form-grid" }, field(t("Name"), name), field(t("Tool"), tool), field(t("Schedule (cron)"), sch, t("Leave empty for manual runs only"))), rows.src, rows.dst, rows.pw, rows.ex, rows.del),
      actions: [{ label: t("Cancel") }, { label: t("Save"), kind: "primary", run: async () => { const body = { name: name.value.trim(), tool: tool.value, source: src.value.trim(), dest: dst.value.trim(), password_file: pw.value.trim(), excludes: ex.value.split("\n").map((s) => s.trim()).filter(Boolean), delete: del_.checked, schedule: sch.value.trim() }; const r = p ? await put(`/api/backups/${p.id}`, body) : await post("/api/backups", body); toast(r.message); load(); } }] });
  }
  async function snapshots(p) { try { const d = await get(`/api/backups/${p.id}/snapshots`); modal({ title: `${p.name} — ${t("restore points")}`, wide: true, body: table([{ label: "ID", mono: true, key: "id" }, { label: t("Time"), mono: true, render: (s) => (s.time ? dt(s.time) : "–") }, { label: t("Details"), key: "info" }], d.snapshots, { empty: empty("archive", t("No restore points")) }), actions: [{ label: t("Close"), kind: "primary" }] }); } catch (e) { fail(e); } }
  async function load() {
    try {
      const d = await get("/api/backups"); const lastOf = (id) => d.history.find((x) => x.profile_id === id);
      mount(list, d.profiles.length ? h("div", { class: "grid g2" }, d.profiles.map((p) => { const last = lastOf(p.id); return card(p.name, h("div", { class: "stack" },
        h("div", { class: "row" }, h("span", { class: "badge solid" }, p.tool), p.schedule ? h("span", { class: "badge" }, icon("calendar-clock"), cronHuman(p.schedule)) : h("span", { class: "badge ghost" }, t("manual")), p.running ? h("span", { class: "badge" }, h("span", { class: "loader" }), t("running")) : null),
        p.tool !== "timeshift" ? h("div", { class: "mono muted" }, `${p.source}  →  ${p.dest}`) : null,
        last ? h("div", { class: "row" }, statusDot(last.ok ? "ok" : "bad"), h("span", { class: "muted" }, `${last.ok ? t("Last run OK") : t("Last run failed")} · ${dt(last.ended)}`)) : h("div", { class: "dim" }, t("Never run")),
        op ? h("div", { class: "row" }, h("button", { class: "btn primary sm", onclick: () => runStreamModal(`${p.name}`, `/api/backups/${p.id}/run/stream`, { action: "run" }, { onFinish: load }) }, icon("play"), t("Run now")),
          p.tool === "restic" ? h("button", { class: "btn sm", onclick: () => runStreamModal(`${p.name} — init`, `/api/backups/${p.id}/run/stream`, { action: "init" }) }, t("Init repo")) : null,
          h("button", { class: "btn sm", onclick: () => snapshots(p) }, icon("history"), t("Restore points")), h("button", { class: "btn sm ghost", onclick: () => edit(p) }, icon("pencil")),
          h("button", { class: "btn sm danger", onclick: async () => { if (await confirmDialog(t("Delete profile"), t("Delete “{p}”? Existing backups are not touched.", { p: p.name }), { danger: true })) { await del(`/api/backups/${p.id}`); load(); } } }, icon("trash-2"))) : null)); })) : h("div", { class: "card" }, empty("archive", t("No backup profiles yet"), t("Create one to protect /home, your configs or a whole system."))));
      mount(hist, card(t("Run history"), table([{ label: t("Profile"), key: "profile_name" }, { label: t("Result"), render: (r) => h("span", { class: `badge ${r.ok ? "" : "bad"}` }, r.ok ? "OK" : t("failed")) }, { label: t("Started"), mono: true, render: (r) => dt(r.started) }, { label: t("Trigger"), mono: true, key: "trigger" }, { label: t("Summary"), render: (r) => h("span", { class: "dim" }, r.summary) }], d.history, { empty: empty("history", t("No runs recorded yet")) }), { flush: true }));
    } catch (e) { mount(list, h("div", { class: "callout bad" }, e.message)); }
  }
  load();
}
