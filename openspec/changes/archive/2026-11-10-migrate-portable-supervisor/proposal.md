## Why

源码运行依赖两套大型 PowerShell/Bash 守护实现，Windows 5.1/7、编码和命令转义反复造成兼容问题。用户要求将页面重启、更新交接与辅助服务一起迁移，收敛操作入口。

## What Changes

- 新增统一 Node CLI，PM2 承担进程树、失败重试和日志，HTTP 适配层保留控制协议 v1。
- 源码编译启动、Python 虚拟环境、前端及 Agent Sidecar 构建使用参数数组调用原生工具。
- Java 继续负责更新资格、空闲判断与 Git 更新；受管运行完成全栈重载。
- **BREAKING** 旧启动/停止入口仅转发 Node；不再按端口强杀未知进程，也不自动安装全局工具或默认拉取 Docker latest。
- 删除 IDE 启动后强制抢占当前 JVM 的 PowerShell 自举；独立 JAR 重启改为 Java 原生子进程。

## Capabilities

### New Capabilities

- `portable-supervisor`: 跨平台源码守护与重启交接。

### Modified Capabilities

无。

## Impact

forge.mjs、scripts/runtime、Taskfile、旧启动入口、SupervisorBootstrap、RestartRuntime、启动文档及测试。数据库与会话协议不变。依据当前源码和 PM2 官方 API；不引入系统服务安装或自动操作用户已有进程。
