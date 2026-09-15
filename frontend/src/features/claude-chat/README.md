# Vibe Coding 会话

页头显示当前对话方式：**开发助手**用于项目代码和任务，**自由对话**用于问答、写作和内容创作。点击名称展开选择；切换保留各自会话和适用草稿，不会把两种方式的消息混在一起。

## 原生语音对话

在 Vibe Coding 的 **Code Agent → 官方 Codex** 会话中，点击输入区上方的 **语音对话** 并允许麦克风。语音发起的代码任务仍在执行时，可以立即重新连接原会话音频，无需等待任务结束。显示“语音已连接”后可以连续说话，听取 Codex 回复并在聊天气泡中查看转写；桌面端同一通话内也可通过原有“补充到当前轮”补充文字。

**静音**只关闭麦克风输入；**结束通话**停止收音和播放，已启动的代码任务继续执行，仍沿用原有工具审批。原有文字草稿保留。你说的话和助手口头回复逐句显示在原有聊天消息列表里，转写过程中更新同一气泡，结束通话后保留在当前视图。语音文字尚未作为独立历史消息保存，刷新或切换会话后以原生线程历史为准；代码任务输出保持独立。

同一会话只保留一路音频，最后主动点击连接的设备接管：在手机点击恢复时，电脑停止收音和播放并显示“语音已转移到另一设备”，代码任务继续执行。旧设备不会自动抢回；连续多端点击以服务端最后收到的合法请求为准。连接仍受麦克风权限、网络和上游能力影响，失败可明确重试。

刷新、切换会话、隐藏页面或网络断开会结束通话，但不停止代码任务。同一浏览器标签页会记住该会话的恢复提示；返回后显示 **恢复语音**，需要点击才会重新收音。原语音线程仍在执行代码时，恢复操作立即协商新音频连接，不新建、排队或中断代码任务。重连会等待旧音频关闭确认，超时可重试；若原线程已退出或任务从未开启语音，会明确提示不能恢复。离开页面、断网或切换会话会释放本地音频；显式结束通话会清除恢复提示。浏览器禁用会话存储时仍可开启语音，但不能保留刷新恢复提示。授权拒绝、设备占用和连接失败会显示原因，可调整浏览器权限后重试，也可继续文字会话。请使用 HTTPS 或 localhost；手机通过局域网访问时也需要 HTTPS。

当前能力使用项目锁定的 Codex 0.153.4 实验性 realtime v3 和同一官方登录目录，账号及上游服务须支持 realtime。Claude、第三方网关、咨询、评审和委托会话不开放该入口。原有“语音输入”是转写为文字，仍使用其独立的 Whisper 配置。

## 实现与验证入口

### 彩虹胶囊与会话委托的边界

彩虹胶囊继续作为业务系统内的只读咨询入口；会话委托、邀请码、Grant、公共 Session Client 和委托 SDK 已移除。胶囊使用独立的 `CapsuleRelay*` 组件，复用宿主用户身份、项目绑定和咨询会话，不赋予开发助手权限。

为兼容已部署宿主，胶囊仍使用 `/api/session-client/v1/relay/capsule/ws`，凭据仍从配置中心 `toolbox.claude-chat.session-client.relay` 读取。该命名空间只配置胶囊宿主认证，不恢复其他 Session Client 路由。开关默认关闭；managed 多客户端模式的空列表拒绝所有客户端，配置撤销在下一条消息生效。

排障需要分别验证隧道、WebSocket 握手和会话就绪：普通 `/api/tools` 返回 200 只能证明 HTTP 可达。胶囊固定只读策略、拒绝开发命令，并使用现有会话所有权校验。回归入口：`CapsuleRelay*Test`、`SessionExecutionPolicyTest` 和 `ClaudeChatSessionAccessPolicyTest`。

### 原生语音实现

浏览器 WebRTC 媒体由 `lib/nativeVoice.ts` 管理，`hooks/useNativeVoice.ts` 管理通话状态，`hooks/useVoiceRecovery.ts` 管理显式恢复，`lib/voiceTranscript.ts` 组装语音消息，`hooks/useVoiceTransport.ts` 按通话隔离事件并交给现有聊天列表；Java `SessionVoiceService` 只转发给发起连接，sidecar `codexRealtime.ts` 在当前原生线程上启动或重连 realtime。SDP 不进入消息回放或前端调试记录，音频由 WebRTC 直接传输。

语音轮次包含多个原生代码轮次；只有通话结束且代码收口、受管进程释放后，才释放 Forge 消息队列。浏览器每 10 秒续租，sidecar 在 45 秒无心跳后清理通话；启动超时为 90 秒。

回归入口：前端 `nativeVoice.test.ts`、`useNativeVoice.test.ts`、`useVoiceTransport.test.ts`、`NativeVoiceControl.test.tsx`，sidecar `codexRealtime.test.ts`、`codexAppServer.test.ts`，后端 `SessionVoiceServiceTest`。`npm run app-server:schema:check` 校验锁定 CLI 的实验语音协议，升级 Codex 时必须重新检查并执行真实音频往返验收。
