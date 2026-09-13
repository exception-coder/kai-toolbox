# Vibe Coding 会话

## 原生语音对话

在 Vibe Coding 的 **Code Agent → 官方 Codex** 会话中，等待当前代码任务结束后，点击输入区上方的 **语音对话** 并允许麦克风。显示“语音已连接”后可以连续说话，听取 Codex 回复并查看实时字幕；桌面端同一通话内也可通过原有“补充到当前轮”补充文字。

**静音**只关闭麦克风输入；**结束通话**停止收音和播放，已启动的代码任务继续执行，仍沿用原有工具审批。原有文字草稿保留。语音字幕用于当前通话展示，不作为独立历史消息保存；代码任务输出沿用原生线程历史。

切换会话、隐藏页面或网络断开会结束通话，恢复后需要主动重新点击，不会自动开启麦克风。授权拒绝、设备占用和连接失败会显示原因，可调整浏览器权限后重试，也可继续文字会话。请使用 HTTPS 或 localhost；手机通过局域网访问时也需要 HTTPS。

当前能力使用项目锁定的 Codex 0.153.4 实验性 realtime v3 和同一官方登录目录，账号及上游服务须支持 realtime。Claude、第三方网关、咨询、评审和委托会话不开放该入口。原有“语音输入”是转写为文字，仍使用其独立的 Whisper 配置。

## 实现与验证入口

浏览器 WebRTC 媒体由 `lib/nativeVoice.ts` 管理，`hooks/useNativeVoice.ts` 管理通话状态；Java `SessionVoiceService` 只转发给发起连接，sidecar `codexRealtime.ts` 在当前原生线程上启动 realtime。SDP 不进入消息回放或前端调试记录，音频由 WebRTC 直接传输。

语音轮次包含多个原生代码轮次；只有通话结束且代码收口、受管进程释放后，才释放 Forge 消息队列。浏览器每 10 秒续租，sidecar 在 45 秒无心跳后清理通话；启动超时为 90 秒。

回归入口：前端 `nativeVoice.test.ts`、`useNativeVoice.test.ts`，sidecar `codexRealtime.test.ts`、`codexAppServer.test.ts`，后端 `SessionVoiceServiceTest`。`npm run app-server:schema:check` 校验锁定 CLI 的实验语音协议，升级 Codex 时必须重新检查并执行真实音频往返验收。
