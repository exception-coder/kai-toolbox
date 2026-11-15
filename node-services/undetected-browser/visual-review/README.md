# ChatGPT 网页视觉评审实验

复用已有 Patchright：新会话 → 上传截图 → 发送评审提示词 → 收集优化方案与生成图预览。不是 Codex 引擎或 OpenAI API，不要求 API Key；尚未提供 Forge 页面入口。

## 使用

在仓库根目录运行，要求本机 Chrome 与浏览器模块依赖已安装：

```powershell
# 首次登录一次，登录态保留在本机独立 profile。
npm --prefix node-services/undetected-browser run visual-review -- login

# 运行即授权把指定截图及补充要求发送到当前登录的 ChatGPT。
npm --prefix node-services/undetected-browser run visual-review -- review --image "D:\screenshots\page.png"

# 每次输出任务 UUID；恢复时保留该编号，不要重跑无编号的 review。
npm --prefix node-services/undetected-browser run visual-review -- status --id "任务UUID"
npm --prefix node-services/undetected-browser run visual-review -- collect --id "任务UUID"
```

重复 `--image` 可上传 1～4 张 PNG/JPEG/WebP，单张不超过 20 MB；`--brief-file` 指定 UTF-8 设计约束文件，最多 12000 字符。`--id` 显式指定稳定 UUID；同一编号不接受不同的输入。默认等待 600 秒，`--timeout` 支持 10～1800 秒。Ctrl+C 停止本地收集，不代表 ChatGPT 已停止生成。

默认数据目录 `~/.kai-toolbox/chatgpt-visual-review`，可用 `--data-dir` 指定本机私有目录。不要使用日常 Chrome profile，不要将目录提交 Git 或共享。脚本不读取密码、不导出 Cookie、不处理或绕过验证码。使用网页当前账号默认模型，不承诺自动选模型或账号具有图片生成权限。

一个数据目录只允许一个浏览器进程；崩溃遗留 `browser.lock` 时，先核对其中 PID 已退出，再手动移除锁，不自动抢占。

## 结果和恢复

每个任务的 `runs/<UUID>` 目录包含：

| 文件 | 含义 |
|---|---|
| `status.json` | 状态、原会话地址、截图 SHA-256、文字结果、产物清单 |
| `prompt.txt` | 实际发送的提示词，可用于网页版或其他渠道对比 |
| `review.txt` | 网页可见回复文字，保留换行，不保证为 Markdown 原文 |
| `example-*-preview.png` | 网页明确标为生成图的图片元素截图，**不是原始分辨率下载图** |
| `page-evidence.png` | 页面证据，可能包含账号及对话信息，仅本地保存 |

`COMPLETED` 要求任务编号匹配、回复停止流式输出、出现回复完成控件，并同时取得文字和加载完成的生成图；不代表设计质量、业务准确性或代码已实现。

`AUTH_REQUIRED` 表示没有识别到登录后输入框，先运行 login 后用同一编号、相同输入重试 review；尚未发送，不能 collect。`PARTIAL` 表示有文字但缺少完整图文，`TIMED_OUT` 表示超时；可用 collect 续收集。`SEND_UNCONFIRMED` / `RESULT_UNCONFIRMED` 表示发送或结果未知，不会自动重发。点击前先持久化发送意图，同一 `--id` 不再点击发送。没有原会话 URL 时需先在浏览器核对任务编号，再用 `collect --id <UUID> --conversation-url <原对话URL>` 恢复；仅接受 ChatGPT 会话地址，收集仍须匹配任务编号，不能假定未发送。准备阶段失败且未尝试发送时，可用同一编号、相同图片和要求重试。

退出码：0 完整成功（status 查询或 login 识别成功同样为 0）；2 需要登录、部分结果、取消、超时或待核对；1 参数、依赖、页面结构等错误。本程序可独立运行到退出，不依赖 AI 持续等待；它是单次命令行工具，不是调度服务，退出后不会后台自动续跑。

## 实验边界

页面选择器集中在 `review.js` 的 `ChatGptPage`，网页结构及本地化变化可能导致失效。无验证码绕过、私有接口、账号池、限额自动重试或授权转交。个人 ChatGPT 条款限制自动提取输出及绕过保护措施；这是非官方实验，持续或团队使用需核对适用条款与授权。

`npm --prefix node-services/undetected-browser run visual-review:test` 验证输入、编号复用、发送不重放、取消、部分结果及隔离浏览器夹具。夹具仅证明实现路径，真实账号上传、评审和出图仍待端到端验证。

2026-11-15 验证：8 项定向用例通过（含隔离 Chrome）；CLI help 与 Node 语法检查通过。真实 ChatGPT 未登录页面返回 `AUTH_REQUIRED`、`submissionAttempted=false`，未上传或发送。Forge all 为 PASSED、退出 0，`executedCheckers=[]`，Runtime 仅 `API-RUNTIME-001`，不证明真实账号图文链路可用。未重启或发布。

复用现有模块依赖，不修改 sidecar HTTP 协议、Forge 引擎、权限或生命周期契约；无服务重启需求。参考：[Patchright](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright-nodejs)、[文件上传](https://playwright.dev/docs/input#upload-files)、[页面下载](https://playwright.dev/docs/downloads)、[ChatGPT 使用条款](https://openai.com/policies/terms-of-use/)。
