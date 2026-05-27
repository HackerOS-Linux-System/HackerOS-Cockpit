import { serve } from "bun";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, resolve, basename, dirname } from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const PORT = 4545;
const TEMPLATES_DIR = join(import.meta.dir, "../templates");
const PUBLIC_DIR = join(import.meta.dir, "../public");

// ─── Validation ────────────────────────────────────────────────────────────────
function validateInput(text: string, maxLength = 100, pattern = /^[\w.\-]+$/): boolean {
  return pattern.test(text) && text.length <= maxLength;
}

// ─── Template rendering ────────────────────────────────────────────────────────
function renderTemplate(name: string, vars: Record<string, unknown> = {}): string {
  const path = join(TEMPLATES_DIR, `${name}.html`);
  if (!existsSync(path)) return `<h1>Template not found: ${name}</h1>`;
  let html = readFileSync(path, "utf8");
  for (const [key, val] of Object.entries(vars)) {
    html = html.replaceAll(`{{${key}}}`, String(val));
  }
  return html;
}

// ─── System Info ───────────────────────────────────────────────────────────────
interface SystemInfo {
  cpu_usage: string;
  memory_total: string;
  memory_used: string;
  memory_percent: string;
  disk_total: string;
  disk_used: string;
  disk_percent: string;
  net_sent: string;
  net_recv: string;
  uptime: string;
  hostname: string;
  kernel: string;
  os: string;
  processes: ProcessInfo[];
}

interface ProcessInfo {
  pid: string;
  name: string;
  cpu: string;
  mem: string;
  status: string;
}

async function getSystemInfo(): Promise<SystemInfo> {
  const run = async (cmd: string): Promise<string> => {
    try {
      const { stdout } = await execAsync(cmd);
      return stdout.trim();
    } catch {
      return "N/A";
    }
  };

  const [cpuRaw, memRaw, diskRaw, netRaw, uptime, hostname, kernel, os_info, procRaw] =
    await Promise.all([
      run("top -bn1 | grep 'Cpu(s)' | awk '{print $2}'"),
      run("free -m | awk 'NR==2{print $2\" \"$3}'"),
      run("df -h / | awk 'NR==2{print $2\" \"$3\" \"$5}'"),
      run("cat /proc/net/dev | awk 'NR>2{rx+=$2; tx+=$10} END{print rx\" \"tx}'"),
      run("uptime -p"),
      run("hostname"),
      run("uname -r"),
      run("cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2 | tr -d '\"'"),
      run("ps aux --sort=-%cpu | awk 'NR>1 && NR<=11{print $1\" \"$2\" \"$3\" \"$4\" \"$8\" \"$11}'"),
    ]);

  const [memTotal, memUsed] = memRaw.split(" ");
  const memPercent = memRaw !== "N/A" ? Math.round((+memUsed / +memTotal) * 100).toString() : "0";

  const diskParts = diskRaw.split(" ");
  const [diskTotal, diskUsed, diskPercent] = diskParts;

  const netParts = netRaw.split(" ");
  const netRecv = netParts[0] ? (parseInt(netParts[0]) / 1024 / 1024).toFixed(1) : "0";
  const netSent = netParts[1] ? (parseInt(netParts[1]) / 1024 / 1024).toFixed(1) : "0";

  const processes: ProcessInfo[] = procRaw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(" ");
      return {
        pid: parts[1] || "",
        name: parts[5] || "",
        cpu: parts[2] || "0",
        mem: parts[3] || "0",
        status: parts[4] || "",
      };
    });

  return {
    cpu_usage: cpuRaw || "0",
    memory_total: memTotal || "0",
    memory_used: memUsed || "0",
    memory_percent: memPercent,
    disk_total: diskTotal || "0",
    disk_used: diskUsed || "0",
    disk_percent: diskPercent?.replace("%", "") || "0",
    net_sent: netSent,
    net_recv: netRecv,
    uptime: uptime || "N/A",
    hostname: hostname || "N/A",
    kernel: kernel || "N/A",
    os: os_info || "HackerOS/Debian",
    processes,
  };
}

// ─── Services ──────────────────────────────────────────────────────────────────
const SERVICES = ["ssh", "apache2", "nginx", "docker", "mysql", "postgresql", "redis", "fail2ban", "cron", "ufw"];

async function getServiceStatus(name: string): Promise<boolean> {
  if (!validateInput(name)) return false;
  try {
    const { stdout } = await execAsync(`systemctl is-active ${name} 2>/dev/null`);
    return stdout.trim() === "active";
  } catch {
    return false;
  }
}

async function getAllServicesStatus(): Promise<Record<string, boolean>> {
  const entries = await Promise.all(
    SERVICES.map(async (s) => [s, await getServiceStatus(s)] as [string, boolean])
  );
  return Object.fromEntries(entries);
}

// ─── Network ───────────────────────────────────────────────────────────────────
async function getNetworkInfo() {
  try {
    const { stdout } = await execAsync(
      "ss -tuanp 2>/dev/null | awk 'NR>1 && $5!=\"*:*\" && $6!=\"*:*\" {print $1\" \"$5\" \"$6\" \"$2}' | head -20"
    );
    return stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(" ");
        return { proto: parts[0], local: parts[1], remote: parts[2], status: parts[3] };
      });
  } catch {
    return [];
  }
}

// ─── Diagnostics ───────────────────────────────────────────────────────────────
async function runDiagnostics() {
  const run = async (cmd: string): Promise<string> => {
    try {
      const { stdout } = await execAsync(cmd);
      return stdout.trim();
    } catch {
      return "N/A";
    }
  };

  const [diskPct, memPct, cpuLoad, dnsOk, pingOk] = await Promise.all([
    run("df / | awk 'NR==2{print $5}' | tr -d '%'"),
    run("free | awk 'NR==2{printf \"%.0f\", $3/$2*100}'"),
    run("uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | tr -d ','"),
    run("dig +short google.com @8.8.8.8 2>/dev/null | head -1"),
    run("ping -c 1 -W 2 8.8.8.8 2>/dev/null && echo ok || echo fail"),
  ]);

  return {
    disk_ok: parseInt(diskPct) < 90,
    disk_pct: diskPct,
    memory_ok: parseInt(memPct) < 90,
    memory_pct: memPct,
    cpu_ok: parseFloat(cpuLoad) < 4.0,
    cpu_load: cpuLoad,
    dns_ok: !!dnsOk && dnsOk !== "N/A",
    network_ok: pingOk.trim() === "ok",
  };
}

// ─── Logs ──────────────────────────────────────────────────────────────────────
async function getLogs(logFile = "/var/log/syslog", lines = 150): Promise<string[]> {
  try {
    const { stdout } = await execAsync(`tail -n ${lines} ${logFile} 2>/dev/null`);
    return stdout.split("\n").filter(Boolean);
  } catch {
    try {
      const { stdout } = await execAsync(`journalctl -n ${lines} --no-pager 2>/dev/null`);
      return stdout.split("\n").filter(Boolean);
    } catch {
      return ["Error: cannot read logs"];
    }
  }
}

// ─── Files ─────────────────────────────────────────────────────────────────────
function listFiles(dirPath: string): { name: string; isDir: boolean; size: string; modified: string }[] {
  const safe = resolve(dirPath);
  if (!safe.startsWith("/")) return [];
  try {
    return readdirSync(safe).map((f) => {
      try {
        const st = statSync(join(safe, f));
        const size = st.isDirectory() ? "-" : formatSize(st.size);
        const modified = st.mtime.toISOString().slice(0, 16).replace("T", " ");
        return { name: f, isDir: st.isDirectory(), size, modified };
      } catch {
        return { name: f, isDir: false, size: "?", modified: "?" };
      }
    });
  } catch {
    return [];
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)}MB`;
  return `${(bytes / 1073741824).toFixed(1)}GB`;
}

// ─── Packages ─────────────────────────────────────────────────────────────────
async function getPackages(): Promise<string[]> {
  try {
    const { stdout } = await execAsync("dpkg -l 2>/dev/null | awk '/^ii/{print $2}' | head -100");
    return stdout.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

// ─── Users & Groups ────────────────────────────────────────────────────────────
async function getUsers() {
  try {
    const { stdout } = await execAsync("getent passwd | awk -F: '{print $1\":\"$3\":\"$6}'");
    return stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [username, uid, home] = line.split(":");
        return { username, uid, home };
      });
  } catch {
    return [];
  }
}

async function getGroups() {
  try {
    const { stdout } = await execAsync("getent group | awk -F: '{print $1\":\"$3}'");
    return stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [groupname, gid] = line.split(":");
        return { groupname, gid };
      });
  } catch {
    return [];
  }
}

// ─── News feeds via RSS ────────────────────────────────────────────────────────
const newsCache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 3600_000;

async function fetchRSS(url: string): Promise<{ title: string; link: string; summary: string }[]> {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "HackerCockpit/2.0" },
      signal: AbortSignal.timeout(8000),
    });
    const text = await resp.text();
    const items: { title: string; link: string; summary: string }[] = [];
    const matches = text.matchAll(/<item>([\s\S]*?)<\/item>/g);
    for (const m of matches) {
      const block = m[1];
      const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] || block.match(/<title>(.*?)<\/title>/)?.[1] || "";
      const link = block.match(/<link>(.*?)<\/link>/)?.[1] || block.match(/<guid>(https?:\/\/[^<]+)<\/guid>/)?.[1] || "";
      const summary = block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1]?.replace(/<[^>]+>/g, "").slice(0, 200) ||
        block.match(/<description>([\s\S]*?)<\/description>/)?.[1]?.replace(/<[^>]+>/g, "").slice(0, 200) || "";
      if (title) items.push({ title: title.trim(), link: link.trim(), summary: summary.trim() });
      if (items.length >= 8) break;
    }
    return items;
  } catch {
    return [];
  }
}

async function getCachedNews(key: string, urls: string[]) {
  const cached = newsCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;
  const results = await Promise.all(urls.map(fetchRSS));
  const data = results.flat().slice(0, 12);
  newsCache.set(key, { data, ts: Date.now() });
  return data;
}

// ─── HTTP Router ───────────────────────────────────────────────────────────────
async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  // Static files
  if (path.startsWith("/public/")) {
    const filePath = join(PUBLIC_DIR, path.replace("/public/", ""));
    if (existsSync(filePath)) {
      const ext = filePath.split(".").pop() || "";
      const types: Record<string, string> = { css: "text/css", js: "application/javascript", png: "image/png", svg: "image/svg+xml" };
      return new Response(Bun.file(filePath), { headers: { "Content-Type": types[ext] || "text/plain" } });
    }
  }

  // Logo
  if (path === "/logo") {
    const logoPath = "/usr/share/HackerOS/ICONS/HackerOS.png";
    if (existsSync(logoPath)) {
      return new Response(Bun.file(logoPath), { headers: { "Content-Type": "image/png" } });
    }
    return new Response("", { status: 404 });
  }

  // JSON API endpoints
  if (path === "/api/system") {
    const info = await getSystemInfo();
    return Response.json(info);
  }

  if (path === "/api/services" && req.method === "POST") {
    const body = await req.text();
    const params = new URLSearchParams(body);
    const name = params.get("service_name") || "";
    const action = params.get("action") || "";
    if (!validateInput(name) || !["start", "stop", "restart"].includes(action)) {
      return Response.json({ status: "error", message: "Invalid input" });
    }
    try {
      await execAsync(`sudo systemctl ${action} ${name}`);
      return Response.json({ status: "success", message: `Service ${name} ${action}ed` });
    } catch (e) {
      return Response.json({ status: "error", message: String(e) });
    }
  }

  if (path === "/api/terminal" && req.method === "POST") {
    const body = await req.text();
    const params = new URLSearchParams(body);
    const command = params.get("command") || "";
    if (!command || command.length > 500) {
      return Response.json({ status: "error", message: "Invalid command" });
    }
    // Block dangerous patterns
    const blocked = /\b(rm\s+-rf|mkfs|dd\s+if=|:(){ :|:& };:)\b/i;
    if (blocked.test(command)) {
      return Response.json({ status: "error", message: "Command blocked for safety" });
    }
    try {
      const { stdout, stderr } = await execAsync(command, { timeout: 30000 });
      return Response.json({ status: "success", output: stdout + stderr });
    } catch (e: unknown) {
      const err = e as { stdout?: string; stderr?: string; message?: string };
      return Response.json({ status: "error", output: (err.stdout || "") + (err.stderr || err.message || "") });
    }
  }

  if (path === "/api/pentest" && req.method === "POST") {
    const body = await req.text();
    const params = new URLSearchParams(body);
    const tool = params.get("tool") || "";
    const target = params.get("target") || "";
    if (!["nmap", "nikto"].includes(tool) || !validateInput(target, 200, /^[\w.\-:\/]+$/)) {
      return Response.json({ status: "error", message: "Invalid input" });
    }
    try {
      const cmd = tool === "nmap" ? `nmap -sV --open ${target}` : `nikto -h ${target}`;
      const { stdout, stderr } = await execAsync(cmd, { timeout: 300000 });
      return Response.json({ status: "success", result: stdout + stderr });
    } catch (e: unknown) {
      const err = e as { stdout?: string; stderr?: string; message?: string };
      return Response.json({ status: "success", result: (err.stdout || "") + (err.stderr || err.message || "") });
    }
  }

  if (path === "/api/packages" && req.method === "POST") {
    const body = await req.text();
    const params = new URLSearchParams(body);
    const name = params.get("package_name") || "";
    const action = params.get("action") || "";
    if (!validateInput(name) || !["install", "remove"].includes(action)) {
      return Response.json({ status: "error", message: "Invalid input" });
    }
    try {
      await execAsync(`sudo DEBIAN_FRONTEND=noninteractive apt-get ${action === "install" ? "install -y" : "remove -y"} ${name}`);
      return Response.json({ status: "success", message: `Package ${name} ${action}ed` });
    } catch (e) {
      return Response.json({ status: "error", message: String(e) });
    }
  }

  if (path === "/api/logs") {
    const logFile = url.searchParams.get("file") || "/var/log/syslog";
    const allowed = ["/var/log/syslog", "/var/log/auth.log", "/var/log/kern.log", "/var/log/dpkg.log"];
    const safeLog = allowed.includes(logFile) ? logFile : "/var/log/syslog";
    const logs = await getLogs(safeLog);
    return Response.json({ logs });
  }

  if (path === "/api/files") {
    const dirPath = url.searchParams.get("path") || "/";
    const files = listFiles(dirPath);
    return Response.json({ files, path: dirPath });
  }

  if (path === "/api/network") {
    const net = await getNetworkInfo();
    return Response.json({ connections: net });
  }

  if (path === "/api/diagnostics") {
    const diag = await runDiagnostics();
    return Response.json(diag);
  }

  if (path === "/api/news/gaming") {
    const news = await getCachedNews("gaming", [
      "https://www.ign.com/rss/articles.xml",
      "https://www.gamespot.com/feeds/news/",
    ]);
    return Response.json({ news });
  }

  if (path === "/api/news/cybersecurity") {
    const news = await getCachedNews("cybersecurity", [
      "https://thehackernews.com/feeds/posts/default",
      "https://krebsonsecurity.com/feed/",
    ]);
    return Response.json({ news });
  }

  // Page routes — all served as single SPA shell
  const pages = ["/", "/services", "/logs", "/files", "/packages", "/users", "/pentest", "/search", "/gaming", "/cybersecurity", "/network", "/diagnostics", "/terminal"];
  if (pages.includes(path)) {
    const html = readFileSync(join(TEMPLATES_DIR, "app.html"), "utf8");
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  return new Response("404 Not Found", { status: 404 });
}

// ─── Start ────────────────────────────────────────────────────────────────────
console.log(`\x1b[32m[HackerCockpit]\x1b[0m Starting on port ${PORT}...`);
serve({
  port: PORT,
  hostname: "0.0.0.0",
  fetch: handleRequest,
});
console.log(`\x1b[32m[HackerCockpit]\x1b[0m Running at http://0.0.0.0:${PORT}`);
