/**
 * priestess-styled-theme — host half (DSH 0.1.5 web profile).
 *
 * Serves two things for the browser half:
 *   GET   /arknights-assets/<file>                — the theme's CSS / SVG / WebP assets
 *   GET   /plugins/priestess-styled-theme/config   — the current 应用/关闭 setting
 *   PATCH /plugins/priestess-styled-theme/config   — persist a new setting
 *
 * The setting itself lives in the `arknights-theme` settings namespace, so it is
 * schema-validated and stored in `$DSH_HOME/settings.yaml` like any other plugin
 * setting; the config route is only a thin transport for the browser half so the
 * client never has to depend on the (optional) client-side settings service.
 *
 * Uses only the public DSH plugin contract: cordis services `webServer` and
 * `settings`, plus a schemastery schema. The frontend dist is never touched, so
 * the theme survives dsh upgrades.
 */
import Schema from "@deepseek-ai/schemastery";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

export const name = "priestess-styled-theme";
export const inject = ["webServer", "settings"];

/** Settings namespace: the `arknights-theme:` section of settings.yaml. */
const NS = "arknights-theme";
/** Base path of the plugin's own HTTP surface (kept exact to leave /plugins/<id>/client.js alone). */
const BASE = "/plugins/priestess-styled-theme";
/** Asset prefix the injected stylesheet and artwork load from. */
const ASSET_PREFIX = "/arknights-assets";

const MODE_ON = "on";
const MODE_OFF = "off";

/**
 * 主题控制 schema. The one field is `mode`:
 *   on  = 应用（主题显示）   off = 关闭（主题隐藏）
 * Kept deliberately plain (`Schema.string()` + `.default()`) so older and newer
 * schemastery majors resolve the same document.
 */
export const Config = Schema.object({
  mode: Schema.string().default(MODE_ON).description("主题状态：on = 应用，off = 关闭")
}).description("普瑞赛斯 · 源石协议主题");

const DEFAULTS = Object.freeze({ mode: MODE_ON });

const MIME = {
  ".css": "text/css; charset=utf-8",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".js": "text/javascript; charset=utf-8"
};

/** Narrow a raw value to the public shape, tolerating anything an old install left behind. */
function publicConfig(value) {
  const mode = value && typeof value.mode === "string" ? value.mode.trim().toLowerCase() : "";
  return { mode: mode === MODE_OFF ? MODE_OFF : MODE_ON };
}

/** In-memory scope used when the `settings` service is absent, so the theme still works. */
function localScope(value) {
  let current = { ...value };
  const watchers = new Set();
  return {
    get: () => current,
    update: (patch) => {
      current = { ...current, ...patch };
      for (const watch of watchers) watch(current);
      return current;
    },
    watch: (fn) => {
      watchers.add(fn);
      return () => watchers.delete(fn);
    }
  };
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

function isLoopback(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

/** Same-origin guard for writes (a missing Origin header is accepted — same-origin fetch may omit it). */
function originMatches(req) {
  const origin = req.headers?.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

/** Read and validate a small JSON patch body carrying only `mode`. */
async function readPatch(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 8192) throw new Error("request body too large");
    chunks.push(chunk);
  }
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("patch must be an object");
  }
  for (const key of Object.keys(value)) {
    if (key !== "mode") throw new Error(`unknown setting: ${key}`);
    if (typeof value[key] !== "string") throw new Error("mode must be a string");
  }
  if (value.mode !== undefined && value.mode !== MODE_ON && value.mode !== MODE_OFF) {
    throw new Error(`mode must be "${MODE_ON}" or "${MODE_OFF}"`);
  }
  return value;
}

function mount(ctx, config = {}) {
  const logger = ctx.logger ?? console;
  const base = publicConfig(config);
  const settings = ctx.settings?.register?.(NS, Config, { base, applies: "live" }) ?? localScope(base);

  const current = () => publicConfig(settings.get());

  const handleConfig = async (req, res) => {
    if (!isLoopback(req.socket?.remoteAddress)) {
      json(res, 403, { error: "local access only" });
      return;
    }
    if (req.method === "GET") return json(res, 200, current());
    if (req.method !== "PATCH") return json(res, 405, { error: "method not allowed" });
    if (!originMatches(req)) {
      json(res, 403, { error: "origin mismatch" });
      return;
    }
    try {
      const patch = await readPatch(req);
      if (patch.mode !== undefined) await settings.update({ mode: patch.mode });
      return json(res, 200, current());
    } catch (error) {
      return json(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  };

  const assetsDir = new URL("./assets/", import.meta.url);

  const handleAsset = async (req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405);
      res.end();
      return;
    }
    try {
      const pathname = new URL(req.url ?? "/", "http://dsh.invalid").pathname;
      if (!pathname.startsWith(`${ASSET_PREFIX}/`)) {
        res.writeHead(404);
        res.end();
        return;
      }
      const rel = decodeURIComponent(pathname.slice(ASSET_PREFIX.length + 1));
      if (!rel || rel.includes("..") || rel.includes("\0") || rel.startsWith("/")) {
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
      res.writeHead(200, {
        "content-type": MIME[extname(rel).toLowerCase()] ?? "application/octet-stream",
        "content-length": body.length,
        /* Theme assets are immutable enough to cache briefly; a hard refresh still bypasses it. */
        "cache-control": "no-cache"
      });
      res.end(req.method === "HEAD" ? undefined : body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  };

  /*
   * Exact routes only, plus the disjoint /arknights-assets prefix: the
   * client-modules bundle route lives under the /plugins prefix, so registering a
   * prefix at `${BASE}` would shadow /plugins/priestess-styled-theme/client.js
   * (longest-prefix-wins) and 404 the browser bundle.
   */
  const disposers = [
    ctx.webServer.register({ kind: "exact", path: `${BASE}/config`, handler: handleConfig }),
    ctx.webServer.register({ kind: "prefix", path: ASSET_PREFIX, handler: handleAsset })
  ];
  logger.info("[priestess-styled-theme] host mounted");
  return () => {
    for (const dispose of disposers) {
      try {
        dispose();
      } catch {
        /* already disposed */
      }
    }
  };
}

export function apply(ctx, config = {}) {
  ctx.effect(() => mount(ctx, config), "priestess-styled-theme: web routes");
}
