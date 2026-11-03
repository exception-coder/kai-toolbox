# 实施与验收

- [x] 普通 AI 回复移除手机气泡，保留 Markdown 层级和代码、文件、工具、异常容器。
- [x] 在现有个性化入口增加三档间距及独立字号，保留偏好并处理存储失败。
- [x] 阅读偏好切换保留可见消息身份与偏移，不重建列表、不强制跳到底部。
- [x] 手机聊天复用会话看板入口收纳已授权工作助理；退出恢复原助理入口。
- [x] 压缩输入区，保留已有运行详情、附件、听写、停止、发送及安全区域机制。
- [x] 定向组件回归、类型检查、生产构建与项目门禁完成并记录结果。
- [x] 实际运行前端版本核对。
- [ ] Android Chrome、iOS Safari、飞书 WebView 与桌面浏览器视觉/键盘专项验收。

2026-11-03：9 组组件回归 89 项通过；最终焦点恢复改动后两组 15 项复验通过。`npm run typecheck`、特性边界检查与最终隔离 Vite 生产构建退出码均为 0；构建保留现有大分块警告。Forge CLI 门禁 JSON 为 PASSED、退出码 0，实际执行 9 项既有 API 验证，executedCheckers 为空；这些接口不代表移动 UI 或真机验收。没有执行服务重启。

既有静态前端构建器已发布源码 `a4b3dec7`，frontend tree `37b73389f1bc01f1c22a8054de7a7873101fea8d`，运行版本 `97a91cd8e06b95b9a80575d8`。HTTPS 页面版本与 active.json 一致，入口及 MessageList 懒加载 JS/CSS 返回 200，在线资源包含阅读密度、字号存储项及间距变量。北京时间 00:17:03 起连续观察超过 60 秒，页面及 `/api/tools` 维持 200；backend 50144、frontend 157436、studio 136208 的进程身份和重启次数（均为 0）未变化，发布日志显示服务进程保持运行。仅静态发布，无服务重启；资源验证不等同真实浏览器视觉、触摸与键盘验收。

手机/桌面预览已准备，均为 WAITING_VIEWER_AUTH，未执行登录或页面验收。请求分别为 `ae4ac2e839564c32b04e2d27ecb1656451b7209c` 与 `c74c9683fb2d90ad425919146097bfde265dfaef`，目标路由 `/tools/claude-chat`。


## 一体式输入区（2026-11-03）

- [x] 默认单行布局、空输入紧凑、运行中保留停止与排队入口。
- [x] 更多功能展开/收起输入、原草稿与附件保留、语音原位呈现。
- [x] 定向回归、类型检查、OpenSpec 和质量门禁。
- [x] 生产构建、实际资源及稳定观察。
- [ ] Android Chrome、iOS Safari、常用 WebView 真机键盘、字体放大、视觉和滚动验收。


一体式输入区定向验证：ChatPage.sessionConfig、ComposerTextarea、VoiceInputButton、useComposerFileUpload 共 45 项通过；补充紧凑续问用例后 ComposerTextarea 4 项通过，去重共 46 项。覆盖原发送/排队/插入、停止、附件选择与粘贴、输入法、语音转写及展开收起时 textarea 身份和草稿保持。最终 typecheck、菜单目录 59 项、模块边界、OpenSpec 严格校验均通过。Forge CLI 门禁 PASSED、退出码 0，executedCheckers 为空，实际执行既有 9 项 API 探测，不作为移动页面视觉验收。运行构建与真实浏览器状态分别登记；未重启服务。


既有静态构建器已发布源码 `ef7f7c82e3b449753d1ca030715c584b754d3b08`，frontend tree `e3027bb1dde8b8c7946720918180bf24cfdba2a2`，运行资源版本 `a0d3858275a3d77f8a62a0ce`。Vite 生产构建通过（1m31s，保留既有分块与第三方指令警告）；实际 HTTPS 页面及 ChatControlWorkspace-Bw9Tb-x0.js、ChatControlWorkspace-CBWWUgnq.css 返回 200，核对一体式 composer 标识及 30dvh 高度限制。北京时间 08:49:48 至 08:50:59 观察 70.7 秒，页面和 `/api/tools` 均 200；backend 50144、frontend 157436、studio 136208 均 ready，PID 不变，重启次数均为 0。没有执行服务重启。

手机、桌面预览已准备，均 WAITING_VIEWER_AUTH，尚未登录或真实浏览器验收。目标 `/tools/claude-chat`、sourceRevision `ef7f7c82`；requestKey 分别 `b1f9325dbb148d60ac640dc91b8b49c9e6ae3f5c` 和 `28a34ab00b0796897b20af55c78ef97c29492b26`。静态资源与 DOM 测试不能替代 Android Chrome、iOS Safari、WebView 的键盘、字体放大及实际滚动验证。
