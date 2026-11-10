# 直接打开文件设计

## 现状与依据

当前本机文本白名单是 md、markdown、mdx、html、htm、txt、rst、adoc。MarkdownView、RawTextView、TocPanel 已承担渲染及 h2–h6 大纲；HTML 目录预览依赖服务端路径。Graphify 报告可定位模块，但图谱基线为 2026-09-24，本次以定向源码核对当前能力，不将代码推断当作已验收事实。

## 交互与边界

适用原则：OBJ-01、NAV-01、CTX-01、DENS-01、FEED-01、CTRL-01、EVID-01、IDEM-01，无例外。

- 对象是本次选择的浏览器 File，临时递增 ID 区分同名文件。首页拖入或选择即进入预览，不要求选择项目或登记目录。
- 首页保留原有文档源，在标题之后插入紧凑拖放区域。临时预览用一个阅读窗口，文件切换、预览/源码、桌面大纲及手机折叠大纲依附当前文件，不新增导航页签。
- 文件读取由 feature 内 file-preview hook 管理，格式/大小/编码校验独立于组件。多次选择及关闭使用请求序号丢弃旧结果，不能把旧文件显示成新文件。
- 一次最多 10 份、单份最多 5 MiB、总计最多 20 MiB，支持 UTF-8 与带 BOM 的 UTF-16。2 MiB 以上复用原始文本优先策略，避免自动执行重渲染。mdx 按静态 Markdown 阅读，不执行 JSX；rst/adoc 为原始文本。
- 内容只保存在当前组件内存，关闭或离开释放；不调用上传、保存或创建文档源接口。读取失败保持明确错误及重新选择入口，已有预览不冒充新结果。
- 无目录授权时不重写 Markdown 相对资源到 Forge 路由，禁用无法解析的关联链接并给出目录入口说明。HTML 使用 srcDoc、空 sandbox 及 CSP，仅支持内嵌样式/数据图片的静态预览，不执行脚本、表单或外部资源；已有目录 HTML 行为不改变。
- 窗口使用项目 Radix 弹框及主题 tokens，header/操作可达，正文拥有滚动，桌面大纲独立滚动；手机优先正文。Esc/关闭返回文件选择按钮焦点，可继续选择同一文件。

浏览器 API 依据：[MDN 文件拖放](https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/File_drag_and_drop)、[MDN iframe sandbox/srcdoc](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe)。不引入依赖，不改变 AI 编程架构的上下文、执行或交付契约。

## 验证

定向覆盖格式/大小/二进制/编码、读取竞态及关闭、真实 drop/select、Markdown 清理与相对链接、HTML 隔离；复用大纲与渲染组件回归。执行前端 typecheck、无 SDK 发布副作用的 Vite 构建、OpenSpec 严格检查及 Forge 门禁。浏览器检查桌面、矮屏和手机的读取/切换/错误/关闭焦点及滚动，不重启服务。
