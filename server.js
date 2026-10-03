import http from "node:http";
import os from "node:os";
import fs from "node:fs";
import { randomBytes } from "node:crypto";

// Bump this, push, and watch the new release take traffic with zero downtime.
const VERSION = "v2";
// Flip to false and deploy to ship a "broken" release: the health gate rejects
// it and the previous release keeps serving. (FAIL_HEALTH=1 does the same.)
const HEALTHY = true;

const PORT = Number(process.env.PORT ?? 3000);
const startedAt = Date.now();
let requests = 0;
// microVMs boot without a hostname, so mint an id per boot to tell replicas apart.
const INSTANCE_ID = randomBytes(3).toString("hex");

// Each replica gets a fun identity (animal + color) derived from its id.
const ANIMALS = ["🦊 fox", "🐙 octopus", "🦉 owl", "🐢 turtle", "🦄 unicorn", "🐝 bee",
  "🦈 shark", "🐧 penguin", "🦖 trex", "🦋 butterfly", "🐼 panda", "🦔 hedgehog",
  "🐳 whale", "🦜 parrot", "🐸 frog", "🦩 flamingo"];
const n = parseInt(INSTANCE_ID, 16);
const NAME = `${ANIMALS[n % ANIMALS.length]}-${INSTANCE_ID}`;
// Distinct hues, none of them red (red squares mean a failed request).
const HUES = [45, 90, 135, 165, 195, 220, 250, 280, 305];
const COLOR = `hsl(${HUES[(n >> 8) % HUES.length]} 70% 55%)`;

const log = (line) => console.log(`[${VERSION} ${INSTANCE_ID}] ${line}`);
const html = fs.readFileSync(new URL("./page.html", import.meta.url));

// Everything here is per-instance: on Synteq each replica is its own microVM,
// so instance id, kernel and OS uptime differ between replicas.
const info = () => ({
  version: VERSION,
  instance: INSTANCE_ID,
  name: NAME,
  color: COLOR,
  kernel: os.release(),
  cpus: os.cpus().length,
  memoryMb: Math.round(os.totalmem() / 1024 / 1024),
  vmUptimeSec: Math.round(os.uptime()),
  appUptimeSec: Math.round((Date.now() - startedAt) / 1000),
  requestsServed: requests,
});

const send = (res, status, type, body) => {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
};

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");
  const t0 = process.hrtime.bigint();

  if (pathname === "/healthz") { // keep probe noise out of the logs
    const ok = HEALTHY && process.env.FAIL_HEALTH !== "1";
    return send(res, ok ? 200 : 500, "application/json", JSON.stringify({ ok, version: VERSION }));
  }

  res.on("finish", () => {
    const ms = (Number(process.hrtime.bigint() - t0) / 1e6).toFixed(1);
    log(`${req.method} ${pathname} ${res.statusCode} ${ms}ms`);
  });

  requests++;
  if (pathname === "/api/info") return send(res, 200, "application/json", JSON.stringify(info()));
  if (pathname === "/") return send(res, 200, "text/html; charset=utf-8", html);
  send(res, 404, "application/json", JSON.stringify({ error: "not found" }));
});

server.listen(PORT, () => log(`listening on :${PORT}`));

// Synteq sends SIGTERM and waits 10s when draining an old release.
process.on("SIGTERM", () => {
  log("SIGTERM received, draining");
  server.close(() => process.exit(0));
});
