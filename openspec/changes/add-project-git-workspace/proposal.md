## Why

项目库缺少集中查看 Git 工作区的入口，用户无法直接区分待提交文件和已提交但待推送的提交，也无法完成推送。

## What Changes

- 项目库新增 Git 工作区区域，选择已登记项目并查看当前分支、HEAD、上游、领先/落后数量、待提交文件和待推送提交。
- 提供当前分支的一键普通 Push，绑定已显示的 HEAD 和上游，返回可恢复的失败信息。
- 非目标：自动 commit、force push、pull/rebase、分支管理、凭据管理或批量推送。

## Capabilities

### New Capabilities
- `project-git-workspace`: 已登记项目的 Git 状态查看及受控推送。

### Modified Capabilities
无。

## Impact

- frontend project-workspace feature 与 tool-projects registry API；复用已登记项目身份和 Git 配置，不新增依赖或数据库表。
- 当前依据：ProjectRegistryPage、ProjectsGitController、GitLogService。图谱 manifest 落后于当前工作区，精确行为以定向源码为准。
- 无未决产品选择；采用轻量 M 档，包含网络写操作的边界与回归测试。
