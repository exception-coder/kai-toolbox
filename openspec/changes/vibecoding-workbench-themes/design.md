## 边界

本次为 L2 前端有界改造，沿用 forge-lite；不改变 AI 工程上下文或执行契约。遵循 CTX-01、DENS-01、FEED-01、AI-01：不重建会话，不重挂消息/输入组件，不加顶部空间，不创建平行全局设置。

- **Theme**：工作台独立视觉偏好，按当前账号 ID 保存在当前浏览器；未登录使用本地槽。默认推荐 Tokyo Night，旧皮肤/着色键不再读取。无跨设备同步承诺。统一注册表拥有调色板，映射既有 CSS Token，不为三套主题复制组件。
- **Layout**：仍由原专注模式、分屏与悬浮窗拥有，本次不增加新的布局配置或 Terminal Mode。
- **Motion**：沿用全局 comfort.reduceMotion 和系统 prefers-reduced-motion，不由主题开启或覆盖；本次不增加常驻动画、外部字体或图片。
- 普通会话挂载时，以 layout effect 设置短期 HTML 主题作用域，覆盖集成顶栏、Shell 导航及 Portal；卸载恢复原属性及自有 Token，不修改全局明暗/材质持久值。悬浮窗仅覆盖自身，保留演示礼物专用外观；主题弹框自己继承局部 Token，不能将底下的其他模块染色。
- 菜单与偏好页复用同一选择器；小型主题预览是可操作对象，使用两列、44px 以上触控目标与明确选中状态。保存失败保留当前选择并给恢复提示。颜色切换只更新 Token，保留草稿、滚动与执行状态。
- 工具分类仅保留中性图标/标签，状态采用独立 info/success/warning/danger 语义色，错误优先于运行中；移除着色逻辑而非仅隐藏开关。旧 skin.css 中的顶栏布局提取保留，不因删除皮肤丢失容器查询和手机高度规则。
- 正文沿用平台字体，代码使用系统等宽字体；SQL 编辑预览复用 CodeMirror 语法扩展并映射主题 Token。普通 Markdown 代码块保持既有能力，不因本轮主题建设引入新高亮引擎。

配色参考官方来源后做 Forge 组件适配，未引入完整第三方主题包：[Tokyo Night](https://github.com/folke/tokyonight.nvim)、[Catppuccin](https://github.com/catppuccin/catppuccin)、[Nord](https://www.nordtheme.com/docs/colors-and-palettes/)。
