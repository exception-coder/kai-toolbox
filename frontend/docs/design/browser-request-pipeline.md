# browser-request 编排链（Pipeline）· 技术方案

## 背景

单层 foreach 解决「同质数据批处理」，但常见链式场景需要多步骤：

```
取文档列表 → foreach 取每个文档详情 → foreach 取每个文档的每条评论
                                       ↑ 嵌套数组扁平化（不只是引用上一步）
```

变量池能存中间结果但**要用户手动点 3 次按钮 + 手动用变量当下一次的循环源**。Pipeline 把链固化成可保存、一键运行、进度可观测的整体。

## 目标

- 一个 Pipeline = 有序 Step[]，串行执行
- 每个 Step 类型：`single`（一次请求）或 `foreach`（循环请求）
- Step 输出可命名为 chain-scope 变量，后续 step 用 `{{name}}` 引用
- 支持嵌套数组扁平化（依赖前置任务 A）
- 一键运行整条链，SSE 流式回前端，每步独立进度
- Pipeline 可保存、命名、复用

## 不做（明确）

- ❌ 条件分支 / if-else 节点
- ❌ DAG / 并行 step（仅串行）
- ❌ 跨会话 chain 共享
- ❌ 单 step 失败自动重试
- ❌ Pipeline 版本管理（只保留最新一份）

## 三个关键策略（已确认）

1. **失败策略**：默认 **失败继续**——单条/单步失败不影响链整体推进，但**完整登记失败明细**（哪个 step 第几项失败、错误信息、渲染后的 URL）。运行视图末尾汇总「N 次失败，点开看详情」。仅当致命错误（如 step 模板渲染抛 MissingVarException 表示根本没数据）才整链终止。
2. **chain vars 持久化**：每个 `output` 加 `persist: boolean` 字段，true 时除了写 chain vars 还写 session vars（落 DB）。链跑完用户能在变量池面板里看到，下次单次请求或新 chain 都能复用。
3. **干跑模式（dry-run）**：运行按钮旁边一个 toggle。开启时**不调** `manager.execute`，只跑模板渲染并把每一步的 `{ method, url, headers, body }` 推回前端展示。用于：
   - 验证 `{{item.xxx}}` 字段名是否正确
   - 链路里有破坏性请求（POST/DELETE）时安全预演
   - 调试嵌套扁平 JSONPath 的实际结果

## 前置任务（必须先做的 A 方案）

JSONPath 子集必须升级支持 `[*]` 通配，并对结果**隐式扁平一层**：

| 表达式 | 输入 | 输出 |
|---|---|---|
| `$.docs[*]` | `{docs:[a,b,c]}` | `[a,b,c]` |
| `$.docs[*].title` | `{docs:[{title:'x'},{title:'y'}]}` | `['x','y']` |
| `$.docs[*].comments[*].id` | 嵌套 | 扁平 id 数组 |

前后端 JSONPath 工具（`SimpleJsonPath.java` + `utils/jsonpath.ts`）一起升级。

## 数据模型

### Pipeline 表

```sql
CREATE TABLE IF NOT EXISTS browser_request_pipeline (
    id          TEXT    PRIMARY KEY,
    session_id  TEXT    NOT NULL,
    name        TEXT    NOT NULL,
    steps_json  TEXT    NOT NULL,    -- 整个 steps 数组序列化为 JSON
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_browser_request_pipeline_session
  ON browser_request_pipeline(session_id, updated_at DESC);
```

不为 step 单独建表——steps 整体序列化为 JSON 列，简单、一致性强（不会出现孤儿 step）、读写都是一次 SQL。

### Step 结构（JSON）

```typescript
type Step = SingleStep | ForeachStep

interface BaseStep {
  id: string            // 客户端 uuid（用于 UI key + 拖拽）
  name: string          // 用户给的标识，如「取文档列表」
  outputs?: Array<{ name: string; jsonPath: string }>
  continueOnError?: boolean   // 默认 false：失败即中断；true 时记录错误继续
}

interface SingleStep extends BaseStep {
  type: 'single'
  request: ExecuteRequestBody   // curl 或结构化
}

interface ForeachStep extends BaseStep {
  type: 'foreach'
  source: {                     // 循环源（替代旧 ForeachPanel 的多 source 模式）
    varName: string             // 引用的 chain/session 变量名
    jsonPath?: string           // 可选：在变量上再做一次 JSONPath（如 '$.[*].comments[*]'）
  }
  request: ExecuteRequestBody   // 用 {{item.xxx}}
  // foreach 的 outputs 自动作用在「聚合后的数组」上，
  // 每条响应取 jsonPath 后 push 到聚合，结果存为 outputs.name
}
```

### Chain 变量作用域

- **session vars**（已有）：跨 chain 共享，落 DB
- **chain vars**（新）：本次执行内的瞬态 Map<String, JsonNode>，结束就丢

渲染时查找顺序：chain vars → session vars。两套重名时 chain 优先（不报错，方便用户用同名覆盖临时调试）。

Foreach step 的 `outputs` 聚合到的数组**自动**写入 chain vars。

## API

```
GET    /api/browser-request/sessions/{sid}/pipelines        列表（不含 steps_json 详情，节省带宽）
GET    /api/browser-request/pipelines/{pid}                 详情（含 steps）
POST   /api/browser-request/sessions/{sid}/pipelines        创建（body 含 name + steps[]）
PUT    /api/browser-request/pipelines/{pid}                 更新（整体替换 steps，含 name）
DELETE /api/browser-request/pipelines/{pid}                 删除
POST   /api/browser-request/pipelines/{pid}/run             运行（SSE）
```

### Pipeline 运行的 SSE 事件

```
event: pipeline-started   data: { totalSteps: 3, pipelineId, pipelineName }
event: step-started       data: { stepIndex, stepName, type, total?: 50 }
event: step-progress      data: { stepIndex, done, status?, sample?, error? }   ← foreach 才有
event: step-completed     data: { stepIndex, status?, ok?, failed?, outputs: { docs: [...] }, elapsedMs }
event: step-failed        data: { stepIndex, error, elapsedMs }
event: pipeline-completed data: { ok: 3, failed: 0, chainVarsSummary: { docs: 50, details: 50 } }
event: pipeline-cancelled
event: pipeline-error     data: { message }
```

`chainVarsSummary` 只给变量名 + 长度/类型，不返回值本身（可能很大）。前端要看具体值的话从 step-completed 的 outputs 里取（仍可能很大但有上限）。

## 执行引擎

`PipelineExecutor`（service 层）：

```java
public SseEmitter startPipeline(String sessionId, String pipelineId) {
    // 1. 加载 pipeline 定义
    // 2. 创建 sse emitter
    // 3. 虚拟线程上跑：
    //    chainVars = new HashMap<>();
    //    for (step : pipeline.steps) {
    //      check emitter alive (取消？跳出)
    //      publish step-started
    //      result = runStep(step, sessionVars + chainVars)
    //      if (result.failed && !step.continueOnError) break;
    //      apply outputs to chainVars
    //      publish step-completed/failed
    //    }
    //    publish pipeline-completed
}
```

复用现有：
- `manager.execute()` 跑单次请求
- `TemplateRenderer.renderWithItem()` 渲染模板
- `SimpleJsonPath` 提取 outputs
- `SseEmitterRegistry` 推送事件
- `BrowserRequestService.runForeach` 内部循环逻辑——可以抽出私有方法 `runForeachStep(...)` 供 Pipeline 和单次 ForeachPanel 共用

### Chain Vars 在 TemplateRenderer 里怎么用

当前 `TemplateRenderer.renderWithItem` 接 `Map<String, String> vars` + `JsonNode item`。chain vars 是 `Map<String, JsonNode>`（可能存数组/对象，不只是字符串）。

升级：再加一个重载

```java
public static String renderWith(String input,
                                 Map<String, String> sessionVars,
                                 Map<String, JsonNode> chainVars,
                                 JsonNode item)
```

占位符 `{{name}}` 解析顺序：chainVars[name] → sessionVars[name] → 报 MissingVar。

chainVars 命中时如果是数组/对象，stringify 成 JSON（用 `.toString()`）；用户大概率用 `{{docs}}` 是为了把数组传递给下一步的 foreach 源——这种场景渲染成 JSON 后再 `JsonNode.parse` 解析回数组。

更清爽的做法：foreach 的循环源**不走模板渲染**，而是直接按 `source.varName` 在 chainVars/sessionVars 里查 JsonNode，再走 jsonPath。这样避免 "stringify → parse" 往返。

## 前端 UI

新增 `PipelinePanel`（**与现有 ForeachPanel 并存**——单次任务还是 foreach 方便）。

### 列表视图

```
┌─ ⛓ 编排链 ───────────────────────────────────┐
│ [选择: 拉取并扁平化评论 ▼]  [+ 新建] [删除]   │
│                                              │
│ ① 取文档列表       [single]    [⋮]          │
│   GET .../docs       → docs                  │
│ ② 取每个文档详情   [foreach]   [⋮]          │
│   {{docs}}           → details               │
│ ③ 取每条评论       [foreach]   [⋮]          │
│   {{details}} $.[*].comments[*] → comments   │
│                                              │
│ [+ 添加步骤]              [💾 保存] [▶ 运行] │
└──────────────────────────────────────────────┘
```

`[⋮]` 展开：编辑、上移/下移、删除。

### Step 编辑器（弹 Dialog）

```
┌─ 编辑 Step 2 ─────────────────────────────┐
│ 名称: [取每个文档详情___]                  │
│ 类型: [○ single  ● foreach]              │
│                                            │
│ 循环源:                                    │
│   变量名: [docs        ▼]                 │
│   JSONPath: [$         ]  ← 可选          │
│                                            │
│ 请求模板:                                  │
│   [cURL 粘贴 / 结构化]                    │
│   用 {{item.slug}} 访问当前元素           │
│                                            │
│ 输出:                                      │
│   [+ 添加]                                 │
│   • 名称 [details] JSONPath [$]   [删除]  │
│                                            │
│ ☐ 失败时继续下一步                         │
│                              [取消] [确定] │
└────────────────────────────────────────────┘
```

### 运行视图

```
┌─ ⛓ 运行中 · 拉取并扁平化评论 ────────────┐
│ ① 取文档列表       ✓ 200  · 412ms        │
│   docs ← 50 项                            │
│ ② 取每个文档详情   ⠋ 23 / 50  ▰▰▰▰▱▱▱   │
│ ③ 取每条评论       - 待运行              │
│                            [✕ 取消]      │
└──────────────────────────────────────────┘
```

完成或失败后每个 step 可点开看具体响应/错误（沿用 ForeachPanel.RunView 的逐条结果）。

## 影响范围

### 后端
- 新表 `browser_request_pipeline`
- 新 `Pipeline` domain / `PipelineRepository`
- `BrowserRequestService` 加 `listPipelines / getPipeline / savePipeline / deletePipeline / runPipeline`
- `BrowserRequestController` 加 5 个 endpoint
- `TemplateRenderer` 加 `renderWith(input, sessionVars, chainVars, item)` 重载
- `SimpleJsonPath` 升级支持 `[*]` 通配 + 隐式扁平
- 新 DTO：`PipelineRequest`、`StepDto`（鉴于 step 是 union 类型，需要 Jackson 多态序列化）

### 前端
- 新 `PipelinePanel.tsx` 组件
- 新 `StepEditorDialog.tsx`
- `utils/jsonpath.ts` 升级支持 `[*]` 扁平
- `api.ts` 新增 pipeline 5 个函数 + SSE 启动
- `types.ts` 新增 `Step` / `Pipeline` 类型
- 删除会话时级联清理 pipelines（service.delete）

### 已有组件保留
- ForeachPanel 不删——它仍是「临时一次性任务」的好工具
- VarsPanel 不动，session vars 是 Pipeline 引用源之一

## 阶段拆分（落地节奏）

| 阶段 | 内容 | 工作量 |
|---|---|---|
| 0 | JSONPath `[*]` 通配 + 扁平（前后端） | 半天 |
| 1 | Pipeline 表 + Domain + Repository + 5 个 CRUD endpoint | 半天 |
| 2 | PipelineExecutor 执行引擎 + SSE 事件协议 | 1 天 |
| 3 | PipelinePanel（列表 + 编辑 dialog）+ 类型/api | 1 天 |
| 4 | 运行视图（多 step 进度 + 详情展开） | 半天 |
| 5 | 端到端联调 + 边缘情况（取消/失败/嵌套扁平） | 半天 |

**总计 3.5–4 天**。比初评估略低，因为执行引擎能复用 foreach 已有逻辑。

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| Step union 类型 Jackson 序列化复杂 | 用 `@JsonTypeInfo` + `@JsonSubTypes` 标准做法；DB 列存 JSON 直读直写 |
| chain vars 含大数组（如 details=50 个 detail）内存炸 | 每个 chain var 限制 `JSON.toString().length() < 16MB`；超限时 step-completed 事件只回大小不回值 |
| 用户在 step 引用未存在的 var | 渲染时抛 MissingVarException → step-failed → 整链 abort（除非 continueOnError） |
| `[*]` 通配性能（深嵌套数组） | 实现时控制最大递归深度 = 6 |
| Pipeline 中途 BOSS 限流 | 不在工具层处理，提供 continueOnError + step 失败可见，让用户调小 batch |
| 现有 SimpleJsonPath / evalJsonPath 升级后破坏 ExtractVarDialog | 升级保持向后兼容（无 `[*]` 时行为不变） |

## 端到端示例

复刻你的场景：

**Pipeline「批量拉取所有评论」**
- Step 1 `取文档列表` · `single`
  - GET `https://www.yuque.com/api/docs?book_id={{bookId}}`（bookId 是 session var）
  - outputs: `{ name: 'docs', jsonPath: '$.data' }`
- Step 2 `取每个文档详情` · `foreach`
  - source: `{ varName: 'docs' }`（直接是数组）
  - GET `https://www.yuque.com/api/docs/{{item.slug}}`
  - outputs: `{ name: 'details', jsonPath: '$.data' }` ← 聚合所有 detail
- Step 3 `取每条评论` · `foreach`
  - source: `{ varName: 'details', jsonPath: '$.[*].id' }` ← 扁平所有 detail id
  - GET `https://www.yuque.com/api/comments?docId={{item}}`
  - outputs: `{ name: 'allComments', jsonPath: '$.data' }`

运行：一键 → 看 3 个 step 进度条 → 完成后 `chainVars.allComments` 是嵌套展平后的评论数组。

也可以勾选 step 3 的某个 output「持久化到会话变量池」让它落 DB，后续手动单次请求也能用 `{{allComments}}`。

---

技术方案完，等你确认开干。
