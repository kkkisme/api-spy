# api-spy — 前端 API 监控 SDK 需求文档

版本：0.1.0  
日期：2026-05-06

---

## 1. 背景与目标

前端项目在生产环境中发生 API 请求错误时，开发者往往只能拿到错误码和 URL，缺乏当时的页面视觉上下文，排查困难。  
**api-spy** 是一个轻量前端 SDK，通过无侵入地拦截 `XMLHttpRequest` 和 `fetch`，在请求失败时自动截取页面快照，并将错误信息连同截图一并上报，帮助开发者快速复现和定位问题。

核心约束：

- **不阻塞主线程**：截图和上报均在 Web Worker / 空闲期执行。
- **零业务侵入**：通过 monkey-patch 拦截原生 API，无需修改业务代码。
- **轻量可摇树**：核心运行时 gzip 后 < 15 KB，截图引擎按需加载。

---

## 2. 术语

| 术语 | 说明 |
|------|------|
| 上报事件 (ReportEvent) | 一次请求错误触发的完整数据包，含请求信息、响应信息、截图、页面元信息 |
| 截图引擎 | 负责将当前 DOM 序列化为图像，默认使用 snapdom |
| 上报通道 | 将 ReportEvent 发往服务端的方式，默认使用 `navigator.sendBeacon`，降级 `fetch` |
| 采样率 | 命中触发条件的请求中，实际执行截图+上报的比例 |

---

## 3. 功能需求

### 3.1 拦截 XHR

| ID | 描述 |
|----|------|
| XHR-01 | 在 SDK 初始化时，用自定义类替换 `window.XMLHttpRequest`，原始构造函数保留在内部引用 |
| XHR-02 | 代理 `open()`，记录 `method`、`url`、调用时间戳 |
| XHR-03 | 代理 `setRequestHeader()`，收集请求头（敏感字段按配置脱敏） |
| XHR-04 | 代理 `send()`，记录 `requestBody`（按配置截断长度） |
| XHR-05 | 监听 `readystatechange`，在 `readyState === 4` 时记录 `status`、`responseText`（截断）、耗时 |
| XHR-06 | 触发条件满足时（见 3.3）进入错误处理流程（见 3.4） |
| XHR-07 | 监听 `onerror` / `ontimeout`，网络级错误同样触发处理流程 |

### 3.2 拦截 Fetch

| ID | 描述 |
|----|------|
| FETCH-01 | 在 SDK 初始化时，用包装函数替换 `window.fetch`，原始函数保留在内部引用 |
| FETCH-02 | 包装函数记录 `method`、`url`、`requestBody`、请求头、调用时间戳 |
| FETCH-03 | 原始 fetch 返回的 `Response` 通过 `.clone()` 读取响应体，避免消费原始流 |
| FETCH-04 | 记录 `status`、`responseBody`（截断）、耗时 |
| FETCH-05 | 触发条件满足时进入错误处理流程 |
| FETCH-06 | Promise rejection（网络错误）同样触发处理流程 |

### 3.3 触发条件（可配置）

以下任一条件成立即触发：

| 优先级 | 条件 | 默认值 |
|--------|------|--------|
| 1 | HTTP 状态码 ∈ 配置的错误码集合 | `[400, 401, 403, 404, 408, 429, 500, 502, 503, 504]` |
| 2 | 网络错误（status === 0 / rejection） | 始终触发 |
| 3 | 响应时长 > `slowThreshold` ms | `3000` ms，默认关闭 |
| 4 | 自定义谓词函数 `shouldCapture(context) => boolean` | `undefined` |

命中后还需通过**采样率**过滤（默认 1.0，即 100%）。

### 3.4 错误处理流程

```
触发条件命中
    │
    ▼
构造 RequestContext（同步，< 1 ms）
    │
    ▼
requestIdleCallback / setTimeout(0) 调度（离开主线程关键路径）
    │
    ▼
[Worker 线程] 截图引擎执行 DOM 快照 → DataURL / Blob
    │
    ▼
[Worker 线程] 序列化 ReportEvent（JSON + 截图）
    │
    ▼
上报通道发送（sendBeacon 优先，Blob 超限时降级 fetch keep-alive）
```

### 3.5 截图引擎

| ID | 描述 |
|----|------|
| SNAP-01 | 默认使用 **snapdom**（基于 CSS inline + SVG foreignObject）序列化当前 document |
| SNAP-02 | 截图在 `requestIdleCallback`（不支持时用 `setTimeout(0)`）回调中发起，不阻塞用户交互 |
| SNAP-03 | 截图结果为 PNG DataURL 或 Blob，超过 `maxSnapshotSize`（默认 500 KB）时等比压缩或降级为纯文本 HTML dump |
| SNAP-04 | 截图超时（默认 2000 ms）后放弃截图，仅上报文字信息 |
| SNAP-05 | 截图引擎通过动态 `import()` 懒加载，不影响首屏 |
| SNAP-06 | 提供 `captureEngine` 配置项，允许替换为自定义截图函数：`(ctx: RequestContext) => Promise<string \| null>` |

### 3.6 上报

| ID | 描述 |
|----|------|
| RPT-01 | 默认使用 `navigator.sendBeacon(endpoint, blob)` 发送 |
| RPT-02 | `sendBeacon` 不可用或 Blob > 64 KB 时，使用原始 `fetch`（绕过拦截器）+ `keepalive: true` 降级 |
| RPT-03 | 上报失败时，ReportEvent 写入 `localStorage` 队列（最多 20 条），下次 SDK 初始化时补发 |
| RPT-04 | 支持批量合并（`batchSize`，默认 1），在 `batchInterval` ms 内积累后一次发送 |
| RPT-05 | 提供 `beforeSend(event) => event \| null` 钩子，返回 `null` 可阻止上报 |
| RPT-06 | 支持自定义 `transport(events: ReportEvent[]) => Promise<void>` 完全接管上报逻辑 |

### 3.7 数据结构

```typescript
interface RequestContext {
  id: string;               // nanoid，唯一标识本次请求
  type: 'xhr' | 'fetch';
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  status: number;           // 0 = 网络错误
  responseHeaders: Record<string, string>;
  responseBody: string | null;
  duration: number;         // ms
  timestamp: number;        // Date.now()
  error?: string;           // rejection message
}

interface PageContext {
  url: string;
  title: string;
  userAgent: string;
  viewport: { width: number; height: number };
  snapshot: string | null;  // PNG DataURL 或 null
}

interface ReportEvent {
  sdkVersion: string;
  appId: string;
  request: RequestContext;
  page: PageContext;
  extra?: Record<string, unknown>; // 业务自定义字段，通过 enrichEvent 钩子注入
}
```

---

## 4. 配置接口

```typescript
interface SpyConfig {
  // 必填
  endpoint: string;           // 上报地址

  // 基础
  appId?: string;             // 默认 location.hostname
  enabled?: boolean;          // 运行时开关，默认 true
  sampleRate?: number;        // 0~1，默认 1

  // 触发条件
  errorStatusCodes?: number[];
  slowThreshold?: number;     // ms，0 = 关闭
  shouldCapture?: (ctx: RequestContext) => boolean;

  // 截图
  captureSnapshot?: boolean;         // 总开关，默认 true
  maxSnapshotSize?: number;          // bytes，默认 512000
  snapshotTimeout?: number;          // ms，默认 2000
  captureEngine?: (ctx: RequestContext) => Promise<string | null>;

  // 上报
  batchSize?: number;
  batchInterval?: number;            // ms，默认 0（不批量）
  beforeSend?: (event: ReportEvent) => ReportEvent | null;
  transport?: (events: ReportEvent[]) => Promise<void>;
  enrichEvent?: (event: ReportEvent) => ReportEvent;

  // 安全
  maskHeaders?: string[];            // 脱敏的请求/响应头名，默认 ['authorization','cookie','set-cookie']
  maskBodyFields?: string[];         // 脱敏响应体中的 JSON 字段名
  maxBodyLength?: number;            // bytes，默认 2048
  ignoreUrls?: (string | RegExp)[]; // 忽略的 URL 列表（含上报地址自身）
}
```

---

## 5. 公开 API

```typescript
// 初始化（幂等，重复调用忽略）
spy.init(config: SpyConfig): void

// 运行时控制
spy.enable(): void
spy.disable(): void

// 手动上报（用于自定义场景）
spy.report(event: Partial<ReportEvent>): Promise<void>

// 卸载（还原 XHR / fetch，清空队列）
spy.destroy(): void

// 获取待发送队列（调试用）
spy.getQueue(): ReportEvent[]
```

---

## 6. 非功能需求

| 类别 | 要求 |
|------|------|
| 性能 | 拦截器同步逻辑 < 0.5 ms；截图 + 上报不在主线程关键路径上 |
| 包体积 | 核心运行时 gzip < 15 KB；含 snapdom 懒加载包 < 50 KB |
| 兼容性 | Chrome 80+、Firefox 78+、Safari 14+、Edge 80+；IE 不支持 |
| 安全 | 脱敏头、脱敏 body 字段；上报地址自动加入 `ignoreUrls`，避免递归拦截 |
| 可测试性 | 拦截器、截图引擎、上报通道均可依赖注入，方便单元测试 |
| 文档 | 提供 TypeScript 类型声明；README 含快速接入示例 |

---

## 7. 目录结构（规划）

```
api-spy/
├── src/
│   ├── index.ts            # 公开 API 入口
│   ├── config.ts           # 配置合并与校验
│   ├── interceptors/
│   │   ├── xhr.ts          # XHR monkey-patch
│   │   └── fetch.ts        # fetch monkey-patch
│   ├── capture/
│   │   ├── snapshot.ts     # 截图调度（idle + timeout 保护）
│   │   └── engines/
│   │       └── snapdom.ts  # snapdom 适配器
│   ├── reporter/
│   │   ├── queue.ts        # 本地队列 + localStorage 持久化
│   │   ├── beacon.ts       # sendBeacon 上报
│   │   └── fetch.ts        # fetch 降级上报
│   ├── sanitize.ts         # 脱敏工具
│   └── utils/
│       ├── id.ts           # nanoid 轻量实现
│       └── idle.ts         # requestIdleCallback polyfill
├── tests/
│   ├── interceptors/
│   ├── capture/
│   └── reporter/
├── examples/
│   └── basic/index.html
├── package.json
├── tsconfig.json
├── vite.config.ts          # 构建：ESM + CJS + IIFE
└── PRD.md
```

---

## 8. 关键技术决策

### 8.1 为何不用 Web Worker 做截图

snapdom 依赖访问真实 DOM，而 Worker 无法访问 DOM。因此截图在主线程执行，但调度在 `requestIdleCallback` 中，保证不抢占用户交互帧。截图超时保护防止长时间阻塞。

### 8.2 递归拦截防护

`window.fetch` 的替换发生在初始化时，内部上报使用保存的**原始引用**，同时将 `endpoint` 自动加入 `ignoreUrls`，双重保护避免上报请求触发二次截图。

### 8.3 XHR 代理方案

采用**原型代理**（修改 `XMLHttpRequest.prototype`）而非子类，兼容业务代码中对 `xhr instanceof XMLHttpRequest` 的检测。

### 8.4 响应体读取

- XHR：在 `readyState === 4` 时读取 `responseText`，此时响应已完整。
- Fetch：使用 `response.clone().text()`，不影响业务侧消费原始 Response。

---

## 9. 里程碑

| 阶段 | 内容 | 预计工期 |
|------|------|--------|
| M1 | XHR / Fetch 拦截 + 触发条件 + 纯文字上报 | 3 天 |
| M2 | snapdom 截图引擎 + idle 调度 + 超时保护 | 2 天 |
| M3 | 上报队列 + sendBeacon + fetch 降级 + localStorage 重试 | 2 天 |
| M4 | 脱敏、采样率、钩子、配置校验 | 1 天 |
| M5 | 单元测试、类型声明、README、Example | 2 天 |

---

## 10. 开放问题

| # | 问题 | 决策 |
|---|------|------|
| 1 | 截图是否需要支持跨域 canvas？ | **否**，跨域 canvas 直接跳过，不影响其余 DOM 快照 |
| 2 | 是否需要记录用户行为轨迹？ | 待定 |
| 3 | 上报格式是否对齐 Sentry / Datadog schema？ | **否**，使用内部 ReportEvent 格式 |
| 4 | 是否支持 Service Worker 下的 fetch 拦截？ | 待定 |
