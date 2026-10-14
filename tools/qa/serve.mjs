// Serve a built copy of the site for the frame-by-frame tools: a fixed set of
// files that no editor save can reload in the middle of a take.
//   npx astro build --outDir .qa/dist && node tools/qa/serve.mjs [port] [dir]
// run.mjs starts one itself when QA_DIST names a built directory.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const types = { html: "text/html; charset=utf-8", js: "text/javascript", mjs: "text/javascript", css: "text/css", json: "application/json", svg: "image/svg+xml", webp: "image/webp", png: "image/png", jpg: "image/jpeg", woff2: "font/woff2", pdf: "application/pdf", xml: "application/xml", ico: "image/x-icon", txt: "text/plain" };

/** Serve `dir` (relative to the repo) on `port`; 0 picks a free one. Resolves with the port and a way to stop. */
export function serve(dir = ".qa/dist", port = 0) {
  const root = path.resolve(ROOT, dir);
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const tries = [url, `${url}.html`, path.join(url, "index.html")].map((p) => path.join(root, p));
    const file = tries.find((p) => p.startsWith(root) && fs.existsSync(p) && fs.statSync(p).isFile());
    if (!file) {
      const lost = path.join(root, "404.html");
      res.writeHead(404, { "content-type": types.html });
      return res.end(fs.existsSync(lost) ? fs.readFileSync(lost) : "not found");
    }
    res.writeHead(200, { "content-type": types[path.extname(file).slice(1)] ?? "application/octet-stream", "cache-control": "no-store" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(port, () => ok({ port: server.address().port, root, close: () => server.close() })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const s = await serve(process.argv[3] ?? ".qa/dist", +(process.argv[2] ?? process.env.PORT ?? 4410));
  console.log(`serving ${path.relative(ROOT, s.root)} at http://localhost:${s.port}`);
}
