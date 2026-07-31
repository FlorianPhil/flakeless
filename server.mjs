import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const envPath = join(root, ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

async function handleApi(req, res, url) {
  const parts = url.pathname.replace(/^\/api\//, "").split("/");
  const file = join(root, "api", ...parts) + ".js";
  if (!existsSync(file)) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  let body = null;
  if (req.method !== "GET" && req.method !== "HEAD") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = {};
    }
  }

  const fakeReq = {
    method: req.method,
    body,
    query: Object.fromEntries(url.searchParams),
    headers: req.headers,
  };
  const fakeRes = {
    statusCode: 200,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      const payload = JSON.stringify(data);
      res.writeHead(this.statusCode, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        ...this.headers,
      });
      res.end(payload);
    },
    end(data) {
      res.writeHead(this.statusCode, this.headers);
      res.end(data ?? "");
    },
  };

  const mod = await import(pathToFileURL(file).href + `?t=${Date.now()}`);
  await mod.default(fakeReq, fakeRes);
}

function serveStatic(req, res, url) {
  const dist = join(root, "dist");
  let path = url.pathname === "/" ? "/index.html" : url.pathname;
  let file = join(dist, path);
  if (!existsSync(file) || (existsSync(file) && statSync(file).isDirectory())) {
    file = join(dist, "index.html");
  }
  if (!existsSync(file)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
}

const apiPort = Number(process.env.FLAKELESS_API_PORT || 4174);
const staticMode = process.argv.includes("--static");
const port = staticMode ? Number(process.env.PORT || 4173) : apiPort;

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    if (staticMode) {
      serveStatic(req, res, url);
      return;
    }
    res.writeHead(404);
    res.end("API only. Run vite for UI, or node server.mjs --static after build.");
  } catch (err) {
    console.error(err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: String(err?.message || err) }));
  }
}).listen(port, "127.0.0.1", () => {
  console.log(
    staticMode
      ? `Flakeless http://127.0.0.1:${port}`
      : `Flakeless API http://127.0.0.1:${port}`
  );
});
