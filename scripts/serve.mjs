import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createGzip } from "node:zlib";
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
const immutable = /^\/(_next\/static|models|fonts|parts)\//;
const compressible = new Set([".html", ".css", ".js", ".json", ".txt", ".svg", ".glb"]);
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
    const ext = extname(file);
    const headers = { "Content-Type": types[ext] || "application/octet-stream", "X-Content-Type-Options": "nosniff",
      "Cache-Control": immutable.test(pathname) ? "public, max-age=31536000, immutable" : "no-cache", "Vary": "Accept-Encoding" };
    // Teks, SVG, dan model 3D dikirim terkompresi; font sudah terkompresi.
    const gzip = compressible.has(ext) && info.size > 1024 && /\bgzip\b/.test(String(req.headers["accept-encoding"] || ""));
    if (gzip) headers["Content-Encoding"] = "gzip"; else headers["Content-Length"] = info.size;
    res.writeHead(200, headers);
    if (req.method === "HEAD") { res.end(); return; }
    const stream = createReadStream(file).on("error", () => res.destroy());
    if (gzip) stream.pipe(createGzip({ level: 6 })).pipe(res); else stream.pipe(res);
  } catch { res.writeHead(404).end(); }
}).listen(port, host, () => console.log(`Rakitron siap di http://${host}:${port}`));
