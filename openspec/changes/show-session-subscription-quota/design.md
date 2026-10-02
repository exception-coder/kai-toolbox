# 设计：会话订阅额度

## 范围与证据
当前 CLI 生成协议与官方 App Server 文档确认 account/read 与 account/rateLimits/read，窗口带 usedPercent、windowDurationMins、resetsAt，多组带 limitId/normalModelSlug。不把 primary/secondary 固定映射为 5h/week。其余引擎未验证账号接口时明确不可用。

## 交互与指标
适用 OBJ-01、CTX-01、DENS-01、FEED-01、AI-01、EVID-01，无例外。主对象为已有 sessionId，复用用量工作区/面板，不加导航或账号选择器。顶部百分比与进度条回答还能使用多少，重置时间帮助安排下一轮，本地统计独立；无历史证据不加趋势图。加载、成功、无数据、失败均可刷新；关闭保留会话与模型。

## 查询链路与隔离
前端查询键包含会话、引擎、服务商、账号目录、模型，不保留跨键旧数据。Java 使用既有访问策略校验 sessionId，从仓库读取账号目录和模型，拒绝第三方路由；不接受浏览器任意目录。Sidecar 按 requestId 独立完成查询，断线、超时释放等待项。无全局配额缓存。

Sidecar 只读 account/read 确认 chatgpt 订阅，再读实际 rateLimits。凭据文件在读取前后取指纹，变化时拒绝该次快照；指纹与凭据不出进程。按模型精确匹配 normalModelSlug，否则采用账号 codex 通用配额并标明共享；无可信匹配时保留返回的配额组名称，不猜独享关系。剩余 = 100 - 服务商已用，缺失/非法窗口不填充。fetchedAt 仅在成功获取后赋值。

## 兼容与部署
保留本地统计 API，停止在全局汇总行展示默认账号配额。固定费用表明确是参照，非当前模型真实费用或订阅余额。用户仅授权前端热更新；后端/Sidecar目标版本及60秒观察待单次重启授权。旧治理扫描因无关临时文件数量限制已由用户明确跳过，仍保留 Forge 执行绑定和专项验证。

## 实现核对
新增 SubscriptionQuotaService 与独立 SubscriptionQuotaSection，Sidecar 请求使用 UUID 关联等待项并在超时/断线释放。真实 CLI 只读调用已返回 pro 周窗口；本次未返回五小时窗口，页面保留“暂无法获取”。手机390×844与桌面现网热更新已验证订阅区在本地统计之前及失败重试入口；现网后端仍为旧版本，因此未宣称端到端额度页面通过。

工作区另有 Claude SDK 依赖升级。配额适配不调用 Claude SDK；已核对当前与 HEAD 的 Codex SDK、TypeScript、Node类型、WS及WS类型版本全部一致，专项测试的纯配额适配只依赖这些能力。因此该无关升级不纳入本提交或配额验证输入；保留原文件不暂存。

完整宿主 Maven 默认 prepare-package 会调用 npm build 和 assistant:release，首次打包发现后已中止。使用先前无发布的 Vite 验证产物逐字节恢复本地 stable 清单 sha256-7f6002439a97 与 loader.js，未重启/生产部署；后续宿主验证显式指定 `-Dskip.frontend=true`，前端独立 Vite 构建验证。
