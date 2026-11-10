## Context

`cua_repl` 的可访问性节点编号属于一次页面快照。Vibe Coding 消息区会在流式输出和活动更新时重新渲染，旧编号可能在下一次点击前失效。当前 Sidecar 会把失败结果送回 Codex，但没有明确恢复规则；`sidecar/claude-agent/src/codexAppServer.ts` 也只生成通用失败标题。

## Goals / Non-Goals

**Goals:**

- 让 Codex 在动态节点失效后重新读取状态、按语义定位并最多重试一次。
- 让失败原因和后续恢复在活动卡片中可判断。
- 避免对不可恢复错误或相同旧节点进行循环重试。

**Non-Goals:**

- 不修改外部 `cua_repl` 插件实现。
- 不在 Sidecar 内重放任意浏览器副作用。
- 不用 `js_reset` 处理普通节点失效。

## Decisions

1. 在 `codexEngine.ts` 组装标准开发会话的 developer instructions 时加入快照生命周期规则。由模型重新读取页面并确认目标语义，Sidecar 不具备安全重放点击所需的页面上下文。
2. 在 `codexAppServer.ts` 映射 MCP 终态时只识别已知动态节点错误，为卡片生成可恢复标题，并设置 `outcome`。前端现有归约逻辑会在同工具成功后把上一失败标记为“已自动重试”。
3. 重试上限为一次。失败后再次获取新快照，仍失败则保留真实错误并交由模型改变策略。

替代方案包括自动重放原 MCP 参数和失败即 `js_reset`。前者会重复点击等副作用，后者会丢失 REPL 绑定，均不采用。

## Risks / Trade-offs

- [模型仍可能未遵守恢复规则] → 使用明确、短小的强约束，并以回归测试锁定注入文本。
- [错误文本变体未命中] → 仅对已知节点/执行上下文失效模式分类，未知错误保持原通用失败和完整输出。
- [恢复成功仍留下失败卡片] → 复用前端基于同工具 `outcome=success` 的恢复标记，保留审计痕迹。

## Migration Plan

构建并重启 Sidecar 后，新一轮 Codex 会话立即生效，无数据迁移。回滚时删除恢复提示和错误标题分类即可。

## Verification

运行 Sidecar 全量测试、TypeScript 编译和 OpenSpec 校验；再使用真实 `cua_repl` 读取动态页面，验证动作后刷新 AX 状态的正常路径。

## Open Questions

无。
