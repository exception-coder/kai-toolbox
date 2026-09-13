# 内容工具

入口 `/tools/content-tools` 将 Markdown 转卡片、图片打码、加解密工具、二维码工具和格式化工具集中到一个模块。页签切换保留本次页面会话的输入与结果；刷新页面仍遵循各工具原有保存策略。

旧 `/tools/markdown-card`、`/tools/image-mosaic`、`/tools/crypto`、`/tools/qrcode`、`/tools/formatter` 链接跳转到对应页签，并保留其他查询参数及片段。已有菜单偏好由 shell 的 `replacesMenus` 机制迁移。

原工具权限只开放对应页签；`menu:content-tools`、ADMIN 或超级管理员可使用全部工具。未授权工具不会挂载。方向键和 Home/End 可切换页签；窄屏横向滚动页签栏。二维码识别仅在当前工具激活时接收全局粘贴。

个人简历与工作线已退出前端注册，菜单、偏好设置和路由不再提供；存量数据与后端服务保留。

设计与验收见 [unify-content-tools](../../../../openspec/changes/unify-content-tools/design.md)。
