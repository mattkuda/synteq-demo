import http from "node:http";
import os from "node:os";
import { randomBytes } from "node:crypto";

// Bump this, push, and watch the new release take traffic with zero downtime.
const VERSION = "v1";
const COLOR = "#e5533d";

const PORT = Number(process.env.PORT ?? 3000);
const startedAt = Date.now();
let requests = 0;
// microVMs boot without a hostname, so mint an id per boot to tell replicas apart.
const INSTANCE_ID = randomBytes(3).toString("hex");

// Everything here is per-instance: on Synteq each replica is its own microVM,
// so instance id, kernel and OS uptime differ between replicas.
const instance = () => ({
  version: VERSION,
  instance: INSTANCE_ID,
  kernel: os.release(),
  cpus: os.cpus().length,
  memoryMb: Math.round(os.totalmem() / 1024 / 1024),
  vmUptimeSec: Math.round(os.uptime()),
  appUptimeSec: Math.round((Date.now() - startedAt) / 1000),
  requestsServed: requests,
  greeting: process.env.GREETING ?? "Hello from Synteq",
});

const log = (fields) => console.log(JSON.stringify({ ts: new Date().toISOString(), ...fields }));

const page = (i) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>synteq-demo ${i.version}</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#111;color:#eee;font:16px/1.5 ui-monospace,Menlo,monospace}
  main{padding:32px;max-width:560px;width:100%;box-sizing:border-box}
  h1{font-size:44px;margin:0 0 4px;color:${COLOR}}
  p{margin:0 0 24px;color:#999}
  table{width:100%;border-collapse:collapse}
  td{padding:8px 0;border-top:1px solid #2a2a2a}
  td:last-child{text-align:right;color:#fff}
</style></head><body><main>
<h1>${i.greeting} · ${i.version}</h1>
<p>Refresh to see which instance answered.</p>
<table>
  <tr><td>instance</td><td>${i.instance}</td></tr>
  <tr><td>kernel</td><td>${i.kernel}</td></tr>
  <tr><td>vCPUs / memory</td><td>${i.cpus} / ${i.memoryMb} MB</td></tr>
  <tr><td>VM booted</td><td>${i.vmUptimeSec}s ago</td></tr>
  <tr><td>app started</td><td>${i.appUptimeSec}s ago</td></tr>
  <tr><td>requests served</td><td>${i.requestsServed}</td></tr>
</table>
</main></body></html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const t0 = process.hrtime.bigint();
  res.on("finish", () => {
    if (url.pathname === "/healthz") return; // keep probe noise out of the logs
    log({ level: "info", method: req.method, path: url.pathname, status: res.statusCode,
      ms: Number(process.hrtime.bigint() - t0) / 1e6, instance: INSTANCE_ID });
  });

  if (url.pathname === "/healthz") {
    // Set FAIL_HEALTH=1 to ship a "broken" release: the health gate rejects it
    // and the previous release keeps serving.
    const ok = process.env.FAIL_HEALTH !== "1";
    res.writeHead(ok ? 200 : 500, { "content-type": "application/json" });
    return res.end(JSON.stringify({ ok, version: VERSION }));
  }

  requests++;
  if (url.pathname === "/api/info") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify(instance(), null, 2));
  }
  if (url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(page(instance()));
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, () => log({ level: "info", msg: "listening", port: PORT, version: VERSION }));

// Synteq sends SIGTERM and waits 10s when draining an old release.
process.on("SIGTERM", () => {
  log({ level: "info", msg: "SIGTERM received, draining" });
  server.close(() => process.exit(0));
});
