# 任务与验证

## 2026-11-03 最近会话扩容

- [x] 取消控制面板最近会话的 3 条截断，复用看板最近 20 条集合；现有内容区内部滚动和面板高度约束保持。
- [x] 扩展既有回归到 6 条有效会话，核对第 6 条位于独立滚动区域、当前标识、过期过滤及原切换回调；15 项组件测试通过。
- [x] 类型检查、OpenSpec strict、diff 检查和既有质量门禁通过（0 静态 checker、9 原有 API verifier，非本次 UI 验收）。
- [ ] 本次真实手机可见条数和触摸滚动验收尚未执行。

无架构契约变化，不修改数据查询接口、草稿保存或任务状态，不重启服务。

## 历史实施

- [x] 标题、快捷操作、队列、记录及最近会话按优先级重组。
- [x] 默认 60% 可见视口、可展开 90%、内部滚动、手柄下滑关闭及键盘避让。
- [x] 队列默认摘要，单条移除复用原能力，批量清除次级入口及确认保护。
- [x] 最近会话复用会话看板口径，原切换流程及完整列表入口保持；2026-11-03 后续调整为最多 20 条，取消原 3 条截断。
- [x] 运行详情按需挂载，语音能力与异常原因明确表达。
- [x] 定向回归、类型检查、生产构建与质量门禁结果记录。
- [x] 实际在线前端版本及稳定性核对。
- [ ] 手机/桌面真实浏览器和 Android Chrome、iOS Safari、飞书 WebView 键盘专项验收。

2026-11-03：MobileAgentDock、MobileSessionStatus、QueuedList.compact 和 ChatPage.sessionConfig 共 54 项回归通过；补充最近三条限制断言后，MobileSessionStatus 与 useSessionStorage 两组 16 项复验通过。最终 typecheck、FeatureManifest 菜单与边界检查退出码 0；隔离 Vite 生产构建退出码 0，保留现有大分块警告。Forge CLI 门禁 JSON 为 PASSED、退出码 0，实际执行既有 9 项 API，executedCheckers 为空；不作为移动页面验收。没有触发服务重启。

OpenSpec 严格校验通过。既有静态构建器发布源码 `28e87f80`，frontend tree `ad9e0728b4d23c99b5d755f32469933c7374ad9b`，运行版本 `ee78465738059dbc7300b55d`。HTTPS 页面版本与 active.json 一致，ChatControlWorkspace、QueuedList 版本资源返回 200，分别包含手柄/动态视口实现及清空确认/队列变化保护。北京时间 00:35:37 至 00:36:54 观察 77 秒，页面与 `/api/tools` 保持 200；backend 50144、frontend 157436、studio 136208 均 ready，进程身份及重启次数（0）未变化。发布日志明确服务进程保持运行，未重启服务。

已准备 `/tools/claude-chat` 手机、桌面预览，状态均 WAITING_VIEWER_AUTH，尚未登录或执行真实页面验收。请求分别为 `1515f5c198443c8a80419651c291950e41e41958`、`8738dcab7c2d24b32f7cacc083d440d5d47b8478`；静态资源和组件测试不等同真机键盘、触摸与视觉验收。


## 状态栏入口精修（2026-11-03）

- [x] 显式“会话控制”文字、整行原生按钮与展开箭头、可访问状态关联。
- [x] 空闲无历史仍可打开，复用原状态和队列；移动端保持单行 44px。
- [x] 一次轻量手机引导，保留既有 Sheet、视口与焦点恢复。
- [x] 本次定向回归、类型检查、规格与质量门禁。
- [x] 本次生产构建、实际资源版本与稳定观察。
- [ ] 本次手机/桌面真实浏览器及 Android Chrome、iOS Safari、飞书 WebView 验收。


入口专项：MobileSessionStatus 与 MobileAgentDock 22 项测试通过（退出码 0），覆盖空闲无历史、已完成、运行/后台状态、队列暂停、原快捷操作、下滑关闭、焦点恢复与首次引导。npm run typecheck 通过，菜单目录 59 项与模块边界检查通过；OpenSpec 严格校验通过。Forge CLI 门禁 PASSED、退出码 0，executedCheckers 为空，实际执行既有 9 项 API 探测，不等同本次移动 UI 验收。专注模式 CSS 已复核，将隐藏空闲/完成 dock 的规则限定为桌面媒体查询。没有重启服务。


既有静态构建器已发布源码 `0887efd97aa59b356bbb6026b23df77f44a4b55a`，frontend tree `430af02ed20c54b588f960d58faa1a58f827dfeb`，运行资源版本 `6507918d751c048c94605ca1`。生产 Vite 构建通过（1m11s，保留既有分块/第三方指令警告）；实际 HTTPS 页面、ChatControlWorkspace-Dx_Ug07U.js 与 ChatControlWorkspace-Cz1eqQ5x.css 返回 200，分别核对显式入口及桌面专属隐藏规则。北京时间 08:38:03 至 08:39:22 连续观察 79.6 秒，页面与 `/api/tools` 保持 200；backend 50144、frontend 157436、studio 136208 均 ready，PID 不变、重启次数均为 0。未触发服务重启。

本次预览入口已准备，状态 WAITING_VIEWER_AUTH，尚未登录或真实浏览器验收：手机 requestKey `e55144109c46f21b4153d8f2e2445732f11968ed`，桌面 `ddaa78ff28ddbfff7b40c7cbfdd07defca980f7b`，目标均 `/tools/claude-chat`，sourceRevision `0887efd9`。DOM 和 HTTP 证据不替代 Android Chrome、iOS Safari、飞书 WebView 的触摸、键盘、横向溢出与滚动保持验收。
