## Why

Codex 会话的已选模型独立于授权目录返回的模型目录持久化。当账号权限或目录发生变化时，刷新会成功但旧选择仍显示，用户会误判为刷新失效，并可能继续使用当前 Auth 不再公开的模型。

## What Changes

- 在模型配置入口和模型列表中明确标识“当前模型不在此 Auth 的可用目录”。
- 展示本次模型目录对应的 Auth 目录，解释刷新不会自动替换已选模型。
- 提供显式恢复操作，将会话切换到当前 Auth 的默认模型；保留复制会话并选择其他 Auth 的指引。
- 增加组件测试，覆盖匹配、失配与恢复行为。

## Capabilities

### New Capabilities

- `codex-model-auth-mismatch-recovery`: 定义 Codex 会话模型与授权目录不一致时的识别、说明和恢复行为。

### Modified Capabilities

（无）

## Impact

- 前端：`frontend/src/features/claude-chat/components/CodexSessionOptions.tsx` 及组件测试。
- 协议、后端、数据库：无变化；继续以 Sidecar 按会话 `codexHome` 返回的 `model/list` 为权威目录。
- 兼容性：保留既有模型值，只有用户点击恢复操作时才改为默认模型。
