# 🛜 PortPass

**Expose your local server to the internet — instantly.**  
PortPass is a lightweight, zero-config tunneling CLI that lets you share any local development server with a secure public URL (similar to ngrok or localtunnel).

---

## 🚀 Features

- ⚡ One-command setup — no config, no signup
- 🌍 Get a unique public URL for your local port
- 🔁 Bi-directional WebSocket tunneling
- 🔒 Works behind NAT/firewalls
- 🧰 Perfect for webhooks, client demos, or local API testing

---

## 📦 Installation

You can use PortPass without installing globally:

```bash
npx portpass 5173
```

Or install globally:

```bash
npm install -g portpass
```

Or add it as a dev dependency:

```bash
npm install -D portpass
```

---

## 💻 Usage

Start your local server (for example, a Vite app on port `5173`):

```bash
npm run dev
```

Then in a new terminal, run:

```bash
npx portpass 5173
```

You’ll get output like:

```
🚀 Tunnel active!
🔗 Public URL: https://your-tunnel-server.up.railway.app/abc123/
↩️ Forwarding → http://localhost:5173
```

Now you can open that **public URL** or share it with anyone — it’ll route traffic straight to your local server.

---

## ⚙️ Options

| Option           | Description                | Example                                                |
| ---------------- | -------------------------- | ------------------------------------------------------ |
| `<port>`         | Local port to expose       | `portpass 5173`                                        |
| `--server <url>` | Use a custom tunnel server | `portpass 3000 --server wss://myserver.up.railway.app` |

---

## 🧠 How It Works

PortPass uses a simple relay server built with WebSockets.
When you run `portpass`, it:

1. Opens a persistent WebSocket connection to the tunnel server.
2. Forwards incoming HTTP requests from the server to your local app.
3. Sends back responses securely through the same tunnel.

You can deploy your own server (Node.js app using Express + `ws`) for complete control.
See the [Tunnel Server Example](https://github.com/yourusername/portpass-server) for setup instructions.

---

## ☁️ Deploying Your Own Tunnel Server

You can host your own relay on [Railway](https://railway.app), [Render](https://render.com), or any Node host.

Example commands:

```bash
git clone https://github.com/yourusername/portpass-server
cd portpass-server
npm install
npm start
```

Then set the `--server` flag to your deployed WebSocket endpoint.

---

## 🔧 Example Workflow

```bash
# Start local server
npm run dev

# Open a tunnel
npx portpass 5173 --server wss://portpass-relay.up.railway.app
```

---

## 🧩 Roadmap

- [ ] Authentication for tunnel access
- [ ] Custom subdomains
- [ ] Dashboard for managing active tunnels
- [ ] Persistent sessions / reconnects

---

## 🪪 License

MIT © 2025 [Paul Agbogun](https://github.com/paul1029-ife)

---

## 💬 Feedback

Found a bug or want to suggest a feature?
Open an issue or PR on [GitHub](https://github.com/paul1029-ife/portpass).

---

> 🚀 _PortPass – the easiest way to share your localhost with the world._
