# Tasks

- [x] Refine module and named domain scope classification.
- [x] Preserve parent/child and exact shared-file conflict rules.
- [x] Add regression cases for frontend features, local database files and existing parent scopes.
- [x] Run affected tests and project quality gate.
- [ ] Complete runtime validation after an authorized Forge service restart.

## 2026-10-06 范围误阻塞修复

- [x] 普通无归属、治理及 Sidecar 源文件使用精确路径；构建与根数据库范围保持协调。
- [x] 从核验身份的原执行重投影新旧 writer，保留记录及精确文件权限，避免旧指针重复登记。
- [x] 增加 6 项专项回归，覆盖并行、冲突、身份损坏、旧指针和 V096 越界；当前工作区 33 项通过，已提交基线加本次修改的隔离快照 32 项通过。
- [x] TypeScript 编译、两个 change 严格校验和项目门禁通过；门禁无 static checker，9 项 API 检查对应当前旧服务。
- [ ] 用户明确授权后重启受管后端，验证新版实际加载及业务会话恢复；不把只读源码投影当作运行验收。
