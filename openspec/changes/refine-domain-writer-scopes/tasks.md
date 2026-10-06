# Tasks

- [x] Refine module and named domain scope classification.
- [x] Preserve parent/child and exact shared-file conflict rules.
- [x] Add regression cases for frontend features, local database files and existing parent scopes.
- [x] Run affected tests and project quality gate.
- [x] Complete runtime validation after an authorized Forge service restart (2026-10-06; read-only MCP ownership projection).

## 2026-10-06 范围误阻塞修复

- [x] 普通无归属、治理及 Sidecar 源文件使用精确路径；构建与根数据库范围保持协调。
- [x] 从核验身份的原执行重投影新旧 writer，保留记录及精确文件权限，避免旧指针重复登记。
- [x] 增加 6 项专项回归，覆盖并行、冲突、身份损坏、旧指针和 V096 越界；当前工作区 33 项通过，已提交基线加本次修改的隔离快照 32 项通过。
- [x] TypeScript 编译、两个 change 严格校验和项目门禁通过；门禁无 static checker，9 项 API 检查对应当前旧服务。
- [x] 2026-10-06 用户授权后通过 `node forge.mjs restart --scope backend` 重启；Sidecar 构建及 Maven 41 模块构建成功。正式 MCP 的只读查询确认原 Forge writer 仅占登记的两个文件，IAM 不再包含 `*`，查询前后记录摘要一致。
- [x] 新运行产物 `1791290360363-31304`（基于 `8188fafb` 及现存工作区）加载；后端受管 PID 45840、Sidecar PID 38100，辅助服务 ready。20:40:51 至 20:42:21 观察期间进程稳定、重启次数未增长，基础及引擎目录接口 200；重启后质量门禁 PASSED，9 项 API 实际执行，无 static checker。
- [ ] 原业务会话实际继续开发及 V096 正式范围补充仍待原会话执行；本次未发送消息或扩充权限。
