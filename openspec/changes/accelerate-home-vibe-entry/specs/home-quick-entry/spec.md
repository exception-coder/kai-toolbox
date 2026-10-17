# 首页快速入口

## ADDED Requirements

### Requirement: 快速显示可进入的高频模块

Forge 首页加载时 SHALL 在已有登录权限快照允许时立即提供从 FeatureManifest 生成的分组菜单，不依赖主应用模块或 API；React 首页一次显示用户有权访问且未隐藏的全部功能，保留 Vibe Coding 优先位置。

#### Scenario: 已授权用户打开首页

- **WHEN** 用户带有有效的本地登录与 Vibe Coding 菜单权限快照打开首页
- **THEN** HTML 内联脚本显示指向现有功能路由的可聚焦链接，包含 Vibe Coding
- **AND** 菜单遵循账号权限、chrome/hidden 标记、默认可见性及本地可见集和旧菜单迁移
- **AND** React 首页不等待浏览器空闲再补齐其他可见菜单

#### Scenario: 主应用加载缓慢

- **WHEN** 主应用 JavaScript 尚未完成下载或执行
- **THEN** 已生成的 HTML 菜单仍可导航且无需 API
- **AND** 十秒未接管时提供重新加载入口，不取消正常加载

#### Scenario: 无权限或快照不可用

- **WHEN** 登录或权限快照不存在、损坏或未授予入口权限
- **THEN** 加载壳不显示 Vibe Coding 快捷链接
- **AND** React 首页仍以现有权限与菜单可见性规则决定入口

### Requirement: 非首屏功能延迟加载

命令面板 SHALL 在首次被用户触发时才加载其搜索界面依赖。

#### Scenario: 打开命令面板

- **WHEN** 用户按 Ctrl/⌘+K 或点击搜索入口
- **THEN** Forge 加载命令面板并在加载完成后打开
