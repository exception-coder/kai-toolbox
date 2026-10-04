# 首页快速入口

## ADDED Requirements

### Requirement: 快速显示可进入的高频模块

Forge 首页加载时 SHALL 在已有登录权限快照允许时提供 Vibe Coding 快捷入口，并在 React 首页优先显示用户有权访问且未隐藏的 Vibe Coding 模块。

#### Scenario: 已授权用户打开首页

- **WHEN** 用户带有有效的本地登录与 Vibe Coding 菜单权限快照打开首页
- **THEN** 加载壳显示指向现有 Vibe Coding 路由的可聚焦链接
- **AND** React 首页先显示 Vibe Coding，随后补齐其他可见菜单

#### Scenario: 无权限或快照不可用

- **WHEN** 登录或权限快照不存在、损坏或未授予入口权限
- **THEN** 加载壳不显示 Vibe Coding 快捷链接
- **AND** React 首页仍以现有权限与菜单可见性规则决定入口

### Requirement: 非首屏功能延迟加载

命令面板 SHALL 在首次被用户触发时才加载其搜索界面依赖。

#### Scenario: 打开命令面板

- **WHEN** 用户按 Ctrl/⌘+K 或点击搜索入口
- **THEN** Forge 加载命令面板并在加载完成后打开
