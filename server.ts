import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { TrinaryDecider } from "./src/lib/trinary-decide";
import { SyntropicEngine } from "./src/lib/syntropic-engine";
import { zylpha } from "./src/lib/zylpha-kernel";
import { UNIFIED_FIELD_CAPABILITIES, isValidTaskEnvelope, requiresApproval } from "./src/lib/unified-field-contract";
import { UnifiedFieldRegistry } from "./src/lib/unified-field-registry";
import { DurableTaskLedger } from "./src/lib/durable-task-ledger";
import { hasValidApprovalToken } from "./src/lib/approval-gate";

const startedAt = Date.now();
const NODE_ID = process.env.HEAVENZFIRE_NODE_ID || "sovereign-node-local";
const VERSION = process.env.npm_package_version || "0.0.0";
const isApprovalAuthorized = (provided: unknown) =>
  hasValidApprovalToken(provided, process.env.HEAVENZFIRE_APPROVAL_TOKEN);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);
  const server = createServer(app);
  const MAX_WS_PAYLOAD_BYTES = 64 * 1024;
  const wss = new WebSocketServer({ server, maxPayload: MAX_WS_PAYLOAD_BYTES });

  // Bound request bodies to reduce accidental or hostile memory exhaustion.
  app.use(express.json({ limit: "256kb" }));

  const decider = new TrinaryDecider();
  const engine = new SyntropicEngine();
  // The engine is a singleton: one WebSocket owns the active stream at a time.
  let engineOwner: WebSocket | null = null;
  let engineRun: Promise<void> | null = null;
  // Process-local registry. This is live only for nodes registered with this process;
  // the server remains loopback-bound until a separately secured remote transport is implemented.
  const registry = new UnifiedFieldRegistry(Number(process.env.HEAVENZFIRE_HEARTBEAT_TTL_MS || 15_000));
  const taskLeaseMs = Number(process.env.HEAVENZFIRE_TASK_LEASE_MS || 15_000);
  const taskLedger = new DurableTaskLedger(
    process.env.HEAVENZFIRE_TASK_LEDGER_PATH || path.resolve(process.cwd(), "data", "tasks.json"),
    { leaseMs: taskLeaseMs }
  );
  const leaseReaper = setInterval(() => {
    void taskLedger.reapExpiredLeases().catch(() => undefined);
  }, Math.max(1_000, Math.min(5_000, taskLeaseMs)));
  leaseReaper.unref();

  const capabilities = UNIFIED_FIELD_CAPABILITIES;

  // API routes FIRST. Health is a local process observation, not mesh-wide proof.
  const healthHandler = (_req: express.Request, res: express.Response) => {
    res.json({
      status: "ok",
      node_id: NODE_ID,
      version: VERSION,
      uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
      capabilities: capabilities.map((item) => item.name),
      observed_at: new Date().toISOString()
    });
  };
  app.get("/health", healthHandler);
  app.get("/api/health", healthHandler);

  app.get("/api/capabilities", (_req, res) => {
    res.json({ schema_version: "1.0.0", node_id: NODE_ID, capabilities });
  });


  // Validate and classify a proposed task without executing it.
  // Approval-required tasks are reported, never silently executed here.
  app.post("/api/tasks/validate", (req, res) => {
    if (!isValidTaskEnvelope(req.body)) {
      return res.status(400).json({ valid: false, error: "Invalid task envelope or unknown capability" });
    }

    const approvalRequired = requiresApproval(req.body.capability);
    res.json({
      valid: true,
      task_id: req.body.task_id,
      capability: req.body.capability,
      approval_required: approvalRequired,
      execution: "not_started",
      deadline: req.body.deadline
    });
  });

  // Durable task ledger. Enqueueing approval-sensitive work is gated;
  // claim is restricted to a fresh local-registry node with the needed capability.
  const sendLedgerError = (res: express.Response, error: unknown) => {
    const message = error instanceof Error ? error.message : "Task ledger operation failed";
    const status = /Task not found/.test(message) ? 404
      : /stale|expired|not queued|must be running|not leased|retry budget|owner/.test(message) ? 409
      : 400;
    return res.status(status).json({ error: message });
  };

  app.post("/api/tasks", async (req, res) => {
    if (!isValidTaskEnvelope(req.body)) {
      return res.status(400).json({ error: "Invalid or expired task envelope" });
    }
    if (requiresApproval(req.body.capability) &&
        !isApprovalAuthorized(req.get("x-heavenzfire-approval"))) {
      return res.status(403).json({ error: "Approval credential required or invalid" });
    }
    try {
      const task = await taskLedger.enqueue({
        task_id: req.body.task_id,
        capability: req.body.capability,
        idempotency_key: req.body.idempotency_key,
        deadline: req.body.deadline
      }, req.body.max_attempts);
      return res.status(202).json({ task, execution: "not_started" });
    } catch (error) {
      return sendLedgerError(res, error);
    }
  });

  app.get("/api/tasks", async (_req, res) => {
    try {
      await taskLedger.reapExpiredLeases();
      const tasks = await taskLedger.list();
      return res.json({ count: tasks.length, tasks: tasks.slice(-100) });
    } catch (error) {
      return sendLedgerError(res, error);
    }
  });

  app.get("/api/tasks/:taskId", async (req, res) => {
    try {
      const task = await taskLedger.get(req.params.taskId);
      if (!task) return res.status(404).json({ error: "Task not found" });
      return res.json({ task });
    } catch (error) {
      return sendLedgerError(res, error);
    }
  });

  app.post("/api/tasks/:taskId/claim", async (req, res) => {
    const workerId = req.body?.worker_id;
    if (typeof workerId !== "string") return res.status(400).json({ error: "Expected worker_id" });
    try {
      await taskLedger.reapExpiredLeases();
      const candidate = registry.list().find((node) => node.id === workerId && node.status === "healthy");
      if (!candidate) return res.status(409).json({ error: "Worker is not registered with a fresh heartbeat" });
      const queuedTask = await taskLedger.get(req.params.taskId);
      if (!queuedTask) return res.status(404).json({ error: "Task not found" });
      if (!candidate.capabilities.includes(queuedTask.capability)) {
        return res.status(403).json({ error: "Worker lacks the task capability" });
      }
      const task = await taskLedger.claim(req.params.taskId, workerId);
      return res.json({ task, lease: { owner: workerId, fencing_token: task.fencing_token, lease_until_ms: task.lease_until_ms } });
    } catch (error) {
      return sendLedgerError(res, error);
    }
  });

  app.post("/api/tasks/:taskId/start", async (req, res) => {
    const { worker_id: workerId, fencing_token: fencingToken } = req.body ?? {};
    if (typeof workerId !== "string" || !Number.isSafeInteger(fencingToken)) {
      return res.status(400).json({ error: "Expected worker_id and integer fencing_token" });
    }
    try {
      return res.json({ task: await taskLedger.start(req.params.taskId, workerId, fencingToken) });
    } catch (error) {
      return sendLedgerError(res, error);
    }
  });

  app.post("/api/tasks/:taskId/renew", async (req, res) => {
    const { worker_id: workerId, fencing_token: fencingToken } = req.body ?? {};
    if (typeof workerId !== "string" || !Number.isSafeInteger(fencingToken)) {
      return res.status(400).json({ error: "Expected worker_id and integer fencing_token" });
    }
    try {
      return res.json({ task: await taskLedger.renew(req.params.taskId, workerId, fencingToken) });
    } catch (error) {
      return sendLedgerError(res, error);
    }
  });

  app.post("/api/tasks/:taskId/complete", async (req, res) => {
    const { worker_id: workerId, fencing_token: fencingToken, result } = req.body ?? {};
    if (typeof workerId !== "string" || !Number.isSafeInteger(fencingToken) || !Object.prototype.hasOwnProperty.call(req.body ?? {}, "result")) {
      return res.status(400).json({ error: "Expected worker_id, integer fencing_token, and result" });
    }
    try {
      return res.json({ task: await taskLedger.complete(req.params.taskId, workerId, fencingToken, result) });
    } catch (error) {
      return sendLedgerError(res, error);
    }
  });

  app.post("/api/tasks/:taskId/fail", async (req, res) => {
    const { worker_id: workerId, fencing_token: fencingToken, error: failure, retryable } = req.body ?? {};
    if (typeof workerId !== "string" || !Number.isSafeInteger(fencingToken) ||
        typeof failure !== "string" || typeof retryable !== "boolean") {
      return res.status(400).json({ error: "Expected worker_id, integer fencing_token, error, and boolean retryable" });
    }
    try {
      return res.json({ task: await taskLedger.fail(req.params.taskId, workerId, fencingToken, failure, retryable) });
    } catch (error) {
      return sendLedgerError(res, error);
    }
  });

  /**
   * ZYLPHA Bridge: sealing may have external or durable effects; callers should
   * require an explicit approval step before invoking this endpoint.
   */
  app.post("/seal", (req, res) => {
    if (!isApprovalAuthorized(req.get("x-heavenzfire-approval"))) {
      return res.status(403).json({ error: "Approval credential required or invalid" });
    }
    const { data } = req.body ?? {};
    if (data === undefined || data === null || data === "") {
      return res.status(400).json({ error: "No data provided" });
    }

    try {
      const signature = zylpha.seal(data);
      res.json({
        signature,
        status: "SEALED",
        compression: zylpha.getCompressionStatus()
      });
    } catch {
      res.status(500).json({ error: "Seal operation failed" });
    }
  });

  app.get("/api/vault", (_req, res) => {
    res.json({
      latest: zylpha.getLatestSeal(),
      count: zylpha.getVault().length,
      compression: zylpha.getCompressionStatus(),
      history: zylpha.getVault().slice(-10)
    });
  });

  app.post("/api/trinary/decide", async (req, res) => {
    if (!isApprovalAuthorized(req.get("x-heavenzfire-approval"))) {
      return res.status(403).json({ error: "Approval credential required or invalid" });
    }
    try {
      const result = await decider.decide(req.body);
      res.json(result);
    } catch {
      res.status(500).json({ error: "Trinary decision failed" });
    }
  });

  // Process-local live registry routes. The HTTP listener is loopback-only; this is not remote mesh discovery.
  app.get("/api/mesh/live-nodes", (_req, res) => {
    res.json({
      mode: "local-registry",
      live_discovery: false,
      heartbeat_ttl_ms: Number(process.env.HEAVENZFIRE_HEARTBEAT_TTL_MS || 15_000),
      nodes: registry.list()
    });
  });

  app.post("/api/mesh/register", (req, res) => {
    try {
      const { id, capabilities: nodeCapabilities, maxTasks } = req.body ?? {};
      if (typeof id !== "string" || !Array.isArray(nodeCapabilities) || !Number.isInteger(maxTasks)) {
        return res.status(400).json({ error: "Expected id, capabilities[], and integer maxTasks" });
      }
      const node = registry.register({ id, capabilities: nodeCapabilities, maxTasks });
      return res.status(201).json({ registered: true, node });
    } catch (error) {
      return res.status(400).json({
        error: error instanceof Error ? error.message : "Node registration failed"
      });
    }
  });

  app.post("/api/mesh/heartbeat", (req, res) => {
    const id = req.body?.id;
    if (typeof id !== "string") {
      return res.status(400).json({ error: "Expected node id" });
    }
    try {
      const node = registry.heartbeat(id);
      if (!node) return res.status(404).json({ error: "Node is not registered" });
      return res.json({ accepted: true, node });
    } catch (error) {
      return res.status(400).json({
        error: error instanceof Error ? error.message : "Heartbeat rejected"
      });
    }
  });

  app.delete("/api/mesh/live-nodes/:id", (req, res) => {
    const removed = registry.remove(req.params.id);
    if (!removed) return res.status(404).json({ error: "Node is not registered" });
    return res.status(204).end();
  });

  // These entries are fixtures for the UI, not live remote-node observations.
  app.get("/api/mesh/nodes", (_req, res) => {
    res.json({
      mode: "simulation",
      live_discovery: false,
      nodes: [
        { id: "node-001", status: "simulated-online", sigma: 2.0, location: "US-EAST-1" },
        { id: "node-002", status: "simulated-online", sigma: 1.8, location: "EU-WEST-2" },
        { id: "node-003", status: "simulated-offline", sigma: 0.0, location: "AP-SOUTH-1" },
        { id: "node-004", status: "simulated-online", sigma: 2.1, location: "SA-EAST-1" }
      ]
    });
  });

  wss.on("connection", (ws: WebSocket) => {
    ws.on("message", (message) => {
      let data: { type?: string; approval_token?: unknown };
      try {
        data = JSON.parse(message.toString());
      } catch {
        ws.send(JSON.stringify({ type: "ERROR", error: "Invalid JSON message" }));
        return;
      }

      if (data.type === "START_ENGINE") {
        if (!isApprovalAuthorized(data.approval_token)) {
          ws.send(JSON.stringify({ type: "ERROR", error: "APPROVAL_REQUIRED" }));
          return;
        }
        if (engineOwner && engineOwner !== ws) {
          ws.send(JSON.stringify({ type: "ERROR", error: "ENGINE_BUSY" }));
          return;
        }
        if (engineOwner === ws) {
          ws.send(JSON.stringify({ type: "ERROR", error: "ENGINE_ALREADY_OWNED" }));
          return;
        }
        engineOwner = ws;
        try {
          const run = engine.start(
            (metrics) => {
              if (engineOwner === ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "METRICS", data: metrics }));
            },
            (validation) => {
              if (engineOwner === ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "REASONING", data: validation }));
            }
          );
          engineRun = run;
          run.then(() => {
            // Ownership is released only after the prior async loop has settled.
            // STOP/close/error merely request cancellation; they must not permit a
            // second owner to restart the singleton while an old loop is suspended.
            if (engineRun === run) {
              engineRun = null;
              if (engineOwner === ws) engineOwner = null;
              if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ENGINE_COMPLETED" }));
            }
          }).catch(() => {
            if (engineRun === run) {
              engineRun = null;
              if (engineOwner === ws) engineOwner = null;
            }
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ERROR", error: "ENGINE_START_FAILED" }));
          });
          ws.send(JSON.stringify({ type: "ENGINE_STARTED" }));
        } catch {
          engineRun = null;
          engineOwner = null;
          ws.send(JSON.stringify({ type: "ERROR", error: "ENGINE_START_FAILED" }));
        }
      } else if (data.type === "STOP_ENGINE") {
        if (engineOwner !== ws) {
          ws.send(JSON.stringify({ type: "ERROR", error: "NOT_ENGINE_OWNER" }));
          return;
        }
        engine.stop();
        // Keep ownership until engineRun settles; releasing here allows a new START
        // to revive an old loop that is awaiting the reasoning provider or timer.
        ws.send(JSON.stringify({ type: "ENGINE_STOP_REQUESTED" }));
      } else {
        ws.send(JSON.stringify({ type: "ERROR", error: "Unsupported message type" }));
      }
    });

    ws.on("close", () => {
      if (engineOwner === ws) engine.stop();
      // Do not clear engineOwner here. The run promise releases it after settling.
    });
    ws.on("error", () => {
      if (engineOwner === ws) engine.stop();
      // Do not clear engineOwner here. The run promise releases it after settling.
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`Sovereign Node listening on http://127.0.0.1:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Sovereign Node failed to start:", error);
  process.exitCode = 1;
});
