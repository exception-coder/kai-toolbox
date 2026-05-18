# browser-request 变量池 + 模板占位符 · 技术方案

## 背景

抓 BOSS、yuque 这类站点接口时常出现链式调用：
- A 接口返回 `token` → B 接口请求头/body 需要带 `token`
- 创建资源接口返回 `resourceId` → 详情/更新接口需要 `resourceId` 拼到 URL

当前工具每个请求独立、复制粘贴体力活、改动易错。

## 目标

让 A 的响应里挑出来的字段，在 B 请求里用 `{{name}}` 写一行就替换上——单步替换覆盖 80% 用例，不做完整 Workflow。

## 不做（明确划线）

- ❌ 「一键跑完整链路」（Postman Workflow / 多步 runner）—— 用户需要一个个手动点
- ❌ Pre-request / Tests JavaScript 脚本（沙箱复杂度高）
- ❌ 跨会话全局变量（保持会话隔离）
- ❌ 加密存储 `secret` 类变量遮罩（迭代二做，先不上）

## 数据模型

新增表 `browser_request_var`：

```sql
CREATE TABLE IF NOT EXISTS browser_request_var (
    session_id  TEXT    NOT NULL,
    name        TEXT    NOT NULL,
    value       TEXT    NOT NULL,
    updated_at  INTEGER NOT NULL,
    PRIMARY KEY (session_id, name)
);
```

- 一个会话一组变量，靠复合主键去重
- value 类型 TEXT，存提取出来的字符串（数值/布尔提取时也 stringify）
- 删除会话时不级联（用户可能想保留变量重命名复用——但 service.delete 会一起清，下面会改）

## API（后端）

```
GET    /api/browser-request/sessions/{sid}/vars           列出会话变量
PUT    /api/browser-request/sessions/{sid}/vars/{name}    设置/更新（body: {value: string}）
DELETE /api/browser-request/sessions/{sid}/vars/{name}    删除
```

「从响应里提取」放**前端做**：前端拿到 ExecutedResponse 后用 JS JSONPath 求值，调 PUT 存。后端因此不引入 Jayway JsonPath 依赖。

## 模板替换

后端 `execute` 在调 Playwright `APIRequestContext.fetch` 之前，对 `curl` / `url` / 每个 header value / `body` 做替换：

- 占位符语法：`{{name}}` 或 `{{ name }}`（前后空白容忍）
- 命名规则：`[A-Za-z_][A-Za-z0-9_]*`
- 缺失变量行为：**抛 IllegalArgumentException("缺少变量: xxx")**——总比静默把字面值送出去后被服务端拒了好排查

替换工具单独抽 `TemplateRenderer`：
```java
public static String render(String input, Map<String,String> vars)  // 单串渲染
public static Set<String> referenced(String input)                  // 找出所有占位符名字
```

curl 模式下，替换在**后端 CurlParser 解析之后**做：curl 文本里 `{{xxx}}` 可能出现在 URL / -H 值 / -d 值任何位置。简单做法——**在 service 层先对 cURL 整段做一次字符串替换**，再传给后端 manager 走原 CurlParser。坏处：变量值含特殊字符（`'`、`"`）会破坏 cURL 引号配对。所以：

- 替换前用 shell-safe 转义：把 value 里的 `'` 换成 `'\''`，整体不再加外层引号——但这会破坏正在用单引号包裹的值
- **更稳的方案**：直接禁止 cURL 模式渲染 → 让用户用结构化模式时才支持模板？太挫
- **折中**：cURL 文本里 `{{xxx}}` 替换为**裸的** value 字符串，**不做 shell 转义**——使用 cURL 的用户接受这个 caveat（值里不能有 `'`、`"`、`\` 等元字符）

文档提示用户：「值含特殊字符建议用结构化模式」。

## JSONPath 引擎（前端）

只实现一个**简化子集**，覆盖 95% 场景：

```
$.a.b           对象点取
$.a.b[0]        数组下标
$.a.b[0].c      混用
$.a["with-dash"] 方括号字符串键（少见但支持）
```

不支持：`$..deep`（递归）、`$.a[*]`（通配）、过滤器、函数。

实现一个 `evalJsonPath(obj, path): unknown`，找不到返回 `undefined`。

## 前端 UI

### 1) 会话详情页新增 `VarsPanel`
位置：JS 捕获面板下方、已保存请求上方

```
┌─ 🔧 变量池  3 个 ───────────────────────────────┐
│ token       eyJhbGc...  · 32 秒前        [✏] [🗑] │
│ resourceId  abc123                       [✏] [🗑] │
│ userId      5378072                      [✏] [🗑] │
│ + 添加变量                                       │
└─────────────────────────────────────────────────┘
```

操作：
- 添加：弹 prompt 输入 name + value
- 编辑：复用 prompt（默认值=当前 value）
- 删除：confirm 后调 API

### 2) ResponseView 加「提取为变量」按钮

按钮放右上角操作区（复制/下载旁），点击弹一个比 prompt 更复杂的 Dialog：

```
┌─ 提取为变量 ──────────────────────────────────┐
│ JSONPath:  [$.data.token              ]       │
│ 当前值:    eyJhbGciOiJIUzI1NiJ9.eyJ...        │
│ 变量名:    [token                     ]       │
│                            [取消]  [保存]      │
└───────────────────────────────────────────────┘
```

输入 JSONPath 时实时显示求值结果，便于用户校准。
保存时调 PUT API，成功后变量池刷新。

### 3) 请求编辑器的提示

不做特殊高亮（CodeMirror 自定义高亮成本高）。靠后端报错兜底。

## 影响范围

- 后端：
  - 新 sql 表
  - 新 `BrowserVar` domain / `BrowserVarRepository`
  - 新 `TemplateRenderer` 工具
  - `BrowserRequestService.execute` 加渲染步骤
  - `BrowserRequestService.delete` 级联清理变量
  - `BrowserRequestController` 加 3 个 endpoint
- 前端：
  - `types.ts` 加类型
  - `api.ts` 加 3 个函数
  - `BrowserRequestPage.tsx` 加 `VarsPanel` + `ExtractVarDialog` + JSONPath 工具
  - 顺便提取 `evalJsonPath` 工具到 `features/browser-request/utils/jsonpath.ts`

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| cURL 模板替换破坏引号 | 文档警告 + 推荐结构化模式存复杂值 |
| 用户写错 JSONPath 提取到 undefined | Dialog 实时显示求值结果 |
| 模板缺失变量静默 | 后端抛错，前端把 "缺少变量: xxx" 显示在响应位 |
| 变量名冲突大小写 | name 区分大小写（跟代码里 `{{Token}}` 与 `{{token}}` 一致） |
