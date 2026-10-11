# Codex 原生续问预测

## Why

用户希望回复结束后在空输入框看到浅灰续问建议，按 Tab 采纳后自行发送。Forge 当前 Codex 0.159.3 没有该协议；0.162.1 的实验 App Server 契约新增 `thread/prediction/request` 与 `thread/prediction/updated`。

## What Changes

- 固定升级 Codex SDK/CLI 到 0.162.1，检查升级后的反向请求及预测契约。
- 成功的官方 Codex 开发轮次结束并释放 writer 后异步读取原生预测；使用选定授权目录和原生 thread/turn 身份。
- 输入框空白时展示浅灰建议，桌面 Tab、手机点击仅填入草稿；保留用户发送动作。
- 失败、无建议、旧会话/旧轮次、已有草稿和正在执行任务时不展示。新轮次先取消并释放旧预测 writer。

## Impact

影响 Sidecar Codex 适配、现有 WebSocket 消息投影和 Vibe Coding 输入框。没有数据库变更、独立模型提示词或额外配置页。预测使用服务商原生能力，账号可用性及额度以实际返回为准。
