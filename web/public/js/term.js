import { h, clear } from "./core.js";

const enc = new TextEncoder();

export class Terminal {
  constructor(host, { onData, onResize }) {
    this.onData = onData; this.onResize = onResize;
    this.screen = h("div", { class: "term-screen", tabindex: "-1" });
    this.input = h("textarea", { class: "term-input", autocapitalize: "off", autocomplete: "off", spellcheck: "false", "aria-label": "terminal input" });
    this.host = host; host.append(this.screen, this.input);
    this.cols = 80; this.rows = 24; this.scrollback = []; this.maxScroll = 3000;
    this.reset();
    this.bind();
    this.measure();
  }
  reset() {
    this.main = this.blank(); this.alt = this.blank(); this.buf = this.main; this.isAlt = false;
    this.cx = 0; this.cy = 0; this.attr = this.defAttr(); this.saved = null; this.top = 0; this.bot = this.rows - 1;
    this.appCursor = false; this.bracketed = false; this.wrapPending = false; this.parse = 0; this.params = ""; this.utf = "";
    this.dirty = true;
  }
  defAttr() { return { fg: null, bg: null, b: 0, u: 0, d: 0, i: 0, inv: 0 }; }
  blankRow() { return Array.from({ length: this.cols }, () => ({ c: " ", a: this.defAttr() })); }
  blank() { return Array.from({ length: this.rows }, () => this.blankRow()); }

  measure() {
    const probe = h("span", { class: "row" }, "M".repeat(20)); probe.style.position = "absolute"; probe.style.visibility = "hidden";
    this.screen.append(probe); const r = probe.getBoundingClientRect(); probe.remove();
    this.cw = r.width / 20 || 8; this.ch = r.height || 16;
  }
  fit() {
    this.measure();
    const r = this.host.getBoundingClientRect();
    const cols = Math.max(20, Math.floor((r.width - 28) / this.cw)), rows = Math.max(5, Math.floor((r.height - 24) / this.ch));
    if (cols !== this.cols || rows !== this.rows) this.resize(cols, rows);
  }
  resize(cols, rows) {
    const fix = (b) => { while (b.length < rows) b.push(this.blankRow0(cols)); b.length = rows; b.forEach((r) => { while (r.length < cols) r.push({ c: " ", a: this.defAttr() }); r.length = cols; }); return b; };
    this.cols = cols; this.rows = rows; this.main = fix(this.main); this.alt = fix(this.alt); this.buf = this.isAlt ? this.alt : this.main;
    this.cx = Math.min(this.cx, cols - 1); this.cy = Math.min(this.cy, rows - 1); this.top = 0; this.bot = rows - 1; this.dirty = true; this.schedule();
    this.onResize?.(cols, rows);
  }
  blankRow0(cols) { return Array.from({ length: cols }, () => ({ c: " ", a: this.defAttr() })); }

  // ── input ────────────────────────────────────────────────────────────
  bind() {
    const focus = () => { this.input.focus({ preventScroll: true }); };
    this.host.addEventListener("mousedown", () => setTimeout(focus, 0));
    this.input.addEventListener("focus", () => this.screen.classList.remove("blur"));
    this.input.addEventListener("blur", () => this.screen.classList.add("blur"));
    this.input.addEventListener("input", () => { const v = this.input.value; this.input.value = ""; if (v) this.send(v); });
    this.input.addEventListener("paste", (e) => { e.preventDefault(); const tx = e.clipboardData.getData("text"); this.send(this.bracketed ? `\x1b[200~${tx}\x1b[201~` : tx); });
    this.input.addEventListener("keydown", (e) => this.key(e));
    this.focus = focus;
  }
  send(s) { this.onData?.(enc.encode(s)); }
  key(e) {
    const app = this.appCursor, k = e.key; let s = null;
    const csi = (c) => (app ? `\x1bO${c}` : `\x1b[${c}`);
    const map = { Enter: "\r", Backspace: "\x7f", Tab: e.shiftKey ? "\x1b[Z" : "\t", Escape: "\x1b", ArrowUp: csi("A"), ArrowDown: csi("B"), ArrowRight: csi("C"), ArrowLeft: csi("D"),
      Home: csi("H"), End: csi("F"), PageUp: "\x1b[5~", PageDown: "\x1b[6~", Delete: "\x1b[3~", Insert: "\x1b[2~" };
    if (k in map) s = map[k];
    else if (/^F([1-9]|1[0-2])$/.test(k)) s = ["\x1bOP", "\x1bOQ", "\x1bOR", "\x1bOS", "\x1b[15~", "\x1b[17~", "\x1b[18~", "\x1b[19~", "\x1b[20~", "\x1b[21~", "\x1b[23~", "\x1b[24~"][+k.slice(1) - 1];
    else if (e.ctrlKey && !e.altKey && k.length === 1) {
      const c = k.toLowerCase().charCodeAt(0);
      if (c >= 97 && c <= 122) { if (k.toLowerCase() === "v" && e.shiftKey) return; if (k.toLowerCase() === "c" && e.shiftKey) return; s = String.fromCharCode(c - 96); }
      else if (k === "[") s = "\x1b"; else if (k === "\\") s = "\x1c"; else if (k === "]") s = "\x1d"; else if (k === " ") s = "\x00";
    } else if (e.altKey && !e.ctrlKey && k.length === 1) s = "\x1b" + k;
    if (s !== null) { e.preventDefault(); this.send(s); this.screen.scrollTop = this.screen.scrollHeight; }
  }

  // ── output parser ────────────────────────────────────────────────────
  write(bytes) {
    const s = typeof bytes === "string" ? bytes : (this.dec ||= new TextDecoder()).decode(bytes, { stream: true });
    for (const ch of s) this.feed(ch);
    this.dirty = true; this.schedule();
  }
  feed(ch) {
    const code = ch.codePointAt(0);
    switch (this.parse) {
      case 0:
        if (code === 0x1b) { this.parse = 1; return; }
        if (code === 0x0a || code === 0x0b || code === 0x0c) { this.lineFeed(); return; }
        if (code === 0x0d) { this.cx = 0; this.wrapPending = false; return; }
        if (code === 0x08) { if (this.cx > 0) this.cx--; this.wrapPending = false; return; }
        if (code === 0x09) { this.cx = Math.min(this.cols - 1, (this.cx + 8) & ~7); return; }
        if (code === 0x07 || code < 0x20 || code === 0x7f) return;
        this.put(ch); return;
      case 1: // after ESC
        if (ch === "[") { this.parse = 2; this.params = ""; return; }
        if (ch === "]") { this.parse = 3; this.params = ""; return; }
        if (ch === "(" || ch === ")" || ch === "*" || ch === "+" || ch === "#") { this.parse = 4; return; }
        this.parse = 0;
        if (ch === "7") this.saveCursor(); else if (ch === "8") this.restoreCursor();
        else if (ch === "D") this.lineFeed(); else if (ch === "E") { this.cx = 0; this.lineFeed(); }
        else if (ch === "M") this.reverseIndex(); else if (ch === "c") this.reset();
        return;
      case 2: // CSI
        if (code >= 0x40 && code <= 0x7e) { this.csi(this.params, ch); this.parse = 0; } else this.params += ch;
        return;
      case 3: // OSC — ignore until BEL or ST
        if (code === 0x07) this.parse = 0; else if (code === 0x1b) this.parse = 5;
        return;
      case 4: this.parse = 0; return;
      case 5: this.parse = 0; return;
    }
  }
  put(ch) {
    if (this.wrapPending) { this.cx = 0; this.lineFeed(); this.wrapPending = false; }
    this.buf[this.cy][this.cx] = { c: ch, a: { ...this.attr } };
    if (this.cx >= this.cols - 1) this.wrapPending = true; else this.cx++;
  }
  lineFeed() {
    if (this.cy === this.bot) this.scrollUp(1); else if (this.cy < this.rows - 1) this.cy++;
  }
  reverseIndex() { if (this.cy === this.top) this.scrollDown(1); else if (this.cy > 0) this.cy--; }
  scrollUp(n) {
    for (let i = 0; i < n; i++) {
      const row = this.buf.splice(this.top, 1)[0];
      if (!this.isAlt && this.top === 0) { this.scrollback.push(row); if (this.scrollback.length > this.maxScroll) this.scrollback.shift(); }
      this.buf.splice(this.bot, 0, this.blankRow());
    }
  }
  scrollDown(n) { for (let i = 0; i < n; i++) { this.buf.splice(this.bot, 1); this.buf.splice(this.top, 0, this.blankRow()); } }
  saveCursor() { this.saved = { cx: this.cx, cy: this.cy, attr: { ...this.attr } }; }
  restoreCursor() { if (this.saved) { this.cx = this.saved.cx; this.cy = this.saved.cy; this.attr = { ...this.saved.attr }; } }
  clampCursor() { this.cx = Math.max(0, Math.min(this.cols - 1, this.cx)); this.cy = Math.max(0, Math.min(this.rows - 1, this.cy)); this.wrapPending = false; }
  eraseCells(row, from, to) { for (let x = from; x <= to && x < this.cols; x++) this.buf[row][x] = { c: " ", a: { ...this.attr, b: 0, u: 0, inv: 0 } }; }

  csi(paramStr, final) {
    const priv = paramStr.startsWith("?") || paramStr.startsWith(">") || paramStr.startsWith("=");
    const raw = priv ? paramStr.slice(1) : paramStr;
    const p = raw.split(/[;:]/).map((x) => (x === "" ? NaN : parseInt(x, 10)));
    const n = (i, d = 1) => (Number.isNaN(p[i]) || p[i] === undefined ? d : p[i]) || d;
    switch (final) {
      case "A": this.cy = Math.max(this.top, this.cy - n(0)); this.wrapPending = false; break;
      case "B": this.cy = Math.min(this.bot, this.cy + n(0)); this.wrapPending = false; break;
      case "C": this.cx = Math.min(this.cols - 1, this.cx + n(0)); this.wrapPending = false; break;
      case "D": this.cx = Math.max(0, this.cx - n(0)); this.wrapPending = false; break;
      case "E": this.cy = Math.min(this.bot, this.cy + n(0)); this.cx = 0; break;
      case "F": this.cy = Math.max(this.top, this.cy - n(0)); this.cx = 0; break;
      case "G": this.cx = n(0) - 1; this.clampCursor(); break;
      case "H": case "f": this.cy = n(0) - 1; this.cx = n(1) - 1; this.clampCursor(); break;
      case "d": this.cy = n(0) - 1; this.clampCursor(); break;
      case "J": { const m = n(0, 0); if (m === 0) { this.eraseCells(this.cy, this.cx, this.cols); for (let y = this.cy + 1; y < this.rows; y++) this.eraseCells(y, 0, this.cols); }
        else if (m === 1) { for (let y = 0; y < this.cy; y++) this.eraseCells(y, 0, this.cols); this.eraseCells(this.cy, 0, this.cx); }
        else { for (let y = 0; y < this.rows; y++) this.eraseCells(y, 0, this.cols); if (m === 3) this.scrollback = []; } break; }
      case "K": { const m = n(0, 0); if (m === 0) this.eraseCells(this.cy, this.cx, this.cols); else if (m === 1) this.eraseCells(this.cy, 0, this.cx); else this.eraseCells(this.cy, 0, this.cols); break; }
      case "L": for (let i = 0; i < n(0); i++) { if (this.cy >= this.top && this.cy <= this.bot) { this.buf.splice(this.bot, 1); this.buf.splice(this.cy, 0, this.blankRow()); } } break;
      case "M": for (let i = 0; i < n(0); i++) { if (this.cy >= this.top && this.cy <= this.bot) { this.buf.splice(this.cy, 1); this.buf.splice(this.bot, 0, this.blankRow()); } } break;
      case "P": { const r = this.buf[this.cy]; r.splice(this.cx, n(0)); while (r.length < this.cols) r.push({ c: " ", a: this.defAttr() }); break; }
      case "@": { const r = this.buf[this.cy]; for (let i = 0; i < n(0); i++) r.splice(this.cx, 0, { c: " ", a: this.defAttr() }); r.length = this.cols; break; }
      case "X": this.eraseCells(this.cy, this.cx, this.cx + n(0) - 1); break;
      case "S": this.scrollUp(n(0)); break;
      case "T": this.scrollDown(n(0)); break;
      case "r": this.top = n(0) - 1; this.bot = n(1, this.rows) - 1; if (this.top < 0 || this.bot >= this.rows || this.top >= this.bot) { this.top = 0; this.bot = this.rows - 1; } this.cx = 0; this.cy = 0; break;
      case "s": this.saveCursor(); break;
      case "u": this.restoreCursor(); break;
      case "m": this.sgr(p); break;
      case "h": case "l": if (priv) for (const v of p) this.mode(v, final === "h"); break;
      case "n": if (n(0) === 6) this.send(`\x1b[${this.cy + 1};${this.cx + 1}R`); break;
      case "c": if (!priv) this.send("\x1b[?1;2c"); break;
      default: break;
    }
  }
  mode(v, on) {
    if (v === 1) this.appCursor = on;
    else if (v === 2004) this.bracketed = on;
    else if (v === 1049 || v === 47 || v === 1047) {
      if (on && !this.isAlt) { this.saveCursor(); this.isAlt = true; this.alt = this.blank(); this.buf = this.alt; this.cx = 0; this.cy = 0; }
      else if (!on && this.isAlt) { this.isAlt = false; this.buf = this.main; this.restoreCursor(); }
      this.top = 0; this.bot = this.rows - 1;
    }
  }
  sgr(p) {
    if (!p.length || (p.length === 1 && Number.isNaN(p[0]))) p = [0];
    for (let i = 0; i < p.length; i++) {
      const v = Number.isNaN(p[i]) ? 0 : p[i], a = this.attr;
      if (v === 0) this.attr = this.defAttr();
      else if (v === 1) a.b = 1; else if (v === 2) a.d = 1; else if (v === 3) a.i = 1; else if (v === 4) a.u = 1; else if (v === 7) a.inv = 1;
      else if (v === 22) { a.b = 0; a.d = 0; } else if (v === 23) a.i = 0; else if (v === 24) a.u = 0; else if (v === 27) a.inv = 0;
      else if (v >= 30 && v <= 37) a.fg = v - 30; else if (v === 39) a.fg = null;
      else if (v >= 40 && v <= 47) a.bg = v - 40; else if (v === 49) a.bg = null;
      else if (v >= 90 && v <= 97) a.fg = v - 90 + 8; else if (v >= 100 && v <= 107) a.bg = v - 100 + 8;
      else if (v === 38 || v === 48) {
        const key = v === 38 ? "fg" : "bg";
        if (p[i + 1] === 5) { a[key] = p[i + 2]; i += 2; }
        else if (p[i + 1] === 2) { a[key] = `rgb(${p[i + 2]},${p[i + 3]},${p[i + 4]})`; i += 4; }
      }
    }
  }

  // ── rendering ────────────────────────────────────────────────────────
  schedule() { if (this.raf) return; this.raf = requestAnimationFrame(() => { this.raf = 0; this.render(); }); }
  span(text, a, cursor) {
    const s = document.createElement("span"); s.textContent = text;
    const cls = [];
    let fg = a.fg, bg = a.bg; if (a.inv) [fg, bg] = [bg ?? 7, fg ?? 0];
    const idx = (v) => (typeof v === "number" ? v : null);
    if (idx(fg) !== null && fg < 16) cls.push("f" + fg); else if (idx(fg) !== null) s.style.color = xterm256(fg); else if (typeof fg === "string") s.style.color = fg;
    if (idx(bg) !== null && bg < 16) cls.push("b" + bg); else if (idx(bg) !== null) s.style.background = xterm256(bg); else if (typeof bg === "string") s.style.background = bg;
    if (a.b) cls.push("t-b"); if (a.u) cls.push("t-u"); if (a.d) cls.push("t-d"); if (a.i) cls.push("t-i"); if (cursor) cls.push("cur");
    if (cls.length) s.className = cls.join(" ");
    return s;
  }
  render() {
    if (!this.dirty) return; this.dirty = false;
    const atBottom = this.screen.scrollTop + this.screen.clientHeight >= this.screen.scrollHeight - 30;
    const frag = document.createDocumentFragment();
    const emit = (cells, curX) => {
      const row = h("div", { class: "row" }); let run = "", ra = null;
      const flush = () => { if (run) { row.append(this.span(run, ra, false)); run = ""; } };
      cells.forEach((cell, x) => {
        if (x === curX) { flush(); row.append(this.span(cell.c, cell.a, true)); ra = null; return; }
        if (ra && sameAttr(ra, cell.a)) run += cell.c; else { flush(); ra = cell.a; run = cell.c; }
      });
      flush(); return row;
    };
    if (!this.isAlt) for (const r of this.scrollback.slice(-1000)) frag.append(emit(r, -1));
    this.buf.forEach((r, y) => frag.append(emit(r, y === this.cy ? this.cx : -1)));
    clear(this.screen); this.screen.append(frag);
    if (atBottom || this.isAlt) this.screen.scrollTop = this.screen.scrollHeight;
  }
  destroy() { cancelAnimationFrame(this.raf); }
}
const sameAttr = (a, b) => a.fg === b.fg && a.bg === b.bg && a.b === b.b && a.u === b.u && a.d === b.d && a.i === b.i && a.inv === b.inv;
function xterm256(n) {
  if (n < 16) return null;
  if (n >= 232) { const g = 8 + (n - 232) * 10; return `rgb(${g},${g},${g})`; }
  n -= 16; const c = [0, 95, 135, 175, 215, 255];
  return `rgb(${c[Math.floor(n / 36)]},${c[Math.floor(n / 6) % 6]},${c[n % 6]})`;
}
