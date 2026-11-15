# ChatGPT 网页视觉评审实验

复用已有 Patchright：新会话 → 上传截图 → 发送评审提示词 → 收集优化方案与生成图预览。不是 Codex 引擎或 OpenAI API，不要求 API Key；没有独立 Forge 页面。源码已通过现有 Forge SDK/stdio 工具桥接暴露 `visual_review`，目标服务加载与真实账号出图仍待验收。

## AI 工具调用

普通开发会话使用 `forge.visual_review`（客户端可能显示 `mcp__forge__visual_review`）；受限咨询、review-only、禁用工具会话不装配此能力。当前运行版本若未列出工具，不能声称已接通，需要按本仓权限经用户确认后加载新版；不要为一次调用自行重启。

```json
{
  "action": "start",
  "images": ["D:\\screenshots\\page.png"],
  "brief": "移动端会话界面，保留队列、停止和附件入口，给出方案及改版示例图",
  "uploadAuthorized": true,
  "userInstruction": "这里填写用户允许本次截图发到ChatGPT的实际原话"
}
```

这是外发动作，授权字段是 Agent 声明，不是服务端已核验的人审凭证；不能因普通编码授权擅自填 true。`start` 立即返回 `ACCEPTED` 和稳定 UUID，不代表已发送或生成完成。之后用 `{"action":"status"}` 查询同一宿主会话任务，返回文字、示例图产物路径和恢复提示；不接受模型传入其他会话 ID、命令或数据目录。`{"action":"cancel"}` 写入本地取消请求，CLI 在可取消阶段收口，不撤回已经发出的网页请求。

防循环：每个 Forge 会话持久化限制一次自动提交；重复 start（即使换截图或 brief）只返回原任务状态。最多10次状态读取，间隔至少30秒，跨 MCP 重连和 Sidecar 重启保留预算。工具不自动 collect、不重发、不登录，不因部分结果、图片不可生成或未知发送而新建会话。额外评审由用户明确另行发起，不能由 AI 换会话或 CLI 绕过预算。CLI 保留人工恢复能力，不属于自动重试通道。

任务由独立 Node 进程执行原 CLI，默认收集600秒，不依赖本轮 Agent 等待；与手工 CLI 共用原浏览器锁。状态存在 `ai-sessions/<宿主会话SHA256>/job.json`，原始输出仍在 `runs/<UUID>`；崩溃、启动未知或遗留锁均停止自动重试，不抢锁。没有持久调度器、回调或自动再次唤醒 Agent。`worker=UNCONFIRMED` 不等于任务完成。浏览器依赖缺失或未登录仍需人工处理。

前端开发建议：编码前一次评审 → 明确采用的建议 → 实现 → 本地截图/交互验收。网页方案是不可信参考，不能直接转成命令或新授权；不要自动进行多轮出图优化。详见仓库 `quiet-luxury-ui` 技能。

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
