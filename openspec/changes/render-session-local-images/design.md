# 设计

适用 OBJ-01、CTX-01、FEED-01、EVID-01、IDEM-01，无例外。图片属于当前会话的消息证据，保留原消息上下文、错误恢复和已有视觉样式，不新增导航。

## 读取链路

Markdown 在 DOMPurify 消毒前将本地图片地址保存为普通数据，消毒后创建 React 图片组件。支持 Windows 盘符、`/D:/`、file URI、中文/空格、项目相对路径及有目录的 POSIX 绝对路径。HTTP、data、blob、站内 API/assets 等图片保持原语义；网站根目录下 `/logo.png` 沿用网页语义，不从模糊路径猜读磁盘。

前端通过现有 authFetch 请求 `/api/claude-chat/sessions/{id}/image?path=...`，只在当前会话内恢复图片，不拼接 Token 到 URL。成功响应转换为对象地址；切换消息/会话和卸载时中止旧请求、释放对象地址，旧 Portal 目标不能短暂绑定到新会话。失败显示服务器原因，重试重新读取，不触发 Agent 或发送聊天消息。

服务端要求真实登录且通过 ClaudeChatSessionAccessPolicy，复用 SessionLocalPathAccessService 的主目录、附加目录、已登记项目及排除策略。允许项目 `.git` 下的截图，不扩大到任意路径或公开评审。只返回最多 25 MiB 的 PNG/JPEG/GIF/WebP/BMP/AVIF，以文件头识别内容类型；非图片、缺失、越界和超限明确拒绝。响应 no-store/nosniff，不返回 HTML 或脚本。相对路径和 junction 的归属语义沿用现有本地文件链路。

## 验证边界

用用户报告的盘符图片补充修复前失败的 Markdown 回归，覆盖消毒、路径转换、重试、迟到结果、会话切换及对象地址释放。后端真实 PNG/HTTP 响应测试覆盖 `.git`、附加目录、排除/越界/权限、缺失、伪装文件和 25 MiB 上限；宿主装配与现有文件/图形回归共同验证。

浏览器隔离样例使用生产 Markdown 与图片组件、模拟图片接口并真实解码截图，不能代替在线后端版本验收。后端新端点需经用户明确确认重启后才能执行实际消息验收。该修复不改变 AI 编程架构的组件职责、上下文及证据分层。
