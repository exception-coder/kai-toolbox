# 设计与边界

适用OBJ-01、NAV-01、CTX-01、DENS-01、FEED-01、EVID-01、CTRL-01、IDEM-01，无例外。主对象是现有咨询sessionId；消息、草稿、附件、模型和发送仍归原页面/ConsultConversation。新增组件仅控制展示与编辑层，不重写上传或消息协议。

## 布局

手机<768px默认咨询，52px标题和44px咨询/系统图谱Tab；平板768–1023px图谱左侧、咨询右侧；桌面≥1024px沿用现有图谱与可调宽浮窗。手机通过hidden切换已挂载视图，保留草稿和消息滚动位置。图谱节点只标记首探索系统，不将候选当已确认关系；咨询上下文链接切到图谱、清除分类过滤并聚焦已有同名节点，不虚构推理链。

复用Shell移动导航上下文，移除本页重复Shell顶栏。原工具条复用于“更多”纵向菜单，历史、配置、归属、连线、更新和风格保持原动作；历史恢复使用原resumeConsult。新建/恢复咨询返回咨询视图，不创建第二会话。加载失败沿用锁定/重试，创建失败保留原草稿并显示错误。全局PC悬浮聊天条在本页小于1024px时隐藏但保持挂载，后台引擎、待确认问题和主动语音入口不受影响。

## 输入和可视高度

新增MobileConsultComposer展示紧凑输入（正文入口、附件数量、添加、语音、模型和发送，正常状态≤110px）；点击打开全屏编辑层，标题可选折叠，附件折叠并保留缩略图/文件类型、删除入口。编辑层仅以受控props读取/更新原状态；完成/Escape保留草稿并回入口，发送调用既有回调，运行中允许编辑但沿用原发送锁。

Shell已有--app-vh；编辑层在既有全屏Portal容器中，监听VisualViewport resize/scroll，以height和offsetTop约束顶部与高度，降级innerHeight。输入区域独立滚动，元数据和模型设置有界，底部操作保留safe-area。卸载/关闭清理监听，不滚动或强制回顶整个页面。

依据：[MDN VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport)与[offsetTop](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport/offsetTop)，查阅2026-10-18。浏览器工具尺寸模拟可验证布局，不能冒充真实iOS/Android软键盘验收。

## 验证与范围

定向验证Tab切换保留原草稿/会话、原恢复/发送用例、附件展示/移除、编辑完成恢复、可视视口变化监听和清理。浏览器检查390px手机、平板和桌面，更多菜单、末条内容和输入可达。首问/追问业务约束及后端部署状态不变，不授权重启。不做手势动画、新关系推理或后台资源同步。
