import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { TrinaryDecider } from "./src/lib/trinary-decide";
import { SyntropicEngine } from "./src/lib/syntropic-engine";
import { zylpha } from "./src/lib/zylpha-kernel";

const startedAt = Date.now();
const NODE_ID = process.env.HEAVENZFIRE_NODE_ID || "sovereign-node-local";
const VERSION = process.env.npm_package_version || "0.0.0";

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);
  const server = createServer(app);
  const wss = new WebSocketServer({ server });

  // Bound request bodies to reduce accidental or hostile memory exhaustion.
  app.use(express.json({ limit: "256kb" }));

  const decider = new TrinaryDecider();
  const engine = new SyntropicEngine();

  const capabilities = [
    { name: "health.read", version: "1.0.0", approval_required: false },
    { name: "capabilities.read", version: "1.0.0", approval_required: false },
    { name: "vault.read", version: "1.0.0", approval_required: false },
    { name: "seal.create", version: "1.0.0", approval_required: true },
    { name: "trinary.decide", version: "1.0.0", approval_required: true },
    { name: "engine.stream", version: "1.0.0", approval_required: true }
  ];

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
        engine.start(
          (metrics) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "METRICS", data: metrics }));
            }
          },
          (validation) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "REASONING", data: validation }));
            }
          }
        );
      } else if (data.type === "STOP_ENGINE") {
        engine.stop();
      } else {
        ws.send(JSON.stringify({ type: "ERROR", error: "Unsupported message type" }));
      }
    });

    ws.on("close", () => engine.stop());
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
