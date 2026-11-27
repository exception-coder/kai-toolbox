# 实施与验证

- [x] 1.1 实现用户身份参数、持久会话映射、幂等与串行保护，保持无状态兼容。
- [x] 1.2 原生 Codex 续接、固定指令通道、SDK 来源标题和消息动作合同。
- [x] 1.3 SDK、协议、架构及图解同步，说明接入方每日归并方法。
- [x] 1.4 定向验证隔离、续接、忙碌、失败恢复、闲聊和兼容，运行适用质量门禁并提交。
- [ ] 2.1 [MANUAL_CONFIRMATION] 目标实例加载新版后执行真实模型多轮验收；服务重启需当次确认。

## 2026-11-27 验证证据与边界

- SDK：`npm test` 27 项通过，`npm pack` 生成 0.6.0 安装包，包含协议、接入说明与两张 PNG/SVG 图解。
- Sidecar：TypeScript 编译通过；App Server 生命周期与临时线程清理回归 30 项通过。
- Java 最终结果：执行器 6 项通过、后端 37 项通过，均零失败、零跳过，Maven exit 0。中途曾因并行 Maven 重编译共享目录出现依赖类不可见，改为串行验证；取消用例重复设置 Mockito 行为触发旧回调，已改为 doAnswer。后端完整回归另暴露普通用例共用 1 秒执行期限造成超时，已将普通用例预算改为 30 秒、终态等待 60 秒；超时专项仍显式设置过期 started_at，生产期限和终态断言未放宽。最终串行重跑覆盖身份隔离、服务重建续接、忙碌/未知执行、确认取消与旧协议兼容。
- 原生实测：使用本机已配置账号与模型执行三轮“业务提问 → 闲聊 → 简短追问”，同一 thread 返回 REPLY / IGNORE / REPLY，追问正确接续前文；读取核对标题后删除测试线程。测试输入为合成样例，不代表目标业务事实或已部署 HTTP 链路验收。
- 手动原生复测入口：在 sidecar/claude-agent 下先 `npx tsc --outDir .external-consult-test-dist`，再 `node scripts/verify-external-consult-native.mjs <已配置账号目录> <可用模型>`。不得把账号目录内的凭据加入产物或提交。
- 质量入口 `forge-quality.ps1 verify -Phase all -Project . -Format json` 返回 PASSED、exit 0；executedCheckers 为空，仅 API-RUNTIME-001 检查既有服务 HTTP 200，不能证明新版部署或全部静态检查通过。
- DDL 未核验：prepare_sql_context 返回 DDL_MISSING；资源发现未找到 Forge 数据库绑定。新表依据仓库现有 schema 编写并由隔离 SQLite 用例验证，未执行运行库迁移。
- 未推送、未重启服务；目标实例加载与真实 SDK HTTP 多轮验证保留在 2.1。每日归并由接入方实现，本次没有安装调度或发布知识库。
