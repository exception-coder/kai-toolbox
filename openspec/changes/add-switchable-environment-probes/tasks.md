## 1. Engines

- [x] 1.1 Extract probe contract and shared tool evaluation; verify existing readiness scenarios.
- [x] 1.2 Implement bounded concurrent Java probes, PATH reuse and timeout cleanup with tests.
- [x] 1.3 Add standalone Go module, adapter and reproducible build; test protocol, concurrency, failures and bounds.

## 2. Interface

- [x] 2.1 Add engine selection and timing metadata while preserving default endpoint behavior.
- [x] 2.2 Add isolated UI selection, sequential fresh comparison and recoverable errors; run frontend tests.

## 3. Delivery

- [x] 3.1 Build frontend and full host assembly, run Forge quality gate and real API/browser smoke tests.
- [x] 3.2 Observe target runtime for 60 seconds; record actual speed comparison and validation evidence.
- [x] 3.3 Update module usage documentation, validate OpenSpec and commit only this task's changes.

## Validation evidence

- 2026-09-12（本机时间），后端相关 24 项测试通过：Service 8、CommandRunner 8、Bootstrap 4、Java engine 1、Go adapter 3。完整宿主 reactor package 成功；其他模块未执行的测试不计为通过。
- 前端 typecheck、完整 build、环境管理 16 项测试通过；最终页面补充修改再次 typecheck、16 项测试和 Vite build 通过。宿主包的 index.html 与环境页面 chunk 与本次 dist 字节一致。
- Go 1.27.1 Windows 官方 SDK 经 SHA256 校验；go test ./...、go vet ./...、独立构建安装成功。覆盖缺失命令、超时、输出上限、并发及空格路径 .cmd。未进行 Linux/macOS 运行验收。
- Forge full gate：进程 exit 0，JSON status/staticStatus/runtimeStatus 均 PASSED；executedCheckers 为空，未执行静态检查器；9 个 API-RUNTIME-001 场景实际通过。另测非法引擎 HTTP 400。
- 浏览器桌面和 375px 窄屏验证：选择器、顺序对比、禁用安装状态、结果表均正常。22:18:11 Java 探测 1.89s / 整体 15.11s；22:18:25 Go 探测 1.63s / 整体 14.02s，依赖状态与版本一致。旧实现一次观测 50.18s，负载和缓存不同，仅作背景，不作为严格加速基准。
- dev 范围 backend :18080、frontend HTTPS :5173；Java PID 8428 于 22:16:32 启动。22:17:26—22:18:44 连续 77.7s，backend wrapper 56924 / frontend 46980 保持不变且 ready，restart 均 0，HTTP /api/tools=200。Studio 同期 ready；WeChat 为既有等待重启状态（4 次），不在本次变更验收范围。
- 默认 Java；Go 独立制品安装于用户目录，源码和构建入口纳入提交，SDK、二进制、运行日志及其他任务改动不提交。
- 故障注入：暂时移开自建 Go 制品，页面明确显示构建命令和切换 Java 的恢复提示；验证后立即恢复二进制。
