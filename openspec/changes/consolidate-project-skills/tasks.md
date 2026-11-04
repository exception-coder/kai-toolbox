# 任务

- [x] 归档五个空模板，收敛运行及 UI 正文，保留兼容路由。
- [x] 持续执行按需参考随包分发，统一源、版本与指纹，保护用户文件。
- [x] 同步架构职责、流程和产品装配边界。
- [x] 完成定向分发测试、格式/同步核对与项目门禁。

验证记录：AutopilotTaskBatchTest 6 项通过；同步脚本生成、漂移检测、幂等和用户文件保护通过；标准 Skill 格式与本地引用通过。持续执行的 x-forge-owned/x-forge-version 为既有宿主扩展，由分发测试核对；通用格式校验排除这两个已知扩展后通过。OpenSpec strict 通过。项目门禁 PASSED，executedCheckers 为空，实际 runtime 检查仅 API-RUNTIME-001（当前服务 /api/tools 200），不代表新分发代码上线。

- [ ] [MANUAL_CONFIRMATION] 用户授权新后端加载后验证实际分发及三引擎发现效果；本次不重启。
