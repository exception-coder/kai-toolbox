## Context

`sidecar/claude-agent/src/antigravityEngine.ts` 将 `agy --output-format stream-json` 的 stdout 解码为 JSONL，并把 `assistantDelta` 经 Java WebSocket 网关转给 React。当前链路没有终态完整性校验。实测 Antigravity 1.2.7 在 Windows 代码页 936 环境中，CLI 实时输出偶发包含 Unicode replacement character，而同一 conversation 的 UTF-8 transcript 正确。

当前 Java `AntigravityHistoryReader` 已把 transcript 作为历史读取来源，但实时轮次结束时不会用它校准浏览器中的当轮草稿。Graphify 定位到 `runAntigravityTurn()`、`ClaudeChatService.onSidecarMessage()` 和 `useClaudeChatSocket` 的 `assistantDelta` 分支；实施前已用当前源码复核这些坐标。

## Goals / Non-Goals

**Goals:**

- 正常流式增量保持低延迟。
- 一轮完成后以本机 Antigravity transcript 为该引擎回复的权威终态。
- 所有客户端通过同一 WebSocket 事件获得校准，不做浏览器、桌面端或移动端分支。
- transcript 缺失或尚未可读时保持可观察，不用错误内容覆盖现有回复。

**Non-Goals:**

- 不修改或升级 `agy.exe`。
- 不猜测整条 stdout 是 GBK、UTF-8 或混合编码，也不对损坏字节做不可验证的反向推断。
- 不批量修复历史数据。

## Decisions

### 1. Transcript 作为 Antigravity 终态来源

Sidecar 在进程关闭后按 conversation ID 读取 `.gemini/antigravity-cli/brain/<id>/.system_generated/logs/transcript.jsonl`，选择最后一条 `MODEL / PLANNER_RESPONSE`。仅接受合法 UUID、UTF-8 JSONL 和非空文本。

选择该方案而不是按当前 Windows code page 重解码 stdout：现场证据证明 transcript 正确，但没有证据表明整个 stdout 使用单一非 UTF-8 编码；盲目转码可能破坏原本正确的中文。

### 2. 新增 replace-semantics 的 `assistantSnapshot` 事件

Sidecar 累计本轮已发出的 assistant 文本。进程结束后，若 transcript 终态与累计文本不同，发送包含完整文本的 `assistantSnapshot`；Java 网关保持序列号、缓冲与重放语义，React 用快照替换最近一条当轮 assistant 草稿。相同则不发事件。

该事件是完整快照而不是负增量，避免客户端用退格符、差分补丁或编码猜测恢复。事件仅替换当前轮最近的非语音 assistant 项，不影响历史轮次和工具项。

### 3. 缺失 transcript 时失败可见但不中断已有回复

如果实时累计文本包含 `U+FFFD` 且 transcript 无法读取，Sidecar 发送 warning，保留当前文本并正常完成已有终态判断。这样不会把一次本地投影暂不可用升级为整轮失败，也不会假装乱码已修复。

### 4. 回归边界

- Sidecar：正确 UTF-8 中文、包含替换字符的流与正确 transcript、相同终态不重复快照、非法 conversation ID。
- Java：`assistantSnapshot` 从 Sidecar 映射为带序号的浏览器消息，并进入可回放类型白名单。
- React：快照替换最近一条 assistant 草稿，且不覆盖用户消息、语音转写或前一轮回复。

### 5. 启动认证错误的安全重试

`agy --print` 启动阶段可能先发起资格检查、随后才从 Windows Keyring 完成静默认证。仅当本轮尚未产生任何可见回复，且诊断明确属于 `not logged in`、`loadCodeAssist` 503 或 `UNAVAILABLE` 时，Sidecar 才在短退避后重启同一请求。已产生文本、权限拒绝、额度不足、地区限制及其它永久错误不重试，避免重复执行已被上游接受的任务。

### 6. 后台任务临时终态自动收口

Antigravity 会把长命令转为后台 task，并要求 print 模式发送“正在执行，请稍候”后结束本次 CLI 进程。该进程退出不代表用户任务完成。Sidecar 对短小、明确的进度占位回复执行确定性分类；命中后不发送最终 `result`，而是携带同一 conversation ID 注入内部继续指令，让 Antigravity 读取后台结果并继续。认证重试与后台续跑分别计数，且共享单轮总时限；达到上限后返回可恢复错误，不伪装完成。

续跑期间仍保留工具和文本事件的顺序，但内部继续指令不作为新的用户消息进入 Forge 会话。最终 transcript 快照仍是唯一终态文本来源。

产品原则：`AI-01`（不把不可信模型/CLI 输出直接视为终态）、`EVID-01`（以可复核 transcript 校准）、`REC-01`（校准失败保留原回复并给出恢复信息）。无例外。

## Risks / Trade-offs

- [Risk] transcript 写入晚于进程关闭 → Sidecar 在有 conversation ID 时做短时有界重读；仍不可用则只告警。
- [Risk] 新快照事件被旧客户端忽略 → 旧客户端仍保留现有流式行为；新客户端获得修复，不破坏连接。
- [Risk] 最后一条 transcript 属于上一轮 → 仅接受本轮开始后更新的 transcript 文件；不满足则不覆盖。
- [Trade-off] 轮次结束时可能产生一次额外重渲染 → 仅文本不一致时发送，换取确定的完整性。
- [Risk] 模型把普通解释写成“请稍候” → 仅接受短小且同时包含执行态与等待语义的占位回复，并限制自动续跑次数。
- [Risk] 上游在接收请求后才返回瞬态错误 → 只有无可见输出的启动/资格检查错误可重试；其它错误保持失败。

## Migration Plan

先部署兼容新事件的 Java/React，再启用同一制品中的 Sidecar 发送逻辑。回滚可整体回退本提交；没有数据库迁移。源码构建与测试完成后仍需用户明确确认重启，才能执行真实 Antigravity 运行验收。

## Open Questions

无阻塞问题。是否向 Antigravity CLI 上游报告 stdout 损坏可作为后续动作，不影响本地确定性修复。
