# 设计

适用原则：OBJ-01、NAV-01、CTX-01、FEED-01、AI-01、CTRL-01、EVID-01、IDEM-01。

1. 主对象是资源中心 application resource ID。既有列表和凭据存储保持权威；common 端口的 interactiveTargets/requireInteractive 仅扩展人工预览，默认 targets/require 仍排除 PROD。没有新菜单、账号副本或跨工具依赖。
2. 继续复用会话内预览弹框。选择 PROD 时展示环境说明和确认勾选；沿用原设备、路径、关闭及焦点恢复。无需跳转其他菜单。
3. 非生产 auto 链接先核对已加载资源环境；PROD/未知资源不自动启动。productionConfirmed 只在人工表单提交时设定，不从 URL 解析。后端先验证 ADMIN、唯一资源及确认，取凭据后复核环境以防配置更新。列表/创建失败保留设置和重试。手动重新调整配置和换账号清除确认；同一已确认预览的设备切换/重开可复用确认。
4. 既有弹框提供焦点圈定、Escape、全屏与滚动。新增确认使用原生 checkbox 和正常触摸区域，测试桌面、手机及矮屏的提交可达性。实际生产登录、运行版本及手机实机不由夹具证明。
5. 幂等仍由 userId + requestKey 负责；重复点击受 operation 锁保护。同一 requestKey 不同参数拒绝；显式重开新建 requestKey，先释放旧 context。

AI-01 的具名授权差异：人工 ADMIN 可以确认生产预览；Agent 的 prepare_page_preview 和咨询 WebResourceGateway 仍沿原非生产端口及环境策略，不获得这一确认入口。人工接管会作用于真实业务页面，界面保留 PROD、账号与操作提示。
