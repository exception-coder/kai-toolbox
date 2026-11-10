## Context

基线 HEAD 为 0b2b4130，工作区存在其他任务的已暂存和未暂存改动。四个工具的 manifest 当前均在“系统”分组独立注册；Graphify 已定位页面，实施依据已用定向源码复核。WebTerm 的 useWebTermSocket 在卸载时关闭连接，因此页签不能只条件渲染当前页面。

## Goals / Non-Goals

目标：一个“本机工具”入口，四个视图；链接可分享、状态保留、原工具权限隔离。非目标：后端模块合并、业务流程重构、修改外部隧道或自动执行命令。

## Decisions

- 适用 OBJ-01、NAV-01、CTX-01、DENS-01、FEED-01、EVID-01、CTRL-01。操作对象为当前主机及用户选择的路径/端口/会话；四个工具是本机范围的稳定视图，不是同一对象操作的重复入口。复用原服务和状态，不新增对象列表。
- 使用 local-tools feature 和 `/tools/local-tools?tool=<id>`。旧 manifest 保留原权限并用 chrome 隐藏菜单，以公开 LegacyLocalToolRedirect 跳转，查询参数及 hash 原样保留。replacesMenus 复用工作区已实现的菜单偏好迁移及入口权限聚合。
- 页面通过各 feature 的 public-api 组合，不导入内部 API/hook。原页面仅增加 embedded 外壳支持；状态及业务反馈仍由原工具拥有。保留旧权限码，新入口权限不授予其他工具能力。
- 首次选择才挂载工具，离开页签通过 hidden 隐藏已访问面板；保持终端和 SSE，重新显示时由现有 ResizeObserver 适配尺寸。离开整个模块仍按原行为清理连接，不承诺刷新保留客户端状态。
- 页签使用手动激活：方向键/Home/End 移动焦点，Enter/Space 或点击激活，避免焦点经过终端即创建连接。无效或无权链接显示原目标不可用和可选页签，零授权提供返回首页。
- 视觉采用 CONSERVATIVE 模式，沿用 forge-enterprise 参考及项目 tokens、Button 与已有页签语言。单一标题和底边页签；普通工具内容独立滚动，终端继承 Shell 剩余高度，窄屏页签横向滚动。无新增视觉例外。
- 查询加载、失败重试、扫描与隧道运行反馈复用原页面；切换不是取消操作。遵循 [WAI-ARIA Tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) 的手动激活契约（2026-09-13 已核实）。

## Risks / Trade-offs

- 隐藏面板仍运行订阅 → 仅挂载已访问工具，不预连接终端；完整离开时清理。
- 原链接带 cwd/autorun → 所有参数保留，仍由原终端白名单解析。
- 工作区有其他导航变更 → 不修改其实现或提交他人文件；生成权限目录只提交本次新增条目。

## Migration Plan

更新 manifest 和生成目录，开发模式通过 Vite 加载目标源码。回滚仅撤销本次前端提交并重新生成目录，无数据迁移。验证包含组件回归（保留状态、惰性连接、权限、深链接、键盘和无效目标）、typecheck/build、Forge CLI all、实际浏览器桌面/窄屏/矮屏及至少 60 秒运行稳定观察。当前服务 backend:18080、frontend:5173 为范围；wechat 已处于 waiting restart，不属于本次前端交付。

## Open Questions

无。
