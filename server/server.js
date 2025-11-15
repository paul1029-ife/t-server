import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import crypto from "crypto";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
const clients = new Map();

function createBinaryMessage(meta, body = Buffer.alloc(0)) {
  const metaBuffer = Buffer.from(JSON.stringify(meta), "utf8");
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(metaBuffer.length);
  return Buffer.concat([lengthBuffer, metaBuffer, body]);
}

wss.on("connection", (ws, req, clientId) => {
  console.log(`🔌 Client connected: ${clientId}`);

  const clientData = {
    ws,
    pendingHttpRequests: new Map(),
    pendingWebSockets: new Map(),
  };
  clients.set(clientId, clientData);

  ws.on("message", (msg) => {
    console.log(`[SERVER] Received message from client (${msg.length} bytes).`);
    try {
      const metaLength = msg.readUInt32BE(0);
      const metaJSON = msg.subarray(4, 4 + metaLength).toString("utf8");
      const meta = JSON.parse(metaJSON);
      const bodyBuffer = msg.subarray(4 + metaLength);

      switch (meta.type) {
        case "HTTP_RESPONSE": {
          const { status, headers, requestId } = meta;
          console.log(
            `[${requestId}] HTTP_RESPONSE received. Looking for pending request.`
          );
          const res = clientData.pendingHttpRequests.get(requestId);
          if (!res) {
            console.warn(
              `[${requestId}] HTTP_RESPONSE received, but NO pending request found!`
            );
            return;
          }

          if (!res) return;

          console.log(
            `📤 [${requestId}] Response: ${status} (${bodyBuffer.length} bytes)`
          );
          res.writeHead(status, headers);
          res.end(bodyBuffer);
          clientData.pendingHttpRequests.delete(requestId);
          break;
        }

        case "WS_DATA": {
          const { requestId } = meta;
          const browserWs = clientData.pendingWebSockets.get(requestId);
          if (browserWs) {
            browserWs.send(bodyBuffer);
          }
          break;
        }

        case "WS_CLOSE": {
          const { requestId } = meta;
          const browserWs = clientData.pendingWebSockets.get(requestId);
          if (browserWs) {
            browserWs.close();
            clientData.pendingWebSockets.delete(requestId);
          }
          break;
        }
      }
    } catch (e) {
      console.error("[SERVER] Error parsing message from client:", e);
    }
  });

  ws.on("close", () => {
    clientData.pendingHttpRequests.forEach((res) => {
      res.status(503).send("Tunnel client disconnected.");
    });
    clientData.pendingWebSockets.forEach((ws) => {
      ws.close();
    });
    clients.delete(clientId);
    console.log(`❌ Client disconnected: ${clientId}`);
  });
});

app.use("/:id", (req, res) => {
  const clientData = clients.get(req.params.id);
  if (!clientData) {
    console.log(`Request for unknown ID: ${req.params.id}`);
    return res.status(404).send("Tunnel not active");
  }

  const requestId = crypto.randomBytes(12).toString("hex");
  console.log(`📥 [${requestId}] ${req.method} ${req.path}`);

  const payload = {
    type: "HTTP_REQUEST",
    requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    headers: req.headers,
  };

  clientData.pendingHttpRequests.set(requestId, res);
  clientData.ws.send(createBinaryMessage(payload));
});

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const clientId = url.searchParams.get("id");

  if (clientId) {
    const clientData = clients.get(clientId);
    if (clientData) {
      console.warn(`Client ${clientId} already connected.`);
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req, clientId);
    });
    return;
  }

  const clientIdFromPath = url.pathname.split("/")[1];
  const clientData = clients.get(clientIdFromPath);

  if (!clientData) {
    console.warn(`[WSS] No client for path: ${clientIdFromPath}`);
    socket.destroy();
    return;
  }

  const wsRequestId = crypto.randomBytes(12).toString("hex");
  console.log(
    `[WSS] [${wsRequestId}] Browser WS connecting for ${clientIdFromPath}`
  );

  clientData.ws.send(
    createBinaryMessage({
      type: "WS_OPEN",
      requestId: wsRequestId,
      path: url.pathname.replace(`/${clientIdFromPath}`, "") + url.search,
    })
  );

  wss.handleUpgrade(req, socket, head, (browserWs) => {
    clientData.pendingWebSockets.set(wsRequestId, browserWs);

    browserWs.on("message", (msg) => {
      const meta = JSON.stringify({
        type: "WS_DATA",
        requestId: wsRequestId,
      });
      const metaBuffer = Buffer.from(meta, "utf8");
      const lengthBuffer = Buffer.alloc(4);
      lengthBuffer.writeUInt32BE(metaBuffer.length);

      const fullMessage = Buffer.concat([lengthBuffer, metaBuffer, msg]);
      clientData.ws.send(fullMessage);
    });

    browserWs.on("close", () => {
      clientData.pendingWebSockets.delete(wsRequestId);
      clientData.ws.send(
        createBinaryMessage({
          type: "WS_CLOSE",
          requestId: wsRequestId,
        })
      );
    });
  });
});

app.get("/", (req, res) => {
  res.send(`Tunnel server is active. ${clients.size} client(s) connected.`);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Tunnel server running on port ${PORT}`);
});
