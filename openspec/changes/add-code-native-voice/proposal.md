## Why

Vibe Coding 的现有麦克风仅将录音交给 Whisper 转写并回填草稿。用户需要在 Code 会话中直接与 Codex 进行双向原生语音交互，保留当前项目、历史和代码执行上下文。

## What Changes

- 官方 Codex Code 会话增加原生语音入口、连接状态、静音、结束和实时字幕。
- 通过当前版本 app-server 的 thread/realtime 与浏览器 WebRTC 接入原生音频；复用当前线程、授权目录、工具配置和审批。
- 语音启动复用既有轮次准入；文字轮次运行中先等待收尾。通话内可连续对话，结束音频不暗示撤销已启动的代码任务。
- 断连、切会话、权限拒绝和账号不支持时停止采集并提供恢复入口。原有 Whisper 输入继续可用。

## Capabilities

### New Capabilities

- `code-native-voice`: Code 会话原生双向语音、线程绑定与可恢复生命周期。

### Modified Capabilities

无。

## Impact

前端 claude-chat 组件及 socket、tool-claude-chat 的消息适配与语音生命周期服务、sidecar Codex app-server。无数据库迁移，无新增服务或音频供应商依赖，不支持第三方 SDK、咨询、分享评审或委托客户端。当前依据为项目锁定的 Codex 0.153.4 生成协议与定向源码；全局 CLI 0.147.0 不作为实施协议来源。账号可用性须实测，不把 schema 存在等同上线验收。
