# 任务与验证

- [x] 标题、快捷操作、队列、记录及最近会话按优先级重组。
- [x] 默认 60% 可见视口、可展开 90%、内部滚动、手柄下滑关闭及键盘避让。
- [x] 队列默认摘要，单条移除复用原能力，批量清除次级入口及确认保护。
- [x] 最近 3 条复用会话看板口径，原切换流程及完整列表入口保持。
- [x] 运行详情按需挂载，语音能力与异常原因明确表达。
- [x] 定向回归、类型检查、生产构建与质量门禁结果记录。
- [x] 实际在线前端版本及稳定性核对。
- [ ] 手机/桌面真实浏览器和 Android Chrome、iOS Safari、飞书 WebView 键盘专项验收。

2026-11-03：MobileAgentDock、MobileSessionStatus、QueuedList.compact 和 ChatPage.sessionConfig 共 54 项回归通过；补充最近三条限制断言后，MobileSessionStatus 与 useSessionStorage 两组 16 项复验通过。最终 typecheck、FeatureManifest 菜单与边界检查退出码 0；隔离 Vite 生产构建退出码 0，保留现有大分块警告。Forge CLI 门禁 JSON 为 PASSED、退出码 0，实际执行既有 9 项 API，executedCheckers 为空；不作为移动页面验收。没有触发服务重启。

OpenSpec 严格校验通过。既有静态构建器发布源码 `28e87f80`，frontend tree `ad9e0728b4d23c99b5d755f32469933c7374ad9b`，运行版本 `ee78465738059dbc7300b55d`。HTTPS 页面版本与 active.json 一致，ChatControlWorkspace、QueuedList 版本资源返回 200，分别包含手柄/动态视口实现及清空确认/队列变化保护。北京时间 00:35:37 至 00:36:54 观察 77 秒，页面与 `/api/tools` 保持 200；backend 50144、frontend 157436、studio 136208 均 ready，进程身份及重启次数（0）未变化。发布日志明确服务进程保持运行，未重启服务。

已准备 `/tools/claude-chat` 手机、桌面预览，状态均 WAITING_VIEWER_AUTH，尚未登录或执行真实页面验收。请求分别为 `1515f5c198443c8a80419651c291950e41e41958`、`8738dcab7c2d24b32f7cacc083d440d5d47b8478`；静态资源和组件测试不等同真机键盘、触摸与视觉验收。
