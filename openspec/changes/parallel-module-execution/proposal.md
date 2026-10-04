# 按模块并行执行

## 目标

同一 Git 工作区中，不同模块的 Forge 执行可并行编辑；同模块与共享文件保持互斥。用户指出全项目 `sequential_single_writer` 使 Yoooni One 等多模块项目无法并行开发。

## 范围

调整 Forge 执行写入权、会话投影、遗留中止与完成判定；同步架构说明和回归。保留宿主分配的共享分支，不自动创建分支或推断任务依赖。

## 证据与边界

现状见 `sidecar/claude-agent/src/execution/service.ts`、`session.ts`、`policy.ts`。共享 Git index/HEAD 不具备模块物理隔离；执行范围声明必须精确，提交前继续核对暂存文件。Hook 未触发的任意 Shell 操作不受此门禁保证。
