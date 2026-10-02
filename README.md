# synteq-demo

Tiny zero-dependency Node API used to demo Synteq Apps: deploys, the health gate, rollbacks, logs and replicas.

- `/` shows which instance answered (instance id, kernel, VM boot time)
- `/api/info` is the same data as JSON
- `/healthz` returns 200, or 500 when `FAIL_HEALTH=1` (to ship a deliberately broken release)

Run locally: `npm start`
