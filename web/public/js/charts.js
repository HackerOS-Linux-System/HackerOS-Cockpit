import { h, svg, clear } from "./core.js";

const W = 760, H = 220, PL = 40, PR = 12, PT = 12, PB = 24;

export function niceMax(v, min = 1) {
  if (v <= min) return min;
  const p = 10 ** Math.floor(Math.log10(v)); const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

// series: [{ cls:"s1", values:[{t,v}], area:true }]
export function lineChart(container, series, { max, fmt = (v) => v, height = H, tfmt } = {}) {
  clear(container); container.classList.add("chart");
  const all = series.flatMap((s) => s.values);
  if (all.length < 2) { container.append(h("div", { class: "empty" }, "…")); return; }
  const t0 = Math.min(...all.map((p) => p.t)), t1 = Math.max(...all.map((p) => p.t));
  const ymax = max ?? niceMax(Math.max(...all.map((p) => p.v)) * 1.1);
  const x = (tt) => PL + ((tt - t0) / Math.max(1, t1 - t0)) * (W - PL - PR);
  const y = (v) => PT + (1 - v / ymax) * (height - PT - PB);
  const root = svg("svg", { viewBox: `0 0 ${W} ${height}`, role: "img", preserveAspectRatio: "none" });
  const grid = svg("g", { class: "grid" });
  for (let i = 0; i <= 4; i++) {
    const v = (ymax / 4) * i, yy = y(v);
    grid.append(svg("line", { x1: PL, x2: W - PR, y1: yy, y2: yy }), svg("text", { x: PL - 8, y: yy + 3.5, "text-anchor": "end" }, fmt(v)));
  }
  const ticks = 5;
  for (let i = 0; i < ticks; i++) {
    const tt = t0 + ((t1 - t0) / (ticks - 1)) * i;
    grid.append(svg("text", { x: x(tt), y: height - 6, "text-anchor": i === 0 ? "start" : i === ticks - 1 ? "end" : "middle" }, (tfmt || defaultT)(tt, t1 - t0)));
  }
  root.append(grid);
  series.forEach((s) => {
    const pts = s.values.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`);
    if (s.area) root.append(svg("path", { class: "ar", d: `M${x(s.values[0].t)},${y(0)} L${pts.join(" L")} L${x(s.values.at(-1).t)},${y(0)} Z` }));
    root.append(svg("path", { class: `ln ${s.cls}`, d: `M${pts.join(" L")}` }));
  });
  const cursor = svg("line", { class: "cursor", y1: PT, y2: height - PB, opacity: 0 });
  const dots = series.map(() => svg("circle", { class: "dot", r: 3.6, opacity: 0 }));
  root.append(cursor, ...dots);
  const tip = h("div", { class: "tip", hidden: true });
  container.append(root, tip); container.style.position = "relative";
  const move = (ev) => {
    const r = root.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    const tt = t0 + ((px - PL) / (W - PL - PR)) * (t1 - t0);
    let best = null, bd = Infinity;
    for (const p of series[0].values) { const d = Math.abs(p.t - tt); if (d < bd) { bd = d; best = p; } }
    if (!best) return;
    cursor.setAttribute("x1", x(best.t)); cursor.setAttribute("x2", x(best.t)); cursor.setAttribute("opacity", 1);
    const rows = [];
    series.forEach((s, i) => {
      let q = s.values[0]; let dd = Infinity;
      for (const p of s.values) { const d = Math.abs(p.t - best.t); if (d < dd) { dd = d; q = p; } }
      dots[i].setAttribute("cx", x(q.t)); dots[i].setAttribute("cy", y(q.v)); dots[i].setAttribute("opacity", 1);
      rows.push(h("div", null, `${s.label || ""} ${fmt(q.v)}`.trim()));
    });
    tip.hidden = false; clear(tip); tip.append(h("b", null, new Date(best.t * 1000).toLocaleString()), ...rows);
    tip.style.left = `${Math.min(Math.max((x(best.t) / W) * r.width, 70), r.width - 70)}px`;
    tip.style.top = `${(y(Math.max(...series.map((s) => s.values.find((p) => p.t === best.t)?.v ?? 0))) / height) * r.height}px`;
  };
  root.addEventListener("mousemove", move); root.addEventListener("touchmove", (e) => move(e.touches[0]), { passive: true });
  root.addEventListener("mouseleave", () => { tip.hidden = true; cursor.setAttribute("opacity", 0); dots.forEach((d) => d.setAttribute("opacity", 0)); });
}
const pad = (n) => String(n).padStart(2, "0");
function defaultT(tt, span) {
  const d = new Date(tt * 1000);
  return span > 2 * 86400 ? `${pad(d.getDate())}.${pad(d.getMonth() + 1)}` : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function sparkline(values, w = 120, hh = 34) {
  const s = svg("svg", { class: "spark", viewBox: `0 0 ${w} ${hh}`, preserveAspectRatio: "none" });
  if (values.length < 2) return s;
  const max = Math.max(...values, 1), min = Math.min(...values, 0);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, hh - 2 - ((v - min) / Math.max(1e-6, max - min)) * (hh - 6)]);
  const d = pts.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" L");
  s.append(svg("path", { class: "a", d: `M0,${hh} L${d} L${w},${hh} Z` }), svg("path", { class: "l", d: `M${d}` }));
  return s;
}

// 32-segment LED bar; segments turn red above 85 %.
export function segBar(n = 32) {
  const el = h("div", { class: "seg", "aria-hidden": "true" }, Array.from({ length: n }, () => h("i")));
  el.set = (pctVal) => {
    const on = Math.round((Math.min(100, Math.max(0, pctVal)) / 100) * n);
    [...el.children].forEach((c, i) => { c.className = i < on ? (pctVal >= 85 ? "hot" : i > n * 0.6 ? "mid" : "on") : ""; });
  };
  return el;
}
