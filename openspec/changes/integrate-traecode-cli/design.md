## Context and decisions

主对象是 Forge 会话 ID（OBJ-01、CTX-01、IDEM-01）。Trae 原生线程 ID 只绑定并显式恢复该会话；绝不使用“恢复最近一次”，避免跨项目/跨会话串上下文。复用现有选择菜单和会话配置，不新增导航或覆盖层（NAV-01、DENS-01）。

官方 TraeCode CLI 2.0 文档声明 `exec --json` 为流式 JSONL，`--resume=SESSION_ID`、`--sandbox`、`--ask-for-approval` 为通用参数；本地未安装 CLI，故先实现隔离的 JSONL 适配器与合成事件测试。未安装、版本不匹配、无助手答复和非零退出均显式失败，不回退其他引擎（FEED-01、EVID-01）。默认仅工作区写入，规划只读；完全访问仅在用户显式选择时启用（CTRL-01）。CLI 探针不等于登录或成功对话。

流程：既有会话选择 Trae → Sidecar 版本探针确认 CLI 2.0 → `exec --json` 从 stdin 读取提示 → 捕获原生线程 ID、终态答复和错误 → 转为 Forge 公开事件；下一轮仅以保存的 ID 显式 `--resume`。不把 CLI 原生 JSON、登录令牌或桌面 Trae 状态传至浏览器。重复刷新目录不创建会话；重复切换同引擎沿用现有幂等路径。

当前 JSONL 事件字段尚无官方详细 schema；合成测试仅证明适配器对预期形态的处理，不能替代安装后抓取真实流验证。未获得用户本次重启授权前，不替换在线 Sidecar `dist`，不声明运行成功。异常时原会话保持可重试，界面显示 CLI 安装/登录恢复提示；键盘、焦点和窄屏沿用既有引擎菜单，运行验收需再次检查。

参考：[TraeCode CLI 2.0 命令参数](https://docs.trae.cn/cli_command-line-parameters)、[官方快速开始](https://docs.trae.cn/cli_get-started-with-trae-cli)。
