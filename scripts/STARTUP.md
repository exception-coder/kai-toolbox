# Forge 启动与运行

## 选择入口

| 场景 | 命令 | 生命周期由谁负责 |
| --- | --- | --- |
| 本地开发 | `task prepare`，然后 `task dev` | Task 前台运行 Maven 与 Vite；Ctrl+C 停止 |
| 分终端调试 | `task dev:backend` / `task dev:frontend` | 各终端分别停止 |
| 预构建产物 | `task build`，然后 `task run` | 前台 Java 进程；无 Vite |
| 保留页面重启与源码更新 | `task legacy:start` / `task legacy:stop` | 原 Windows/macOS 监督器 |
| 可选观测服务 | `task deps:up` / `task deps:down` | Docker Compose |

Task 是命令编排工具，不是新守护进程。Java 继续管理 Agent Sidecar，避免两方重复拉起。新入口不会扫描和杀死占用端口的进程；已有服务运行时不要重复启动。Vite 使用 strictPort，端口冲突直接报错。

## 环境与配置

安装 [Task v3](https://taskfile.dev/docs/installation)、JDK 21、Maven 3.9+、项目支持的 Node/npm 和 Git，放入 PATH。先运行 `task doctor` 查看实际版本。`doctor` 只检查命令可用并输出版本，不安装或修改环境。

Windows 使用原生终端即可，不要求 Git Bash；Task 内置 shell 处理任务语法。macOS、Ubuntu 与受维护的 CentOS Stream 使用同一 Taskfile。CentOS Linux 7/8 已结束维护，不宣称支持；运行时版本和 CPU 架构必须与各工具支持矩阵匹配。

`task prepare` 按锁文件安装 JS 依赖，构建 Sidecar，再安装 Maven 依赖模块；此步骤跳过测试以准备开发环境。`task build` 执行 Maven 正常打包和测试，并使用项目已有前端嵌入流程。打包后仍需提供本机 Node、Agent 登录配置及 Sidecar 文件；不是单文件离线发行包。

原 `run-tools.conf` / `run-tools.d` 是旧监督器的配置格式，新 Task 入口不解释或执行这些文件。使用 PATH、当前终端环境变量及 Spring 配置。自定义业务库、Python 语音服务等仍需显式配置；不会自动启动旧脚本中的全部辅助服务。不要把含密码的本地配置提交到仓库。

## 重启与自动更新边界

新 native 入口设置 `KAI_SUPERVISED=0`、关闭 `TOOLBOX_AUTO_UPDATE_ENABLED`。它不提供 18081 监督控制端口；开发重启用 Ctrl+C 后重跑。页面原生后端重启能力由现有 Java 逻辑决定，不能等同于完整前后端 reload。需要原页面重启、自动更新交接和辅助服务守护时继续用 `legacy:start`。

Linux 长期部署应由 systemd 或容器平台托管构建产物；Windows 常驻服务由 Windows Service、macOS 由 launchd 托管。安装这些服务前应明确关闭或适配应用内自行重启，避免服务管理器与 replacement JVM 双重拉起。本次不自动安装服务、不替换现有监督协议。

## 可选 Phoenix

为避免隐式拉取 latest，必须设置经过团队验证的 `FORGE_PHOENIX_IMAGE`（完整镜像版本或 digest）。Windows 在 PowerShell 中用 `$env:FORGE_PHOENIX_IMAGE` 设置，macOS/Linux 用 `export FORGE_PHOENIX_IMAGE=...`。

```shell
task deps:check
task deps:up
task deps:status
task deps:logs
task deps:down
```

默认访问 `http://127.0.0.1:16006`，可用 `FORGE_PHOENIX_PORT` 修改。数据保存在独立 Compose volume；down 不带 `-v`，不删除数据。该服务与旧监督器的 kai-phoenix 容器和数据卷独立；不会自动迁移旧数据。Forge 的观测接收地址须按配置指向新端口，启动容器本身不代表已接通遥测。已有 Langfuse 部署继续使用 `deploy/langfuse/docker-compose.yml`。

## 验证范围

安装 Task 与 Docker Compose CLI 后，运行 `node --test scripts/tests/portable-startup.test.mjs`。若 Task 不在 PATH，可通过 `FORGE_TASK_BIN` 指定其绝对路径。测试使用临时模拟命令，不构建项目、不连接 Docker daemon、不拉镜像。

Task 文件跨平台不等于所有主机已验收。需在各平台验证实际构建、启动、Ctrl+C 子进程退出、路径含空格、端口冲突及 Agent 登录恢复后，才能退役旧监督器。当前验证证据见 `openspec/changes/standardize-cross-platform-startup/tasks.md`。
