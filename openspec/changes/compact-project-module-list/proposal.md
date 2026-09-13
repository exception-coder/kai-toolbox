## Why

项目模块使用大卡片和重复状态，前端目录清单占据过多页面。用户要求提高信息密度，并明确其前端视角。

## What Changes

- 前端功能目录使用紧凑模块行，省略 knowledge 来源标签及默认未打开状态。
- 默认展示 12 项，可展开全部或收起；搜索展示所有匹配项。
- 保留模块会话、钉选及递归子模块操作，完整路径通过标题提示可查。

## Capabilities

### New Capabilities

- `compact-project-modules`: 模块清单的紧凑展示、渐进展开及操作保持。

### Modified Capabilities

无。

## Impact

仅 project-workspace 前端展示和测试；不改 API、目录识别、会话启动或业务域定义。依据为用户截图、WorkspaceModuleCards/ProjectWorkspacePage 实现及模块类型契约。无未决选择。
