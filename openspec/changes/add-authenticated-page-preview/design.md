# 实施设计

## 主对象与边界

预览主对象为 ownerUserId + requestKey 对应的短期 previewId。browser-request/preview 拥有预览用例、内存状态及浏览器控制；BrowserSessionManager 提供受管 worker 上的独立 headless Chromium，不修改原录制浏览器模式。preview context 不进入普通会话目录，不触发录制或登录态落盘。tool-ops 通过 common 的 BrowserLoginResources 端口提供既有测试账号引用，密码留在服务端；不增加跨工具 Maven 依赖或第二份凭据配置。

前端为 browser-request 的页面预览视图，通过 public-api 作为现有业务咨询的附属路由注册；沿用咨询模块访问守卫，无新增菜单。站点录制编排提供“页面预览”入口；交付消息可直接给出带目标路由的自动打开链接。SDK 与 stdio MCP 同步提供 prepare_page_preview；受限业务咨询不暴露交付工具。

## 流程与状态

```mermaid
flowchart LR
  A[开发 Agent 准备目标路由与查看状态] --> B[MCP 返回 WAITING_VIEWER_AUTH 入口]
  B --> C[用户打开入口并通过现有登录守卫]
  C --> D[POST 创建或复用本人预览]
  D --> E[资源与精确来源校验]
  E --> F[独立 headless context 登录与路由]
  F --> G[等待目标元素或展开咨询图片]
  G --> H[实时画面 默认只读]
  H --> I[用户显式接管 点击 输入 滚动]
```

当前 Forge 登录态使用本次已经验证的 access token、用户与权限快照恢复到已配置的精确 origin，禁止伪造角色、从匿名 Agent 请求签发身份或向任意 Host 注入 token。测试应用必须由管理员选择既有非生产资源；只在指定同源登录页面中唯一且可见的含密码表单填写字段。凭据不传给模型、不进普通动作日志、不进预览链接。跨域导航被阻断；验证码/未完成登录进入 WAITING_LOGIN，可人工接管；跨域 SSO 明确暂不支持，不禁用 TLS 校验。

STARTING/AUTHENTICATING/NAVIGATING 至多 90 秒，超时结束；READY 只表示页面及目标元素已出现。FAILED 保留可用画面供诊断，WAITING_LOGIN 允许接管。关闭/过期终止交互，15 分钟或当前 access token 更早失效时释放 context。延迟启动任务在执行前及结束时复核取消标志，避免关闭后创建泄漏。并发最多 4 个，内存最多 64 条，重启不恢复临时预览；重新创建明确生成新 requestKey。普通重试/刷新用相同请求身份复用原结果，不替用户重发业务操作。

截图使用 Authorization 请求后生成本地 blob URL，不在 img/query URL 中嵌入 token；周期读取串行，15 秒读超时，关闭/换账号/切换预览时清理画面 URL 和请求。用户、路由、环境与账号明确展示；当前实现没有部署指纹证据，始终标注运行版本尚未核验，不把页面出现当作本次功能验收。

## 产品原则与验证

适用 OBJ-01、CTX-01、FEED-01、AI-01、EVID-01、CTRL-01、IDEM-01，无例外。预览继承当前任务目标，不重复选择系统；有缺口才进入准备表单。独立可分享目的地适合持续查看与手机操作，返回原咨询不归档或取消咨询。失败提供重试或新建入口；关闭只销毁预览，不撤销已经发出的页面操作。移动端工具行换行、触控至少 44px，保留键盘操作与页面焦点；需要真实浏览器实测，组件断言不代替布局证据。

验证包括账号隔离、资源环境、精确来源/导航与凭据保护、幂等、生命周期；组件覆盖自动打开、接管与错误恢复；MCP 同步与受限模式工具库存；真实无头引擎使用独立回环测试站点核验表单 Cookie 登录、路由与手机截图。宿主装配必须编译；服务运行加载、真实业务咨询与稳定观察待本次明确重启许可后验收。无新增人工数据库脚本。

参考：Playwright authentication https://playwright.dev/docs/auth （2026-10-18 查阅）；本项目 Playwright Java 为 1.49.0，仅使用现有版本支持的 context/storageState/导航/截图能力，不照搬新版本 API。
