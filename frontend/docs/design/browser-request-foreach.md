# browser-request 批量执行（Foreach Runner）· 技术方案

## 背景

单值变量池解决"挑一个字段塞下一个请求"，但常见场景是「拿到 N 条 doc，对每条调一次详情」：
- 数组 `$.data` 有 50 项 → 用每项的 `slug` 调 50 次详情接口

变量池天然无法循环，需要独立的批量执行能力。

## 目标

- 选一个数组作循环源（来自响应 / 变量池里存的 JSON 数组 / 手动粘 JSON）
- 选一个请求作循环体（已保存请求 / 当前编辑器）
- 用 `{{item.xxx}}` 占位访问当前元素
- 按可配并发度执行，进度流式回前端，失败继续不中断
- 可选：每次响应再提取一个字段，聚合成数组存回变量池

## 不做

- ❌ 多层嵌套循环
- ❌ 持久化批量执行历史（瞬态，关页面就丢）
- ❌ Workflow 风格的多 step（A→B→C 这种链路图，太重）
- ❌ 跨请求依赖（item N+1 用 item N 的响应）—— 设计上仍是各次独立

## 数据流

```
[源数组]──┐
         ├──→ [模板渲染] ──→ [APIRequestContext.fetch] ──→ [响应] ──→ [可选聚合提取]
[模板]───┘                                                              │
                                                                       ▼
                                                              [聚合数组 → 变量池]
```

## 后端

### 新增 endpoint

`POST /api/browser-request/sessions/{id}/foreach`（SSE 流式）

请求体：
```json
{
  "items":  [ {...}, {...}, ... ],
  "request": { "curl"?: "...", "method"?, "url"?, "headers"?, "body"? },
  "concurrency": 1,
  "stopOnError": false,
  "aggregate": { "name": "slugs", "jsonPath": "$.data.slug" }   // 可选
}
```

SSE 事件（事件名：data）：
- `started`  `{ total: 50 }`
- `progress` `{ index, status, statusText, finalUrl, error?, sample? }` —— sample 是响应体截前 200 字符供 UI 显示
- `completed` `{ ok: N, failed: M, aggregatedVar?: 'slugs', aggregatedSize?: 47 }`
- `error`    `{ message }`（致命错误，整次终止）
- `cancelled`（用户主动取消）

返回 SSE token 给前端用于断开。

### 模板扩展

当前 `TemplateRenderer.render(input, Map<String,String> vars)` 只支持扁平。
要支持 `{{item.slug}}` / `{{item.nested.field}}` / `{{item[0]}}`。

方案：把 `item` 的对象在调用前**预先扁平化**：

```java
flatten(item)
  → { "item.slug" -> "abc", "item.nested.field" -> "x", "item[0]" -> "y" }
```

每次循环把 flatten(currentItem) 跟会话级变量合并后调 render。flatten 递归把 JsonNode 走平，叶子值 stringify。

### 并发模型

worker 线程已经把 Playwright 调用串行化了（playwright-worker 单线程亲和）。所以**并发度 > 1 在 Playwright 这一层没意义**——APIRequestContext.fetch 全部排队。

考虑去掉并发度参数，让用户知道实际是串行；或者保留 UI 上的 concurrency 但实际只是并发**发起任务**给 worker（不会真并发跑）。

**结论**：UI 不暴露并发度，强制串行。简单、避开 BOSS/yuque 的限流，也避免误导。

### 取消

`SseEmitterRegistry` 的 emitter close 即可作为取消信号——后端循环每次迭代前检查 emitter 是否还活着，已断则跳出。

### 聚合

每次响应文本用 Jackson 解析成 JsonNode，按用户给的 `jsonPath`（前端解析过同样的 JSONPath 子集，后端实现一份小版本）取值，stringify 推入聚合数组。结束时 `varRepo.upsert(sessionId, name, JSON.stringify(arr))`。

聚合实现的 JSONPath 子集**和前端一致**（`$.a.b[0].c`），写在 `service/SimpleJsonPath.java` 共后端用。

## 前端

### UI 入口

新增「批量执行」面板，挂在 RequestExecutor 下方。结构：

```
┌─ 🔁 批量执行 ─────────────────────────────────────────┐
│ 循环源：                                              │
│   [○ 从最近响应]  [○ 从变量池]  [○ 手动粘贴 JSON]    │
│   JSONPath: $.data           [50 项 ✓]               │
│                                                       │
│ 循环体：                                              │
│   [○ 当前编辑器]  [○ 已保存请求 ▼]                  │
│   在请求里用 {{item.slug}} 访问每条元素              │
│                                                       │
│ ☐ 聚合：把每次响应里的 [$.data.title] 存为变量 [titles] │
│                                                       │
│         [▶ 执行 50 次]                                │
└───────────────────────────────────────────────────────┘
```

执行后切到进度态：

```
┌─ 🔁 批量执行 · 进行中 12 / 50 ────────────────────────┐
│ ▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱  24%       [✕ 取消]            │
│                                                       │
│ ▼ 结果（点击展开看响应）                              │
│   1  ✓ 200  doc-1   54 ms                            │
│   2  ✓ 200  doc-2   62 ms                            │
│   3  ✗ 404  doc-3   服务端返回错误                   │
│   ...                                                 │
└───────────────────────────────────────────────────────┘
```

完成后状态条变绿，聚合结果如果有就 toast「变量 titles 已写入（47 项）」。

### 实现拆分

- `ForeachPanel.tsx`（新文件）：300 行级别组件
- `api.ts` 加 `startForeach(sessionId, body): EventSource` —— 返回 EventSource 让组件订阅事件
- 复用现有 SSE 工具 `subscribeSse`（`lib/api.ts` 已有，但当前只支持 GET——需要扩展支持 POST + body）

#### SSE POST 难点

`EventSource` 不支持 POST。两个解法：
1. **fetch + ReadableStream** 自己读 SSE（业界主流，Hoppscotch/Postman 都这么做）
2. **后端改成 GET + 参数放 querystring** —— 不适合，items 数组太大

走 1。`subscribeSseWithBody(path, body, handlers)` 用 fetch + reader 实现，工具新加。

### 取消

前端断 `AbortController` 取消 fetch → 后端 SSE emitter close → 循环跳出。

## 影响范围

- 后端
  - 新 endpoint `POST /sessions/{id}/foreach`
  - `TemplateRenderer` 加 flatten helper
  - 新 `SimpleJsonPath` 后端版（同前端子集）
  - `BrowserRequestService` 加 `runForeach(sessionId, cmd, emitter)` 方法
- 前端
  - 新 `ForeachPanel` 组件
  - `api.ts` 加 fetch + SSE reader 的工具
  - 共享 `evalJsonPath` 工具（已有）

## 风险

| 风险 | 缓解 |
|---|---|
| 串行执行 50 次太慢 | 文档提示用户预期；不允许真并发（Playwright 串行） |
| 用户误执行 1000 次 | items.length > 200 时弹 confirm "确认执行 N 次？" |
| flatten 大对象内存爆 | 深度限制 5 层，超出截断 |
| BOSS 触发限流 | 不在工具层处理，由用户调小批次/加 sleep（后续可加） |
