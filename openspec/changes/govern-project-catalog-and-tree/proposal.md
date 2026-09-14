## Why

项目扫描、登记和业务路由分别拼接目录，托管占位路径会遮蔽真实源码。Git 变更平铺完整路径，无法快速理解目录归属。

## What Changes

- 项目领域提供统一目录清单；项目库集中排除和恢复项目，消费入口与路径加载遵循同一策略。
- 登记身份优先，同名不同路径不得静默合并；托管业务模板不再充当运行项目清单。
- Git 变更采用可折叠目录层级、单链目录压缩、数量与文件状态。
- 保留源码、历史记录和现有公共 API 的兼容响应；不引入通用 EAV 基础数据平台。

## Capabilities

### New Capabilities

- `project-catalog-governance`: 统一发现、全局使用策略和管理清单。
- `git-change-hierarchy`: Git 文件层级浏览。

### Modified Capabilities

无。

## Impact

tool-projects owns the catalog and policy; toolbox-common exposes stable ports. Workspace scanning, route resolution, registry and resources consume those ports. Frontend project registry and Git workspace change. Policy reuses dynamic configuration storage; no manual SQL migration.
