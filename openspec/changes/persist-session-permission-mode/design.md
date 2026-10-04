# 设计

在 `claude_chat_session` 增加 `permission_mode`，旧行默认 `default`；启动迁移补列。合法值由现有 `setMode` 入口校验，成功写库后同步 sidecar，并广播 `modeChanged`。`Ready` 返回当前服务端模式；刷新、切会话和后端恢复从数据库载入，不再由浏览器 `localStorage` 回写旧值。演示会话不落库。

适用产品原则：CTRL-01 让用户选择在刷新后保持一致；FEED-01 通过 Ready 与在线广播即时反馈；AI-01 保持当前会话上下文。没有新增导航或弹窗；业务咨询只读策略仍优先于模式显示。
