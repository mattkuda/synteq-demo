# synteq-demo

Zero-dependency Node app for demoing Synteq Apps: microVM replicas, zero-downtime deploys and the health gate.

**Roll Call** (`/`) polls the API every 500 ms and draws one square per request, colored by the microVM that answered. Scale up and the strip fills with new colors; deploy a new `VERSION` and a labeled divider appears with no red squares.

- `GET /` serves the Roll Call page (`page.html`)
- `GET /api/info` returns JSON: version, instance, name, color, kernel, vCPUs, memory, uptimes, requests served
- `GET /healthz` returns 200, or 500 when `HEALTHY = false` in `server.js` or `FAIL_HEALTH=1` is set
- Edit `VERSION` (e.g. `"v2"`) to ship a new release; set `HEALTHY` to `false` to ship a deliberately broken one

Run locally: `npm start` (port from `PORT`, default 3000)
