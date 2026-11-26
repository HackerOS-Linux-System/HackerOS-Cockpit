import { h, icon, get, fail, bytes, card, tabs, table, empty, pageHead, mount, clear, statusDot, loading, pct } from "../core.js";
import { t } from "../i18n.js";
import { segBar } from "../charts.js";

// ═══ Disks & SMART ══════════════════════════════════════════════════════
export async function disks(root, ctx) {
  const body = h("div", null, loading(4)), smart = h("div");
  root.append(pageHead(t("Storage"), t("Filesystem usage, block devices and SMART health."), h("button", { class: "btn", onclick: () => load() }, icon("refresh-cw"))), body, smart);
  async function load() {
    try {
      const d = await get("/api/disks");
      mount(body, h("div", { class: "stack" },
        h("div", { class: "grid g3" }, d.mounts.map((m) => { const b = segBar(); b.set(m.percent); return card(m.mount, h("div", { class: "stack" }, h("div", { class: "row" }, h("span", { class: "mono", style: null }, `${m.percent.toFixed(0)}%`), h("span", { class: "spacer" }), h("span", { class: "dim mono" }, `${bytes(m.used)} / ${bytes(m.size)}`)), b, h("div", { class: "dim mono" }, `${m.source} · ${m.fs}`))); })),
        card(t("Block devices"), table([{ label: t("Device"), render: (b) => h("div", { class: "namecell", }, h("span", { class: "dim" }, b.parent ? "└ " : ""), h("b", { class: "mono" }, b.name)) }, { label: t("Type"), key: "type" }, { label: t("Size"), mono: true, render: (b) => bytes(b.size) }, { label: t("Filesystem"), key: "fs" }, { label: t("Mount"), mono: true, key: "mount" }, { label: t("Model"), key: "model" }, { label: t("Kind"), render: (b) => (b.type === "disk" ? h("span", { class: "badge ghost" }, b.rotational ? "HDD" : "SSD/NVMe") : "") }], d.blocks, { empty: empty("hard-drive", d.message || t("No data")) }), { flush: true })));
    } catch (e) { mount(body, h("div", { class: "callout bad" }, e.message)); }
    if (ctx.can("operator")) {
      mount(smart, card(t("SMART health"), h("div", null, loading(2))));
      try {
        const s = await get("/api/disks/smart");
        mount(smart, s.drives.length ? h("div", { class: "grid g2" }, s.drives.map((x) => card(x.device, h("div", { class: "stack" }, x.error ? h("div", { class: "callout" }, icon("info"), x.error) : [
          h("div", { class: "row" }, h("span", { class: `badge ${x.passed === false ? "bad" : "solid"}` }, x.passed === false ? t("FAILING") : x.passed ? t("PASSED") : "?"), h("span", { class: "muted" }, x.model)),
          h("dl", { class: "kv" }, h("dt", null, t("Temperature")), h("dd", null, x.temp_c ? `${x.temp_c} °C` : "–"), h("dt", null, t("Power-on")), h("dd", null, `${x.power_on_hours} h`), x.percentage_used >= 0 ? [h("dt", null, t("Wear")), h("dd", null, `${x.percentage_used}%`)] : [h("dt", null, t("Reallocated")), h("dd", null, x.reallocated), h("dt", null, t("Pending")), h("dd", null, x.pending)]),
          x.warnings.length ? h("div", { class: "callout bad" }, icon("triangle-alert"), x.warnings.join(" · ")) : null])))) : card(t("SMART health"), empty("hard-drive", s.message || t("No SMART-capable drives found"), t("Install smartmontools and allow smartctl via sudo."))));
      } catch (e) { fail(e); }
    }
  }
  load();
}

// ═══ Diagnostics ════════════════════════════════════════════════════════
export async function diagnostics(root) {
  const body = h("div", null, loading(3));
  root.append(pageHead(t("Diagnostics"), t("A quick health check of the essentials."), h("button", { class: "btn primary", onclick: () => run() }, icon("stethoscope"), t("Run again"))), body);
  async function run() {
    mount(body, loading(3));
    try {
      const d = await get("/api/diagnostics");
      const tile = (ic, title, ok, detail) => h("div", { class: `diag ${ok ? "" : "bad"}` }, h("div", { class: "ic" }, icon(ic)), h("div", null, h("b", null, title), h("span", null, detail)), h("span", { class: "spacer" }), h("span", { class: `badge ${ok ? "" : "bad"}` }, ok ? "OK" : t("Check")));
      mount(body, h("div", { class: "stack" }, h("div", { class: "grid g3" },
        tile("hard-drive", t("Disk"), d.disk_ok, pct(d.disk_pct, 1)), tile("memory-stick", t("Memory"), d.memory_ok, pct(d.memory_pct, 1)), tile("cpu", t("CPU load"), d.cpu_ok, `${d.cpu_load.toFixed(2)} / ${d.cores} ${t("cores")}`),
        tile("globe", t("DNS resolution"), d.dns_ok, d.dns_ok ? t("resolves") : t("failing")), tile("wifi", t("Internet reachability"), d.network_ok, d.network_ok ? t("reachable") : t("unreachable"))),
        d.sensors_info ? card(t("Sensors"), h("pre", { class: "pre" }, d.sensors_info)) : null));
    } catch (e) { mount(body, h("div", { class: "callout bad" }, e.message)); }
  }
  run();
}

// ═══ Search ═════════════════════════════════════════════════════════════
export async function search(root) {
  const q = h("input", { class: "input", placeholder: t("Search the web…"), autofocus: true }); const res = h("div");
  const go = async () => {
    if (!q.value.trim()) return; mount(res, loading(4));
    try { const d = await get(`/api/search?q=${encodeURIComponent(q.value.trim())}`);
      mount(res, card(null, d.results.length ? d.results.map((r) => h("div", { class: "result" }, h("a", { href: r.url, target: "_blank", rel: "noopener noreferrer nofollow" }, r.title), h("div", { class: "u" }, r.url), h("p", null, r.snippet))) : empty("search", t("No results")), { flush: true, sub: d.provider })); }
    catch (e) { mount(res, h("div", { class: "callout bad" }, icon("triangle-alert"), e.message)); }
  };
  q.addEventListener("keydown", (e) => e.key === "Enter" && go());
  root.append(pageHead(t("Web search"), t("Uses the provider configured on the server (DuckDuckGo, Brave or SearXNG).")), h("div", { class: "toolbar" }, q, h("button", { class: "btn primary", onclick: go }, icon("search"), t("Search"))), res);
}

// ═══ News ═══════════════════════════════════════════════════════════════
export async function news(root) {
  let topic = "cybersecurity"; const body = h("div", null, loading(4));
  root.append(pageHead(t("News"), t("Headlines from public RSS/Atom feeds (cached for 10 minutes)."), tabs([["cybersecurity", t("Security")], ["linux", "Linux"], ["gaming", t("Gaming")]], topic, (id) => { topic = id; load(); })), body);
  async function load() {
    mount(body, loading(4));
    try { const d = await get(`/api/news/${topic}`);
      mount(body, d.news.length ? h("div", { class: "grid g2" }, d.news.map((a) => h("section", { class: "card" }, h("div", { class: "card-b stack" }, h("div", { class: "eyebrow" }, a.source || ""), a.link ? h("a", { href: a.link, target: "_blank", rel: "noopener noreferrer nofollow", class: "result", style: null }, h("b", null, a.title)) : h("b", null, a.title), h("p", { class: "muted" }, a.summary))))) : h("div", { class: "card" }, empty("newspaper", t("No articles could be loaded"), t("The feeds may be unreachable from this host."))));
    } catch (e) { mount(body, h("div", { class: "callout bad" }, e.message)); }
  }
  load();
}
