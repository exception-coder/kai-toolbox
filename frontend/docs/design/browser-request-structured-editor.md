# browser-request · 结构化字段编辑器 + 双击绑变量 · 技术方案

## 背景

当前编排 step 编辑器是「cURL 文本框 / 结构化 二选一」+「OutputsEditor」+「PathPickerDialog」混合形式。用户痛点：
- 配 step 时要 cURL 粘贴 → 切到结构化模式 → 在 url/headers/body 里手敲 `{{var}}`
- 或者反复点开「可用变量徽章」复制 → 切回输入框粘贴
- JSON body 含变量时编辑特别痛苦（字符串里夹 `{{name}}` 易错）

## 目标

粘 cURL 后**自动解析成结构化字段表单**——每个 value 输入框右侧带「↳ 绑变量」按钮，双击/点击弹候选下拉，**点选即写入** `{{varName}}` 到对应位置。

## 范围（用户选定 b/b/b）

1. **JSON body** 也树状编辑（每个 key/value 一行，可绑变量）
2. **Pipeline + Foreach 同步**一起改
3. cURL 解析失败时**硬拒绝**保存，UI 给明确错误提示

## 数据模型

后端 `step.request` 结构**不变**（仍是 `{curl, method, url, headers, body}`）。前端 UI 层做"展开 / 收起":
- 编辑时拆 url → `path + query[]`、拆 body（JSON）→ tree
- 序列化回 step.request：每次改动后立刻拼回 url 字符串、JSON.stringify body

前端不引新字段、不动 server-side schema。

## 组件设计

### 1. `parseCurl(text)` —— 前端 cURL 解析器

移植后端 `CurlParser.java` 到 TS（`utils/curlParser.ts`）。返回：
```ts
interface ParsedCurl {
  method: string
  url: string
  headers: Record<string, string>
  body: string | undefined
}
```

失败时抛 `Error`，调用方捕获展示。

### 2. `parseUrl(url)` —— URL 拆 path + query

```ts
function parseUrl(url: string): { origin: string; path: string; query: Array<{key: string; value: string}> }
```

注意：保留 query 顺序（用 array 不是 Map），且**值里可能含 `{{var}}`**，编码时跳过 `{{...}}` 内部。

### 3. `VarPickerPopover` —— 变量候选弹层

挂在某个输入框 `<input>` 旁边的按钮上。点开显示：
```
变量来源：
  ▾ 来自「目录」(saved)
    {{slug}}     = "oyfmian..."
    {{docs}}     = [50 项]
  ▾ 上游 step outputs（仅 pipeline 内可见）
    {{details}}  = [50 项]
  ▾ 会话变量（旧）
    {{xxx}}
```

点某条 → 调 `onPick(varRef)` 把 `{{varName}}` 写入目标 input；同时记忆"绑定关系"用 outline 显示。

数据来源：
- saved.lastExtractedValues × N → 合并所有 saved 的 outputs
- 当前 pipeline 之前的 step.outputs（pipeline 编辑器特有）
- legacy session vars

### 4. `KeyValueFieldsEditor` —— k/v 行编辑器（query 和 headers 共用）

```
┌─────────────────────────────────────────────────────┐
│ key1 = [value1______________] [🎯] [🗑]              │
│ key2 = [{{slug}}______________] [🎯] [🗑]             │ ← 已绑变量
│ [+ 添加]                                            │
└─────────────────────────────────────────────────────┘
```

`🎯` = 打开 VarPickerPopover。

每行 value 输入框**双击**也触发 VarPicker 弹出（PC 上习惯）。

输入框检测到内容是 `^\{\{(\w+)\}\}$` 时显示蓝色 outline 表示"已绑定变量"。

### 5. `JsonTreeEditor` —— body 树状编辑

递归渲染：

```
{
  user: {
    id: [{{userId}}________] [🎯] [🗑]
    name: ["abc"___________] [🎯] [🗑]
  }
  tags: [
    [0]: ["dev"____________] [🎯] [🗑]
    [1]: ["ops"____________] [🎯] [🗑]
    [+ 添加项]
  ]
  [+ 添加字段]
}
```

每个值都是 input/select + VarPicker。

**类型切换**：每行字段头部有一个小 type select（`string / number / boolean / null / object / array`）。切换类型时清空值。

**复杂度控制**：
- 嵌套深度 ≤ 5 层（再深就显示 "(嵌套过深，请用 textarea 模式)"）
- 单层字段 ≤ 50 个（超出折叠 "更多 N 项")
- 提供「切换到原始 JSON 文本」开关 —— 复杂 body 时降级

### 6. `StepFieldEditor` —— Pipeline step 的新主编辑器

替换现有 cURL/结构化 toggle 区。结构：

```
┌─────────────────────────────────────────────────┐
│ 粘 cURL: [textarea ──────────────────] [解析]    │
│   ✓ 解析成功，下方已填充                          │
├─────────────────────────────────────────────────┤
│ 方法: [GET ▼]                                   │
│ URL:  [https://www.yuque.com/api/docs        ]  │
│                                                  │
│ Query 参数 (2):                                  │
│   book_id  = [63622563_____] [🎯] [🗑]          │
│   slug     = [{{slug}}______] [🎯] [🗑]         │
│   [+ 添加]                                      │
│                                                  │
│ Headers (5):                                     │
│   ...                                            │
│                                                  │
│ Body:  [○ 无 ● JSON ○ form ○ 原文本]            │
│   ┌──────────────────────────────────┐          │
│   │ JsonTreeEditor / KeyValueEditor  │          │
│   └──────────────────────────────────┘          │
└─────────────────────────────────────────────────┘
```

### 7. `ForeachPanel` 同步

ForeachPanel 的"循环体"区当前是 [当前编辑器 / 已保存请求] 两选 —— 改成内嵌一个 StepFieldEditor（迷你版，去掉变量来源里的"上游 step outputs"，因为 Foreach 没有 step 概念，只有 `{{item.xxx}}`）。

## 阶段拆分

| 阶段 | 内容 | 工作量 |
|---|---|---|
| 1 | `parseCurl` + `parseUrl` 工具 + `VarPickerPopover` + `KeyValueFieldsEditor` + 接入 Pipeline StepEditor（query/headers 字段化，body 暂留 textarea + 插入变量到光标） | 半天 |
| 2 | `JsonTreeEditor` 实现 + 接入 body 区域 | 半天 |
| 3 | ForeachPanel 同步用 StepFieldEditor 子集 | 半天 |
| 4 | cURL 解析失败的 UI 提示 + 阻止保存 | 1 小时 |

总共约 **1.5 天**。

## 不做（明确）

- ❌ JSON body 字段重命名时校验跨字段冲突（接受用户自己负责）
- ❌ 拖拽调整字段顺序（query 顺序按数组保留，但不提供拖拽 UI）
- ❌ 单字段大值（>4KB）的折叠预览（先按 input 渲染，过长滚动）
- ❌ 同步给当前 RequestExecutor 用（这个组件用户日常单次请求用，改动风险大；先只动 Pipeline / Foreach）

## 风险

| 风险 | 缓解 |
|---|---|
| cURL 解析失败丢失用户原始输入 | 「粘 cURL」textarea 保留原文本；解析失败时不清空 |
| 用户已存的 step（cURL 模式）打开时显示啥 | 自动解析 → 字段化展示；解析失败 → fallback 显示原 cURL textarea + 警告 |
| URL 里的 query value 含 `{{var}}` 编码后变成 `%7B%7Bvar%7D%7D` | `serializeUrl()` 跳过 `{{...}}` 段不做 encodeURIComponent |
| JsonTreeEditor 嵌套太深导致 React 渲染慢 | 深度 ≤ 5 层强制限制 + 单层 50 字段折叠 |
| Foreach 改造可能让正在运行的旧 step 配置渲染错 | 加 try/catch + fallback 到原 UI |
