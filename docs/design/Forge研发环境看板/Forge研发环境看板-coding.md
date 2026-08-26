# Forge 研发环境看板编码摘要

本文档对应 `Forge研发环境看板-current.md`，用于约束具体实现落点和方法职责。

## 变更记录

| 版本 | 日期 | 变更内容摘要 |
|---|---|---|
| v1 | 2026-08-26 | 建立环境快照、一键初始化和前端看板编码坐标 |
| v2 | 2026-08-26 | 增加套件安装/更新入口并统一 Git 同步与本地安装规则 |

---

## 1. 核心业务规则

- 前端不得传入任意命令、包名、仓库或本地路径。
- 初始化仅补齐缺失项，已安装项跳过；套件安装和升级均可从 Forge 环境页显式触发。
- OpenSpec 最低 Node.js 20.19；Graphify 最低 Python 3.10；Forge 本地构建最低 Java 21。
- Java/Maven 构建链异常显示告警但不阻断已部署 Forge 的公司套件初始化。
- 安装命令成功后必须重新探测；当前进程仍找不到命令时停止并返回 `restartRequired`。
- 单项探测失败不得让整个快照接口失败；诊断输出必须截断且不得包含凭据或环境变量。
- 公司套件继续复用五个固定仓库、三个插件和两个 MCP 的现有白名单。
- 公司套件工作区固定为 `${user.home}/.kai-toolbox/team-tools`；所有安装和更新先同步仓库，再从本地目录执行。
- 已存在仓库仅在工作树干净时执行 `git pull --ff-only`；不得删除、强制重置或覆盖用户修改。
- SSE 事件固定为 `snapshot`、`step`、`restartRequired`、`done`、`error`。

---

## 2. 接口入口指针

| 接口 | 实现类 #方法 |
|---|---|
| `GET /api/claude-chat/forge-environment` | `ForgeEnvironmentController#readiness` |
| `GET /api/claude-chat/forge-environment/bootstrap/stream` | `ForgeEnvironmentController#bootstrap` |
| `GET /api/claude-chat/plugins/install/stream` | `PluginUpdateController#install` |
| `GET /api/claude-chat/plugins/update/stream` | `PluginUpdateController#update` |

---

## 3. 涉及类清单

| 全路径 | 操作 | 说明 |
|---|---|---|
| `com.exceptioncoder.toolbox.claudechat.api.ForgeEnvironmentController` | 新增 | 环境快照与 SSE HTTP 适配 |
| `com.exceptioncoder.toolbox.claudechat.api.dto.ForgeEnvironmentView` | 新增 | 环境总览与依赖项封闭契约 |
| `com.exceptioncoder.toolbox.claudechat.service.ForgeEnvironmentService` | 新增 | 只读探测、版本门禁和套件聚合 |
| `com.exceptioncoder.toolbox.claudechat.service.ForgeEnvironmentBootstrapService` | 新增 | 初始化步骤拓扑、互斥与恢复编排 |
| `com.exceptioncoder.toolbox.claudechat.service.PluginUpdateService` | 修改 | 提取供初始化编排复用的同步安装入口 |
| `frontend.src.features.forge-environment.pages.ForgeEnvironmentPage` | 新增 | 页面数据和 SSE 生命周期编排 |
| `frontend.src.features.forge-environment.components.ReadinessSummary` | 新增 | 总结论、阻断说明与主操作 |
| `frontend.src.features.forge-environment.components.DependencySection` | 新增 | 分组依赖清单及恢复动作 |
| `frontend.src.features.forge-environment.components.SuiteOperations` | 新增 | 套件安装、更新与本地优先说明 |
| `frontend.src.features.forge-environment.components.BootstrapProgress` | 新增 | 步骤日志和执行结果 |

### 关键方法签名与职责

```text
ForgeEnvironmentService#inspect(String sessionId, String source): ForgeEnvironmentView
  并行探测固定工具，聚合套件与仓库并生成总览。

ForgeEnvironmentService#inspectTool(ToolDefinition definition): DependencyView
  执行单个固定探测命令并应用最低版本规则。

ForgeEnvironmentBootstrapService#start(String taskId, String sessionId, String source): void
  在虚拟线程中启动单一初始化任务并发布 SSE。

ForgeEnvironmentBootstrapService#bootstrap(String taskId, String sessionId, String source): BootstrapResult
  按拓扑跳过或执行固定安装步骤，并在 PATH 需刷新时停止。

PluginUpdateService#installDependencies(String taskId, String sessionId, String source): List<Map<String, Object>>
  同步完成五仓拉取、MCP 构建、双端插件和 MCP 安装，不自行完成 SSE。

PluginUpdateService#startInstall(String taskId, String sessionId, String source): void
  异步执行五仓同步与本地安装链路并发布默认 SSE 消息。

PluginUpdateService#startUpdate(String taskId, String sessionId, String source): void
  异步执行五仓安全快进同步、本地重建和套件更新，并发布默认 SSE 消息。
```

---

## 4. 数据结构

### 关键 DTO 字段

```java
public record ForgeEnvironmentView(
        String state,
        boolean ready,
        int readyCount,
        int totalCount,
        int blockingCount,
        String checkedAt,
        List<DependencyGroupView> groups) {
}
```

```java
public record DependencyView(
        String id,
        String name,
        String state,
        boolean blocking,
        String version,
        String summary,
        String detail,
        String installCommand,
        String officialUrl) {
}
```

前端使用与后端同构的联合类型：`READY | MISSING | INCOMPATIBLE | ATTENTION | CHECKING`；未知值按 `ATTENTION` 渲染，避免页面崩溃。

---

## 5. 重要约束与边界

- 幂等键：进程内 `AtomicBoolean` 作为单任务门禁；重复启动返回明确冲突状态。
- 并发控制：探测可并行；安装按依赖顺序串行；公司套件内部沿用既有顺序。
- 事务范围：无数据库事务。
- 输出边界：每个 CLI 步骤最多保留末尾 16 KB 输出，页面默认仅展示摘要。
- 安装边界：Windows 首版优先 WinGet；macOS 仅在 Homebrew 存在时自动安装；其它平台返回手工指引。
- 不处理的场景：自动登录账号、修改 shell 启动文件、初始化具体业务项目的 OpenSpec root、替用户修复私有仓权限。

---

## 6. 下游依赖调用

```text
PluginUpdateService#readSuites(String sessionId, boolean fetch, String source)
PluginUpdateService#readRepositoryStatuses(String source, boolean fetch)
PluginUpdateService#installDependencies(String taskId, String sessionId, String source)
SseEmitterRegistry#create(String taskId)
SseEmitterRegistry#publish(String taskId, String eventName, Object payload)
```

固定命令定义集中在环境服务内部，不通过 DTO、配置热更新或请求参数覆盖。

---

## 7. 异常处理要点

- 初始化任务已运行 → 返回冲突错误，页面保持当前任务上下文。
- 固定命令不存在 → 依赖状态 `MISSING`，提供安装命令和官方链接。
- 版本低于门禁 → 依赖状态 `INCOMPATIBLE`，阻断其下游步骤。
- 安装返回非零 → 发布失败 `step` 后发布 `error`，保留已完成步骤。
- 安装成功但复检不可见 → 发布 `restartRequired`，正常结束 SSE，不伪报完整就绪。
- 公司仓拉取或安装部分失败 → 由既有步骤结果逐项展示，总览保持 `BLOCKED`。
- 公司仓工作树非干净 → 不执行 pull、删除或覆盖；返回失败步骤并提示先处理本地修改。
