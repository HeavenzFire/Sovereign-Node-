import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { TrinaryDecider } from "./src/lib/trinary-decide";
import { SyntropicEngine } from "./src/lib/syntropic-engine";
import { zylpha } from "./src/lib/zylpha-kernel";

async function startServer() {
  const app = express();
  const PORT = 3000;
  const server = createServer(app);
  const wss = new WebSocketServer({ server });

  app.use(express.json());

  const decider = new TrinaryDecider();
  const engine = new SyntropicEngine();

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  /**
   * ZYLPHA Bridge v2.4: The /seal Endpoint.
   * "Word into Flesh" gateway.
   * Operates in "11th Hour Stillness" (no logging).
   */
  app.post("/seal", (req, res) => {
    const { data } = req.body;
    if (!data) return res.status(400).json({ error: "No data provided" });
    
    const signature = zylpha.seal(data);
    res.json({ 
      signature, 
      status: "SEALED",
      compression: zylpha.getCompressionStatus()
    });
  });

  app.get("/api/vault", (req, res) => {
    res.json({ 
      latest: zylpha.getLatestSeal(),
      count: zylpha.getVault().length,
      compression: zylpha.getCompressionStatus(),
      history: zylpha.getVault().slice(-10) // Last 10 for performance
    });
  });

  app.post("/api/trinary/decide", async (req, res) => {
    try {
      const action = req.body;
      const result = await decider.decide(action);
      res.json(result);
    } catch (error: any) {
      console.error("Trinary decision error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Global Mesh Simulation
  app.get("/api/mesh/nodes", (req, res) => {
    res.json([
      { id: "node-001", status: "online", sigma: 2.0, location: "US-EAST-1" },
      { id: "node-002", status: "online", sigma: 1.8, location: "EU-WEST-2" },
      { id: "node-003", status: "offline", sigma: 0.0, location: "AP-SOUTH-1" },
      { id: "node-004", status: "online", sigma: 2.1, location: "SA-EAST-1" },
    ]);
  });

  // WebSocket for Syntropic Engine
  wss.on("connection", (ws: WebSocket) => {
    console.log("New mesh connection established.");

    ws.on("message", async (message: string) => {
      const data = JSON.parse(message);
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
      }
    });

    ws.on("close", () => {
      engine.stop();
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
