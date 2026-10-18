# 设计

## 一期闭环

管理员在现有咨询配置中关联资源中心应用账号，按DEV/TEST/UAT分别登记应用地址与账号；在原流程节点选择绑定并发布。旧咨询保持快照，绑定禁用或资源环境变为生产时立即禁止后续调用。仅网页登录不要求登录API路径或CALL能力，浏览器账号端口独立核验可用性；同源不同应用前缀也参与URL环境匹配。数据库配置保持独立QUERY路径，Web不开放通用CALL。

consult_web以DISCOVER返回本咨询冻结选择且属于当前服务端系统的账号引用、环境及地址。READ接受bindingId、URL或站内路径、可选明确环境和同源网页登录路径；优先匹配URL，不同源或越出应用前缀先拒绝。存在多环境但没有可确认URL/环境时返回缺口，助手询问地址，不盲试其他环境。仅允许LOCAL/DEV/TEST/UAT。

BrowserLoginResources、WebResourceGateway和WebPageReader是common端口。ops拥有资源/绑定/环境规则；browser-request拥有隔离登录及正文读取；fore-consult通过原会话签名和冻结流程工具授权组织调用；SDK/stdio共用readonly MCP及装配白名单。资源密码仅服务端传给浏览器，不进入工具参数、日志或链接；页面正文作为不可信证据，不能成为指令。

浏览器复用现有Playwright 1.49.0 worker及预览执行原语，咨询上下文按runtime+绑定及配置指纹隔离，最多8个，15分钟释放，不写登录态文件。相同账号失败不重复尝试，配置更正后指纹变化会重新建上下文；可选择同一环境其他已授权账号。仅提交唯一可见的标准密码表单，登录POST只放行已识别表单action或资源登记登录API；登录结束后阻断非GET/HEAD/OPTIONS请求，禁用ServiceWorker与WebSocket，不开放点击、任意脚本或业务写接口。传统GET副作用和复杂页面行为仍需目标应用自身保证；正文只反映实际读取结果，不等于业务验收。

## 交互和证据

复用原关联编辑器与流程候选发布，无新导航；按需展开Web账号分区，沿用44px控件与当前主题、失败保留草稿。适用OBJ-01、NAV-01、CTX-01、FEED-01、AI-01、EVID-01、CTRL-01、IDEM-01，无例外。后端授权/环境/地址边界测试、前端绑定与发布回归、MCP转发/工具隔离和真实Chromium登录态复用与写请求阻断均需验证；业务页面和目标版本验收待本次重启许可，不重启现有服务。

## 后续边界

跨域SSO、验证码人工接管、任意页面点击和生产账号不在本期；无法完成登录时明确FAILED/WAITING_LOGIN。现有应用资源的loginPath继续表示登录API；工具loginPage表示网页登录路径，缺省从应用baseUrl进入。没有新增DDL或人工待执行SQL。

参考：[Playwright认证](https://playwright.dev/java/docs/auth)、[隔离上下文](https://playwright.dev/java/docs/browser-contexts)，2026-10-18核对；沿用当前依赖支持的API，不引入新版能力。
