/**
 * 本地 demo 服务器
 * - GET /              → 导航首页（列出所有示例）
 * - GET /basic         → examples/basic/index.html
 * - GET /autoinit      → examples/autoinit/index.html
 * - GET /mock/:status  → 返回指定 HTTP 状态码
 * - GET /dist/*        → dist/ 静态文件
 *
 * 用法：node examples/server.mjs
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const BASE_PORT = 5174

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.cjs':  'application/javascript',
  '.map':  'application/json',
  '.css':  'text/css',
  '.json': 'application/json',
}

const INDEX_HTML = /* html */`<!doctype html>
<html lang="zh">
<head>
  <meta charset="UTF-8"/>
  <title>api-spy demos</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 480px; margin: 60px auto; padding: 0 16px; }
    h2   { margin-bottom: 24px; }
    ul   { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 12px; }
    a    { display: block; padding: 14px 18px; border: 1px solid #ddd; border-radius: 6px;
           text-decoration: none; color: #222; font-size: 14px; }
    a:hover { background: #f5f5f5; }
    a span  { display: block; font-size: 12px; color: #888; margin-top: 3px; }
  </style>
</head>
<body>
  <h2>api-spy 示例</h2>
  <ul>
    <li>
      <a href="/basic">
        手动初始化
        <span>调用 ApiSpy.spy.init(config) 完成配置，适合需要自定义 transport / hook 的场景</span>
      </a>
    </li>
    <li>
      <a href="/autoinit">
        script 标签自动初始化
        <span>只需一行 &lt;script data-endpoint="..."&gt;，零 JS 代码接入</span>
      </a>
    </li>
  </ul>
</body>
</html>`

const server = createServer(async (req, res) => {
  const url = (req.url ?? '/').split('?')[0]  // 去掉 query string

  // ── mock 路由 ─────────────────────────────────────────────────────────────
  const mockMatch = url.match(/^\/mock\/(\d+)/)
  if (mockMatch) {
    const status = Number(mockMatch[1])
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ mocked: true, status }))
    return
  }

  // ── 短路由 ───────────────────────────────────────────────────────────────
  const shortcuts = {
    '/':        '',           // 特殊：返回内联 HTML
    '/basic':   'examples/basic/index.html',
    '/autoinit':'examples/autoinit/index.html',
  }

  if (url in shortcuts) {
    if (url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(INDEX_HTML)
      return
    }
    const file = shortcuts[url]
    try {
      const data = await readFile(join(ROOT, file))
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(data)
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end(`404 Not Found: ${url}`)
    }
    return
  }

  // ── 静态文件 ─────────────────────────────────────────────────────────────
  let filePath = join(ROOT, url)
  if (filePath.endsWith('/')) filePath += 'index.html'

  try {
    const data = await readFile(filePath)
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' })
    res.end(data)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end(`404 Not Found: ${url}`)
  }
})

let currentPort = BASE_PORT

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    currentPort += 1
    console.warn(`  Port ${currentPort - 1} in use, trying ${currentPort}…`)
    server.listen(currentPort)
  } else {
    console.error(err)
    process.exit(1)
  }
})

server.on('listening', () => {
  console.log(`
  api-spy demo server
  ───────────────────────────────
  http://localhost:${currentPort}/           导航首页
  http://localhost:${currentPort}/basic      手动初始化示例
  http://localhost:${currentPort}/autoinit   script 标签自动初始化示例
  `)
})

server.listen(currentPort)
