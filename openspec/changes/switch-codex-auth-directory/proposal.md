## Why

Vibe Coding 仅在创建 Codex 会话时允许填写 Auth 目录。会话开始后，用户无法从当前工作上下文发现并切换到另一个已登录账号，只能回到新建流程手工重填路径。

## What Changes

- 在当前 Codex 会话的模型配置中列出本机可用的 `.codex*` 授权目录。
- 用户选择其他目录后先解释 Codex thread 的目录绑定，再经确认创建并切换到同工作目录、同运行配置的新会话。
- 切换时生成版本化结构交接包：规格优先，显式记录证据范围、规格缺口、恢复顺序和目标 Auth 必须重新核验的状态。
- 保留原会话，不原地改写授权身份，不混合不同 Auth 的模型或 thread 数据。

## Capabilities

### New Capabilities

- `codex-auth-directory-switch`: 定义当前会话发现和切换多个 Codex 授权目录的行为。

## Impact

- 前端：Vibe Coding 会话配置与授权目录选择反馈。
- 后端：增加只返回用户主目录直属 `.codex*` 文件夹的只读目录接口。
- 会话协议与数据库：沿用既有 `duplicateSession`、`codexHome` 与首轮显式交接消息，无迁移。

## Product Principles

- OBJ-01：动作附着当前会话，沿用其工作目录和运行配置。
- CTX-01：保留源会话，成功后进入新会话。
- FEED-01、CTRL-01：执行前明确新建语义及目标 Auth，避免把目录点击误解为原地换号。
- AI-01、EVID-01：交接包把规格、代码事实、会话推断和待核验项分层，不把摘要冒充已验证事实。
