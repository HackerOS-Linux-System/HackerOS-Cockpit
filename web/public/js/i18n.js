import { PL } from "./pl.js";

let lang = "en";
try { lang = localStorage.getItem("hc.lang") || ((navigator.language || "en").toLowerCase().startsWith("pl") ? "pl" : "en"); } catch { /* storage blocked */ }

export function t(s, vars) {
  let out = lang === "pl" && PL[s] !== undefined ? PL[s] : s;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, v);
  return out;
}
export const getLang = () => lang;
export function setLang(l) { try { localStorage.setItem("hc.lang", l); } catch { /* ignore */ } location.reload(); }
document.documentElement.lang = lang;

// Theme (dark by default)
export function getTheme() { try { return localStorage.getItem("hc.theme") || "dark"; } catch { return "dark"; } }
export function applyTheme(th) { document.documentElement.dataset.theme = th; try { localStorage.setItem("hc.theme", th); } catch { /* ignore */ } }
applyTheme(getTheme());
