## Why

彩虹胶囊已有页面咨询会话，但没有实时语音入口。用户需要在同一窗口说话并查看转写，沿用项目、页面和权限上下文。

## What Changes

- 在胶囊输入区增加语音开始、静音、挂断与显式恢复操作。
- 复用原生媒体连接，独立适配 Assistant Transport；语音协商不进入重发队列或日志。
- 官方 Codex 咨询会话支持原生语音，继续强制咨询只读工具策略，不提升开发权限。
- 转写进入现有消息列表；关闭、切页、掉线释放媒体，跨设备接管复用既有绑定。

## Capabilities

### New Capabilities
- `capsule-native-voice`: 胶囊语音交互、上下文及资源生命周期。

### Modified Capabilities

## Impact

Assistant SDK、公开媒体能力入口、SessionVoiceService 与 Codex 引擎准入。复用 `/api/claude-chat/consult/ws` 的 send/voiceControl/voiceEvent 契约，无数据库迁移。首个普通文字任务运行中启动语音仍受既有线程限制，错误必须可恢复且不打断任务；不在本变更中自动授予代码修改权限。
