# 浏览器管理登录凭据

## 当前证据与范围

`frontend/src/components/auth/LoginDialog.tsx` 已有独立表单、稳定 name/id 和 username/current-password 自动完成标记。但受控输入与空 state 禁用条件不能可靠覆盖无 change 事件的自动填充。`frontend/src/lib/auth.ts` 将 access/refresh 保存到 localStorage，`toolbox-auth.yml` 默认 refresh-ttl 为 7d，TokenService 负责轮换、吊销；不能根据截图判断是否为令牌过期、浏览器清理数据或来源变化。

Graphify 查询因现有图超过 CLI 默认大小上限而失败，依据以上定向源码核查，不重建全仓图。

## 选择

本次修复登录表单适配层，复用 `login` 用例和现有认证服务，无新增持久层或跨 feature 依赖。使用非受控原生字段和 FormData 读取实际值；required 保持原生校验，登录按钮仅在请求中禁用，并用 ref 防止重复请求。保留 POST 表单语义、自动完成标记，账号禁用自动大写及拼写纠正。错误反馈不清空表单，使用户可修正重试；关闭后 Radix 移除表单，重新打开不保留上次密码。

密码由用户在浏览器/系统密码管理器中主动选择保存，页面只提供说明，不代替浏览器弹窗或绕过设备解锁。关闭表单不能保证 JavaScript 内存立即擦除；应用不把密码写入 storage、URL、日志或额外服务。

## 安全边界与后续条件

不新增“永久免登录”或自制可逆加密密码存储。浏览器策略、私密模式、站点来源及系统密码管理器会影响保存/填充；无法保证所有版本的夸克浏览器展示保存提示，需要真机验收。

现有令牌在 localStorage 对同源脚本可见，这是已有安全限制，本次不把它描述为推荐的长期会话方案。若后续要延长免登录时长，应迁移为受限、可撤销的 HttpOnly/Secure/SameSite 刷新 Cookie，同时验证 CSRF、跨窗口轮换、SSE/WS 和外部客户端兼容；不能仅延长 localStorage 令牌有效期。当前不扩大暴露面，也不为修复自动填充改写所有认证消费者。

## 产品原则

适用 CTX-01（保留登录上下文）、FEED-01（登录中、失败重试）、CTRL-01（用户决定是否保存密码）、IDEM-01（单请求）、EVID-01（分开报告组件验证与真机验收），无例外。遵循 quiet-luxury-ui，复用原弹窗，仅增加一段就近提示，不新增页面、卡片或密码托管设置。

## 调研依据（2026-10-19）

- [Chrome 团队登录表单实践](https://web.dev/articles/sign-in-form-best-practices)：原生表单、稳定字段、current-password；避免空状态禁用提交；成功后移除登录表单；不同浏览器需实测。
- [MDN autocomplete](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/autocomplete)：声明 username/current-password，最终自动填充由浏览器及密码管理器决定。
- [OWASP HTML5 Security](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html)：不要把敏感信息或会话标识放入 localStorage，HttpOnly Cookie 可减少脚本读取风险。
