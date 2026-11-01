## 边界

本次为 L2 前端有界改造，沿用 forge-lite；不改变 AI 工程上下文或执行契约。遵循 CTX-01、DENS-01、FEED-01、AI-01：不重建会话，不重挂消息/输入组件，不加顶部空间，不创建平行全局设置。

- **Theme**：工作台独立视觉偏好，按当前账号 ID 保存在当前浏览器；未登录使用本地槽。默认推荐 Tokyo Night，旧皮肤/着色键不再读取。无跨设备同步承诺。统一注册表拥有调色板，映射既有 CSS Token，不为六套主题复制组件。
- **Layout**：仍由原专注模式、分屏与悬浮窗拥有，本次不增加新的布局配置或 Terminal Mode。
- **Motion**：沿用全局 comfort.reduceMotion 和系统 prefers-reduced-motion，不由主题开启或覆盖；本次不增加背景常驻动画、外部字体或图片。
- 普通会话挂载时，以 layout effect 设置短期 HTML 主题作用域，覆盖集成顶栏、Shell 导航及 Portal；卸载恢复原属性及自有 Token，不修改全局明暗/材质持久值。悬浮窗仅覆盖自身，保留演示礼物专用外观；主题弹框自己继承局部 Token，不能将底下的其他模块染色。
- 菜单与偏好页复用同一选择器；小型主题预览是可操作对象，使用两列、44px 以上触控目标与明确选中状态。保存失败保留当前选择并给恢复提示。颜色切换只更新 Token，保留草稿、滚动与执行状态。
- 工具分类仅保留中性图标/标签，状态采用独立 info/success/warning/danger 语义色，错误优先于运行中；移除着色逻辑而非仅隐藏开关。旧 skin.css 中的顶栏布局提取保留，不因删除皮肤丢失容器查询和手机高度规则。
- 正文默认沿用平台字体，代码使用系统等宽字体；SQL 编辑预览复用 CodeMirror 语法扩展并映射主题 Token。普通 Markdown 代码块复用现有 Shiki 依赖，按需加载语法。

配色参考官方来源后做 Forge 组件适配，未引入完整第三方主题包：[Tokyo Night](https://github.com/folke/tokyonight.nvim)、[Catppuccin](https://github.com/catppuccin/catppuccin)、[Nord](https://www.nordtheme.com/docs/colors-and-palettes/)。
## 内容表达增量

沿用 L2、CTX-01、DENS-01、FEED-01、EVID-01。主对象仍是当前会话与消息，不增加路由、任务列表、请求身份或副本创建；在原主题选择器选择六套外观，复用浏览器账号键。关闭与焦点恢复契约不变。仅扩展前端渲染，无 AI 编程架构影响。

- Token 分 Surface、Typography、Content、Syntax、Status；Motion 时长共享且独立于主题，原全局/系统减少动画拥有最终控制。Terminal Hacker 改等宽字体，不等于 Terminal Layout。标题采用主题色而非渐变/光效，主题不开启全屏背景动画。
- 保留 Marked GFM/DOMPurify 流程，在消毒后的 DOM 标记路径/API 行内代码、引用提示与横向滚动表格。关键词仅来自原 strong/mark 语义，不推断、不自动改写正文；文件名只取围栏显式 title/filename，不猜测真实文件。原始 Mermaid/站点预览与本地文件读取边界不变。
- 代码头提供语言、可选文件名、复制、折叠。折叠按消息内块位置保留，切换会话/文档清理；更换主题只更新 CSS，不重置节点、草稿或执行。使用当前 Shiki 4.1 的细粒度 Core 与 JS 引擎，接近可视区才按语言加载，180ms 合并流式更新并取消过期结果。30,000 字符/600 行以上、未知语言和加载失败保留原文，不能宣称高亮成功。Token 使用 textContent 与 CSS 变量，不把代码当 HTML 注入。
- Diff 只标记已有解析器产出的增删行与配对修改，保留 +/-、行号与内容；普通代码围栏中的 diff 使用同样状态语义。工具类型区分 Write/Edit 图标，运行/错误/完成/真实排队状态有文字和图标；不恢复按种类整块着色。思考与流式反馈限制在小圆点/光标，工具完成为短暂反馈；减少动画或系统偏好下静止。
- 定向验证语义与内容不变、复制失败反馈、折叠/草稿保持、迟到高亮取消、真实语法、Diff 与账号隔离；手机/桌面实际视觉与减动效须浏览器验证，构建不能替代。上一轮浏览器策略拒绝 file 地址且公网 origin 受限，未以替代通道绕过；预览入口仅代表可访问入口已准备。

查阅当前官方实践后采用 CSS Token 驱动语法色和按需加载，保留项目已安装版本，不升级依赖：[Shiki Theme Colors](https://shiki.style/guide/theme-colors)、[细粒度按需打包](https://shiki.style/guide/bundles)、[W3C 减少动画](https://www.w3.org/WAI/WCAG22/Techniques/css/C39.html)。
