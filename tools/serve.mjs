import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = process.cwd(); const port = Number(process.env.PORT || 4173);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml" };
createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`); let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") pathname = "/web/";
    let file = normalize(join(root, pathname)); if (pathname === "/web/" || pathname === "/web") file = join(root, "web", "index.html");
    if (!file.startsWith(root)) throw new Error("outside root");
    const info = await stat(file); if (!info.isFile()) throw new Error("not file");
    response.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" }); response.end(await readFile(file));
  } catch { response.writeHead(404); response.end("Not found"); }
}).listen(port, () => console.log(`Camsend dev server: http://localhost:${port}/web/`));
