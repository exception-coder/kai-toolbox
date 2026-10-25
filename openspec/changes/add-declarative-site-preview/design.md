# 实现设计

适用原则：OBJ-01、NAV-01、CTX-01、FEED-01、AI-01、EVID-01、IDEM-01，无例外。

1. 主对象是声明的 HTTP(S) URL，标题只用于展示，不创造资源身份。已登记地址可以直接引用；本机 DPAPI、资源中心账号和测试凭据均不复制到声明或浏览器参数。当前工作区未找到用户提及的 `.run/test-environment/`，不据此声称完成凭据登记。
2. 当前消息提供轻量入口，在覆盖层浏览当前站点，关闭回到原触发器，不新增菜单。`components/site-preview` 和 `lib/sitePreview` 是公共前端展示能力，消息层仅解释顶层完整围栏；不开放原始 iframe HTML。现有快捷站点独立测试窗口不变。
3. 解析先确认 HTTP(S)、无 URL 账号密码、非 Forge 同源，仅接受 url/title。未闭合围栏、其他代码围栏内的示例保持文本。声明错误显示原因。点击后延迟加载弹框和 iframe，未点击不请求；流式尾部更新保留实例，全屏/缩小不重载。显式刷新更换实例；关闭和切会话销毁。没有创建业务记录或登录幂等键，重复点击复用当前弹框。
4. 窄屏标题与工具分行，操作至少 44px；桌面弹框与全屏共用同一 iframe。Radix 管理焦点，关闭恢复入口和原会话滚动，Esc 在宿主文档聚焦时关闭；焦点位于跨域 iframe 内时浏览器不会向父页传播按键，始终保留可见关闭按钮。
5. sandbox 仅允许外站脚本、同源存储、表单、站内弹框和下载，不允许顶层导航或派生窗口；referrerPolicy=no-referrer。防止 iframe 与 Forge 同源组合解除 sandbox。HTTPS 工作台不嵌入 HTTP 目标，显示新窗口恢复。12 秒结束不确定等待，不使用 onLoad/onError 宣称成功；始终提示站点证书、CSP/X-Frame-Options、跨站 Cookie 等可能限制嵌入，失败可刷新或新窗口。无代理绕过、证书信任修改或凭据自动注入。

技术依据（2026-10-25）：[MDN iframe](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe) 说明 sandbox、跨域事件和不可靠的 load/error；[frame-ancestors](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors) 由目标站控制嵌入来源。用户目标入口只读 HEAD 的严格 TLS 校验失败，忽略证书校验的诊断返回 200、未见嵌入限制头；不等于浏览器可用或实际登录成功。

验收覆盖：解析与流式边界、点击前无 iframe、切会话卸载、全屏保持实例、刷新、错误与超时恢复、桌面/窄屏实际浏览器焦点与边界。通用组件和消息适配分别测试，不用无头预览 READY 或编译成功代替目标站运行证据。
