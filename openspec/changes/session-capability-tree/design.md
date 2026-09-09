## Context

当前 `SessionCapsPanel.tsx` 仅接收 MCP 的 `name/status`，Java `ServerMessage.Ready` 和 Sidecar `CapabilitySnapshot` 同样只保留该最小结构。`codexAppServer.ts` 已调用 `mcpServerStatus/list`，但解析后丢弃 Tool、认证和服务信息；尚未调用已由当前 Codex App Server schema 提供的 `plugin/list` 与 `skills/list`。

当前工作树存在其他未提交功能，本变更只修改会话能力链路和对应 OpenSpec 文件，不覆盖无关改动。

## Goals / Non-Goals

**Goals:**

- 使用当前会话绑定的 Codex Auth 目录和工作目录取得权威能力目录。
- 让 Sidecar、Java 和前端共享稳定、可兼容演进的能力快照契约。
- 明确表示运行时事实、配置态降级和查询错误。
- 提供桌面端与移动端均可扫描的诊断树。

**Non-Goals:**

- 不在该面板中安装、升级、启用或删除插件。
- 不扫描临时缓存目录推断插件是否生效。
- 不为 Claude Code、Antigravity、OpenCode 虚构其 SDK 未提供的能力字段。
- 不新增 HTTP 接口、数据库表或人工待执行 SQL。

## Decisions

### Use App Server catalogs as the Codex authority

Codex 会话使用 `mcpServerStatus/list` 判断本线程 MCP 的运行状态与 Tool 注入事实，使用 `plugin/list` 判断当前 Auth 目录的插件安装和版本状态，使用 `skills/list` 判断当前工作目录实际加载的 Skills。相比文件系统扫描，该方案与本轮实际运行时一致，并能在官方目录变化时自动跟随。

替代方案是扫描 `.codex/plugins` 和 Skills 目录；该方案无法证明 Tool 已注入，也容易被旧缓存和多 Auth 目录污染，因此只作为 App Server 不可用时的现有配置态降级，不作为权威事实。

### Extend one backward-compatible capability snapshot

沿用现有 `ready` 与 `init` 事件，新增 `capabilitySource`、`capabilityRefreshedAt`、`capabilityErrors`、`plugins`、丰富的 `skills` 和 `mcpServers` 字段。保留旧的字符串 Skills 和最小 MCP 数据兼容解析，避免协议升级期间页面崩溃。

### Keep aggregation at the Sidecar boundary

Sidecar 负责把三个 App Server 响应归一为会话能力快照；Java 只缓存和透传，前端只负责展示。这样不会把 Codex 私有 schema 扩散到 Java 和 React，也便于未来为其他引擎增加独立适配器。

### Model provenance as deterministic, multi-valued evidence

每个 MCP、Tool、Plugin 和 Skill 使用同一份来源证据结构，包含 `origin`、`scope`、`sourceId`、`effective` 和 `evidence`。来源允许多值：同名 MCP 同时存在于 Auth 配置和 Forge 会话配置时，Forge 会话覆盖项标记为当前有效，Auth 项保留为被覆盖证据，不能丢失或强行二选一。

来源只能由确定性事实产生：Forge 构建的会话 MCP 清单、当前 Auth 的 `config.toml` MCP 名称、App Server 返回的 `pluginId`、Skill 的官方 `scope`。Tool 继承其所属 MCP 的有效来源。没有证据时使用 `unknown`，禁止根据名称、路径片段或描述猜测。

`verified` 描述能力是否被运行时核验；`provenance.evidence` 描述来源判断依据。两者相互独立，避免把“知道由 Forge 配置”误写成“Tool 已成功注入”。

### Display diagnostics as a compact disclosure tree

面板使用分区、细分隔线和 disclosure 行，不使用嵌套卡片或大量胶囊。健康节点默认收起，失败、未验证和版本不一致节点默认展开；窄屏保持单列和内部纵向滚动。状态同时使用文字与图标，避免仅靠颜色传达。

## Risks / Trade-offs

- [插件目录远端刷新可能较慢] → 初始化使用缓存目录，用户显式刷新时才请求远端刷新，并保留上一份快照直到新结果完成。
- [部分 App Server 版本不支持插件目录方法] → 逐项使用独立结果，MCP 成功时不因插件查询失败而整体丢失；错误进入 `capabilityErrors`。
- [SDK 回退无法证明运行时 Tool] → 来源标记为 `sidecar-config`，UI 明确显示未验证，不使用“已连接”措辞。
- [同名 MCP 可能由会话配置覆盖 Auth 配置] → 保存多条来源证据并显式标识当前有效项，禁止只按名称归为单一来源。
- [目录数量较大] → 只传展示需要的名称、版本、状态和说明，不透传 Tool schema、插件完整元数据或图标二进制。

## Migration Plan

1. 先发布可解析新旧字段的 Java 与前端。
2. 再发布产生丰富快照的 Sidecar。
3. 重启 Java 后端和 Sidecar，刷新会话能力面板验证当前 Auth 与工作目录。
4. 回滚时恢复旧 Sidecar；新增字段均为可选，Java 和前端继续显示旧名称清单。

## Verification Strategy

- Sidecar 单元测试覆盖 App Server 响应解析、插件与 Skill 聚合、部分失败降级。
- Java 测试覆盖丰富快照的 JSON 解析与 `ready` 透传。
- 前端类型检查与组件测试覆盖树展开、版本不一致、配置态降级和空状态。
- 在桌面和移动视口检查面板密度、滚动、焦点和长名称溢出。

## Open Questions

- Claude Agent SDK 后续若提供插件与 Tool 目录，应通过同一快照契约增加新的权威来源，不改变当前 Codex 行为。
