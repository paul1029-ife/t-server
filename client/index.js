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
    const { method, path, headers } = JSON.parse(data);

    try {
      const response = await fetch(`http://localhost:${localPort}${path}`, {
        method,
        headers,
      });

      const body = await response.buffer();

      const responseHeaders = Object.fromEntries(response.headers.entries());
      delete responseHeaders["content-encoding"];
      delete responseHeaders["transfer-encoding"];

      responseHeaders["content-length"] = body.length.toString();

      ws.send(
        JSON.stringify({
          status: response.status,
          headers: responseHeaders,
          body: body.toString("base64"),
        })
      );
    } catch (err) {
      ws.send(
        JSON.stringify({
          status: 502,
          headers: { "content-type": "text/plain" },
          body: Buffer.from("Bad Gateway: local server unreachable").toString(
            "base64"
          ),
        })
      );
    }
  });

  ws.on("close", () => console.log("❌ Tunnel closed"));
  ws.on("error", (err) => console.error("WebSocket error:", err.message));
}
