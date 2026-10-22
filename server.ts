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

const startedAt = Date.now();
const NODE_ID = process.env.HEAVENZFIRE_NODE_ID || "sovereign-node-local";
const VERSION = process.env.npm_package_version || "0.0.0";

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

  /**
   * ZYLPHA Bridge: sealing may have external or durable effects; callers should
   * require an explicit approval step before invoking this endpoint.
   */
  app.post("/seal", (req, res) => {
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
      let data: { type?: string };
      try {
        data = JSON.parse(message.toString());
      } catch {
        ws.send(JSON.stringify({ type: "ERROR", error: "Invalid JSON message" }));
        return;
      }

      if (data.type === "START_ENGINE") {
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
