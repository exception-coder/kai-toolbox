# OpenSpec 待验收清单

2026-11-10 快照。统计 `openspec/changes` 中尚未归档的 147 个变更：源码大多已完成，未勾选项主要是重启加载后的运行验收、真机或浏览器验收及人工确认。勾选状态以各变更的 `tasks.md` 为准，本清单不代替验收记录。

同日已清理：任务全部完成的 67 个变更归档并合并到 `openspec/specs`；功能已被移除的 7 个变更标注废弃后归档（未合并规格）；3 个空壳目录删除。

## 怎么使用

1. 在固定的加载与验收窗口中，经授权重启服务，加载待验收版本。
2. 按下列分组逐项验证，把真实证据写回对应 `tasks.md` 并勾选；无法验收的保留未勾选并写明原因。
3. 任务全部完成后执行 `openspec archive <变更名>` 合并规格，再从本清单移除。

| 分组 | 数量 | 说明 |
| --- | --- | --- |
| 需重启加载后运行验收 | 104 | 新版本尚未加载到运行服务，或需观察启动与稳定性 |
| 需真机或浏览器验收 | 28 | 手机、桌面浏览器、键盘、语音等真实交互与视觉检查 |
| 需人工确认或外部条件 | 3 | 真实账号、外部服务、部署环境或业务方确认 |
| 仍有开发任务 | 7 | 除验收外还有未完成的实现或修复 |
| 任务已不适用，待决定 | 4 | 待办依赖已退役的接口登记工具或已删除代码 |
| 已完成但依赖前置变更 | 1 | 修改的规格由尚未归档的变更创建，需先归档前置变更 |

## 需重启加载后运行验收

| 变更 | 未完成 | 最近更新 | 第一项待办 |
| --- | --- | --- | --- |
| [add-markdown-image-hosting](../../openspec/changes/add-markdown-image-hosting/tasks.md) | 2 / 6 | 2026-11-08 | 获得本次 Forge 后端重启授权后加载目标版本，核对新接口、页面和至少60秒稳定性。 |
| [control-pinned-queue-inquiry](../../openspec/changes/control-pinned-queue-inquiry/tasks.md) | 1 / 9 | 2026-11-08 | 当次授权重启后核对目标版本、真机操作与稳定观察；当前源码未宣称上线。 |
| [consult-plain-writing-skill](../../openspec/changes/consult-plain-writing-skill/tasks.md) | 4 / 20 | 2026-11-07 | 用户确认更新服务后进行新咨询、连续追问和技术问题真实回答验收（本轮未重启）。 |
| [consult-project-local-knowledge](../../openspec/changes/consult-project-local-knowledge/tasks.md) | 1 / 5 | 2026-11-07 | 目标实例加载后验证真实咨询、修改文件后新内容及更新操作；本次不重启 |
| [add-vibe-composer-file-drop](../../openspec/changes/add-vibe-composer-file-drop/tasks.md) | 3 / 13 | 2026-11-06 | 在可用授权环境完成真实浏览器文件拖放、主题及窄屏验收（当前保存的浏览器权限策略阻止访问，未绕过）。 |
| [inline-message-card-editor](../../openspec/changes/inline-message-card-editor/tasks.md) | 4 / 22 | 2026-11-06 | 新版运行加载及真实手机/桌面复制、跨应用粘贴验收。预览入口已准备为 WAITING_VIEWER_AUTH，不代表登录、截图或验收通过；本次不触… |
| [project-review-explorer](../../openspec/changes/project-review-explorer/tasks.md) | 1 / 4 | 2026-11-06 | 获得本次新版服务加载授权后，执行手机/桌面真实视觉、只读功能与稳定观察；预览入口不代表验收通过。 |
| [consult-flexible-backend](../../openspec/changes/consult-flexible-backend/tasks.md) | 1 / 4 | 2026-11-05 | 确认目标实例与本次服务重启，加载后核对认证、新版真实任务、旧任务和至少 60 秒稳定观察。 |
| [add-session-communication-journal](../../openspec/changes/add-session-communication-journal/tasks.md) | 3 / 17 | 2026-11-04 | 后端更新经用户本次明确确认后启动，运行验收及至少 60 秒稳定观察。 |
| [consolidate-project-skills](../../openspec/changes/consolidate-project-skills/tasks.md) | 1 / 5 | 2026-11-04 | 用户授权新后端加载后验证实际分发及三引擎发现效果；本次不重启。 |
| [remove-pending-sql-tool](../../openspec/changes/remove-pending-sql-tool/tasks.md) | 1 / 4 | 2026-11-04 | 用户确认加载服务版本后核验真实引擎工具清单与 SQL 回复；本次未重启。 |
| [add-code-native-voice](../../openspec/changes/add-code-native-voice/tasks.md) | 7 / 30 | 2026-11-03 | 用户确认本次后端/Sidecar 重启后加载新路由，继续实际运行与手机听写验收。 |
| [add-research-first-preset](../../openspec/changes/add-research-first-preset/tasks.md) | 1 / 7 | 2026-11-03 | 获授权后加载目标服务版本，验证技术选型、简单 Bug、离线三个真实 Harness 场景。 |
| [complete-deepseek-harness-engine](../../openspec/changes/complete-deepseek-harness-engine/tasks.md) | 1 / 7 | 2026-11-03 | 新版服务生效与 Forge 端到端运行验收；须用户当次确认重启，未授权不执行。 |
| [fold-long-composer-paste](../../openspec/changes/fold-long-composer-paste/tasks.md) | 1 / 5 | 2026-11-03 | 目标运行版本核验及手机、桌面实际视觉验收。 |
| [group-git-branch-sources](../../openspec/changes/group-git-branch-sources/tasks.md) | 2 / 7 | 2026-11-03 | 后端新能力待用户确认重启后运行验收。 |
| [poll-source-update-safely](../../openspec/changes/poll-source-update-safely/tasks.md) | 1 / 8 | 2026-11-03 | 明确确认 idle 策略并加载目标版本后，核对实际配置、运行版本、日志、HTTP 与至少六十秒稳定观察。 |
| [schedule-daily-source-update](../../openspec/changes/schedule-daily-source-update/tasks.md) | 1 / 5 | 2026-11-03 | 经用户确认本次目标版本重启后，核对运行配置、启动日志、HTTP 与至少 60 秒稳定观察。真实午夜远端更新及重启尚未验收。 |
| [consult-backend-analysis](../../openspec/changes/consult-backend-analysis/tasks.md) | 2 / 6 | 2026-11-02 | 用户明确确认重启后核对目标版本并用真实测试问题、多应用/企业完成运行验收及稳定观察；正式地址和服务凭据通过安全渠道交付。 |
| [consult-backend-images](../../openspec/changes/consult-backend-images/tasks.md) | 1 / 5 | 2026-11-02 | 目标实例授权加载后真实应用认证、原图模型、重复查询、失败和隔离验收；记录真实 taskId/requestId 及稳定观察。 |
| [add-drawio-preview](../../openspec/changes/add-drawio-preview/tasks.md) | 5 / 24 | 2026-11-01 | 手机竖/横屏及桌面使用真实宽流程图检查完整边界、文字细节、拖动/双指和全屏恢复。本次 Chrome 浏览器访问 Forge 被已有安全策略拒绝：… |
| [authorize-resource-sql-writes](../../openspec/changes/authorize-resource-sql-writes/tasks.md) | 1 / 4 | 2026-11-01 | 用户确认重启后加载新版并对实际获授权的目标操作进行运行验收；本轮不执行真实数据库写入。 |
| [fix-session-duplication-feedback](../../openspec/changes/fix-session-duplication-feedback/tasks.md) | 2 / 12 | 2026-11-01 | 已获用户授权并完整重启；新版运行行为仍待真实复制验收。 |
| [preview-session-markdown](../../openspec/changes/preview-session-markdown/tasks.md) | 5 / 24 | 2026-11-01 | 登录态实际 SQL/Markdown/draw.io 文件读取及手机/桌面内嵌视觉、滚动验收；已准备的预览入口不能代替实机证据。原重启任务已完成… |
| [refine-git-workspace](../../openspec/changes/refine-git-workspace/tasks.md) | 1 / 4 | 2026-11-01 | 用户确认加载新后端后，核对版本并完成手机与 14 寸桌面真实浏览器验收；不自行重启。 |
| [refine-review-workbench](../../openspec/changes/refine-review-workbench/tasks.md) | 1 / 4 | 2026-11-01 | 2026-11-01 新版后端已加载并通过既有评审只读接口冒烟；实际提交执行链路、Android Chrome/飞书 H5 运行验收仍待完成，沿… |
| [reliable-vibe-message-queue](../../openspec/changes/reliable-vibe-message-queue/tasks.md) | 2 / 10 | 2026-11-01 | 真实浏览器、含实际模型的任务链端到端验收。 |
| [trim-vibe-model-tools](../../openspec/changes/trim-vibe-model-tools/tasks.md) | 1 / 3 | 2026-11-01 | 新服务加载验收：2026-11-01 已授权重启并核对实际六项工具与核心稳定性；微信库授权和完整自动推进链路仍待核验，后续重启须另行确认。 |
| [accelerate-vibe-coding-entry](../../openspec/changes/accelerate-vibe-coding-entry/tasks.md) | 14 / 90 | 2026-10-31 | 登录态历史读取与真实浏览器恢复验收；本次匿名请求仅验证新接口已加载且拒绝未授权读取。 |
| [adapt-deepseek-provider-models](../../openspec/changes/adapt-deepseek-provider-models/tasks.md) | 2 / 9 | 2026-10-31 | 经用户明确授权重启后，以有效开放平台 Key 验证模型目录与真实 Claude 对话并观察稳定性。 |
| [add-authenticated-page-preview](../../openspec/changes/add-authenticated-page-preview/tasks.md) | 1 / 8 | 2026-10-31 | 本次重启许可后的实际业务咨询登录/图片预览、桌面与手机布局及稳定观察。 |
| [add-codex-follow-up-predictions](../../openspec/changes/add-codex-follow-up-predictions/tasks.md) | 4 / 16 | 2026-10-31 | 本次用户确认重启后加载目标后端/Sidecar，验收真实账号预测并观察至少 60 秒。 |
| [add-composer-site-preview](../../openspec/changes/add-composer-site-preview/tasks.md) | 2 / 9 | 2026-10-31 | 目标版本加载、真实站点登录与运行验收（服务尚未获本次重启授权）。 |
| [add-declarative-site-preview](../../openspec/changes/add-declarative-site-preview/tasks.md) | 1 / 6 | 2026-10-31 | 目标版本加载后真实会话及目标站点嵌入验收；未经本次确认不重启。 |
| [add-requirement-autopilot](../../openspec/changes/add-requirement-autopilot/tasks.md) | 1 / 7 | 2026-10-31 | 用户确认本次重启后，目标版本启动并验收真实 Claude/Codex 需求任务的进度上报、跨轮续跑及暂停恢复；核查日志、HTTP 和至少 60 … |
| [add-session-commit-push](../../openspec/changes/add-session-commit-push/tasks.md) | 2 / 10 | 2026-10-31 | 目标后端版本启动及运行验收；须先取得本次重启授权，不能以旧运行响应代替。 |
| [add-session-git-pull](../../openspec/changes/add-session-git-pull/tasks.md) | 2 / 6 | 2026-10-31 | Desktop/narrow-screen browser verification: saved browser permission den… |
| [add-sftp-file-transfer](../../openspec/changes/add-sftp-file-transfer/tasks.md) | 2 / 5 | 2026-10-31 | 用户确认重启后运行新版本并完成桌面/移动浏览器验收 |
| [allow-consult-followup-drafting](../../openspec/changes/allow-consult-followup-drafting/tasks.md) | 1 / 6 | 2026-10-31 | 目标版本浏览器验收（未触发服务重启）。 |
| [allow-unevaluated-consult-release](../../openspec/changes/allow-unevaluated-consult-release/tasks.md) | 1 / 8 | 2026-10-31 | 新后端加载及真实候选发布验收未执行；不自动重启服务或发布真实配置。 |
| [auto-manage-cloudflare-tunnel](../../openspec/changes/auto-manage-cloudflare-tunnel/tasks.md) | 1 / 4 | 2026-10-31 | the deployed version after an explicitly authorized full restart and 60-… |
| [automatic-consult-system-routing](../../openspec/changes/automatic-consult-system-routing/tasks.md) | 6 / 39 | 2026-10-31 | 本次重启确认后部署后端/Sidecar，以真实截图验证跨系统定位、用户纠正和Git线索，连续观察60秒。当前未部署、未验收。 |
| [avoid-oversized-codex-websocket-retries](../../openspec/changes/avoid-oversized-codex-websocket-retries/tasks.md) | 2 / 8 | 2026-10-31 | 用户确认后通过 `node forge.mjs` 加载 Sidecar 版本，核验连续消息、真实 HTTP、启动日志及至少 60 秒稳定性。 |
| [bound-runtime-state-failures](../../openspec/changes/bound-runtime-state-failures/tasks.md) | 1 / 4 | 2026-10-31 | 用户确认后加载新版本，验证原会话 d53c097d-bdd5-47cc-b4dc-516c38591089 的真实运行状态、故障恢复及推进结果。 |
| [browse-vibe-working-directories](../../openspec/changes/browse-vibe-working-directories/tasks.md) | 3 / 17 | 2026-10-31 | 用户确认重启后执行新接口与手机/桌面真实目录浏览验收。 |
| [coalesce-codex-mcp-startup-warnings](../../openspec/changes/coalesce-codex-mcp-startup-warnings/tasks.md) | 1 / 6 | 2026-10-31 | 用户确认后通过正规入口加载目标版本，验证实际客户端提示与服务稳定性。 |
| [compact-mobile-agent-workspace](../../openspec/changes/compact-mobile-agent-workspace/tasks.md) | 2 / 9 | 2026-10-31 | Activate and verify target runtime after explicit restart authorization … |
| [consult-bound-databases](../../openspec/changes/consult-bound-databases/tasks.md) | 2 / 14 | 2026-10-31 | 用户确认重启后进行目标版本运行验收与稳定观察；不自动重启。 |
| [consult-client-distribution](../../openspec/changes/consult-client-distribution/tasks.md) | 1 / 6 | 2026-10-31 | 经本次重启授权并配置测试身份后，真实 HTTPS/WSS、多用户与实际模型联调。 |
| [consult-desktop-conversation](../../openspec/changes/consult-desktop-conversation/tasks.md) | 3 / 17 | 2026-10-31 | desktop browser, keyboard, focus and long/short-height review (browser a… |
| [consult-explore-before-url](../../openspec/changes/consult-explore-before-url/tasks.md) | 1 / 7 | 2026-10-31 | 用户确认重启后，用无 URL 截图问题验证实际探索与必要追问；不将规则装配测试当作模型效果验收。 |
| [consult-manual-source-sync](../../openspec/changes/consult-manual-source-sync/tasks.md) | 1 / 5 | 2026-10-31 | 用户确认重启后进行真实远端、浏览器及稳定观察验收（本轮不重启）。 |
| [consult-model-document-design](../../openspec/changes/consult-model-document-design/tasks.md) | 1 / 6 | 2026-10-31 | 用户明确确认重启后，目标版本加载、真实AI生成下载和稳定观察。 |
| [consult-readonly-git-history](../../openspec/changes/consult-readonly-git-history/tasks.md) | 1 / 7 | 2026-10-31 | 用户确认重启后，用真实业务咨询验证源码定位、提交线索与联系人表述；当前未部署验收。 |
| [consult-source-auto-sync](../../openspec/changes/consult-source-auto-sync/tasks.md) | 1 / 8 | 2026-10-31 | 经用户确认部署后验证实际业务远端凭据、源码同步及运行稳定性；本轮不拉取真实业务仓库、不重启或发布。 |
| [consult-suggestion-automation](../../openspec/changes/consult-suggestion-automation/tasks.md) | 3 / 15 | 2026-10-31 | 服务实际消费建议、真实模型审核及真实用户需求开发验证 |
| [consult-suggestion-board](../../openspec/changes/consult-suggestion-board/tasks.md) | 1 / 6 | 2026-10-31 | 用户授权更新服务后验证真实整理、保存和跨用户读取（本轮不重启）。 |
| [consult-upgrade-announcement](../../openspec/changes/consult-upgrade-announcement/tasks.md) | 1 / 28 | 2026-10-31 | 浏览器桌面与窄屏验证：Chrome标签连接/导航多次超时，未取得新纸签视觉证据；未重启或发布服务，未将视觉验收记为通过。 |
| [consult-voice](../../openspec/changes/consult-voice/tasks.md) | 1 / 6 | 2026-10-31 | 用户确认重启后加载目标版本，以真实账号完成音频协商及运行稳定观察。 |
| [consult-web-environment-accounts](../../openspec/changes/consult-web-environment-accounts/tasks.md) | 1 / 5 | 2026-10-31 | 用户确认本次重启后的真实业务页面验收及稳定观察。 |
| [controlled-consult-documents](../../openspec/changes/controlled-consult-documents/tasks.md) | 1 / 7 | 2026-10-31 | 用户明确确认重启后，真实咨询生成下载及运行稳定观察（不属于本次已授权操作）。 |
| [converge-desktop-coding-workspace](../../openspec/changes/converge-desktop-coding-workspace/tasks.md) | 1 / 10 | 2026-10-31 | 新版实际会话页面验收；如需重启，等待本次明确授权，不将隔离样例当作真实会话运行通过。 |
| [efficient-coding-checkpoints](../../openspec/changes/efficient-coding-checkpoints/tasks.md) | 1 / 6 | 2026-10-31 | 经用户确认加载新版后端，验收实际会话后续派发与进度 |
| [filter-git-ignored-changes](../../openspec/changes/filter-git-ignored-changes/tasks.md) | 1 / 4 | 2026-10-31 | 新版服务加载后完成桌面与手机现场验收；本次未授权重启，仍待加载新版后端。现有运行门禁不能替代新筛选的页面验收。 |
| [fix-consult-image-preview-dismiss](../../openspec/changes/fix-consult-image-preview-dismiss/tasks.md) | 1 / 6 | 2026-10-31 | 桌面及移动浏览器验收：Chrome 连接不可用；Edge 读取现有咨询标签页超时，未取得实际布局证据。未重启服务。 |
| [fix-mobile-navigation-selection](../../openspec/changes/fix-mobile-navigation-selection/tasks.md) | 1 / 4 | 2026-10-31 | 真实华为手机确认当前功能、跨模块、搜索均可操作；本次不重启或推送。 |
| [fullscreen-git-status-diff](../../openspec/changes/fullscreen-git-status-diff/tasks.md) | 1 / 3 | 2026-10-31 | 发布到其他同事使用的环境并确认目标版本，无自动推送或重启。 |
| [initialize-team-repository-workspace](../../openspec/changes/initialize-team-repository-workspace/tasks.md) | 1 / 4 | 2026-10-31 | 用户授权后加载新后端，浏览器真实端点验收与稳定观察。 |
| [integrate-traecode-cli](../../openspec/changes/integrate-traecode-cli/tasks.md) | 1 / 5 | 2026-10-31 | 用户登录 TraeCode CLI 后，验证真实 JSONL、恢复、中断和 UI；仅获本次重启确认后部署并观察稳定性。 |
| [isolate-engine-provider-overrides](../../openspec/changes/isolate-engine-provider-overrides/tasks.md) | 1 / 4 | 2026-10-31 | 用户授权重启后真实供应商运行验收。 |
| [layer-agent-conversation-messages](../../openspec/changes/layer-agent-conversation-messages/tasks.md) | 2 / 10 | 2026-10-31 | 登录后的真实会话页面运行验收。 |
| [lighten-autopilot-flow](../../openspec/changes/lighten-autopilot-flow/tasks.md) | 1 / 3 | 2026-10-31 | 经用户确认本次重启后，核验目标版本、真实模型续跑和手机/桌面恢复；当前未启动新版，未验收。 |
| [mobile-consult-graph-readability](../../openspec/changes/mobile-consult-graph-readability/tasks.md) | 1 / 8 | 2026-10-31 | 正式部署与手机真机触控验收（未获本次重启授权，不自动执行）。 |
| [mobile-consultation-workspace](../../openspec/changes/mobile-consultation-workspace/tasks.md) | 2 / 16 | 2026-10-31 | 发布后在真实iOS Safari/Android Chrome检查软键盘弹出/收回、浏览器工具栏变化、截图粘贴和安全区；模拟视口和单元测试不替代… |
| [mobile-session-quick-switch](../../openspec/changes/mobile-session-quick-switch/tasks.md) | 1 / 5 | 2026-10-31 | 完成目标版本移动端浏览器验收。 |
| [persist-session-permission-mode](../../openspec/changes/persist-session-permission-mode/tasks.md) | 1 / 4 | 2026-10-31 | build, tests and running version acceptance after separately authorized … |
| [preflight-autopilot-binding](../../openspec/changes/preflight-autopilot-binding/tasks.md) | 4 / 27 | 2026-10-31 | 新版本重启后验证原会话续报、数据库验证回归与冲突提示。 |
| [prevent-business-credential-autofill](../../openspec/changes/prevent-business-credential-autofill/tasks.md) | 1 / 8 | 2026-10-31 | 用户浏览器/密码管理器实测；浏览器连接超时，未复现或验收真实自动填充行为，不能以 DOM 属性用例代替。未重启服务。 |
| [prioritize-agent-dock-actions](../../openspec/changes/prioritize-agent-dock-actions/tasks.md) | 1 / 3 | 2026-10-31 | 在其他同事使用的环境加载并验收目标版本；不自动推送或重启。 |
| [progressive-page-loading](../../openspec/changes/progressive-page-loading/tasks.md) | 2 / 10 | 2026-10-31 | 华为手机公网冷加载实测；未经本次明确授权不重启服务。 |
| [project-developer-control](../../openspec/changes/project-developer-control/tasks.md) | 1 / 7 | 2026-10-31 | 用户明确授权后加载新版本、运行验收及稳定观察。 |
| [record-session-turn-changes](../../openspec/changes/record-session-turn-changes/tasks.md) | 1 / 5 | 2026-10-31 | 新后端运行验收，需明确重启授权；不以旧服务响应充当通过。 |
| [recover-consult-initial-session-state](../../openspec/changes/recover-consult-initial-session-state/tasks.md) | 2 / 16 | 2026-10-31 | 在允许读取的浏览器中验证桌面与移动端原咨询可恢复，无重复提问。 |
| [reliable-spec-progression](../../openspec/changes/reliable-spec-progression/tasks.md) | 2 / 18 | 2026-10-31 | 获授权后重启并验收实际规格会话 |
| [renew-active-page-previews](../../openspec/changes/renew-active-page-previews/tasks.md) | 1 / 5 | 2026-10-31 | 用户另行确认重启后验证在线连续预览；当前不重启。 |
| [repair-opencode-session-output](../../openspec/changes/repair-opencode-session-output/tasks.md) | 1 / 4 | 2026-10-31 | 经用户明确授权重启后，用指定会话验证回答和模型切换，并完成稳定观察。 |
| [review-confirmed-execution](../../openspec/changes/review-confirmed-execution/tasks.md) | 1 / 4 | 2026-10-31 | 本次后端重启授权后核对目标版本、功能运行与稳定性；真实 Android Chrome/飞书 H5 验收单独记录。 |
| [show-complete-workspace-file-names](../../openspec/changes/show-complete-workspace-file-names/tasks.md) | 1 / 5 | 2026-10-31 | 新版真实会话文件树验收；如需重启须取得本次明确授权。 |
| [show-session-record-size](../../openspec/changes/show-session-record-size/tasks.md) | 1 / 5 | 2026-10-31 | 用户确认本次后端重启后，验收真实会话文件与至少 60 秒稳定观察。 |
| [stabilize-session-navigation](../../openspec/changes/stabilize-session-navigation/tasks.md) | 2 / 12 | 2026-10-31 | 桌面与手机实际交互验收；若浏览器策略阻止，明确记录未验证范围并准备预览入口。 |
| [sync-codex-desktop](../../openspec/changes/sync-codex-desktop/tasks.md) | 3 / 19 | 2026-10-31 | 真实页面导入 / 续接完整链路验收（已获授权重启，73 秒稳定观察通过）。 |
| [unify-consult-runtime-account](../../openspec/changes/unify-consult-runtime-account/tasks.md) | 1 / 6 | 2026-10-31 | 获本次明确重启授权后加载版本，真实多账号/多用户验证并观察至少 60 秒（当前未授权）。 |
| [work-assistants](../../openspec/changes/work-assistants/tasks.md) | 6 / 33 | 2026-10-31 | 用户确认重启后验证真实账号、语音、资源登记及 60 秒稳定性；未授权不重启。 |
| [recover-interrupted-chat-session](../../openspec/changes/recover-interrupted-chat-session/tasks.md) | 3 / 24 | 2026-10-24 | 用户确认加载新版本后，验证真实会话终止、日志与至少 60 秒稳定观察。 |
| [consolidate-forge-system-resources](../../openspec/changes/consolidate-forge-system-resources/tasks.md) | 2 / 21 | 2026-10-22 | 浏览器视觉验收：本轮读取浏览器状态仍超时，未得到页面或截图，不绕过已有站点权限。单元测试不替代桌面/移动端显示和真实运行验收。 |
| [verify-local-development-tests](../../openspec/changes/verify-local-development-tests/tasks.md) | 1 / 3 | 2026-10-14 | 加载后端版本并验证原监督会话续跑 |
| [batch-supervised-verification](../../openspec/changes/batch-supervised-verification/tasks.md) | 1 / 4 | 2026-10-07 | 用户确认 Forge 重启后加载新版本，验收原会话批次推进和执行/复用记录。 |
| [stop-repeated-readiness-failures](../../openspec/changes/stop-repeated-readiness-failures/tasks.md) | 1 / 4 | 2026-10-07 | 确认后端重启后加载本变更，验收原会话阻塞原因、恢复及后续推进；本地修复不代表原会话已恢复。 |
| [associate-session-git-directories](../../openspec/changes/associate-session-git-directories/tasks.md) | 1 / 4 | 2026-10-06 | 加载新版后运行验收 |
| [show-session-subscription-quota](../../openspec/changes/show-session-subscription-quota/tasks.md) | 3 / 12 | 2026-10-04 | 授权重启后真实页面/供应商验收与60秒稳定观察。 |
| [resolve-existing-specs](../../openspec/changes/resolve-existing-specs/tasks.md) | 7 / 47 | 2026-10-03 | After explicit service restart approval, verify running target version a… |
| [integrate-pi-copilot-engines](../../openspec/changes/integrate-pi-copilot-engines/tasks.md) | 1 / 7 | 2026-09-25 | 获用户本次重启授权后加载目标版本，真实账号冒烟并观察 60 秒。 |
| [integrate-qwen-code-engine](../../openspec/changes/integrate-qwen-code-engine/tasks.md) | 3 / 18 | 2026-09-23 | After explicit restart authorization, publish the protected Sidecar `dis… |
| [integrate-capsule-native-voice](../../openspec/changes/integrate-capsule-native-voice/tasks.md) | 1 / 6 | 2026-09-13 | Verify real browser/audio and managed target runtime stability; record A… |

## 需真机或浏览器验收

| 变更 | 未完成 | 最近更新 | 第一项待办 |
| --- | --- | --- | --- |
| [vibecoding-workbench-themes](../../openspec/changes/vibecoding-workbench-themes/tasks.md) | 5 / 22 | 2026-11-09 | 真实手机 Chrome、飞书 H5 与桌面工作台核验主题、窄屏布局、键盘输入、弹层和会话状态；浏览器工具当前不能完成此项，不以组件测试代替。 |
| [retire-central-topology](../../openspec/changes/retire-central-topology/tasks.md) | 1 / 9 | 2026-11-08 | 浏览器执行真实咨询、旧会话追问及项目初始化入口验收。当前浏览器访问授权待开通。 |
| [add-readable-message-copy](../../openspec/changes/add-readable-message-copy/tasks.md) | 1 / 6 | 2026-11-07 | 真实浏览器及飞书、企微、钉钉粘贴效果分别记录，不能由模拟剪贴板测试代替。 |
| [compact-mobile-session-controls](../../openspec/changes/compact-mobile-session-controls/tasks.md) | 4 / 23 | 2026-11-04 | 本次真实手机可见条数和触摸滚动验收尚未执行。 |
| [refine-mobile-chat-workspace](../../openspec/changes/refine-mobile-chat-workspace/tasks.md) | 2 / 8 | 2026-11-04 | 新版本浏览器视觉回归。浏览器连接 host 不可用，尚未执行。 |
| [embed-chat-page-previews](../../openspec/changes/embed-chat-page-previews/tasks.md) | 1 / 5 | 2026-11-03 | 真实手机与桌面验收图片清晰度、窄/矮视口、消息位置、全屏关闭与键盘/滚动。当前浏览器访问拒绝仍有效，未另换通道；预览入口不等于实际验收。 |
| [organize-session-tools-menu](../../openspec/changes/organize-session-tools-menu/tasks.md) | 2 / 16 | 2026-11-03 | 本次真实手机浏览器验收尚未执行，旧任务的历史浏览器记录不作为本次新菜单验收。 |
| [organize-workspace-preferences](../../openspec/changes/organize-workspace-preferences/tasks.md) | 2 / 10 | 2026-11-03 | 本次手机/桌面真实浏览器验收未执行。 |
| [polish-mobile-chat-reading](../../openspec/changes/polish-mobile-chat-reading/tasks.md) | 2 / 13 | 2026-11-03 | Chrome、iOS Safari、飞书 WebView 与桌面浏览器视觉/键盘专项验收。 |
| [simplify-mobile-session-header](../../openspec/changes/simplify-mobile-session-header/tasks.md) | 2 / 15 | 2026-11-03 | 实际手机浏览器长按复验；当前尚未执行。 |
| [compact-autopilot-dashboard](../../openspec/changes/compact-autopilot-dashboard/tasks.md) | 4 / 21 | 2026-11-02 | 真实手机、桌面及各 WebView 视觉/触控核验；原有未验收边界保留。 |
| [converge-mobile-coding-workspace](../../openspec/changes/converge-mobile-coding-workspace/tasks.md) | 1 / 9 | 2026-11-02 | 真实手机软键盘、麦克风和转写验收。 |
| [chat-focus-preferences](../../openspec/changes/chat-focus-preferences/tasks.md) | 1 / 19 | 2026-10-31 | Chrome 与飞书 H5 真机：顶部高度、首屏内容、长回复/长草稿、键盘弹出/收起、返回及滚动位置验收。 |
| [compact-mobile-session-views](../../openspec/changes/compact-mobile-session-views/tasks.md) | 1 / 4 | 2026-10-31 | 完成浏览器移动端视觉验收 |
| [complete-runtime-account-preview](../../openspec/changes/complete-runtime-account-preview/tasks.md) | 1 / 14 | 2026-10-31 | 目标子应用部署源码版本及手机实机验收；不将本次桌面预览及版本 33 资源目录显示当作部署版本证明。 |
| [lighten-workspace-context-switcher](../../openspec/changes/lighten-workspace-context-switcher/tasks.md) | 1 / 6 | 2026-10-31 | 登录后真实会话页验收（当前浏览器未登录）。 |
| [mobile-consult-new-session](../../openspec/changes/mobile-consult-new-session/tasks.md) | 2 / 14 | 2026-10-31 | 真实移动浏览器检查新建、返回、历史恢复、触控与焦点。 |
| [serve-built-frontend](../../openspec/changes/serve-built-frontend/tasks.md) | 1 / 9 | 2026-10-31 | 登录态真实浏览器及公网手机性能检查；辅助微信服务的健康异常单独保留。 |
| [simplify-vibe-new-session](../../openspec/changes/simplify-vibe-new-session/tasks.md) | 1 / 4 | 2026-10-31 | 桌面、手机及矮屏实际界面检查；无法执行的范围明确记录，准备手机/桌面入口。 |
| [session-capability-tree](../../openspec/changes/session-capability-tree/tasks.md) | 1 / 17 | 2026-10-04 | 在桌面与移动视口完成视觉与交互验收 |
| [distinguish-running-chat-actions](../../openspec/changes/distinguish-running-chat-actions/tasks.md) | 2 / 4 | 2026-09-24 | Cover action eligibility and desktop/touch behavior with targeted tests;… |
| [remove-supplier-quote-from-forge](../../openspec/changes/remove-supplier-quote-from-forge/tasks.md) | 1 / 7 | 2026-09-16 | Forge all 门禁、浏览器菜单及旧路由验收，连续观察至少 60 秒。 |
| [unify-chat-control-modes](../../openspec/changes/unify-chat-control-modes/tasks.md) | 1 / 6 | 2026-09-13 | Verify keyboard focus, permissions and draft retention, run frontend che… |
| [visualize-openspec-query-results](../../openspec/changes/visualize-openspec-query-results/tasks.md) | 1 / 4 | 2026-09-12 | 浏览器视觉核验此前被拒绝，保留未验证状态。 |
| [fix-knowledge-panel-responsiveness](../../openspec/changes/fix-knowledge-panel-responsiveness/tasks.md) | 1 / 3 | 2026-09-09 | Reproduce the reported browser freeze and verify the final browser inter… |
| [simplify-code-analysis-dialog](../../openspec/changes/simplify-code-analysis-dialog/tasks.md) | 1 / 3 | 2026-09-09 | Inspect desktop/mobile visual states when browser access is available; o… |
| [optimize-role-management-ui](../../openspec/changes/optimize-role-management-ui/tasks.md) | 1 / 8 | 2026-09-08 | Inspect the role workflow in a real browser at desktop and mobile viewpo… |
| [simplify-chat-header](../../openspec/changes/simplify-chat-header/tasks.md) | 1 / 5 | 2026-09-08 | Inspect desktop and mobile browser layouts and site navigation. |

## 需人工确认或外部条件

| 变更 | 未完成 | 最近更新 | 第一项待办 |
| --- | --- | --- | --- |
| [accelerate-home-vibe-entry](../../openspec/changes/accelerate-home-vibe-entry/tasks.md) | 1 / 8 | 2026-10-31 | 真实移动端首屏速度及键盘、权限路径运行验收。 |
| [allow-manual-production-preview](../../openspec/changes/allow-manual-production-preview/tasks.md) | 1 / 9 | 2026-10-31 | 生产站点由用户人工确认后的实际登录尚未验收；本次不通过 Agent 工具执行生产登录，业务子页另有旧预览内核兼容性缺口。 |
| [refine-mobile-agent-results](../../openspec/changes/refine-mobile-agent-results/tasks.md) | 1 / 6 | 2026-10-31 | 登录恢复后复验真实会话联动：当前路由显示「请先登录」，未绕过权限。 |

## 仍有开发任务

| 变更 | 未完成 | 最近更新 | 第一项待办 |
| --- | --- | --- | --- |
| [add-forge-mobile-apps](../../openspec/changes/add-forge-mobile-apps/tasks.md) | 2 / 7 | 2026-11-08 | 鸿蒙 SDK 编译并修复暴露的问题，核对缓存清理、来源权限及页面重载回执隔离，不能以纯 Java 或网页测试代替。 |
| [guide-native-shell-environment](../../openspec/changes/guide-native-shell-environment/tasks.md) | 3 / 8 | 2026-11-03 | 运行服务加载目标版本（需要用户当次重启授权；当前未重启）。 |
| [parallel-module-execution](../../openspec/changes/parallel-module-execution/tasks.md) | 1 / 13 | 2026-10-31 | 原业务会话实际继续开发及 V096 正式范围补充仍待原会话执行；本次未发送消息或扩充权限。 |
| [recover-orphan-sidecar-startup](../../openspec/changes/recover-orphan-sidecar-startup/tasks.md) | 2 / 10 | 2026-10-31 | explicit restart approval, load the target version, inspect startup logs… |
| [refine-domain-writer-scopes](../../openspec/changes/refine-domain-writer-scopes/tasks.md) | 2 / 16 | 2026-10-31 | 原业务会话实际继续开发及 V096 正式范围补充仍待原会话执行；本次未发送消息或扩充权限。 |
| [name-session-on-create](../../openspec/changes/name-session-on-create/tasks.md) | 2 / 6 | 2026-09-24 | OpenSpec 严格校验与 Forge 影响门禁通过。 |
| [assistant-request-base-url](../../openspec/changes/assistant-request-base-url/tasks.md) | 2 / 18 | 2026-09-05 | 校验 ingress 匹配顺序并重启 cloudflared |

## 任务已不适用，待决定

以下待办依赖已退役的接口人工登记工具（由 retire-session-delegation-and-api-registration-tool 移除）或已删除的会话客户端代码，无法按原文完成。可选择：在 `tasks.md` 写明“不再适用”并保留未勾选后归档，或改写为当前可验证的检查。

| 变更 | 未完成 | 最近更新 | 第一项待办 |
| --- | --- | --- | --- |
| [govern-project-catalog-and-tree](../../openspec/changes/govern-project-catalog-and-tree/tasks.md) | 1 / 8 | 2026-09-15 | 通过 Forge 工具登记接口证据（本轮工具返回 user rejected MCP tool call，未登记，不绕过）。 |
| [forge-project-registry-system-init](../../openspec/changes/forge-project-registry-system-init/tasks.md) | 3 / 18 | 2026-09-12 | Register affected API evidence. Attempt rejected by Forge tool with `use… |
| [discover-project-openspec-for-analysis](../../openspec/changes/discover-project-openspec-for-analysis/tasks.md) | 1 / 4 | 2026-09-09 | Register affected API evidence in Forge (tool returned user rejection; n… |
| [refresh-multiple-relay-clients](../../openspec/changes/refresh-multiple-relay-clients/tasks.md) | 1 / 8 | 2026-09-08 | Full frontend typecheck passes after the existing sessionClient.test.ts:… |

## 已完成但依赖前置变更

- [prefer-running-message-insertion](../../openspec/changes/prefer-running-message-insertion/tasks.md)：任务已全部完成，但其修改的规格由 [distinguish-running-chat-actions](../../openspec/changes/distinguish-running-chat-actions/tasks.md) 创建；该变更验收归档后再归档本变更。
