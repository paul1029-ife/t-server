import express from "express";
import { WebSocketServer } from "ws";
import httpProxy from "http-proxy";
import http from "http";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const proxy = httpProxy.createProxyServer({});
const clients = new Map();

wss.on("connection", (ws, req) => {
  const clientId = new URL(
    req.url,
    `http://${req.headers.host}`
  ).searchParams.get("id");

  if (!clientId) {
    console.warn("Client connection rejected: No ID provided in query.");
    ws.close();
    return;
  }

  clients.set(clientId, ws);
  console.log(`🔌 Client connected: ${clientId}`);

  ws.on("close", () => {
    clients.delete(clientId);
    console.log(`❌ Client disconnected: ${clientId}`);
  });
});

app.use("/:id", (req, res) => {
  const client = clients.get(req.params.id);
  if (!client) {
    console.log(`Request for unknown ID: ${req.params.id}`);
    return res.status(404).send("Tunnel not active");
  }

  console.log(
    `📥 ${req.method} ${req.path}${
      req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : ""
    }`
  );

  const payload = {
    method: req.method,
    path: req.path,
    query: req.query,
    headers: req.headers,
  };

  client.send(JSON.stringify(payload));

  client.once("message", (msg) => {
    try {
      const { status, headers, body } = JSON.parse(msg.toString());

      const bodyBuffer = Buffer.from(body, "base64");

      console.log(`📤 Response: ${status} (${bodyBuffer.length} bytes)`);

      res.writeHead(status, headers);
      res.end(bodyBuffer);
    } catch (e) {
      console.error("Error parsing message from client:", e);
      res.status(500).send("Error processing client response.");
    }
  });
});

app.get("/", (req, res) => {
  res.send(`Tunnel server is active. ${clients.size} client(s) connected.`);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Tunnel server running on port ${PORT}`);
});
