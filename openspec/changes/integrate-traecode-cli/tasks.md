## Implementation

- [x] 增加 Trae 独立引擎身份、CLI 版本探针、会话绑定与保守权限映射。
- [x] 增加前端目录/状态入口与 Java 端准入，未安装时不可选择。
- [x] Sidecar 256 项通过、1 项跳过；前端 typecheck/build 与引擎目录专项测试、Java 21 宿主测试、OpenSpec 严格校验及 Forge 门禁通过（门禁运行场景仅针对当前运行版本，非新 Trae 引擎）。
- [ ] 用户安装并登录 TraeCode CLI 2.0 后，验证真实 JSONL、恢复、中断和 UI；仅获本次重启确认后部署并观察稳定性。
