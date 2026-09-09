## Why

Vibe Coding 顶部信息密度过高，站点药丸与连接状态发生挤压。用户截图要求减少顶部堆叠并统一站点入口。

## What Changes

- 站点集中到现有站点页签，移除顶部重复弹出入口。
- 标题承担剩余空间，工具区按内容占宽；按实际容器宽度收起次要信息。
- 保留引擎选择、连接状态和常用操作，复用现有视觉变量。

## Capabilities

### New Capabilities

- `chat-header-layout`: 会话顶部的清晰层级及窄宽度布局。

### Modified Capabilities

无。

## Impact

仅 claude-chat 的 ChatPage.tsx 与 skin.css；不修改后端、消息或状态契约。证据为用户截图和当前源码。无未决业务选择。
