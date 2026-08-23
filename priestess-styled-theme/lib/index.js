/* ==========================================================================
   普瑞赛斯 · 源石协议 — host half: serves the theme assets under
   /arknights-assets/ so the client plugin never touches the frontend dist
   (survives dsh updates / reinstalls).
   ========================================================================== */
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { settingsNamespace } from "@deepseek-ai/dsh-settings";
import z from "@deepseek-ai/schemastery";

const name = "priestess-styled-theme";
const inject = ["webServer"];

/** 设置命名空间：settings.yaml 中的 arknights-theme: 节 */
const SETTINGS_NS = settingsNamespace("arknights-theme");
/** 主题控制 schema：mode = auto | all-on | all-off | current-off；excluded = 排除的工作区名 */
const ThemeSettingsSchema = z.object({
  mode: z.string().default("auto"),
  excluded: z.array(String).default([])
});

const MIME = {
  ".css": "text/css; charset=utf-8",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".js": "text/javascript; charset=utf-8"
};

function apply(ctx, config) {
  /* 注册设置命名空间（可选 settings 服务），使「设置 → 插件」卡片可写 */
  ctx.inject(["settings"], (settingsCtx) => {
    settingsCtx.settings.register(SETTINGS_NS, ThemeSettingsSchema);
  });
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
