# 本机工具

系统分组的“本机工具”集中提供目录扁平化、端口进程查询、Web 终端和 VS Code Tunnel。四个工具保留独立授权；给合并入口授权不会自动授予子工具。

入口为 `/tools/local-tools?tool=flatten`，tool 可选 `flatten`、`port-process`、`webterm` 或 `vscode-tunnel`。原 `/tools/<tool>` 链接继续可用，并保留路径、自动启动参数及 URL 片段。

点击或 Enter/Space 打开页签；左右方向键与 Home/End 移动页签焦点。页签切换保留已打开工具的输入、进度和终端连接；离开整个模块或刷新页面仍遵循各工具原有清理行为。工具只在首次选择时初始化，切换页签不表示取消已经开始的操作。

组合页通过各工具的 public-api 使用原页面，复用 Shell 的菜单偏好迁移和权限聚合。行为设计及验收记录见 [OpenSpec 变更](../../../../openspec/changes/unify-local-tools-workspace/design.md)。
