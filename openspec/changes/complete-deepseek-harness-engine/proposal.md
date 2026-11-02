# 补齐 DeepSeek Harness 本地编程引擎

现有 Adapter 锁定旧 SDK、要求手填 Runtime，尚未形成原生凭据、工作目录与持久会话闭环。本次复用既有引擎目录、Session、消息事件及权限确认，不引入独立 Agent 平台。

升级并锁定官方 SDK/Runtime，使用隔离 Harness Home，通过子进程环境复用本机已登记的 DeepSeek Key；验证流式对话、文件操作、工作目录绑定、中断和原会话恢复。模型结果失败不得按 idle 冒充成功。WorkBuddy 仅核查桌面自带 CLI 和原生登录能力，不使用开放平台 OAuth 代替本地集成。

源码和隔离验证不授予服务重启权限；当前运行版本生效和完整运行验收在用户明确确认后执行。
