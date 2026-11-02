# 本地 Harness 适配

本次涉及凭据与权限边界，采用 L3，范围限于现有 DeepSeek Adapter。适用 OBJ-01、CTX-01、FEED-01、AI-01、EVID-01、CTRL-01、IDEM-01。对象为 Forge sessionId，保持既有目录准入、消息队列与账号边界；不增加导航或第二份配置系统。

- 复用官方 TypeScript SDK 的自带同版本 dsh，不再依赖 PATH 中的命令；实验引擎只有握手通过才可选。开发预览版本精确锁定，不用 latest 或忽略 peer 冲突。
- 使用 Forge 独立 Harness Home，避免升级改写用户已有 web profile。凭据优先继承明确环境，其次复用后端唯一的全局官方 DeepSeek 档案，再只读解析本机 `.dsh/.credentials.yaml` 的 `version=1`、`refs.DEEPSEEK_API_KEY`。不扫描私人档案；多个全局官方档案不自动猜选。后端传入的专用 Key 在 Sidecar 模块初始化时移出 ambient environment，只向 Harness 子进程注入，防止其他引擎继承；不复制凭据文件、不回传 Key、不在错误中输出配置正文。
- 每个 Adapter 固定 cwd 与根会话身份。持久恢复读取同一 Home 的既有原生会话，失败不新建替代；恢复后核对有效工作目录，不静默切换项目。中断关闭并回收 SDK 子进程，后续对话恢复原会话，不重放中断输入。
- SDK 审批/提问转接现有 Permissions；缺少处理器、未知请求或取消一律拒绝。保留 consult/review/demo 限制，不能以新增引擎绕过。只有真实终止成功才发完成；失败和超时保留明确原因，无自动重试写操作。
- 内容和工具事件继续映射既有消息流，原生调试数据不越过 Sidecar。关闭界面不取消任务；没有新增自动发送动作。

验证版本为 SDK/dsh `0.2.2-alpha.2`（实验选项），Runtime wire identity 另为 `0.0.1`，不能把包版本与协议版本误作同一字段。原 SDK `0.1.0-rc.6` 无宿主审批入口，`0.2.1-rc.5` 仍缺少此入口，故选择实际可处理审批和提问的精确 alpha 版本；未使用 `--force` 或 `--legacy-peer-deps`。从原 lock 增量解析以保留其他依赖，新 dsh 引入完整原生工具及其依赖，根 ws 因依赖收敛从 8.21.0 到 8.22.1。官方 SDK 仅推送原生落盘步骤消息，不保证逐 Token；图片、非默认权限与咨询/评审/演示仍明确拒绝，不以 native workspace-write 冒充这些安全模式。

WorkBuddy 5.6.2 安装目录内确有 `@genie/agent-cli` 和 WorkBuddy 专属 `product.json`。使用产品配置、关闭全部工具进行独立只读 Headless 探测，返回 `Authentication required` 并要求 `/login`；没有要求 clientSecret。证明存在可探测的本地 CLI 登录路径，但不证明桌面账号缓存可直接复用，也不据此开放未验证的 WorkBuddy 引擎。

依据：[官方 SDK](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/packages/sdk/client/README.md)（2026-11-02 核查），实际实现按锁定发布包的类型和协议核对，主干文档不代替已安装版本验证。WorkBuddy 开放平台 clientSecret 仅适用于其 OAuth 路径，桌面自带 CLI 须独立核验产品身份、登录方式及公开调用契约，不能把独立 CodeBuddy 直接重命名。

验证优先已有 Adapter/Catalog 用例，加工作目录不匹配、原生恢复、审批失败关闭、取消/超时和失败终态覆盖；真实模型仅在专用临时目录写入验收文件。隔离子进程不是 Forge 服务重启。全局服务保持现状，未启动新版时不宣称线上可用。
