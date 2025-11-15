import WebSocket from "ws";
import fetch from "node-fetch";

const activeWebSockets = new Map();

function createBinaryMessage(meta, body = Buffer.alloc(0)) {
  const metaBuffer = Buffer.from(JSON.stringify(meta), "utf8");
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(metaBuffer.length);
  return Buffer.concat([lengthBuffer, metaBuffer, body]);
}

async function handleHttpRequest(ws, localPort, clientId, message) {
  const { method, path, query, headers, requestId } = message;

  try {
    const queryString =
      query && Object.keys(query).length > 0
        ? "?" + new URLSearchParams(query).toString()
        : "";
    const fullUrl = `http://localhost:${localPort}${path}${queryString}`;

    const forwardedHeaders = { ...headers };
    forwardedHeaders.host = `localhost:${localPort}`;
    delete forwardedHeaders["x-forwarded-host"];
    delete forwardedHeaders["x-forwarded-proto"];
    delete forwardedHeaders["x-forwarded-for"];
    delete forwardedHeaders.origin;
    delete forwardedHeaders.referer;

    const response = await fetch(fullUrl, {
      method,
      headers: forwardedHeaders,
    });

    let bodyBuffer = await response.buffer();

    const responseHeaders = Object.fromEntries(response.headers.entries());
    delete responseHeaders["content-encoding"];
    delete responseHeaders["transfer-encoding"];

    const contentType = responseHeaders["content-type"] || "";
    const needsPathRewrite =
      contentType.includes("text/html") ||
      contentType.includes("text/javascript") ||
      contentType.includes("application/javascript") ||
      contentType.includes("text/css");

    if (needsPathRewrite) {
      let bodyString = bodyBuffer.toString("utf8");

      bodyString = bodyString.replace(
        /(src|href|action)="\/(?!\/)/g,
        `$1="/${clientId}/`
      );
      bodyString = bodyString.replace(
        /(url\(|url\()"\/(?!\/)/g,
        `$1"/${clientId}/`
      );
      bodyString = bodyString.replace(/(url\(|url\()'\/.*?'/g, (match) =>
        match.replace("url('", `url('/${clientId}`)
      );
      bodyString = bodyString.replace(
        /(import|import\(.*?\))\((["'])\/(?!\/)/g,
        `$1($2/${clientId}/`
      );
      bodyString = bodyString.replace(/":"\/(?!\/)/g, `":/"${clientId}/`);
      bodyString = bodyString.replace(
        /from (["'])\/(?!\/)/g,
        `from $1/${clientId}/`
      );
      bodyString = bodyString.replace(
        /import\((["'])\/(?!\/)/g,
        `import($1/${clientId}/`
      );
      bodyString = bodyString.replace(
        /import (["'])\/(?!\/)/g,
        `import $1/${clientId}/`
      );

      bodyBuffer = Buffer.from(bodyString, "utf8");
      responseHeaders["content-length"] = bodyBuffer.length.toString();
    }

    const meta = {
      type: "HTTP_RESPONSE",
      status: response.status,
      headers: responseHeaders,
      requestId,
    };
    ws.send(createBinaryMessage(meta, bodyBuffer));
  } catch (err) {
    console.error(`❌ [${requestId}] Fetch error: ${err.message}`);

    const errorBody = Buffer.from("Bad Gateway: local server unreachable");
    const meta = {
      type: "HTTP_RESPONSE",
      status: 502,
      headers: {
        "content-type": "text/plain",
        "content-length": errorBody.length.toString(),
      },
      requestId,
    };
    ws.send(createBinaryMessage(meta, errorBody));
  }
}

function handleWebSocketOpen(ws, localPort, message) {
  const { requestId, path } = message;
  const wsUrl = `ws://localhost:${localPort}${path}`;

  try {
    const localWs = new WebSocket(wsUrl);

    localWs.on("open", () => {
      activeWebSockets.set(requestId, localWs);
    });

    localWs.on("message", (msg) => {
      const meta = { type: "WS_DATA", requestId };
      ws.send(createBinaryMessage(meta, msg));
    });

    localWs.on("close", () => {
      activeWebSockets.delete(requestId);
      const meta = { type: "WS_CLOSE", requestId };
      ws.send(createBinaryMessage(meta));
    });

    localWs.on("error", (err) => {
      console.error(
        `[WSS] [${requestId}] Local WebSocket error: ${err.message}`
      );
    });
  } catch (err) {
    console.error(`[WSS] [${requestId}] WS open failed: ${err.message}`);
    const meta = { type: "WS_CLOSE", requestId };
    ws.send(createBinaryMessage(meta));
  }
}

export async function startTunnel(localPort, tunnelServer, clientId) {
  const ws = new WebSocket(`${tunnelServer}?id=${clientId}`);

  ws.on("open", () => {
    console.log(`
Tunnel active
Public URL: ${tunnelServer.replace("wss", "https")}/${clientId}/
Forwarding → http://localhost:${localPort}
    `);
  });

  ws.on("message", async (data) => {
    let message;
    let bodyBuffer;

    try {
      const metaLength = data.readUInt32BE(0);
      const metaJSON = data.subarray(4, 4 + metaLength).toString("utf8");
      message = JSON.parse(metaJSON);
      bodyBuffer = data.subarray(4 + metaLength);
    } catch (e) {
      console.error("Failed to parse binary message:", e);
      return;
    }

    switch (message.type) {
      case "HTTP_REQUEST":
        handleHttpRequest(ws, localPort, clientId, message);
        break;

      case "WS_OPEN":
        handleWebSocketOpen(ws, localPort, message);
        break;

      case "WS_DATA":
        const localWs = activeWebSockets.get(message.requestId);
        if (localWs) localWs.send(bodyBuffer);
        break;

      case "WS_CLOSE":
        const wsToClose = activeWebSockets.get(message.requestId);
        if (wsToClose) {
          wsToClose.close();
          activeWebSockets.delete(message.requestId);
        }
        break;
    }
  });

  ws.on("close", () => console.log("Tunnel closed"));
  ws.on("error", (err) => console.error("WebSocket error:", err.message));
}
