# 后台整理接入

复制完整 `test-asset-cleanup/` 目录到目标 `.agents/skills/workflow/` 即可使用，不需要中台 SDK、固定项目名或公共 npm 包。日常人工/AI 整理只读 Skill；只有可选的后台执行依赖 Node.js 22.12+、Git 与已安装、已登录且可执行必要验证的 Codex CLI。

在目标项目执行：

```powershell
node .agents/skills/workflow/test-asset-cleanup/scripts/maintenance.mjs
node .agents/skills/workflow/test-asset-cleanup/scripts/maintenance.mjs --run
```

第一条只读预览；第二条在独立工作树处理一批，按本项目命令定向验证后提交候选，默认不推送、不合入、不部署。模板另提供同义入口 `npm run maintenance:tests` 与 `npm run maintenance:tests -- --run`。有未合入候选或失败现场时不叠加新一批；相同输入和规则已完成审计时跳过，blocked 不计作已审计。

默认识别各层目录的 `src/test/`、`__tests__/`、`*.test.*`、`*.spec.*`、`test_*.py` 和 `*_test.go`，不要求 `platform/`、`backend/` 或 `frontend/`。基线优先采用当前分支上游，没有上游时使用当前本地分支。默认预算 15 分钟，候选分支为 `maintenance/test-assets`；本地状态、日志及工作树放在当前 Git common-dir 的 `tac/` 下，命令预览显示实际位置，不要求项目忽略 `.run/`。

确有差异时在项目根维护可选 `test-maintenance.config.json`，不复制中台配置。示例只限定特殊测试位置：

```json
{
  "testPatterns": ["tools/**/src/test/**", "frontend/**/*.test.*", "sidecar/**/*.test.*"],
  "watchPaths": ["tools", "frontend", "sidecar"]
}
```

| 可选字段 | 含义 |
| --- | --- |
| `testPatterns` | 允许改动的仓库相对 glob；覆盖默认模式，不接受越界路径或全仓通配 |
| `watchPaths` | 只在这些目录有变化时再次审计；缺省关注整个仓库 |
| `baseRef` | 覆盖自动推断的 Git 基线，如项目自己的 `upstream/develop` |
| `branch` | 本项目专用的候选分支；已有未知同名分支不会覆盖 |
| `budgetMinutes` | 1–60 分钟，默认 15 |
| `publish` | 默认 false；只有项目已授权时才设 true，推送至基线所属远端 |
| `ignoreUserConfig` | 默认 false，保留目标已有 CLI 配置；仅确有隔离需求时设置 |

配置属于目标项目，不由公共模板同步覆盖。已有子应用同步后即使尚无配置文件，也使用上述通用默认值；新项目同样不默认写一份空配置。

Windows 默认识别标准 npm 安装，其他系统从 PATH 查找 `codex`。非标准安装可用本机环境变量 `TEST_MAINTENANCE_CODEX_CLI` 指向已安装的 `bin/codex.js`，兼容旧变量 `YOOONI_CODEX_CLI`；不在共享配置中保存凭据或机器绝对路径。

定时执行由项目现有 CI 或本机调度器显式调用同一 `--run` 入口，不增加第二套调度服务，也不随模板自动登记系统任务。先验证真实工作区写入和该项目必要检查，才能声明自动清理已验收；请求可写却实际只读、依赖/工具缺失或验证受阻时保留 blocked，不关闭沙箱、降低断言或反复空转。退出 0 只表示 Agent 会话结束，不证明清理成功。后台调度的时间、登录条件与启停方式由安装方维护。
