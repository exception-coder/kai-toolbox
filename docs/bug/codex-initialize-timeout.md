# Codex 初始化等待

## 2026-11-23 调查与修复

用户报告 App Server initialize 60 秒超时、Skill 初始化反复等待。不能仅凭超时归因为网络。

- 后端日志记录多个 model/list 在 initialize 阶段超时，尚未发送模型目录请求。历史 Skill 前置探测也有首次 initialize 超时、清理后重试接近 60 秒才完成的记录。这些证明本地原生宿主没有及时完成握手，但不足以判断其内部慢在网络、插件加载还是系统负载。
- App Server 轮次原先先启动元数据进程读取 skills/list 和 config/read，再关闭并冷启动任务进程。现改为同一进程完成初始化、Skill 选择及线程启动；SDK/Exec 保留原独立探测。不会删除用户 MCP、改变认证、缓存过期账号配置或跳过必要的 Skill 校验。

## 验证与运行边界

- Sidecar 类型编译及 42 项定向回归通过：单进程新建/恢复、项目优先、无效结构化配置拒绝、取消、回退及进程清理。
- 质量门禁 status=PASSED、exit 0，executedCheckers=[]、executedVerifiers=[API-RUNTIME-001]；运行项仅证明当前 /api/tools 返回 200。
- 服务未重启，本次代码尚未完成目标版本运行验收。原生宿主单次 initialize 的底层慢因仍待目标版本日志及实际复测；不能将减少一次冷启动报告为外部宿主故障已完全恢复。
