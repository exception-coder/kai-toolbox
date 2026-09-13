## Context

基线 HEAD 为 59c39e2。Graphify 2026-08-25 图谱将调用链定位到 ChatPage/useClaudeChatSocket → ClaudeChatService/SidecarClient → sessionManager/runCodexTurn/runCodexAppServerTurn；已按当前源码补齐。现有 app-server 为每个 Forge 轮次创建进程，不能另起 writer 抢占原生线程。现有 VoiceInputButton 走 Whisper，与本能力不同。

## Goals / Non-Goals

目标为当前官方 Codex Code 会话中的连续双向语音，复用原生线程及代码任务。非目标为声纹克隆、第三方引擎语音、分享/咨询扩权、保存原始音频、改造所有会话为常驻进程。

## Decisions

### 对象与交互

适用 OBJ-01、NAV-01、CTX-01、DENS-01、FEED-01、AI-01、EVID-01、CTRL-01，无例外。对象为已绑定 Forge sessionId，对应既有 sdkSessionId；输入栏紧凑按钮打开原位语音控制区，不新增导航或项目选择。保留文字草稿，停止/失败后焦点回入口。窄屏控制区可换行，按钮可键盘操作，状态区有可访问标签。

### 协议与层次

采用当前依赖 @openai/codex 0.153.4 的生成协议：thread/realtime/start（outputModality=audio，transport=webrtc+sdp）、thread/realtime/sdp、transcript/delta、transcript/done、error、closed、stop。浏览器通过 WebRTC 原生媒体流播放音频，不引入 STT/TTS 拼接。SDP 只瞬时投递给发起连接，不进入消息回放或日志。

真实账号探测确认需要在线程 config 中设置 `features.realtime_conversation=true`，启动参数显式指定 `version=v3`；默认关闭时返回不支持 realtime，旧 v1/v2 被当前上游拒绝。仅对本次语音线程启用，不修改全局配置。生成协议校验使用 `--experimental`，同时覆盖 `currentTime/read` 的 Unix 秒级返回契约。

语音线程同时设置 `suppress_unstable_features_warning=true`，由入口旁的中文“实验功能”说明承担能力提示，避免把英文全局配置建议混进消息流。该覆盖只属于本次语音调用，不修改用户配置文件，也不屏蔽实际连接错误。

客户端先获取麦克风并建立 offer，再通过既有 send 准入启动语音轮次。Java 的 focused 语音服务验证 Code/official/连接归属，维持连接和 callId 绑定，控制命令只允许 stop/heartbeat。Sidecar focused realtime 模块维持启动与活动句柄；runCodexTurn 沿用既有权限和 MCP 配置，runCodexAppServerTurn 的文字分支不变，语音分支启动 realtime 并复用原生工具事件翻译。

准入消息显式携带 voiceCallId；普通文字轮次不会消费预备语音，取消或过期的语音轮次直接失败，不能回退为文字重放。普通 result 只有通过当前 Forge turnId 校验后才能结束通话；语音信令额外以 callId 隔离。

### 生命周期与恢复

UI 状态 idle → connecting → connected/muted → idle；任意失败进入 error，可重试。每次启动有唯一 callId，过期事件不作用到新通话。获取设备等待期间可以取消；迟到授权取得的 track 必须立即释放。页面切换、socket 断线、挂起和退出停止本地媒体；服务端连接解绑和有限心跳租约兜底结束 realtime。

语音会话占用一个 Forge 轮次，可容纳多个 native turn。native turn/completed 在音频会话活跃时不释放 app-server；每个 native turn 重新初始化完成门闩。结束通话先 stop realtime，已运行代码继续，等其完成后才发 Forge result 并释放 writer。语音启动不自动降级 SDK，不自动重放。开始时已有文字轮次则提示等待；通话内文字可通过 realtime appendText 补充，显式携带 user 角色。

### Evidence baseline

- [OpenAI App Server](https://developers.openai.com/codex/app-server)：自定义客户端协议集成，2026-09-13 已读取；语音细节以本机锁定依赖生成类型为准。
- [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)：安全上下文、设备授权与失败语义，2026-09-13 已读取。
- [MDN AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)：PCM 方案候选；本次选择 WebRTC 直接媒体以减少手动重采样、缓冲和回声处理。

## Risks / Trade-offs

- 实验协议和账号可用性 → schema 检查及真实启动探测；失败如实展示，禁止假称语音已接通。
- 多轮执行与 writer 生命周期 → 对语音停止、native turn 收口、启动失败和跨线程事件提供回归测试。
- 断网、浏览器后台与权限拒绝 → 本地立即清理、连接归属和心跳租约；不自动恢复录音。
- SDP/媒体敏感且高频 → WebRTC 音频不经过消息历史，SDP 不存库、不回放、不输出调试日志。

## Migration Plan

无 DDL。构建 frontend、sidecar、受影响后端和宿主；通过 Forge static/runtime 并实际重启验收，前后端及 sidecar 观察至少 60 秒。回滚本次源码提交并重建即可，既有文字历史保持兼容。

## Open Questions

当前账号已通过原生 realtime v3 连接验证；无未决业务选择。实验协议与其他账号可用性仍需升级时重新验收。

## Verification

2026-09-13 验收记录：

- 前端 116 项测试、typecheck/build 通过；sidecar 194 项测试及 11 类 app-server 服务端请求/实验语音 schema 校验通过。
- 后端受影响模块 397 项测试中 396 通过、1 项跳过，无失败；宿主装配构建通过。
- Forge CLI 全量质量门禁返回 PASSED，9 个运行场景通过。`executedCheckers` 为空，不能视为执行了静态 checker；静态证据来自上述实际构建、类型检查和测试。
- 浏览器原生 WebRTC 探测已连接并收到音频 track；登录后的实际会话验证麦克风获取、实时字幕、静音、取消、重连、挂断和焦点恢复。390px 窄屏及桌面入口已检查。
- 通话中通过文字补充触发 Codex 只读测试文件，原生代码轮次返回 `native-voice-check-42`，语音字幕随后返回该结果，代码完成后通话继续。多轮收口及执行中挂断边界另有单元测试。未进行人工听感评定；实时语音曾先给出不准确的口头结果，随后按代码结果纠正，不能把口头回复作为工具执行证据。
- 英文实验功能警告在新通话中不再出现，中文实验提示仍可见，实际错误保留。
- 最终开发模式宿主于 09:49:20 启动：Java PID 87200、API 18080，sidecar PID 70744、端口 18890；前端 HTTPS 5173。最终完整服务观察 67 秒，进程身份不变、主服务重启次数均为 0、HTTP 200，当前启动日志无致命异常。既有微信辅助服务未就绪、Ollama 嵌入回填不可达，未作为本次语音验收通过项。
- 共享治理记录工具因既有未跟踪 `.codex-work/node_modules/.modules.yaml` 越界链接返回 `PATH_SYMLINK`，未取得共享治理 PASS；未修改该无关链接。项目 Forge 门禁独立执行。
