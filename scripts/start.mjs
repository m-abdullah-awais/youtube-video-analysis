// Runs the app in production mode for everyday use:
// installs dependencies into this folder when needed, rebuilds only when the
// code changed, starts the server and opens the browser.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const port = Number(process.env.PORT) || 3000;
const url = `http://localhost:${port}`;
const isWindows = process.platform === "win32";

const step = (n, message) => console.log(`\n[${n}/4] ${message}`);
const note = (message) => console.log(`      ${message}`);

/** Runs an npm command line (fixed strings only, never user input) and stops on failure. */
function run(commandLine) {
  const result = spawnSync(commandLine, { cwd: root, stdio: "inherit", shell: true });
  if (result.status !== 0) {
    console.error(`\n"${commandLine}" failed. See the messages above.`);
    process.exit(result.status ?? 1);
  }
}

const mtime = (file) => {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
};

/** Newest modification time of any file under the given paths. */
function newest(paths) {
  let latest = 0;
  const walk = (p) => {
    let stat;
    try {
      stat = fs.statSync(p);
    } catch {
      return;
    }
    if (stat.isDirectory()) for (const entry of fs.readdirSync(p)) walk(path.join(p, entry));
    else latest = Math.max(latest, stat.mtimeMs);
  };
  for (const p of paths) walk(path.join(root, p));
  return latest;
}

async function isRunning() {
  try {
    const response = await fetch(`${url}/api/vidiq/status`, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

function openBrowser() {
  if (process.env.NO_BROWSER) return;
  const opener = isWindows ? ["cmd", ["/c", "start", "", url]] : [process.platform === "darwin" ? "open" : "xdg-open", [url]];
  spawn(opener[0], opener[1], { stdio: "ignore", detached: true }).unref();
}

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(`Node.js 22.13 or later is required (found ${process.versions.node}). Download it from https://nodejs.org`);
  process.exit(1);
}

if (await isRunning()) {
  console.log(`\nVideo Summaries is already running. Opening ${url}`);
  openBrowser();
  process.exit(0);
}

step(2, "Checking app dependencies...");
if (mtime(path.join(root, "node_modules/.package-lock.json")) < mtime(path.join(root, "package-lock.json"))) {
  note("DOWNLOADING and INSTALLING app dependencies into this folder (node_modules).");
  note("This happens on the first run only and can take a few minutes. Nothing is installed globally.");
  run("npm ci --no-audit --no-fund");
  note("Dependencies installed.");
} else {
  note("Already installed.");
}

step(3, "Checking the app build...");
const sources = ["src", "public", "package.json", "next.config.ts", "postcss.config.mjs", "tsconfig.json"];
if (mtime(path.join(root, ".next/BUILD_ID")) < newest(sources)) {
  note("BUILDING an optimized version of the app (first run or after code changes, about a minute)...");
  run("npm run build");
  note("Build finished.");
} else {
  note("Up to date, no build needed.");
}

step(4, `Starting Video Summaries at ${url} ...`);
// Listen on this computer only: the app has no login and holds the vidIQ connection.
const server = spawn(`npm run start -- --hostname localhost --port ${port}`, {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: { ...process.env, NODE_ENV: "production", NODE_NO_WARNINGS: "1", NEXT_TELEMETRY_DISABLED: "1" },
});

for (let i = 0; i < 60 && !(await isRunning()); i++) await new Promise((r) => setTimeout(r, 500));
if (await isRunning()) {
  console.log(`\n  Ready: ${url}`);
  console.log("  Opening it in your browser. Keep this window open while you use the app; close it to stop the app.\n");
  openBrowser();
}

server.on("exit", (code) => process.exit(code ?? 0));
