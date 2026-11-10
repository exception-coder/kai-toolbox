## 1. 实现与专项验证

- [x] 1.1 实现 registry Git 查询与快照绑定 push，临时 bare 仓库覆盖成功、特殊文件名、空仓库、无上游、detached、过期快照、远端拒绝、多目标及部分失败重试。8 个测试通过；最后调整多目标 ahead=0 重试后，单目标、多目标、部分失败/fetch 后重试 3 个受影响测试再次通过，0 failures/errors。
- [x] 1.2 实现项目库 Git 标签、项目选择、文件/提交明细及 Push 状态，验证加载、失败、禁用与成功刷新。最终 `ProjectGitWorkspace.test.tsx` 5 tests 通过。

## 2. 交付验证

- [x] 2.1 完成前端 typecheck/build、宿主构建与 Forge 质量门禁。`npm run typecheck`、`npm run build` 成功；Maven 完整宿主 install 成功。最终装配复用本次已构建的前端，JAR 内 index 与 dist SHA-256 一致（3d793f5ed02f427fad894d1cd5214d0bd71b4dadea8aa9db3c163ef65f329655）。Forge CLI all：PASSED，Static PASSED、Runtime PASSED；executedCheckers=[]，不能宣称运行了静态规则；API-RUNTIME-001 执行 9 个场景，全部通过。
- [x] 2.2 完成桌面/移动浏览器验收、当次启动日志及 60 秒稳定观察，更新使用说明并仅提交本次改动。真实页面 1440×1000 / 390×844，通过项目选择、文件/提交切换、两个推送目标展示、按钮可用及读取失败恢复，无页面异常或横向溢出。真实远端 push 未执行，写入验收使用临时 bare 仓库。

## 3. 运行证据与范围

- 本地证据：`.codex-work/git-workspace-{browser,runtime,quality}.json`、前后端构建/测试日志；这些临时产物不纳入提交。
- 最终观察 2026-09-13 05:17:42–05:18:47 UTC，共 64.665 秒；backend 56924 / frontend 46980 / Studio 72684，均 online/ready，restart=0 且身份不变；Git API 与健康响应均 200。
- 模式为源码运行：backend 18080、Vite HTTPS 5173、Studio 3000。验证源码指纹 `1c6aa8aca9562f2eac92a6ce8145048038e5db3e4e7dbd151a6294f6aa80f4c0`。
- 当次启动无致命异常；之前运行期间出现的 SessionExecutionPolicy 类加载错误在最终重启后未重现。微信辅助服务原有未就绪、aria2/Ollama 外部依赖缺失单列，均不属于 Git 工作区交付范围。
- Agent 自审：需求场景、固定 SHA/目标快照、普通推送与部分失败语义一致；OpenSpec 严格校验通过。未执行真实业务远端推送或自动归档。
