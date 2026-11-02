# 看板布局与返回设计

适用 OBJ-01、NAV-01、CTX-01、DENS-01、FEED-01、EVID-01，无例外。对象仍为当前会话和原监督运行 ID，复用既有 API、查询缓存和开关组件，不建第二份配置或新菜单。

页面顺序为常驻返回/标题/刷新 → 范围与搜索 → 折叠的规格/项目设置 → 运行列表。返回头不随正文滚走，正文拥有单一纵向滚动；桌面保留表格和范围页签，手机改用原生下拉，触控目标至少 44px。设置关闭时不挂载控制查询，展开后仍使用原有权限与保存反馈。

返回调用原 leaveSupervision，清理 view 路由参数，保留会话、消息和输入草稿，并在下一帧聚焦原输入框。看板范围/分页、运行暂停/恢复/停止逻辑不变；读取失败、空列表和控制结果未确认仍有恢复入口，返回按钮始终可用。移除看板外重复监督状态条，避免同一任务上下文出现两套标题操作。

补已有组件案例检查返回回调、折叠与手机范围选择；类型及前端构建覆盖宿主引用。真实手机、桌面和短视口浏览器结果须单列，不以 JSDOM 或编译替代。

## 贴边会话快捷看板（2026-11-02）

本次为 L2 有界前端交互，后续按 Floating Workspace 建议调整：已授权 Forge 外壳提供 48px 圆形按钮，默认右侧、约可用高度 62% 处，可拖动至任一侧；8px 位移后识别为拖动并抑制随后的指针点击，松手吸附最近边缘。账号独立保存边缘与纵向比例，受限存储降级为本次页面内记忆。Alt + 方向键提供键盘移动。位置投影到 visualViewport 和 safe-area 内，预留底部操作空间，检测现有 composer 边界；键盘导致的临时避让不覆盖已存位置。默认收起、不自动打开或激活聊天引擎；展开时隐藏入口。

上下移动沿用工作助理的松手处理：pointerup 先应用最终坐标，即使无中间 move 也保留垂直位移；从手势起点计算位移，避免过程中视口/焦点重算造成跳变。图标子节点 lostpointercapture 冒泡不终止按钮手势，按钮自身取消仍回到保存位置；吸附只校准左右位置，高度保留用户选择。

手机（小于 768px）复用现有 Radix Sheet：两侧各 12px，最高 70dvh 并进一步限制在键盘后的可视高度内；顶部拖动指示区可下滑 64px 关闭，列表滚动不触发关闭，保留显式关闭与 Esc。桌面保留非模态 Popover，按按钮所在边缘向内展开，上限 22rem、available-height 与 12px 碰撞边距。中间列表独立滚动，标题、刷新、关闭及完整看板入口固定可达；不新增弹层库。新规范替代首轮左侧矩形入口、手机横向 Popover 的呈现。

适用 OBJ-01、NAV-01、NAV-02、CTX-01、DENS-01、FEED-01、AI-01、EVID-01、CTRL-01、IDEM-01，无额外权限例外。主对象是既有 run.id 与 sessionId；这是用户明确要求的跨会话比较快捷投影，不维护另一份会话或执行状态。全局入口沿用 Vibe Coding 的 ADMIN/超管或 menu:claude-chat 可见条件，演示页隐藏；服务端仍按原 API 执行账号、项目和会话访问校验。无后端、数据库、上下文流或任务生命周期变更，因此不更新整体 AI 编程架构契约。

数据使用原 GET `/api/claude-chat/autopilot/runs?scope=all&limit=8`，按服务端 updated_at/id 倒序取最近集合，筛选和计数只在该集合中进行；不把全局 counts 当成最近集合数量。ACTIVE 为规划进行中，COMPLETED 为完成，FAILED 为异常；WAITING_USER/PAUSED/STOPPED 保持待确认/已暂停/已停止，不从会话 IDLE、DONE 或消息气泡推断规划结果。需求模式的完成同时显示 Agent 自验，不冒充完整 OpenSpec 验收。每项显示规划目标、项目、原会话及已有任务计数，异常/等待原因按已有字段显示。

同一账号查询快照同时驱动角标和列表；收起时每 30 秒读取，展开时每 15 秒读取，并监听原 autopilot-changed 通知，隐藏页面不在后台轮询。这是支持真实角标所需的有界后台读取，替代首轮“关闭即停止查询”；关闭只卸载列表、不取消任务，账号切换或入口卸载传递 AbortSignal 取消读取。缓存键包含账号 ID，不复用前一账号快照。角标只统计最近 8 项内的 WAITING_USER 与 FAILED；有异常优先异常标识，只有运行项显示运行点，全部完成恢复中性，不把停止或暂停推断为完成。读取失败或超过 45 秒的快照不继续显示有效状态角标，显示待更新提示。

自动更新仅保留当前存在条目的相对顺序，新项附在后面；唯一头部刷新作用于同一份规划数据，主动刷新才恢复服务器最近顺序。顶部显示更新时间，列表保留紧凑分段筛选，每项增加实际 run.updatedAt 最近活动（缺失显示未知），低频状态说明折叠。面板超过 30 秒或更新失败明确标注上次快照，失败不伪装成零项。空集合引导完整看板配置，筛选空态说明仅限最近集合。

点击一项关闭面板并返回原会话对应规划进度视图（view=autopilot_detail、changeId）：有常驻运行时就只调用一次既有 chat.switchTo，随后导航时不携带 sessionId，避免路由所有者再切一次；引擎尚未挂载时只生成带 sessionId 的深链接，由既有路由所有者恢复。点击当前会话不再切换。原 useSessionViewRoute 消费规划深链接并在离开时清理 changeId；复用现有 AutopilotProgressWorkspace，完整看板仍用 view=supervision。不会创建任务、发送消息、恢复、暂停或中断规划。关闭不修改原草稿或消息位置；跨会话切换保留原按 sessionId 管理的草稿，沿用已有历史恢复。

焦点与 Esc/外部点击关闭复用 [Radix Popover](https://www.radix-ui.com/primitives/docs/components/popover) 和 [Dialog](https://www.radix-ui.com/primitives/docs/components/dialog)：桌面不设置 aria-modal；手机 Sheet 锁住背景并明确模态语义。打开聚焦关闭按钮且 preventScroll，关闭回到入口且不唤起输入键盘。[Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events) 的指针捕获用于拖动，处理 cancel/lost capture；touch-action 仅在按钮和拖动指示条内隔离，列表仍原生滚动。[VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport) 用于键盘与可视区变化，保留系统辅助缩放；不支持 ResizeObserver 时保留 resize/focus 降级。提供可见关闭、状态文本、焦点样式与减少动态效果支持。上述官方文档查阅于 2026-11-02。

验收覆盖角标真实计数、不激活引擎、真实状态和自验区别、筛选/空态/失败/过期恢复、手动排序、账号隔离、一次切换、规划定位及草稿保留；拖动/轻点区分、吸附记忆、键盘移动、软键盘视口投影、下滑关闭及 Escape 回焦点。Android Chrome、iOS Safari、飞书 WebView、桌面和短视口的真实触控与视觉布局分别记录；单元测试和生产资源核对不代替实机证据。
