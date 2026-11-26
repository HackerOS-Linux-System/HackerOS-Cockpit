import { h, icon, get, post, del, mount, clear, fail, toast, modal, field, confirmDialog, copyText } from "./core.js";
import { t, getLang, setLang, getTheme, applyTheme } from "./i18n.js";
import * as Dash from "./pages/dashboard.js";
import * as Ops from "./pages/ops.js";
import * as Sec from "./pages/sec.js";
import * as Info from "./pages/info.js";
import * as Admin from "./pages/admin.js";

const NAV = [
  { group: () => t("Dashboard"), items: [["overview", "layout-dashboard", () => t("Overview"), Dash.dashboard], ["fleet", "network", () => t("Fleet"), Dash.fleet]] },
  { group: () => t("Operations"), items: [
    ["services", "server-cog", () => t("Services"), Ops.services], ["logs", "scroll-text", () => t("Logs"), Ops.logs],
    ["terminal", "terminal-square", () => t("Terminal"), Ops.terminal, "admin"], ["files", "folder-tree", () => t("Files"), Ops.files],
    ["packages", "package", () => t("Packages"), Ops.packages], ["containers", "boxes", () => t("Containers"), Ops.containers],
    ["cron", "calendar-clock", () => t("Scheduled tasks"), Ops.cron], ["backups", "archive", () => t("Backups"), Ops.backups],
  ] },
  { group: () => t("Security"), items: [
    ["network", "network", () => t("Network"), Sec.network], ["firewall", "shield-check", () => t("Firewall"), Sec.firewall],
    ["certs", "badge-check", () => t("Certificates"), Sec.certs], ["sysusers", "users", () => t("System accounts"), Sec.sysusers, "admin"],
    ["pentest", "crosshair", () => t("Pentest toolkit"), Sec.pentest, "admin"], ["audit", "clipboard-list", () => t("Audit log"), Sec.audit, "admin"],
  ] },
  { group: () => t("Information"), items: [
    ["disks", "hard-drive", () => t("Storage"), Info.disks], ["diagnostics", "stethoscope", () => t("Diagnostics"), Info.diagnostics],
    ["search", "search", () => t("Web search"), Info.search], ["news", "newspaper", () => t("News"), Info.news],
  ] },
  { group: () => t("Administration"), items: [["access", "key-round", () => t("Access"), Admin.access, "admin"], ["settings", "settings", () => t("Settings"), Admin.settings, "admin"]] },
];
const ROLE_RANK = { viewer: 1, operator: 2, admin: 3 };
const ALL_ITEMS = NAV.flatMap((g) => g.items);
const ROUTES = Object.fromEntries(ALL_ITEMS.map((i) => [i[0], i]));

let STATE = { user: null, role: "admin", authEnabled: false, features: {} };
const can = (min) => (ROLE_RANK[STATE.role] || 0) >= (ROLE_RANK[min] || 0);

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, qs] = raw.split("?");
  return { id: path || "overview", query: Object.fromEntries(new URLSearchParams(qs || "")) };
}

async function boot() {
  let status;
  try { status = await get("/api/auth/status"); } catch { status = { auth_enabled: false, logged_in: true, role: "admin", features: {} }; }
  STATE = { user: status.user, role: status.role || "admin", authEnabled: status.auth_enabled, features: status.features || {}, hostname: status.hostname, version: status.version, codename: status.codename };
  if (status.auth_enabled && !status.logged_in) return renderLogin();
  renderShell();
}
async function renderLogin() {
  document.title = "HackerCockpit — sign in";
  const root = document.getElementById("root"); clear(root);
  const card = h("div", { class: "login-card" }, h("div", { class: "login-top" }, themeBtn(), langBtn()));
  const shell = h("div", { class: "login-wrap" },
    h("div", { class: "login-art" }, h("svg", { class: "rings", viewBox: "0 0 640 640" }, h("circle", { cx: 460, cy: 460, r: 260 }), h("circle", { cx: 460, cy: 460, r: 300 })),
      h("div", null, brandMark(46), h("h1", null, "HackerCockpit"), h("p", null, t("Sign in to continue"))),
      h("p", { class: "dim mono", style: null }, "v" + (STATE.version || ""))),
    card);
  root.append(shell);
  drawPasswordStep();

  function drawPasswordStep() {
    const user = h("input", { class: "input", autocomplete: "username", autofocus: true }), pass = h("input", { class: "input", type: "password", autocomplete: "current-password" });
    const err = h("div", { class: "err-line" }); const btn = h("button", { class: "btn primary", type: "submit" }, t("Sign in"));
    const form = h("form", { onsubmit: async (e) => { e.preventDefault(); err.textContent = ""; btn.disabled = true;
      try {
        const res = await post("/api/auth/login", { username: user.value, password: pass.value });
        if (res.status === "mfa_required") drawTOTPStep(res.pending);
        else boot();
      } catch (er) { err.textContent = er.message; } finally { btn.disabled = false; } } },
      field(t("Username"), user), field(t("Password"), pass), err, btn);
    mount(card, h("h2", null, "HackerCockpit"), h("p", { class: "sub" }, t("Sign in to continue")), form);
  }

  function drawTOTPStep(pending) {
    const code = h("input", { class: "input mono", inputmode: "numeric", autocomplete: "one-time-code", maxlength: 12, autofocus: true, placeholder: "123456" });
    const err = h("div", { class: "err-line" }); const btn = h("button", { class: "btn primary", type: "submit" }, t("Verify"));
    const back = h("button", { class: "btn ghost sm", type: "button", onclick: drawPasswordStep }, t("Cancel"));
    const form = h("form", { onsubmit: async (e) => { e.preventDefault(); err.textContent = ""; btn.disabled = true;
      try { await post("/api/auth/login/totp", { pending, code: code.value.trim() }); boot(); }
      catch (er) { err.textContent = er.message; } finally { btn.disabled = false; } } },
      field(t("Verification code"), code, t("From your authenticator app, or a backup code")), err, h("div", { class: "row" }, btn, back));
    mount(card, h("h2", null, t("Two-factor verification")), h("p", { class: "sub" }, t("Enter the 6-digit code from your authenticator app.")), form);
    code.focus();
  }
}
function brandMark(size) {
  return h("svg", { viewBox: "0 0 34 34", class: "brand-mark", width: size, height: size },
    h("rect", { class: "m-bg", width: 34, height: 34, rx: 9 }),
    h("path", { class: "m-fg", d: "M9 9v16M9 17h9M23 9v16", stroke: "currentColor", fill: "none", "stroke-width": 2.6, "stroke-linecap": "round", "stroke-linejoin": "round" }));
}
function themeBtn() {
  const b = h("button", { class: "icon-btn", "aria-label": t("Toggle theme"), onclick: () => { applyTheme(getTheme() === "dark" ? "light" : "dark"); sync(); } }, icon(getTheme() === "dark" ? "moon" : "sun"));
  function sync() { clear(b); b.append(icon(getTheme() === "dark" ? "moon" : "sun")); } return b;
}
function langBtn() { return h("button", { class: "icon-btn lang-btn", "aria-label": t("Toggle language"), onclick: () => setLang(getLang() === "pl" ? "en" : "pl") }, getLang().toUpperCase()); }

let currentCleanup = null, notifTimer = null;
function renderShell() {
  document.title = "HackerCockpit";
  const root = document.getElementById("root"); clear(root);
  const sidebar = h("aside", { class: "sidebar" });
  const scrim = h("div", { class: "scrim" });
  const crumbTitle = h("h1"), crumbSub = h("span");
  const notifBtn = h("button", { class: "icon-btn", "aria-label": t("Notifications"), onclick: openNotifications }, icon("bell"));
  const topbar = h("header", { class: "topbar" },
    h("button", { class: "icon-btn menu-btn", "aria-label": "menu", onclick: () => { sidebar.classList.add("open"); scrim.classList.add("on"); } }, icon("menu")),
    h("div", { class: "crumbs" }, crumbTitle, crumbSub),
    h("div", { class: "top-actions" }, h("button", { class: "cmdk", onclick: openPalette }, icon("search"), h("span", null, t("Search pages and actions…")), h("kbd", null, "⌘K")),
      langBtn(), themeBtn(), notifBtn));
  const content = h("main", { class: "content" });
  scrim.addEventListener("click", () => { sidebar.classList.remove("open"); scrim.classList.remove("on"); });
  root.append(h("div", { class: "app" }, sidebar, h("div", { class: "main" }, topbar, content)), scrim);
  buildSidebar(sidebar);
  document.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); } });
  window.addEventListener("hashchange", () => route(content, crumbTitle, crumbSub, sidebar));
  route(content, crumbTitle, crumbSub, sidebar);
  refreshNotifBadge(notifBtn);
  notifTimer = setInterval(() => refreshNotifBadge(notifBtn), 45000);
}
function buildSidebar(sidebar) {
  clear(sidebar);
  sidebar.append(h("a", { href: "#/overview", class: "brand" }, brandMark(34), h("div", null, h("b", null, "HackerCockpit"), h("small", null, STATE.hostname || "localhost"))));
  NAV.forEach((g) => {
    const visible = g.items.filter((i) => can(i[4] || "viewer"));
    if (!visible.length) return;
    sidebar.append(h("div", { class: "nav-group" }, g.group()), h("nav", { class: "nav" }, visible.map(([id, ic, label]) => h("a", { href: `#/${id}`, "data-route": id }, icon(ic), h("span", null, label())))));
  });
  sidebar.append(h("div", { class: "sb-foot" }, h("button", { class: "userchip", onclick: openAccountMenu },
    h("div", { class: "avatar" }, (STATE.user || "lo").slice(0, 2)), h("div", { class: "who" }, h("b", null, STATE.user || t("Local session")), h("span", null, STATE.role)))));
}
async function route(content, crumbTitle, crumbSub, sidebar) {
  const { id, query } = parseHash();
  const entry = ROUTES[id] || ROUTES.overview;
  const [routeId, iconName, label, fn, minRole] = entry;
  if (minRole && !can(minRole)) { location.hash = "#/overview"; return; }
  [...sidebar.querySelectorAll("[data-route]")].forEach((a) => a.classList.toggle("active", a.dataset.route === routeId));
  sidebar.classList.remove("open"); document.querySelector(".scrim")?.classList.remove("on");
  crumbTitle.textContent = label(); crumbSub.textContent = "";
  currentCleanup?.(); currentCleanup = null; clear(content);
  const ctx = { can, query, user: STATE.user, features: STATE.features };
  try { const cleanup = await fn(content, ctx); if (typeof cleanup === "function") currentCleanup = cleanup; }
  catch (e) { clear(content); content.append(h("div", { class: "card" }, h("div", { class: "card-b" }, h("div", { class: "callout bad" }, icon("triangle-alert"), e.message || String(e))))); }
}

async function refreshNotifBadge(btn) {
  try { const d = await get("/api/notifications?limit=1"); clear(btn); btn.append(icon("bell")); if (d.unread > 0) btn.append(h("span", { class: "pip" })); } catch { /* ignore */ }
}
async function openNotifications() {
  const drawer = h("div", { class: "drawer" }); const body = h("div", { class: "drawer-b" });
  drawer.append(h("div", { class: "drawer-h" }, h("h3", null, t("Notifications")), h("span", { class: "spacer" }),
    h("button", { class: "btn sm ghost", onclick: async () => { await post("/api/notifications/read", { id: 0 }); load(); } }, t("Mark all as read")),
    h("button", { class: "btn sm ghost", onclick: async () => { if (await confirmDialog(t("Confirm"), t("Clear all"), {})) { await del("/api/notifications"); load(); } } }, t("Clear all")),
    h("button", { class: "icon-btn", onclick: close }, icon("x"))), body);
  const scrim = h("div", { class: "scrim on", onclick: close }); document.body.append(scrim, drawer);
  function close() { drawer.remove(); scrim.remove(); document.removeEventListener("keydown", esc); }
  function esc(e) { if (e.key === "Escape") close(); } document.addEventListener("keydown", esc);
  async function load() {
    try { const d = await get("/api/notifications?limit=60");
      clear(body); if (!d.events.length) { body.append(h("div", { class: "empty" }, icon("bell"), t("No notifications"))); return; }
      d.events.forEach((e) => body.append(h("div", { class: `note ${e.read ? "" : "unread"} ${e.level}` }, h("span", { class: `lv ${e.read ? "" : "u"}` }), h("div", null, h("div", { class: "nt" }, e.title), h("div", { class: "muted" }, e.message), h("small", null, new Date(e.time).toLocaleString())))));
    } catch (er) { fail(er); }
  }
  load();
}

async function openAccountMenu() {
  const body = h("div", { class: "stack" }, h("div", { class: "row" }, h("div", { class: "avatar" }, (STATE.user || "lo").slice(0, 2)), h("div", null, h("b", null, STATE.user || t("Local session")), h("div", { class: "dim" }, STATE.role))));
  let totp = { enabled: false };
  if (STATE.authEnabled) { try { totp = await get("/api/auth/totp"); } catch { /* ignore */ } }
  const actions = [STATE.authEnabled ? { label: t("Change password"), run: () => { changePasswordModal(); return false; } } : null,
    STATE.authEnabled ? { label: totp.enabled ? t("Manage two-factor authentication") : t("Set up two-factor authentication"),
      run: () => { totp.enabled ? disableTOTPModal() : enrollTOTPModal(); return false; } } : null,
    { label: t("Sign out"), kind: "danger", run: async () => { await post("/api/auth/logout"); location.reload(); } }].filter(Boolean);
  modal({ title: t("Account"), body, actions });
}
function changePasswordModal() {
  const cur = h("input", { class: "input", type: "password", autocomplete: "current-password" }), nw = h("input", { class: "input", type: "password", autocomplete: "new-password" });
  modal({ title: t("Change password"), body: h("div", { class: "stack" }, field(t("Current password"), cur), field(t("New password"), nw)),
    actions: [{ label: t("Cancel") }, { label: t("Save"), kind: "primary", run: async () => { await post("/api/auth/password", { current: cur.value, new: nw.value }); toast(t("Password changed")); } }] });
}
async function enrollTOTPModal() {
  let res; try { res = await post("/api/auth/totp/enroll"); } catch (e) { return fail(e); }
  const code = h("input", { class: "input mono", inputmode: "numeric", placeholder: "123456", autofocus: true });
  modal({ title: t("Set up two-factor authentication"), wide: true,
    body: h("div", { class: "stack" },
      h("p", { class: "muted" }, t("Add this account to an authenticator app (Aegis, andOTP, Google Authenticator…), then enter the 6-digit code it shows to confirm.")),
      field(t("Secret (manual entry)"), h("code", { class: "code", style: null }, res.secret)),
      h("div", null, h("button", { class: "btn sm", onclick: () => copyText(res.secret) }, icon("copy"), t("Copy secret"))),
      h("details", null, h("summary", { class: "muted" }, "otpauth:// URI"), h("pre", { class: "pre" }, res.uri)),
      field(t("Verification code"), code)),
    onClose: () => post("/api/auth/totp/cancel").catch(() => {}),
    actions: [{ label: t("Cancel") }, { label: t("Confirm"), kind: "primary", run: async () => {
      const r = await post("/api/auth/totp/confirm", { code: code.value.trim() });
      showBackupCodes(r.backup_codes);
    } }] });
}
function showBackupCodes(codes) {
  modal({ title: t("Save your backup codes"), body: h("div", { class: "stack" },
    h("div", { class: "callout bad" }, icon("triangle-alert"), t("Each code works once and lets you sign in if you lose access to your authenticator app. Store them somewhere safe — they are shown only now.")),
    h("pre", { class: "pre mono" }, codes.join("\n"))),
    actions: [{ label: t("Copy all"), close: false, run: () => { copyText(codes.join("\n")); return false; } }, { label: t("Done"), kind: "primary" }] });
}
function disableTOTPModal() {
  const pass = h("input", { class: "input", type: "password", autocomplete: "current-password" });
  modal({ title: t("Disable two-factor authentication"), body: h("div", { class: "stack" }, h("div", { class: "callout bad" }, icon("triangle-alert"), t("This makes sign-in password-only again.")), field(t("Current password"), pass)),
    actions: [{ label: t("Cancel") }, { label: t("Disable"), kind: "danger", run: async () => { await post("/api/auth/totp/disable", { password: pass.value }); toast(t("Two-factor authentication disabled")); } }] });
}

function openPalette() {
  const ov = h("div", { class: "overlay", onmousedown: (e) => { if (e.target === ov) close(); } });
  const inp = h("input", { placeholder: t("Search pages and actions…"), autofocus: true }); const ul = h("ul");
  let sel = 0, items = [];
  const close = () => { ov.remove(); document.removeEventListener("keydown", onKey); };
  const list = () => ALL_ITEMS.filter((i) => can(i[4] || "viewer")).map(([id, ic, label]) => ({ id, ic, label: label() }));
  const draw = (q) => { items = list().filter((i) => i.label.toLowerCase().includes(q.toLowerCase())); sel = 0; clear(ul);
    items.forEach((i, idx) => ul.append(h("li", { class: idx === sel ? "sel" : "", onclick: () => { location.hash = `#/${i.id}`; close(); } }, icon(i.ic), i.label))); };
  const onKey = (e) => { if (e.key === "Escape") close(); else if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); mark(); } else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); } else if (e.key === "Enter" && items[sel]) { location.hash = `#/${items[sel].id}`; close(); } };
  const mark = () => [...ul.children].forEach((li, i) => li.classList.toggle("sel", i === sel));
  inp.addEventListener("input", () => draw(inp.value)); document.addEventListener("keydown", onKey);
  ov.append(h("div", { class: "palette" }, inp, ul)); document.body.append(ov); draw(""); inp.focus();
}

boot();
