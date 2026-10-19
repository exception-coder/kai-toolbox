# 内容工具

入口 `/tools/content-tools` 将 Markdown 转卡片、图片打码、加解密工具、二维码工具和格式化工具集中到一个模块。页签切换保留本次页面会话的输入与结果；刷新页面仍遵循各工具原有保存策略。

旧 `/tools/markdown-card`、`/tools/image-mosaic`、`/tools/crypto`、`/tools/qrcode`、`/tools/formatter` 链接跳转到对应页签，并保留其他查询参数及片段。已有菜单偏好由 shell 的 `replacesMenus` 机制迁移。

原工具权限只开放对应页签；`menu:content-tools`、ADMIN 或超级管理员可使用全部工具。未授权工具不会挂载。方向键和 Home/End 可切换页签；窄屏横向滚动页签栏。二维码识别仅在当前工具激活时接收全局粘贴。

Vibe Coding 的「转卡片」通过 Markdown 卡片模块公开的弹框入口复用同一个编辑器，无需离开聊天。弹框可全屏/缩小，只处理当前回复的副本，不覆盖本页独立草稿；仍使用相同工具权限和导出能力。

个人简历与工作线已退出前端注册，菜单、偏好设置和路由不再提供；存量数据与后端服务保留。

设计与验收见 [unify-content-tools](../../../../openspec/changes/unify-content-tools/design.md)。

格式化工具提供 Java 代码高亮、行号、折叠与原文/结果对照，直达 `/tools/content-tools?tool=formatter&format=java`。粘贴完整文件或单个方法（含 `default` 方法）、语句、表达式后点击「格式化」，或按 Ctrl/⌘+Enter；可选择缩进和行宽，复制结果或下载为 `.java`。手机用「原始代码 / 格式化结果」切换阅读。

代码不上传、不执行、不持久保存；单次最多 256 KB。各格式页签保留本页已输入内容。修改原文或选项会让旧结果失效并取消旧计算，语法错误保留输入并定位；Worker 失败可重试，剪贴板受限时提供手动复制。Java 使用固定的浏览器兼容解析器，不保证覆盖所有较新语法，无法解析时保留原文高亮查看。
