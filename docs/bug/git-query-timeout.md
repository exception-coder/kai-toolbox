# 代码与分支本地读取超时

## 2026-11-23 调查

弹框的本地状态、引用与历史查询不默认 fetch；前端已并行读取状态和历史，历史也不等待分支列表。最近提交按条数有界读取，不是全量扫描历史。当前机器直接执行最近 30 条提交约 197 ms，工作区 status 约 412 ms。该测量不是截图发生时的系统负载，不能据此排除当时负载问题。

`GitLogService.exec` 有两个可复现的管道问题：

- stderr 保留到 64 KiB 后停止读取，子进程写满管道后无法退出；2 MiB stderr 的本地子进程在旧实现稳定触发 5 秒超时。
- 三路进程 IO 都使用虚拟线程。JDK 21 阻塞管道读取可能占用 carrier；测试 JVM 限制 `jdk.virtualThreadScheduler.parallelism=1` 和 `maxPoolSize=1` 后，输出 2 MiB stdout 的子进程也超时。该限制模拟调度资源耗尽，不代表现场配置为 1。

[JDK 21 官方虚拟线程说明](https://docs.oracle.com/en/java/javase/21/core/virtual-threads.html)解释阻塞与 pinning 的限制；本仓结论同时依据真实进程管道复现，不据此断言所有 Codex/Skill 超时均同源。

## 修复

仅 Git 查询边界的 stdout、stderr、stdin 使用独立 daemon 平台线程，随子进程完成结束；不改变全局虚拟线程配置。stderr 达到保留上限后继续消费而不缓存。读线程未完成时拒绝返回不完整结果。保留原 5 秒命令预算，不增加远端查询、缓存、认证或 Git 写操作，不改变架构契约。

## 验收边界

复现测试使用本地 Java 子进程，不访问网络或修改业务仓库；真实临时 Git 仓库测试覆盖状态和审阅读取。运行服务未重启，修复尚未加载。现场当次超时没有线程快照及完整子进程输出，不能将复现缺陷等同于该次故障的唯一根因。

修复后以同一受限调度参数运行 GitProcessDrainTest、GitStatusReaderTest、GitReviewServiceTest，共 12 项通过，Maven exit 0。质量门禁 status=PASSED、exit 0；executedCheckers=[]，仅执行 API-RUNTIME-001（当前服务 /api/tools 200），不代表新版 Git 查询的运行验收。
