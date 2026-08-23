/* ==========================================================================
   普瑞塞斯 · 源石协议 — host half: serves the theme assets under
   /arknights-assets/ so the client plugin never touches the frontend dist
   (survives dsh updates / reinstalls), and exposes the theme configuration
   (enabled switch + target workspace) to the settings page and the client.
   ========================================================================== */
import Schema from '@deepseek-ai/schemastery'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'

const name = 'priestess-styled-theme'
const inject = ['webServer', 'settings']

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.js': 'text/javascript; charset=utf-8'
}

export const Config = Schema.object({
  enabled: Schema.boolean().default(true).description('主题总开关（关闭后任何工作区都不显示主题）'),
  all: Schema.boolean().default(false).description('应用到全部工作区（忽略目标工作区，所有工作区都显示主题）'),
  target: Schema.string().default('deepseek_workspace').description('启用主题的工作区文件夹名（会话 cwd 的目录名；仅当「应用到全部」关闭时生效）'),
}).description('普瑞塞斯 · 源石协议 — Arknights 主题')

const defaults = Object.freeze({
  enabled: true,
  all: false,
  target: 'deepseek_workspace',
})

const BASE_PATH = '/plugins/priestess-styled-theme'

/** Narrow a raw config object to the public shape (unknown fields dropped). */
function publicConfig(config = {}) {
  return {
    enabled: config.enabled ?? defaults.enabled,
    all: config.all ?? defaults.all,
    target: config.target ?? defaults.target,
  }
}

/** In-memory settings scope fallback (used when the settings service is absent). */
function localSettingsScope(value) {
  let current = { ...value }
  const watchers = new Set()
  return {
    get: () => current,
    update: (patch) => {
      current = { ...current, ...patch }
      for (const watch of watchers) watch(current)
      return current
    },
    watch: (fn) => {
      watchers.add(fn)
      return () => watchers.delete(fn)
    },
  }
}

function json(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

function isLoopback(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

async function readPatch(req) {
  const chunks = []
  let bytes = 0
  for await (const chunk of req) {
    bytes += chunk.length
    if (bytes > 16384) throw new Error('request body too large')
    chunks.push(chunk)
  }
  const value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('patch must be an object')
  }
  const types = { enabled: 'boolean', all: 'boolean', target: 'string' }
  for (const [key, next] of Object.entries(value)) {
    if (!(key in types)) throw new Error(`unknown setting: ${key}`)
    if (typeof next !== types[key]) throw new Error(`${key} must be a ${types[key]}`)
  }
  return value
}

function mount(ctx, config = {}) {
  const logger = ctx.logger ?? console
  const base = publicConfig(config)
  const settings = ctx.settings?.register?.('priestess-styled-theme', Config, { base, applies: 'live' })
    ?? localSettingsScope(base)

  const current = () => publicConfig(settings.get())

  const handleConfig = async (req, res) => {
    if (!isLoopback(req.socket?.remoteAddress)) {
      json(res, 403, { error: 'local access only' })
      return
    }
    if (req.method === 'GET') return json(res, 200, current())
    if (req.method !== 'PATCH') return json(res, 405, { error: 'method not allowed' })
    const origin = req.headers?.origin
    if (origin) {
      let originHost
      try {
        originHost = new URL(origin).host
      } catch {
        /* malformed origin — treated as mismatch below */
      }
      if (!originHost || originHost !== req.headers.host) {
        json(res, 403, { error: 'origin mismatch' })
        return
      }
    }
    try {
      const patch = await readPatch(req)
      await settings.update(patch)
      return json(res, 200, current())
    } catch (error) {
      return json(res, 400, { error: error instanceof Error ? error.message : String(error) })
    }
  }

  const assetsDir = new URL('./assets/', import.meta.url)
  const handleAssets = async (req, res) => {
    try {
      const pathname = new URL(req.url ?? '/', 'http://x').pathname
      if (!pathname.startsWith('/arknights-assets/')) {
        res.writeHead(404)
        res.end()
        return
      }
      const rel = decodeURIComponent(pathname.slice('/arknights-assets/'.length))
      if (!rel || rel.includes('..') || rel.includes('\0')) {
        res.writeHead(403)
        res.end()
        return
      }
      const target = new URL(rel, assetsDir)
      if (!target.pathname.startsWith(assetsDir.pathname)) {
        res.writeHead(403)
        res.end()
        return
      }
      const body = await readFile(target)
      res.writeHead(200, { 'content-type': MIME[extname(rel)] ?? 'application/octet-stream' })
      res.end(body)
    } catch {
      res.writeHead(404)
      res.end()
    }
  }

  const disposers = [
    ctx.webServer.register({ kind: 'exact', path: `${BASE_PATH}/config`, handler: handleConfig }),
    ctx.webServer.register({ kind: 'prefix', path: '/arknights-assets', handler: handleAssets }),
  ]
  logger.info('[priestess-styled-theme] host mounted')
  return () => {
    for (const dispose of disposers) dispose()
  }
}

export function apply(ctx, config = {}) {
  ctx.effect(() => mount(ctx, config), 'priestess-styled-theme: web routes')
}

export { inject, name };
