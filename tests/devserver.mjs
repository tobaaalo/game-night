// Local stand-in for the live site: serves dist/ and forwards /api (including WebSockets) to `wrangler dev` on :8787.
import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
const PORT = +process.argv[2] || 4180, UP = 8787;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };
const root = path.resolve("dist");
const srv = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    const p = http.request({ port: UP, path: req.url, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    p.on("error", () => { res.statusCode = 502; res.end(); });
    return req.pipe(p);
  }
  let f = path.join(root, decodeURIComponent(req.url.split("?")[0]));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(root, "index.html");
  res.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
srv.on("upgrade", (req, sock, head) => {
  const up = net.connect(UP, "127.0.0.1", () => {
    up.write(`${req.method} ${req.url} HTTP/1.1\r\n` + Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join("\r\n") + "\r\n\r\n");
    up.write(head); sock.pipe(up); up.pipe(sock);
  });
  up.on("error", () => sock.destroy()); sock.on("error", () => up.destroy());
});
srv.listen(PORT, () => console.log("dev server on", PORT));
