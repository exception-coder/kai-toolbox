# Vibe Coding 公开展示截图

这些图用于项目 README 的移动体验和核心功能介绍。它们由真实前端组件在隔离 Chromium 中渲染，展示数据是虚构的演示商城、演示项目、会话和文档，不是线上会话回放，也不是 AI 绘制的产品界面。

## 来源与范围

- 日期：2026-11-03；截图组件基于本次仓库工作区，Git 基线 `70a05ccd8`。
- 样式：当日既有生产构建 `.run/mobile-reading-final-20261103-dist/assets`，Tokyo Night 主题。
- 移动视口：390×844，设备像素比 2，PNG 为 780×1688；桌面视口：1440×960，设备像素比 2。
- 真实组件：`ChatPage`、`MessageList`、`SessionBoard`、`SessionConfigSheet`、`CodexSessionOptions`、`MessageMarkdownDialog`、`SessionAutopilotStatus`、`RequirementAutopilotForm` 等。
- 聊天运行时及 HTTP 返回由离线夹具替代；文档预览和自动推进入口以相同真实组件单独挂载。各图为独立展示场景，会话状态不表示一条真实任务的时间顺序。
- 未连接用户浏览器、现有 Forge 实例、真实账号、编码引擎或模型服务；没有运行开发任务、提交推进请求或启动/重启服务。
- 这些截图证明展示组件能够在相应视口渲染，不证明跨设备恢复、模型可用性、后台续跑、实际测试或发布已通过。

## 图与亮点

| 文件 | 展示内容 |
|---|---|
| [mobile-conversation.png](mobile-conversation.png) | 手机需求输入、分层回复、语音入口与草稿 |
| [mobile-session-board.png](mobile-session-board.png) | 多引擎会话、运行状态、待发送队列 |
| [mobile-document-preview.png](mobile-document-preview.png) | 当前上下文内的 Markdown 只读预览 |
| [mobile-requirement-planning.png](mobile-requirement-planning.png) | 需求持续推进、规格模式与预算，停留在提交前 |
| [desktop-workspace.png](desktop-workspace.png) | 最近会话、项目分组、对话与输入工作区 |
| [desktop-engine-selection.png](desktop-engine-selection.png) | 会话内切换引擎入口 |
| [desktop-model-configuration.png](desktop-model-configuration.png) | 模型、推理强度、速度与权限的配置入口 |

## 更新截图

夹具保存在 [scripts/readme-showcase](../../scripts/readme-showcase/capture.cjs)，不进入产品打包。复用已安装的前端 esbuild、浏览器模块的 patchright-core 与本机 Chromium，以及一次已有的前端构建样式；不自动安装依赖、不启动 HTTP 服务。

在仓库根目录运行，样式目录应指向与源码匹配的实际构建：

```powershell
$env:FORGE_SHOWCASE_STYLE_DIR = 'frontend/dist/assets'
node scripts/readme-showcase/capture.cjs
```

省略变量时也默认读取 `frontend/dist/assets`。编译夹具只写入忽略目录 `.run/readme-showcase/`，最终图片写入本目录。所有页面和接口由测试上下文拦截提供，其他网络地址被拒绝；`.test` 域名只作为离线浏览器原点，不是真实部署站点。示例登录标记为固定无效值，仅用于隔离界面的本地状态，不可用于真实服务。

更新后逐张检查中文、溢出、覆盖层、焦点样式和公开数据；同步 README 的亮点与来源说明。原图不经过内容替换或 AI 修图，不能添加未执行的“测试通过”“发布成功”等结果。

本次七张图已完成渲染、无横向溢出检查及逐图目视复核；当前用户浏览器访问不可用，读取原生 Chrome 窗口被自动审批拒绝，因此未使用当前实例或私人会话截图。

截图脚本执行退出码 0，七个场景没有收集到浏览器脚本或控制台错误；README 的链接、图片引用及图片尺寸已核对。项目质量入口 JSON `status=PASSED`、退出码 0，`executedCheckers` 为空、实际执行 9 个既有 API 场景；该结果不证明截图中的任务已执行或对应能力已完成线上验收。本次不改产品交互或架构契约，也未执行完整前后端构建。
