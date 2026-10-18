# 设计

适用 NAV-01、CTX-01、DENS-01、FEED-01、EVID-01、IDEM-01，无例外。

主对象为 manifest 注册的原页面及共享聊天实例；路由、会话身份、权限与恢复规则不变。加载占位复用外壳内容区，不新增业务页面或配置入口。骨架只有中性工具栏与行结构，不包含虚构业务数据、不可用的假按钮或进度百分比。

HTML 在任何 JS 执行前自带骨架、返回工作台链接和禁用脚本说明。内联导航仍由现有目录生成器编译，复用权限与可见性规则；直达路径默认收起导航，首页有缓存导航时用真实菜单取代骨架。无登录快照时不暴露受保护入口。HTML 响应到达前的网络时间不能靠骨架缩短。

React 工具路由与展示布局使用 PageSkeleton；路由错误沿用 ErrorBoundary。十秒未就绪给出慢加载说明、返回与重新加载。响应式行结构与系统/产品减少动画设置保持一致。局部 Suspense 不替代模块内部普通 Effect/Query 的数据加载状态；本次统一的是 HTML 与页面代码加载阶段。

Context 与页面始终保持相同树位置；ChatRuntimeEngine 作为旁挂的 memo 组件，首次激活才动态下载，下载后发布实例到原 Context，避免页面重建与父子更新循环。原会话查找、PRD 通道、紧急修复和跨路由常驻逻辑整体保留。下载失败由局部边界承接，不阻塞侧栏。重复激活和切换路由复用同一实例，不创建额外会话。

验证静态 HTML、权限缓存与直达链接、慢加载恢复、页面草稿和引擎挂载次数、桌面/窄屏宽度及真实页面接管。采用项目现有 React 19 lazy/Suspense，不增加框架：[lazy](https://react.dev/reference/react/lazy)、[Suspense](https://react.dev/reference/react/Suspense)（查阅于2026-10-18）。

## 点击立即切换与意图预加载

React Router锁定版本7.14.2默认把位置更新放进startTransition，现有移动导航测试曾明确断言慢页完成前位置仍为旧页面。WorkspaceRouter采用该版本公开的`unstable_useTransitions={false}`，统一让菜单、首页、程序导航及浏览器历史先提交位置；保持现有路由守卫和局部Suspense，不自制第二套路由。该API带unstable前缀，升级路由依赖时应随类型及回归核对命名：[7.14.2官方契约](https://reactrouter.com/7.14.2/api/declarative-routers/BrowserRouter)。

页面manifest保留原动态import与组件属性，统一使用公共preloadable包装。FeatureLink只在鼠标停留120ms、键盘聚焦、触摸时请求入口代码；不遍历并提前下载全量菜单。指针离开和卸载清理等待定时器。省流量及2G/slow-2G跳过。重复意图与首次渲染共用同一promise；预加载失败不提前污染React.lazy初始化状态，真实访问仍按现有错误边界处理。

入口预加载只读声明的React元素树，支持ConfirmProvider包装，不调用组件函数。SystemResources显式转发其内部Resources.preload；不借预加载触发数据库请求、连接聊天引擎或扩大权限。静态重定向和代码级隐藏模块沿用原行为。咨询与Vibe Coding骨架保持移动导航按钮，关闭后仍能切换其他目标；快捷键、焦点与修饰点击保持原链接语义。
