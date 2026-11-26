import { h, modal, stream, liveOutput, icon, toast } from "../core.js";
import { t } from "../i18n.js";

// Opens a modal that shows the live output of a streaming API call.
export function runStreamModal(title, path, body, { onFinish } = {}) {
  const out = liveOutput();
  const status = h("div", { class: "row", style: null }, h("span", { class: "loader" }), h("span", { class: "muted" }, t("Running…")));
  let finished = false;
  const job = stream(path, body, {
    onLine: (l) => out.push(l),
    onDone: ({ ok, error }) => {
      finished = true;
      status.replaceChildren(icon(ok ? "circle-check" : "circle-x"), h("span", null, ok ? t("Finished successfully") : t("Failed: {e}", { e: error || "?" })));
      if (!ok) toast(error || t("Failed"), "error");
      onFinish?.(ok);
    },
  });
  modal({ title, wide: true, body: h("div", { class: "stack" }, status, out.el),
    onClose: () => { if (!finished) job.abort(); },
    actions: [{ label: t("Stop"), kind: "danger", close: false, run: () => { if (!finished) job.abort(); return false; } }, { label: t("Close"), kind: "primary" }] });
  return job;
}

const ansi = /\x1b\[[0-9;?]*[A-Za-z]/g;
export const stripAnsi = (s) => s.replace(ansi, "");

export function levelClass(line) {
  const l = line.toLowerCase();
  if (/\b(error|fail(ed|ure)?|fatal|critical|denied|panic|segfault)\b/.test(l)) return "ln err";
  if (/\b(warn(ing)?|deprecated|timeout|refused)\b/.test(l)) return "ln warn";
  return "ln";
}

export function cronHuman(sched) {
  const macros = { "@reboot": t("at boot"), "@hourly": t("every hour"), "@daily": t("every day at 00:00"), "@midnight": t("every day at 00:00"), "@weekly": t("every Sunday at 00:00"), "@monthly": t("on the 1st of every month"), "@yearly": t("every January 1st"), "@annually": t("every January 1st") };
  if (macros[sched]) return macros[sched];
  const f = sched.split(/\s+/); if (f.length !== 5) return sched;
  const [m, hr, dom, mon, dow] = f; const two = (n) => String(n).padStart(2, "0");
  if (f.every((x) => x === "*")) return t("every minute");
  let mm = /^\*\/(\d+)$/.exec(m); if (mm && hr === "*" && dom === "*" && mon === "*" && dow === "*") return t("every {n} minutes", { n: mm[1] });
  if (/^\d+$/.test(m) && hr === "*" && dom === "*" && mon === "*" && dow === "*") return t("every hour at :{m}", { m: two(m) });
  mm = /^\*\/(\d+)$/.exec(hr); if (m === "0" && mm && dom === "*" && mon === "*" && dow === "*") return t("every {n} hours", { n: mm[1] });
  if (/^\d+$/.test(m) && /^\d+$/.test(hr) && mon === "*") {
    const at = `${two(hr)}:${two(m)}`;
    if (dom === "*" && dow === "*") return t("every day at {t}", { t: at });
    if (dom === "*" && /^[0-7]$/.test(dow)) return t("every {d} at {t}", { d: [t("Sunday"), t("Monday"), t("Tuesday"), t("Wednesday"), t("Thursday"), t("Friday"), t("Saturday"), t("Sunday")][+dow], t: at });
    if (/^\d+$/.test(dom) && dow === "*") return t("on day {d} of the month at {t}", { d: dom, t: at });
  }
  return sched;
}
