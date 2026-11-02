# 看板布局与返回设计

适用 OBJ-01、NAV-01、CTX-01、DENS-01、FEED-01、EVID-01，无例外。对象仍为当前会话和原监督运行 ID，复用既有 API、查询缓存和开关组件，不建第二份配置或新菜单。

页面顺序为常驻返回/标题/刷新 → 范围与搜索 → 折叠的规格/项目设置 → 运行列表。返回头不随正文滚走，正文拥有单一纵向滚动；桌面保留表格和范围页签，手机改用原生下拉，触控目标至少 44px。设置关闭时不挂载控制查询，展开后仍使用原有权限与保存反馈。

返回调用原 leaveSupervision，清理 view 路由参数，保留会话、消息和输入草稿，并在下一帧聚焦原输入框。看板范围/分页、运行暂停/恢复/停止逻辑不变；读取失败、空列表和控制结果未确认仍有恢复入口，返回按钮始终可用。移除看板外重复监督状态条，避免同一任务上下文出现两套标题操作。

补已有组件案例检查返回回调、折叠与手机范围选择；类型及前端构建覆盖宿主引用。真实手机、桌面和短视口浏览器结果须单列，不以 JSDOM 或编译替代。

## 悬浮会话看板（2026-11-02，纠正数据口径）

入口外观按用户随后明确要求参照工作助理收起态：宽 28px、高 44px，紧贴安全区域内的左右边缘，16px 图标，无圆形底座与阴影。角标朝屏幕内侧，避免贴边裁切；持久位置继续使用原账号与高度比例，不重置。DENS-01 的本次例外是入口宽度小于通用 44px 触控目标，遵循用户指定的窄贴边形态，高度仍为 44px；需实机核对点击与拖动可达性。面板、队列读取和会话跳转不变。

用户明确要求显示现有会话看板，而非 OpenSpec 推进/监督规划。原先“最近 8 项规划”的数据、筛选、角标及规划跳转均被本节替代；历史验证记录保留在 tasks。当前为 L2 有界前端纠正，不改变执行、任务生命周期或整体 AI 编程架构。

适用 OBJ-01、NAV-01、NAV-02、CTX-01、DENS-01、FEED-01、AI-01、EVID-01、CTRL-01、IDEM-01。主对象为已有 sessionId，不再以 run.id/changeId 建立列表。复用 SessionBoard 的 recentBoardSessions、boardSessionState、isBoardSessionRunning、readBoardQueue 及同一行组件；提取 useSessionBoardData 供完整页和悬浮视图共用账号缓存，不复制一套会话/队列事实源。保留权限与演示隐藏边界。

内容与既有会话看板一致：最近 20 个未锁定的开发会话、所有项目，依 lastSeenAt 最新到最早排序，最近集合确定后才筛选；不由本地选中重写活动时间。提供“全部 / 进行中 / 有待发送”，列出会话名、项目/引擎、真实会话状态、服务端待发送任务摘要及最近活动。RUNNING 且 live 才为进行中，离线 RUNNING 为待恢复，DONE 为已结束，IDLE 为空闲，INTERRUPTED 为已中断；不把普通会话结束称为 OpenSpec 验收完成。队列读取未知/失败仍保留核对和重试，不用零项冒充成功。悬浮版隐藏重复标题、内部刷新与低频原生记录大小读取，正文仍复用 SessionBoardContent；完整页保留原存储显示与新建入口。

数据来源为既有 listSessions 与 readBoardQueue，不再调用 autopilot/runs。名单缓存键为 claude-chat-sessions/board/userId，队列键为 claude-chat-session-board-queue/userId/sessionId，与完整页共享。收起时名单 30 秒读取，只在展开后启用最近集合队列读取（既有并发 4、8 秒超时约束）；打开时 15 秒读取，隐藏页面不后台轮询。唯一标题栏刷新作用于同一份名单与队列，队列单行失败沿用原重试。账号切换不复用上一账号缓存，旧队列读取取消。角标为最近集合内需关注的会话数：中断、待恢复或已成功读取且未过期的非空待发送队列，按 sessionId 去重；失败/过期队列不伪装成已确认数量。只有运行且无待关注时显示运行点，正常空闲或结束恢复中性，名单失败/过期显示待更新。

点击条目返回原 sessionId 的 conversation，沿用 isBoardSessionRunning 提示。常驻引擎已挂载时仅调用一次 switchTo，路由不再携带 sessionId；无引擎时由深链接所有者恢复；当前会话不重复切换。不会创建、发送、恢复、暂停或中断任务。底部“打开完整会话看板”进入 view=board，ChatPage 与原路由 hook 消费该意图并恢复单视图，避免跳到推进看板或被旧分屏遮挡。关闭保留原聊天与草稿，不取消执行。

入口与覆盖层保持已实现的 Floating Workspace：28×44px 贴边标签（参照工作助理，16px 图标、8px 内侧圆角、无阴影）、默认右侧、拖动吸附左右边缘并账号独立记忆高度比例；8px 拖动阈值，松手补最终坐标，子图标捕获丢失不误取消，真正取消回退，Alt + 方向键可移动。位置投影到 visualViewport、安全区及 composer 外，键盘临时避让不覆盖存储。打开隐藏入口；手机小于 768px 使用两侧各 12px、最大 70dvh 且受实际可视高度限制的 Sheet，顶部下滑 64px 关闭、内容独立滚动。桌面保留限宽限高、碰撞避让的非模态 Popover。打开聚焦关闭按钮且 preventScroll，关闭回入口，不自动唤起输入键盘。

复用 [Radix Dialog](https://www.radix-ui.com/primitives/docs/components/dialog) 与 [Popover](https://www.radix-ui.com/primitives/docs/components/popover)，桌面非模态、手机 Sheet 真正锁背景才标 aria-modal；[Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events) 与 [VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport) 指导指针及键盘视口处理，官方资料已于 2026-11-02 核查，不引入新组件库。本次纠正是本地数据与既有组件复用，不增加外部技术假设。

验证完整页与悬浮版同一数据/状态/队列，未监督的普通会话也能显示；过滤仅最近 20，失败队列可核对，不能再读取推进接口。覆盖会话跳转一次、完整会话看板路由、账号隔离及既有拖动/关闭/草稿恢复。Android Chrome、iOS Safari、飞书 WebView、桌面与短视口真实触控和布局未执行时明确保留，不以 JSDOM、预览入口或生产资源 HTTP 代替。
