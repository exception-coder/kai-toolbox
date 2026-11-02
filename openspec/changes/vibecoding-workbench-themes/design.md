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

## 沉浸皮肤（2026-11-03，L2）

适用 OBJ-01、CTX-01、DENS-01、FEED-01、EVID-01、IDEM-01；保持 Theme / Layout / Motion 分工，无 AI 编程架构契约变更。

1. 主对象为当前账号的工作台外观，唯一身份沿用 `forge.vibecoding.theme:<userId|local>`。读取原字符串和新版 `{theme,strength}`，保存为单次存储写入，失败不覆盖旧值。未增加后台账号同步，因此 UI 明确标注当前浏览器。跨设备同步不在本次交付范围。
2. 复用原主题弹框和个性化入口。分组缩略图不触发保存，单击进入同一弹框内的独立场景预览；返回列表恢复缩略图焦点。预览复用 AssistantReply、Markdown 和 ToolCallBubble，演示内容不连接真实会话或引擎，不复制生产聊天组件。窄屏两列缩略图、单列场景，覆盖层仅内部滚动。
3. 实时试用是账号隔离的内存覆盖，不写存储、不改变任务。恢复、返回、Escape、遮罩关闭、卸载及账号变化均释放所属试用；恢复读取最新持久偏好，不把试用前快照写回并覆盖别的标签页。保存成功后释放覆盖，失败保留候选和错误，允许恢复。重复试用复用当前 owner，不创建会话、任务或新偏好键。
4. 只更新主题 Token；页面与悬浮窗共享材质强度，礼赠助手保持例外。不使用主题 key 重挂实际消息或输入组件。变更前广播既有 readingChangeEvent，复用可视消息锚点恢复，避免标题字体变化后跳读。关闭覆盖层沿用 Radix 焦点恢复；交互与草稿保留由定向回归验证，真实滚动、对比度观感和窄屏视觉仍须浏览器检查。
5. 各主题完整提供材质默认值，嵌套预览不继承外层皮肤的扫描线、阴影或玻璃滤镜。背景、消息、输入、代码和工具分别消费材质 Token。原工具失败边框、状态文字与代码操作保持语义，不通过皮肤推断业务状态。

四套语言：黄油纸为暖纸底、细纤维和轻边注；报纸为衬线标题、硬边与细规则线；终端为墨绿实底、琥珀代码和极弱静态扫描线，中文正文仍为系统无衬线；玻璃为烟灰实底正文、静态极光边缘和输入区最多 6% 透明/6px 模糊。不引入图片、字体请求、背景常驻动画或新的动效开关。材质强度只调纹理与光影，不调文字透明度，不改尺寸、间距或阅读密度。

用户明确要求四套材质，故仅本工作台 opt-in 皮肤允许纸纹、扫描线和输入区玻璃，是 quiet-luxury-ui 默认禁用装饰规则的有界例外；不推广到全平台。正文无大面积玻璃，极光不动画。`backdrop-filter` 不可用或系统减少透明度时使用不透明底色；forced-colors 去除纹理和阴影；原全局/系统减少动效规则保持优先。

2026-11-03 核对官方资料：[W3C 正文对比度至少 4.5:1](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)、[MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion)、[MDN backdrop-filter](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter)。采用实底与保守透明度并提供降级；自动色值检查不能替代最终合成画面的浏览器验收。
