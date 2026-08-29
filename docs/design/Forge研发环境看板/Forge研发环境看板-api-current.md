# Forge 研发环境看板接口文档

本文档定义 Forge 环境快照与一键初始化的 HTTP/SSE 契约；设计决策见 `Forge研发环境看板-current.md`。

## 变更记录

| 版本 | 日期 | 修改人 | 变更内容摘要 |
|---|---|---|---|
| v1 | 2026-08-26 | Codex | 新增环境快照与初始化 SSE 契约 |
| v2 | 2026-08-26 | Codex | 纳入公司套件一键安装与一键更新 SSE 契约 |

---

## 接口清单

| # | 方法 | 路径 | 用途 |
|---|---|---|---|
| 1 | GET | `/api/claude-chat/forge-environment` | 读取分层环境快照 |
| 2 | GET | `/api/claude-chat/forge-environment/bootstrap/stream` | 执行一键初始化并实时返回步骤 |
| 3 | GET | `/api/claude-chat/plugins/install/stream` | 同步五个套件仓并从本地一键安装 |
| 4 | GET | `/api/claude-chat/plugins/update/stream` | 同步五个套件仓并从本地一键更新 |
| 5 | GET | `/api/claude-chat/plugins/business-systems` | 读取四个业务系统、六个固定仓库状态 |
| 6 | GET | `/api/claude-chat/plugins/business-systems/sync/stream` | 一键拉取或安全快进业务源码 |

---

## 1. 读取 Forge 环境快照

### 1.1 基本信息

- **方法**：`GET`
- **路径**：`/api/claude-chat/forge-environment`
- **用途**：读取基础 CLI、研发方法工具、公司套件、依赖仓库和本地构建链状态。
- **认证**：沿用 `/api/claude-chat/**` 现有保护策略。
- **幂等**：是，只读探测。

### 1.2 请求

#### Query

| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `sessionId` | string | 否 | - | 有值时沿用会话的 Codex Home |
| `source` | string | 否 | `gitee` | 固定为 `gitee` 或 `github`；公司首次安装默认 Gitee |
| `fetch` | boolean | 否 | `false` | 是否刷新公司仓远端状态 |

### 1.3 响应

#### 成功

```json
{
  "state": "BLOCKED",
  "ready": false,
  "readyCount": 10,
  "totalCount": 13,
  "blockingCount": 2,
  "checkedAt": "2026-08-26T20:10:00Z",
  "groups": [
    {
      "id": "workflow",
      "name": "研发方法工具",
      "description": "代码图谱与规格驱动工具",
      "items": [
        {
          "id": "openspec",
          "name": "OpenSpec",
          "state": "INCOMPATIBLE",
          "blocking": true,
          "version": "1.6.0",
          "summary": "Node.js 版本不满足 20.19+",
          "detail": "当前 Node.js 18.20.0",
          "installCommand": "npm install --global @fission-ai/openspec@latest",
          "officialUrl": "https://github.com/Fission-AI/OpenSpec/blob/main/docs/installation.md"
        }
      ]
    }
  ]
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `state` | string | `READY`、`BLOCKED` 或 `ATTENTION` |
| `ready` | boolean | 所有 blocking 项是否就绪 |
| `readyCount` | integer | 状态为 `READY` 的依赖数量 |
| `totalCount` | integer | 依赖总数 |
| `blockingCount` | integer | 阻断项数量 |
| `checkedAt` | string | ISO-8601 检测完成时间 |
| `groups` | array | 分层依赖组 |
| `groups[].items[].state` | string | `READY`、`MISSING`、`INCOMPATIBLE`、`ATTENTION` 或 `CHECKING` |
| `groups[].items[].blocking` | boolean | 当前项是否阻断完整初始化 |
| `groups[].items[].detail` | string or null | 有界诊断，不含凭据 |

#### 错误

| HTTP 状态 | 触发场景 |
|---|---|
| 400 | `source` 非白名单值 |
| 500 | 聚合服务本身不可恢复失败；单项 CLI 失败不使用 500 |

---

## 2. 一键初始化 Forge 环境

### 2.1 基本信息

- **方法**：`GET`
- **路径**：`/api/claude-chat/forge-environment/bootstrap/stream`
- **响应类型**：`text/event-stream`
- **用途**：补齐缺失基础工具、Graphify、OpenSpec 和公司套件。
- **认证**：沿用 `/api/claude-chat/**` 现有保护策略。
- **幂等**：已就绪步骤跳过；同一时刻只允许一个任务。

### 2.2 请求

#### Query

| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `sessionId` | string | 否 | - | 有值时沿用会话的 Codex Home |
| `source` | string | 否 | `gitee` | 公司依赖 Git 源 |

### 2.3 SSE 事件

#### `snapshot`

```text
event: snapshot
data: {"state":"BLOCKED","ready":false,"blockingCount":2}
```

字段与环境快照接口相同，用于任务开始和结束时同步基线。

#### `step`

```text
event: step
data: {"id":"openspec","name":"OpenSpec","state":"RUNNING","message":"正在安装 OpenSpec"}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 固定步骤 ID |
| `name` | string | 用户可见名称 |
| `state` | string | `PENDING`、`RUNNING`、`SKIPPED`、`SUCCEEDED` 或 `FAILED` |
| `message` | string | 当前动作或结果摘要 |
| `detail` | string or null | 截断后的诊断输出 |

#### `restartRequired`

```text
event: restartRequired
data: {"message":"基础工具已安装，请重启 Forge 后继续初始化","completed":["git","node"]}
```

该事件表示已产生有效修改，但当前进程无法解析新 PATH；客户端不得显示“全部完成”。

#### `done`

```text
event: done
data: {"ready":true,"message":"Forge 研发环境已就绪"}
```

#### `error`

```text
event: error
data: {"stepId":"team-suites","message":"公司套件安装失败","detail":"Gitee authentication failed"}
```

客户端必须保留已经完成的步骤，并提供重新检测、重试或复制命令动作。

---

## 3. 一键安装公司套件

### 3.1 基本信息

- **方法**：`GET`
- **路径**：`/api/claude-chat/plugins/install/stream`
- **响应类型**：`text/event-stream`
- **用途**：将五个固定仓库同步到 `${user.home}/.kai-toolbox/team-tools`，随后从本地目录构建并安装三个插件和两个 MCP。
- **幂等**：已存在仓库执行安全快进拉取；已安装套件按当前状态执行安装或更新。

### 3.2 请求

| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `sessionId` | string | 否 | - | 有值时沿用会话的 Codex Home |
| `source` | string | 否 | `gitee` | 新克隆仓库的默认 Git 源 |

### 3.3 SSE 消息

接口使用默认 `message` 事件，`data.type` 为 `line`、`step`、`done` 或 `error`。`step` 携带步骤名、退出码和摘要；`done` 表示完整同步与本地安装链路结束。

---

## 4. 一键更新公司套件

### 4.1 基本信息

- **方法**：`GET`
- **路径**：`/api/claude-chat/plugins/update/stream`
- **响应类型**：`text/event-stream`
- **用途**：与一键安装使用同一条本地优先链路；先同步五个固定仓库，再从统一工作区重新构建并更新插件和 MCP。
- **安全边界**：本地仓有未提交修改时停止该仓操作并保留现场；Git 更新仅允许 `--ff-only`，不得删除或强制重置本地仓。

### 4.2 请求与事件

Query 参数和 SSE 消息格式与“一键安装公司套件”相同。前端在收到 `done` 或 `error` 后重新读取环境快照。

## 5. 读取业务系统源码状态

### 5.1 基本信息

| 项 | 内容 |
|---|---|
| Method | `GET` |
| Path | `/api/claude-chat/plugins/business-systems` |
| 用途 | 返回四个业务系统、六个固定仓库的目录、Git 与同步状态 |

### 5.2 请求

| 参数 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `fetch` | boolean | `false` | 是否刷新远端引用后计算 ahead/behind |

## 6. 一键拉取业务系统源码

### 6.1 基本信息

| 项 | 内容 |
|---|---|
| Method | `GET` |
| Path | `/api/claude-chat/plugins/business-systems/sync/stream` |
| Produces | `text/event-stream` |
| 用途 | clone 缺失仓库，并对安全仓库执行 fetch 与快进更新 |

### 6.2 请求与事件

`system` 默认 `all`，也可传 `erp`、`erp-mini-program`、`srm` 或 `scm`。事件沿用 `message`，其中 `line` 表示 Git 输出，`step` 表示单步退出码，`done` 携带逐仓库结果；任一仓库失败不删除或覆盖其他仓库。
