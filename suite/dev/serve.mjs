/**
 * dev-only static server for the preview environment. Zero dependencies:
 *
 *   node suite/dev/serve.mjs            # http://127.0.0.1:4310
 *   node suite/dev/serve.mjs 5000
 *
 * Serves the whole `suite/` package directory (client.js, dev/preview.html,
 * dev/boot.mjs, dev/vendor/…) so the preview exercises the exact client file
 * that ships — no build step, no copy.
 *
 * Also answers GET /api/plugin-suite/asset/previews/<id>/<theme>.png with a
 * generated SVG placeholder: <img> loads bypass the boot.mjs fetch shim, so
 * the server itself must stand in for the host half's asset route (404 for
 * skins whose gallery entry has no previews).
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GALLERY, previewSvg } from './mock-data.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.dirname(here) // suite/
const PORT = Number(process.argv[2] ?? process.env.PREVIEW_PORT ?? 4310)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.map': 'application/json; charset=utf-8',
}

if (!fs.existsSync(path.join(here, 'vendor', 'react.iife.js'))) {
  console.warn('[serve] dev/vendor/react.iife.js is missing — run: npm i -D react react-dom esbuild --prefix suite && node suite/dev/build-deps.mjs')
}

const ASSET_RE = /^\/api\/plugin-suite\/asset\/previews\/([^/]+)\/(light|dark)\.(?:png|svg)$/

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    let pathname = decodeURIComponent(url.pathname)
    if (pathname === '/') pathname = '/dev/preview.html'

    // dev stand-in for the host half's preview asset route
    const asset = pathname.match(ASSET_RE)
    if (asset) {
      const skin = GALLERY.skins.find((s) => s.id === asset[1])
      if (!skin || !skin.previews) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: 'no preview' }))
        return
      }
      res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(previewSvg(skin.id, asset[2]))
      return
    }

    const file = path.normalize(path.join(ROOT, pathname))
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end('forbidden')
      return
    }
    const body = fs.existsSync(file) && fs.statSync(file).isFile() ? fs.readFileSync(file) : null
    if (!body) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end(`not found: ${pathname}`)
      return
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    })
    res.end(body)
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end(String(err?.stack ?? err))
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[serve] preview ready: http://127.0.0.1:${PORT}/  (Ctrl+C to stop)`)
})
