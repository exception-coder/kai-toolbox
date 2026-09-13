## Why

内容分组中的五个实用工具入口分散，个人简历和工作线已不再需要。按用户要求收敛导航。

## What Changes

- 新增“内容工具”模块，以五个页签承载 Markdown 转卡片、图片打码、加解密工具、二维码工具、格式化工具。
- 旧工具入口兼容跳转，保留查询参数、片段和已有菜单权限；切换工具保留当前输入。
- **BREAKING**：个人简历和工作线退出前端注册表，菜单、偏好设置和路由不再提供这两个模块；保留存量数据与后端能力。

## Capabilities

### New Capabilities

- `content-tools-workspace`: 内容工具统一入口、状态保留、权限与旧入口兼容，以及退役模块的导航边界。

### Modified Capabilities

无。

## Impact

仅调整前端内容工具、resume、workline 的注册及页面组合，更新生成的菜单目录。复用当前 shell 已有的 replacesMenus 和权限迁移能力。证据来自用户请求、Graphify 定位和当前源码；无未决选择。不删除数据库，不改动算法或后端接口，不接管其他工作区变更。
