import { t } from "./i18n.js";

const SVG_NS = "http://www.w3.org/2000/svg";

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "value") el.value = v;
    else if (k === "checked" || k === "disabled" || k === "selected" || k === "readOnly") el[k] = !!v;
    else if (k === "dataset") Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  add(el, kids);
  return el;
}
function add(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
export function svg(tag, attrs, ...kids) {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  add(el, kids);
  return el;
}
export function icon(name, cls) {
  const s = svg("svg", { class: cls || "ic", "aria-hidden": "true" });
  s.append(svg("use", { href: `/public/icons.svg#i-${name}` }));
  return s;
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export function mount(el, ...kids) { clear(el); add(el, kids); return el; }

// ── API ────────────────────────────────────────────────────────────────
export class ApiError extends Error {
  constructor(status, body) { super(body?.message || `HTTP ${status}`); this.status = status; this.code = body?.code; this.body = body; }
}
export async function api(method, path, body) {
  const opts = { method, headers: { "X-Requested-With": "HackerCockpit" }, credentials: "same-origin" };
  if (body !== undefined) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
  let res;
  try { res = await fetch(path, opts); } catch { throw new ApiError(0, { message: t("Cannot reach the server") }); }
  let data = null;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("json")) data = await res.json().catch(() => null);
  if (res.status === 401 && !path.startsWith("/api/auth/login")) { location.reload(); throw new ApiError(401, data); }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}
export const get = (p) => api("GET", p);
export const post = (p, b) => api("POST", p, b ?? {});
export const put = (p, b) => api("PUT", p, b ?? {});
export const del = (p) => api("DELETE", p);

// Streams a POST that answers with Server-Sent-Events ("line" / "done").
export function stream(path, body, { onLine, onDone } = {}) {
  const ctl = new AbortController();
  const p = (async () => {
    let ok = true, error = "";
    try {
      const res = await fetch(path, { method: "POST", signal: ctl.signal, credentials: "same-origin",
        headers: { "X-Requested-With": "HackerCockpit", "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new ApiError(res.status, j); }
      const rd = res.body.getReader(), dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await rd.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          let ev = "message"; const data = [];
          for (const l of block.split("\n")) {
            if (l.startsWith("event:")) ev = l.slice(6).trim();
            else if (l.startsWith("data:")) data.push(l.slice(5).replace(/^ /, ""));
          }
          const payload = data.join("\n");
          if (ev === "line") onLine?.(payload);
          else if (ev === "done") { const d = JSON.parse(payload || "{}"); ok = d.ok; error = d.error || ""; }
        }
      }
    } catch (e) { if (e.name !== "AbortError") { ok = false; error = e.message; } else { ok = false; error = t("Cancelled"); } }
    onDone?.({ ok, error });
    return { ok, error };
  })();
  p.abort = () => ctl.abort();
  return p;
}

// ── toasts & dialogs ───────────────────────────────────────────────────
let toastHost;
export function toast(msg, kind = "ok") {
  if (!toastHost) { toastHost = h("div", { class: "toasts", role: "status", "aria-live": "polite" }); document.body.append(toastHost); }
  const el = h("div", { class: `toast ${kind}` }, icon(kind === "error" ? "triangle-alert" : "circle-check"), h("div", null, msg));
  toastHost.append(el);
  setTimeout(() => el.remove(), kind === "error" ? 7000 : 3800);
}
export const fail = (e) => toast(e?.message || String(e), "error");

export function modal({ title, body, actions = [], wide = false, onClose }) {
  const close = () => { ov.remove(); document.removeEventListener("keydown", esc); onClose?.(); };
  const esc = (e) => { if (e.key === "Escape") close(); };
  const foot = h("div", { class: "modal-f" }, actions.map((a) => h("button", { class: `btn ${a.kind || ""}`, onclick: async (e) => {
    const btn = e.currentTarget; btn.disabled = true;
    try { const r = await a.run?.(close); if (r !== false && a.close !== false) close(); } catch (er) { fail(er); }
    finally { btn.disabled = false; }
  } }, a.label)));
  const ov = h("div", { class: "overlay", onmousedown: (e) => { if (e.target === ov) close(); } },
    h("div", { class: `modal ${wide ? "wide" : ""}`, role: "dialog", "aria-modal": "true" },
      h("div", { class: "modal-h" }, h("h3", null, title), h("span", { class: "spacer" }), h("button", { class: "icon-btn", "aria-label": t("Close"), onclick: close }, icon("x"))),
      h("div", { class: "modal-b" }, body), actions.length ? foot : null));
  document.body.append(ov); document.addEventListener("keydown", esc);
  const first = ov.querySelector("input,select,textarea"); first?.focus();
  return { close, el: ov };
}
export function confirmDialog(title, message, { danger = false, confirmLabel = t("Confirm") } = {}) {
  return new Promise((res) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; res(v); } };
    modal({ title, body: h("p", { class: "muted", style: null }, message), onClose: () => finish(false),
      actions: [{ label: t("Cancel"), close: true, run: () => { finish(false); } }, { label: confirmLabel, kind: danger ? "danger" : "primary", run: () => { finish(true); } }] });
  });
}
export function promptDialog(title, label, { value = "", type = "text", confirmLabel = t("OK"), hint = "" } = {}) {
  return new Promise((res) => {
    let done = false; const inp = h("input", { class: "input", type, value, autocomplete: "off" });
    const finish = (v) => { if (!done) { done = true; res(v); } };
    modal({ title, body: h("div", { class: "field" }, h("label", null, label), inp, hint ? h("div", { class: "hint" }, hint) : null), onClose: () => finish(null),
      actions: [{ label: t("Cancel"), run: () => finish(null) }, { label: confirmLabel, kind: "primary", run: () => finish(inp.value) }] });
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { finish(inp.value); document.querySelector(".overlay")?.remove(); } });
  });
}

// Runs a request that may answer 409 "confirm_required" (lock-out guards).
export async function withConfirm(fn, { danger = true } = {}) {
  try { return await fn(false); }
  catch (e) {
    if (e.code === "confirm_required") {
      if (await confirmDialog(t("Are you sure?"), e.message, { danger, confirmLabel: t("Proceed anyway") })) return fn(true);
      return null;
    }
    throw e;
  }
}

// ── formatting ─────────────────────────────────────────────────────────
export function bytes(n, digits = 1) {
  if (!Number.isFinite(n)) return "–";
  const u = ["B", "KB", "MB", "GB", "TB", "PB"]; let i = 0;
  while (Math.abs(n) >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i === 0 ? 0 : digits)} ${u[i]}`;
}
export const rate = (n) => `${bytes(n, 1)}/s`;
export const pct = (n, d = 0) => `${Number(n).toFixed(d)}%`;
export function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return t("just now");
  if (s < 3600) return t("{n} min ago", { n: Math.floor(s / 60) });
  if (s < 86400) return t("{n} h ago", { n: Math.floor(s / 3600) });
  return t("{n} d ago", { n: Math.floor(s / 86400) });
}
export const dt = (iso) => iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "–";
export function debounce(fn, ms = 250) { let id; return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); }; }
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── shared bits ────────────────────────────────────────────────────────
export function loading(rows = 3) {
  return h("div", { class: "stack", style: null }, Array.from({ length: rows }, () => h("div", { class: "sk", "aria-hidden": "true" })));
}
export function empty(iconName, text, sub) {
  return h("div", { class: "empty" }, icon(iconName), h("div", null, text), sub ? h("p", { class: "dim" }, sub) : null);
}
export function pageHead(title, sub, ...actions) {
  return h("div", { class: "page-h" }, h("div", null, h("h2", null, title), sub ? h("p", null, sub) : null), h("span", { class: "spacer" }), actions);
}
export function card(title, body, { sub, actions, flush } = {}) {
  return h("section", { class: "card" },
    title || actions ? h("div", { class: "card-h" }, title ? h("h3", null, title) : null, sub ? h("span", { class: "sub" }, sub) : null, h("span", { class: "spacer" }), actions) : null,
    h("div", { class: `card-b ${flush ? "flush" : ""}` }, body));
}
export function field(label, input, hint) {
  return h("div", { class: "field" }, h("label", null, label), input, hint ? h("div", { class: "hint" }, hint) : null);
}
export function switchEl(checked, onchange) {
  const i = h("input", { type: "checkbox", checked, onchange: () => onchange?.(i.checked) });
  return h("label", { class: "switch" }, i, h("i"));
}
export function tabs(items, active, onpick) {
  const wrap = h("div", { class: "tabs", role: "tablist" });
  const draw = (cur) => { clear(wrap); items.forEach(([id, label]) => wrap.append(h("button", { class: id === cur ? "on" : "", role: "tab", onclick: () => { draw(id); onpick(id); } }, label))); };
  draw(active); return wrap;
}
export function table(cols, rows, { empty: emptyEl, onRow } = {}) {
  if (!rows.length) return emptyEl || empty("layers", t("Nothing here yet"));
  const thead = h("thead", null, h("tr", null, cols.map((c) => h("th", { class: c.num ? "num" : "" }, c.label))));
  const tbody = h("tbody", null, rows.map((r) => h("tr", { class: onRow ? "clickable" : "", onclick: onRow ? () => onRow(r) : null },
    cols.map((c) => { const v = c.render ? c.render(r) : r[c.key]; return h("td", { class: `${c.num ? "num" : ""} ${c.mono ? "mono" : ""}` }, v); }))));
  return h("div", { class: "table-wrap" }, h("table", { class: "table" }, thead, tbody));
}
export function statusDot(kind) { return h("span", { class: `dot ${kind || ""}` }); }
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast(t("Copied to clipboard")); }
  catch { const ta = h("textarea", { class: "sr" }, text); document.body.append(ta); ta.select(); document.execCommand("copy"); ta.remove(); toast(t("Copied to clipboard")); }
}
export function download(name, text, mime = "application/json") {
  const a = h("a", { href: URL.createObjectURL(new Blob([text], { type: mime })), download: name });
  document.body.append(a); a.click(); a.remove();
}
// A live output console used by every streaming action.
export function liveOutput({ height } = {}) {
  const pre = h("pre", { class: "pre", style: null });
  let follow = true;
  pre.addEventListener("scroll", () => { follow = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 24; });
  let lines = 0;
  return {
    el: pre,
    push(l) { if (lines++ > 6000) { pre.firstChild?.remove(); } pre.append(document.createTextNode(l + "\n")); if (follow) pre.scrollTop = pre.scrollHeight; },
    clear() { clear(pre); lines = 0; },
  };
}
