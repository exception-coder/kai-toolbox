# 在 Vibe Coding 会话中核对网页跳转

开发人员需要在当前项目会话里打开一个公开页面，点击指定链接并得到落地地址。独立启动的 Codex App Server 线程可能没有桌面端的浏览器访问许可。Forge 将按 [OpenAI 自有浏览器接入方案](https://developers.openai.com/api/docs/guides/tools-computer-use-integration)提供由项目管理的临时 Chromium。

变更范围为 Vibe Coding 普通开发会话的 Codex App Server、随轮次装配的 MCP 工具和点击回执。业务咨询及使用资源账号的页面预览沿用各自入口。
