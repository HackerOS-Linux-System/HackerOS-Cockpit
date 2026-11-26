import { h, icon, get, post, fail, toast, bytes, rate, pct, card, tabs, table, empty, ago, mount, clear, statusDot, pageHead, dt, loading, modal } from "../core.js";
import { t } from "../i18n.js";
import { lineChart, sparkline, segBar } from "../charts.js";

function statTile(iconName, label, unit) {
  const val = h("div", { class: "val" }, "–", unit ? h("small", null, unit) : null);
  const bar = segBar(); const foot = h("div", { class: "foot" }, "…"); const spark = h("div", null);
  const el = h("section", { class: "card stat" }, h("div", { class: "lab" }, icon(iconName), label), val, bar, spark, foot);
  return { el, set(v, num, footText, hist) {
    val.firstChild.textContent = typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : v;
    bar.set(num); foot.textContent = footText; if (hist) mount(spark, sparkline(hist));
  } };
}

export async function dashboard(root, ctx) {
  const cpu = statTile("cpu", t("CPU"), "%"), mem = statTile("memory-stick", t("Memory"), "%"), disk = statTile("hard-drive", t("Disk /"), "%"), load = statTile("activity", t("Load average"));
  const stateLine = h("div", { class: "state-line" }, h("span", { class: "pulse" }), h("span", null, t("Checking systems…")));
  const title = h("h2", null, "…"), chips = h("div", { class: "meta" });
  const hero = h("section", { class: "hero" }, stateLine, title, chips);
  const procBody = h("div", null, loading(4)), svcBody = h("div", null, loading(3)), noteBody = h("div", null, loading(3));
  const chartA = h("div"), chartB = h("div");
  let range = "1h", live = null, points = [];

  const drawCharts = () => {
    const ser = (k) => points.map((p) => ({ t: p.t, v: p[k] }));
    lineChart(chartA, [{ cls: "s1", label: "CPU", values: ser("cpu"), area: true }, { cls: "s2", label: "MEM", values: ser("mem") }], { max: 100, fmt: (v) => `${Math.round(v)}%` });
    const top = Math.max(1, ...points.map((p) => Math.max(p.rx, p.tx)));
    lineChart(chartB, [{ cls: "s1", label: "RX", values: ser("rx"), area: true }, { cls: "s3", label: "TX", values: ser("tx") }], { max: undefined, fmt: (v) => rate(v).replace(" ", "") });
    void top;
  };
  const loadRange = async (r) => { try { const d = await get(`/api/metrics?range=${r}`); points = d.points || []; drawCharts(); if (r === "1h") tilesHist(); } catch (e) { fail(e); } };
  const tilesHist = () => { /* sparks refreshed on next tick */ };

  const info = { last: null };
  const applyInfo = (i) => {
    info.last = i;
    const hist = (k) => points.slice(-40).map((p) => p[k]);
    cpu.set(i.cpu, i.cpu, t("{n} cores", { n: i.cores }), hist("cpu"));
    mem.set(i.mem_percent, i.mem_percent, `${bytes(i.mem_used)} / ${bytes(i.mem_total)}`, hist("mem"));
    disk.set(i.disk_percent, i.disk_percent, `${bytes(i.disk_used)} / ${bytes(i.disk_total)}`, hist("disk"));
    const l1 = i.load?.[0] ?? 0; load.set(l1, (l1 / i.cores) * 100, `${(i.load?.[1] ?? 0).toFixed(2)} · ${(i.load?.[2] ?? 0).toFixed(2)}`, hist("load"));
    title.textContent = i.hostname;
    mount(chips, h("span", { class: "chip" }, icon("layers"), i.os), h("span", { class: "chip" }, icon("cpu"), `Linux ${i.kernel}`), h("span", { class: "chip" }, icon("history"), t("up {t}", { t: i.uptime })),
      i.temp_c ? h("span", { class: "chip" }, icon("thermometer"), `${i.temp_c.toFixed(0)} °C`) : null,
      h("span", { class: "chip" }, icon("network"), `↓ ${bytes(i.net_rx)}  ↑ ${bytes(i.net_tx)}`));
    mount(procBody, table([
      { label: t("Process"), render: (p) => h("b", { class: "mono" }, p.name) }, { label: "PID", key: "pid", mono: true }, { label: t("User"), key: "user" },
      { label: "CPU", num: true, mono: true, render: (p) => p.cpu.toFixed(1) + "%" }, { label: "MEM", num: true, mono: true, render: (p) => p.mem.toFixed(1) + "%" },
    ], i.processes || [], { empty: empty("activity", t("No process data")) }));
  };

  root.append(pageHead(t("Overview"), null, tabs([["1h", "1h"], ["6h", "6h"], ["24h", "24h"], ["7d", "7d"]], range, (r) => { range = r; loadRange(r); })),
    h("div", { class: "stack" }, hero,
      h("div", { class: "grid g4" }, cpu.el, mem.el, disk.el, load.el),
      h("div", { class: "grid g2" },
        card(t("Utilisation"), chartA, { sub: "CPU · MEM", actions: h("div", { class: "legend" }, h("span", null, h("i"), "CPU"), h("span", null, h("i", { class: "d" }), "MEM")) }),
        card(t("Network throughput"), chartB, { sub: "RX · TX", actions: h("div", { class: "legend" }, h("span", null, h("i"), "RX"), h("span", null, h("i", { class: "d" }), "TX")) })),
      h("div", { class: "grid g-main" },
        card(t("Busiest processes"), procBody, { flush: true }),
        h("div", { class: "stack" }, card(t("Services"), svcBody, { flush: true, actions: h("a", { class: "btn sm ghost", href: "#/services" }, t("Manage"), icon("chevron-right")) }),
          card(t("Recent notifications"), noteBody, { flush: true })))));

  await loadRange(range);

  // live stream
  try {
    live = new EventSource("/api/system/stream");
    live.addEventListener("system", (e) => { try { applyInfo(JSON.parse(e.data)); } catch { /* ignore */ } });
    live.onerror = () => { /* the browser reconnects on its own */ };
  } catch { const i = await get("/api/system"); applyInfo(i); }

  // services + notifications + health verdict
  const canAct = ctx.can("operator");
  let down = 0, crit = 0;
  const verdict = () => {
    const bad = down + crit;
    stateLine.replaceChildren(h("span", { class: `pulse ${bad ? "bad" : ""}` }), h("span", null, bad ? t("Attention needed — {n} issue(s)", { n: bad }) : t("All systems nominal")));
  };
  get("/api/services").then((d) => {
    const list = d.services || [];
    down = list.filter((s) => s.state === "failed" || (!s.active && s.enabled === "enabled")).length;
    verdict();
    mount(svcBody, list.length ? list.slice(0, 7).map((s) => h("div", { class: "svc-row" }, statusDot(s.active ? "ok" : s.state === "failed" ? "bad" : ""), h("div", null, h("b", null, s.name), h("br"), h("small", null, s.active ? (s.sub || s.state) : s.enabled === "not-found" ? t("not installed") : s.state)), h("span", { class: "spacer" }),
      canAct && s.enabled !== "not-found" ? h("button", { class: "btn sm", onclick: async () => { try { await post("/api/services/action", { name: s.name, action: s.active ? "restart" : "start" }); toast(`${s.name}: ${t("done")}`); } catch (e) { fail(e); } } }, s.active ? t("Restart") : t("Start")) : null))
      : empty("server-cog", t("No services configured")));
  }).catch(fail);
  get("/api/notifications?limit=5").then((d) => {
    crit = (d.events || []).filter((e) => !e.read && e.level === "crit").length; verdict();
    mount(noteBody, d.events?.length ? d.events.map((e) => h("div", { class: "svc-row" }, statusDot(e.level === "crit" ? "bad" : e.level === "warn" ? "warn" : ""), h("div", null, h("b", null, e.title), h("br"), h("small", null, `${ago(e.time)} · ${e.message}`)))) : empty("bell", t("All quiet"), t("Alerts about services, disk and certificates appear here.")));
  }).catch(fail);

  return () => live?.close();
}

const cpuBar = (v) => { const b = segBar(); b.set(v); return b; };

export async function fleet(root, ctx) {
  const body = h("div", null, loading(3));
  root.append(pageHead(t("Fleet"), t("Other HackerCockpit hosts, polled with API tokens. Add them under Settings → Fleet."),
    h("button", { class: "btn", onclick: () => refresh() }, icon("refresh-cw"), t("Refresh"))), body);
  async function refresh() {
    mount(body, loading(3));
    try {
      const d = await get("/api/fleet");
      mount(body, d.hosts.length ? h("div", { class: "grid g3" }, d.hosts.map((x) => {
        const i = x.ok ? JSON.parse(x.info) : null;
        return h("section", { class: `card stat ${x.ok ? "clickable" : ""}`, onclick: x.ok ? () => remoteServicesModal(x.name) : null },
          h("div", { class: "lab" }, statusDot(x.ok ? "ok" : "bad"), h("b", null, x.name), h("span", { class: "spacer" }), h("span", { class: "badge" }, x.ok ? `${x.latency_ms} ms` : x.error)),
          i ? [h("div", { class: "val" }, `${i.cpu.toFixed(0)}`, h("small", null, "% CPU")), cpuBar(i.cpu),
            h("div", { class: "foot" }, h("span", null, `MEM ${pct(i.mem_percent)}`), h("span", null, `DISK ${pct(i.disk_percent)}`), h("span", null, i.uptime))] : h("div", { class: "dim" }, x.url));
      })) : h("div", { class: "card" }, empty("network", t("No hosts yet"), t("Create an API token on the remote host (Access → API tokens) and add it in Settings."))));
    } catch (e) { fail(e); }
  }
  async function remoteServicesModal(name) {
    const bodyEl = h("div", null, loading(3));
    const op = ctx.can("operator");
    const act = async (svcName, action) => { try { await post(`/api/fleet/${encodeURIComponent(name)}/services/action`, { name: svcName, action }); toast(t("done")); load(); } catch (e) { fail(e); } };
    async function load() {
      mount(bodyEl, loading(3));
      try {
        const d = await get(`/api/fleet/${encodeURIComponent(name)}/services`);
        mount(bodyEl, table([
          { label: t("Service"), render: (svc) => h("div", { class: "namecell" }, statusDot(svc.active ? "ok" : svc.state === "failed" ? "bad" : ""), h("b", null, svc.name)) },
          { label: t("State"), render: (svc) => h("span", { class: `badge ${svc.state === "failed" ? "bad" : ""}` }, svc.enabled === "not-found" ? t("not installed") : svc.state) },
          { label: "", render: (svc) => svc.enabled === "not-found" || !op ? null : h("div", { class: "actions" },
            h("button", { class: "btn sm", onclick: () => act(svc.name, svc.active ? "stop" : "start") }, svc.active ? t("Stop") : t("Start")),
            h("button", { class: "btn sm", onclick: () => act(svc.name, "restart") }, icon("rotate-cw"))) },
        ], d.services || [], { empty: empty("server-cog", t("No services configured")) }));
      } catch (e) { mount(bodyEl, h("div", { class: "callout bad" }, e.message)); }
    }
    modal({ title: `${name} — ${t("Services")}`, wide: true, body: bodyEl, actions: [{ label: t("Close"), kind: "primary" }] });
    load();
  }
  refresh();
}
