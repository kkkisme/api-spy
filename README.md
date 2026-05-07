# api-spy

轻量级前端 API 监控 SDK。自动拦截 `XHR` / `fetch`，在请求出错时截取页面快照并上报，全程非阻塞主线程。

**[🔗 在线 Demo](https://api-spy-eta.vercel.app)** · [手动初始化示例](https://api-spy-eta.vercel.app/basic) · [script 标签示例](https://api-spy-eta.vercel.app/autoinit)

---

## 特性

- 🔌 **零侵入接入** — 一行 `<script>` 标签即可启用，无需任何 JS 初始化代码
- 🕵️ **双路拦截** — 同时覆盖 `XMLHttpRequest` 和 `fetch`，保留 `instanceof` 检查
- 📸 **页面快照** — 出错时通过 [`@zumer/snapdom`](https://github.com/zumerlab/snapdom) 捕获 SVG/PNG 快照
- 🚀 **非阻塞** — 拦截耗时 < 0.5 ms；快照与上报通过 `requestIdleCallback` 延迟执行
- 🔒 **隐私保护** — 自动遮盖敏感请求头（`Authorization`、`Cookie` 等）及自定义字段
- 📦 **多格式产物** — 提供 ESM / CJS / IIFE 三种格式
- ⚙️ **高度可配** — 采样率、批量上报、自定义 transport、`beforeSend` 钩子均可配置

---

## 安装

```bash
npm install api-spy
# 如需页面快照功能
npm install @zumer/snapdom
```

---

## 快速上手

### 方式一：`<script>` 标签（推荐）

在 HTML 的 `<head>` 中加入一行：

```html
<script
  src="path/to/api-spy.iife.js"
  data-endpoint="https://your-server.com/collect"
  data-app-id="my-app"
></script>
```

只要 `data-endpoint` 存在，SDK 即自动完成初始化，**无需任何额外 JS 代码**。

### 方式二：ES 模块手动初始化

```js
import { spy } from 'api-spy'

spy.init({
  endpoint: 'https://your-server.com/collect',
  appId: 'my-app',
  captureSnapshot: true,
  sampleRate: 0.5,           // 50% 采样
  beforeSend: (event) => {
    // 可修改或过滤事件；返回 null 则丢弃
    return { ...event, extra: { buildVersion: '1.2.3' } }
  },
})
```

---

## `data-*` 属性速查（script 标签模式）

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `data-endpoint` | string | — | **必填**，上报地址；有此属性才触发自动初始化 |
| `data-app-id` | string | `location.hostname` | 应用标识 |
| `data-sample-rate` | number (0–1) | `1` | 采样率，`1` = 全量上报 |
| `data-capture-snapshot` | boolean | `true` | 是否截取页面快照，`"false"` 关闭 |
| `data-slow-threshold` | number (ms) | `0` | 慢请求阈值，`0` = 不检测 |
| `data-batch-size` | number | `1` | 批量上报条数 |
| `data-batch-interval` | number (ms) | `0` | 批量上报间隔 |
| `data-max-body-length` | number (bytes) | `2048` | 保留的 HTTP 请求/响应体最大字节数（与快照无关） |
| `data-max-snapshot-size` | number (bytes) | `512000` | 页面快照最大字节数，超出则丢弃快照 |
| `data-snapshot-timeout` | number (ms) | `2000` | 快照超时时间 |

---

## API

### `spy.init(config)`

初始化 SDK，**幂等**，重复调用无副作用。

```ts
spy.init({
  endpoint: string           // 必填：上报地址
  appId?: string             // 应用标识
  enabled?: boolean          // 默认 true
  sampleRate?: number        // 0–1，默认 1

  // 触发条件
  errorStatusCodes?: number[]           // 默认 [400,401,403,404,408,429,500,502,503,504]
  slowThreshold?: number                // ms，0 = 不检测慢请求
  shouldCapture?: (ctx: RequestContext) => boolean  // 自定义触发逻辑

  // 快照
  captureSnapshot?: boolean             // 默认 true
  maxSnapshotSize?: number              // bytes，默认 512000（512 KB），超出则丢弃快照
  snapshotTimeout?: number              // ms，默认 2000
  captureEngine?: (ctx) => Promise<string | null>   // 自定义截图引擎

  // 上报
  batchSize?: number                    // 默认 1（逐条上报）
  batchInterval?: number                // ms，默认 0
  beforeSend?: (event: ReportEvent) => ReportEvent | null
  transport?: (events: ReportEvent[]) => Promise<void>   // 自定义发送函数
  enrichEvent?: (event: ReportEvent) => ReportEvent      // 全局事件增强

  // 脱敏
  maskHeaders?: string[]                // 遮盖的请求头（默认含 Authorization、Cookie 等）
  maskBodyFields?: string[]             // 遮盖的请求体字段名
  maxBodyLength?: number                // bytes，默认 2048
  ignoreUrls?: (string | RegExp)[]      // 忽略的 URL（上报地址自动加入）
})
```

### `spy.enable()` / `spy.disable()`

临时开关拦截，不卸载 patch。

### `spy.report(partial)`

手动上报一条事件，绕过触发条件和采样。

```js
spy.report({
  request: { url: '/api/pay', method: 'POST', status: 500, duration: 120 },
})
```

### `spy.destroy()`

卸载所有 patch，刷新待发队列，重置内部状态。返回 `Promise<void>`。

```js
await spy.destroy()
```

### `spy.getQueue()`

查看当前待发队列（只读快照）。

---

## 上报数据结构

```ts
interface ReportEvent {
  sdkVersion: string
  appId: string
  request: {
    id: string
    type: 'fetch' | 'xhr'
    method: string
    url: string
    requestHeaders: Record<string, string>
    requestBody: string | null
    status: number             // 0 = 网络错误
    responseHeaders: Record<string, string>
    responseBody: string | null
    duration: number           // ms
    timestamp: number          // Unix ms
    error?: string             // 网络错误时的错误信息
  }
  page: {
    url: string
    title: string
    userAgent: string
    viewport: { width: number; height: number }
    snapshot: string | null    // PNG DataURL 或 null
  }
  extra?: Record<string, unknown>  // beforeSend 注入的自定义字段
}
```

---

## 本地开发

```bash
# 安装依赖
npm install

# 监听模式构建
npm run dev

# 单次构建
npm run build

# 启动 demo 服务器（http://localhost:5174）
npm run serve

# 运行测试
npm test

# 测试覆盖率
npm run test:coverage
```

### Demo 页面

本地运行（`npm run serve`）：

| 本地地址 | 线上地址 | 说明 |
|----------|----------|------|
| `http://localhost:5174/` | [api-spy-eta.vercel.app](https://api-spy-eta.vercel.app) | 导航首页 |
| `http://localhost:5174/basic` | [/basic](https://api-spy-eta.vercel.app/basic) | 手动初始化示例 |
| `http://localhost:5174/autoinit` | [/autoinit](https://api-spy-eta.vercel.app/autoinit) | script 标签自动初始化示例 |

---

## 构建产物

| 文件 | 格式 | 用途 |
|------|------|------|
| `dist/api-spy.js` | ESM | `import` 引入 |
| `dist/api-spy.cjs` | CJS | `require` 引入 |
| `dist/api-spy.iife.js` | IIFE | `<script>` 标签直接引入，全局变量 `ApiSpy` |
| `dist/index.d.ts` | TypeScript 类型 | IDE 类型提示 |

---

## 许可证

[MIT](LICENSE)
