import WebSocket from "ws";
import fetch from "node-fetch";

export async function startTunnel(localPort, tunnelServer, clientId) {
  const ws = new WebSocket(`${tunnelServer}?id=${clientId}`);

  ws.on("open", () => {
    console.log(`
🚀 Tunnel active!
🔗 Public URL: ${tunnelServer.replace("wss", "https")}/${clientId}/
↩️ Forwarding → http://localhost:${localPort}
    `);
  });

  ws.on("message", async (data) => {
    const { method, path, query, headers, requestId } = JSON.parse(data);

    try {
      const queryString =
        query && Object.keys(query).length > 0
          ? "?" + new URLSearchParams(query).toString()
          : "";

      const fullUrl = `http://localhost:${localPort}${path}${queryString}`;

      console.log(`🔄 [${requestId}] Fetching: ${fullUrl}`);

      const response = await fetch(fullUrl, {
        method,
        headers,
      });

      const bodyBuffer = await response.buffer();

      const responseHeaders = Object.fromEntries(response.headers.entries());
      delete responseHeaders["content-encoding"];
      delete responseHeaders["transfer-encoding"];
      responseHeaders["content-length"] = bodyBuffer.length.toString();

      const meta = JSON.stringify({
        status: response.status,
        headers: responseHeaders,
        requestId,
      });
      const metaBuffer = Buffer.from(meta, "utf8");

      const lengthBuffer = Buffer.alloc(4);
      lengthBuffer.writeUInt32BE(metaBuffer.length);

      const fullMessage = Buffer.concat([lengthBuffer, metaBuffer, bodyBuffer]);

      ws.send(fullMessage);
    } catch (err) {
      console.error(`❌ [${requestId}] Fetch error: ${err.message}`);

      const errorBody = Buffer.from("Bad Gateway: local server unreachable");
      const errorMeta = JSON.stringify({
        status: 502,
        headers: {
          "content-type": "text/plain",
          "content-length": errorBody.length.toString(),
        },
        requestId,
      });
      const errorMetaBuffer = Buffer.from(errorMeta, "utf8");
      const lengthBuffer = Buffer.alloc(4);
      lengthBuffer.writeUInt32BE(errorMetaBuffer.length);
      const errorMessage = Buffer.concat([
        lengthBuffer,
        errorMetaBuffer,
        errorBody,
      ]);
      ws.send(errorMessage);
    }
  });

  ws.on("close", () => console.log("❌ Tunnel closed"));
  ws.on("error", (err) => console.error("WebSocket error:", err.message));
}
