import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../out/", import.meta.url));
const base = resolve(root);
const port = Number(process.env.PORT || 3000);
const host = process.env.HOSTNAME_LOCAL || "127.0.0.1";
const types = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json",
  ".txt": "text/plain; charset=utf-8", ".svg": "image/svg+xml",
  ".glb": "model/gltf-binary", ".webp": "image/webp", ".png": "image/png",
  ".woff2": "font/woff2", ".ico": "image/x-icon"
};
if (!existsSync(resolve(root, "index.html"))) {
  console.error("Jalankan npm run build terlebih dahulu.");
  process.exit(1);
}
createServer(async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(req.url || "/", "http://localhost").pathname);
    let file = resolve(root, "." + pathname);
    if (file !== base && !file.startsWith(base + sep)) { res.writeHead(404).end(); return; }
    if ((await stat(file)).isDirectory()) file = resolve(file, "index.html");
    const info = await stat(file);
    if (!info.isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream",
      "Content-Length": info.size, "X-Content-Type-Options": "nosniff" });
    if (req.method === "HEAD") res.end();
    else createReadStream(file).on("error", () => res.destroy()).pipe(res);
  } catch { res.writeHead(404).end(); }
}).listen(port, host, () => console.log(`Rakitron siap di http://${host}:${port}`));
