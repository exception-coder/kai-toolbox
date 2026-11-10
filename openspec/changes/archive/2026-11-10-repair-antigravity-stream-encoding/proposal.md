## Why

Antigravity 在 Windows 上的实时回复偶发出现 Unicode 替换字符，但同一轮由 Antigravity 写入的 UTF-8 transcript 完整正确。Forge 当前直接信任 CLI stdout 增量，导致正确的上游最终内容在浏览器中被显示为乱码。

## What Changes

- 在 Antigravity 引擎适配边界校验实时文本完整性，不把包含替换字符的流式结果当作可信终态。
- 一轮结束后以该 conversation 的 UTF-8 transcript 最终模型回复进行确定性校准，并通过统一事件让客户端替换当轮草稿。
- 保留正常回复的实时流式体验；transcript 不可用时给出可观察告警，不伪造成功文本。
- 增加中文多字节文本、损坏增量、正确终态校准与正常流式路径回归。
- 对尚未产生可见输出的启动认证与资格检查瞬态错误执行有界安全重试。
- Antigravity 把命令转为后台任务并以“请稍候”结束 print 回合时，复用同一 conversation 自动续跑，直至获得实质性终态或达到有界停止条件。

非目标：不修改 Antigravity CLI、不按浏览器或移动端分别处理、不自动修复历史 transcript。

证据来源：会话 `33ca067c-a135-40e5-860d-0df70e880098` 页面显示 `污���`、`切���`，而 `~/.gemini/antigravity-cli/brain/<conversation>/.system_generated/logs/transcript.jsonl` 对应内容为“污染”“切换”。

## Capabilities

### New Capabilities

- `antigravity-message-integrity`: 约束 Antigravity 实时输出与权威 transcript 的完整性校准、降级和客户端无关行为。

### Modified Capabilities

无。

## Impact

- Sidecar Antigravity stdout 适配器与会话事件。
- Java WebSocket 统一消息映射和 React 会话状态归并。
- Antigravity、后端消息契约及前端 reducer 回归测试。
- Sidecar 启动恢复、后台任务续跑和总时限保护。
- 不新增数据库表、外部依赖或人工 SQL。
