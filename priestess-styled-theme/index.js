/* ==========================================================================
   普瑞塞斯 · 源石协议 — host half: serves the theme assets under
   /arknights-assets/ so the client plugin never touches the frontend dist
   (survives dsh updates / reinstalls).
   ========================================================================== */
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

const name = "arknights-theme-client";
const inject = ["webServer"];

const MIME = {
  ".css": "text/css; charset=utf-8",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".js": "text/javascript; charset=utf-8"
};

function apply(ctx, config) {
  const assetsDir = new URL("./assets/", import.meta.url);
  ctx.effect(() => ctx.webServer.register({
    kind: "prefix",
    path: "/arknights-assets",
    handler: async (req, res) => {
      try {
        const pathname = new URL(req.url ?? "/", "http://x").pathname;
        if (!pathname.startsWith("/arknights-assets/")) {
          res.writeHead(404);
          res.end();
          return;
        }
        const rel = decodeURIComponent(pathname.slice("/arknights-assets/".length));
        if (!rel || rel.includes("..") || rel.includes("\0")) {
          res.writeHead(403);
          res.end();
          return;
        }
        const target = new URL(rel, assetsDir);
        if (!target.pathname.startsWith(assetsDir.pathname)) {
          res.writeHead(403);
          res.end();
          return;
        }
        const body = await readFile(target);
        res.writeHead(200, { "content-type": MIME[extname(rel)] ?? "application/octet-stream" });
        res.end(body);
      } catch {
        res.writeHead(404);
        res.end();
      }
    }
  }), "arknights-theme: assets route");
}

export { apply, inject, name };
