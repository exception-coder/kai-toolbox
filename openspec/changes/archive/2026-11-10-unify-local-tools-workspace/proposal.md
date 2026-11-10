## Why

系统配置下四个本机操作工具各占一个菜单，入口分散。用户要求将目录扁平化、端口进程查询、Web 终端和 VS Code Tunnel 合并为一个模块的四个页签。

## What Changes

- 新增“本机工具”入口，按四个稳定工具视图切换，保留已打开视图的操作状态。
- 原入口保留为兼容跳转，保留查询参数及片段；菜单偏好迁移到合并入口。
- 复用原页面及权限，按原工具授权隔离内容，统一页头和可用高度。
- 不变更后端接口、数据模型、终端命令和隧道启停行为。

## Capabilities

### New Capabilities

- `local-tools-workspace`: 本机工具的统一导航、状态保留及兼容入口。

### Modified Capabilities

无。

## Impact

影响 frontend/src/features 下 local-tools、flatten、port-process、webterm 和 vscode-tunnel，以及自动生成的菜单权限目录。复用当前工作区项目开发变更已提供的 replacesMenus、access 与 menuMigration，不接管其未提交改动。依据为用户确认、当前页面源码及 docs/product-philosophy.md；无未决业务选择。
