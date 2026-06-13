// Production Node server for the TanStack Start build.
// `dist/server/server.js` exports a fetch-style handler (no listener of its own),
// so this adapter serves static client assets from dist/client and forwards
// everything else to the SSR handler, listening on PORT (default 3000).
import http from 'node:http'
import { Readable } from 'node:stream'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import ssr from './dist/server/server.js'

const PORT = Number(process.env.PORT) || 3000
const HOST = process.env.HOST || '0.0.0.0'
const CLIENT_DIR = join(process.cwd(), 'dist', 'client')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.webmanifest': 'application/manifest+json',
}

function serveStatic(req, res) {
  const pathname = decodeURIComponent((req.url || '/').split('?')[0])
  if (pathname === '/') return false
  const fp = normalize(join(CLIENT_DIR, pathname))
  if (!fp.startsWith(CLIENT_DIR) || !existsSync(fp) || !statSync(fp).isFile()) {
    return false
  }
  res.statusCode = 200
  res.setHeader('content-type', MIME[extname(fp).toLowerCase()] || 'application/octet-stream')
  res.setHeader(
    'cache-control',
    pathname.startsWith('/assets/')
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=3600',
  )
  createReadStream(fp).pipe(res)
  return true
}

function toHeaders(nodeHeaders) {
  const headers = new Headers()
  for (const [key, value] of Object.entries(nodeHeaders)) {
    if (value === undefined) continue
    if (Array.isArray(value)) for (const v of value) headers.append(key, v)
    else headers.set(key, value)
  }
  return headers
}

const server = http.createServer(async (req, res) => {
  try {
    if (serveStatic(req, res)) return
    const url = `http://${req.headers.host || 'localhost'}${req.url}`
    const request = new Request(url, {
      method: req.method,
      headers: toHeaders(req.headers),
    })
    const response = await ssr.fetch(request)
    res.statusCode = response.status
    response.headers.forEach((value, key) => res.setHeader(key, value))
    if (response.body) {
      Readable.fromWeb(response.body).pipe(res)
    } else {
      res.end()
    }
  } catch (err) {
    console.error('SSR error:', err)
    if (!res.headersSent) res.statusCode = 500
    res.end('Internal Server Error')
  }
})

server.listen(PORT, HOST, () => {
  console.log(`frontend listening on http://${HOST}:${PORT}`)
})
