# 设计

适用OBJ-01、NAV-01、CTX-01、DENS-01、FEED-01、AI-01、EVID-01、CTRL-01、IDEM-01，无例外。对象为全局业务咨询配置，使用原管理员配置抽屉，不增加导航。Sheet复用键盘焦点约束、Escape关闭和触发器恢复；内容滚动，末行操作可达。附件和系统显示分开保存并明确作用域；失败保留草稿、显示重试，不暗示已经保存。

配置复用DynamicConfigService和现有SQLite覆盖表，新增toolbox.fore-consult.attachments配置块，不增加表或第二份配置。默认单文件上传100 MiB，文本读取50 MiB，管理员可配置1至200 MiB；读取不得超过上传，上传不得超过当前部署Servlet硬边界。部署默认硬边界200/210 MiB。运行时每次上传、读取取当前策略，重启后恢复持久配置；普通Vibe Coding仍用原50 MiB，不扩大其权限。策略入口ADMIN可写，用户只读公开大小元数据；通用配置中心沿用现有管理员鉴权和候选值校验。服务首次装载此实现需要正常部署，后续策略修改不需要重启。

附件存储模块实现公共SessionAttachmentReader端口，按当前runtime session的元数据及realpath同时验证归属，拒绝跨会话、目录穿越、符号链接越界和未知文件。read_consult_attachment通过原会话签名调用，允许文本/HTML有界字符分页（单次最多50000），不运行HTML脚本、不伪称解析图片或JS中嵌入的业务表格。源码source_read仍保持2 MiB；模型提示和工具描述引导附件使用专用入口。Office/PDF解析和图片模型容量保持既有边界；本次不宣称新解析能力。

数据库视图投影现有ReadonlyResourceGateway和已发布流程，显示地址、环境、当前状态、是否被已发布流程选择。修改连接跳转同一资源记录编辑器，密码留空继续按既有语义保留；选择资源继续走原流程评测发布，不在此自动发布或复制凭据。旧咨询保持冻结选择，连接更新和停用继续按查询时动态校验，不自动改库。重复打开刷新不创建新对象，策略更新覆盖同一配置键；地址编辑更新原资源ID。

Spring Boot 3.4的传输层限制独立于业务校验，不能仅改UI：[MultipartProperties](https://docs.spring.io/spring-boot/3.4/api/java/org/springframework/boot/autoconfigure/web/servlet/MultipartProperties.html)，2026-10-16查阅。图谱曾受713MB/512MB上限阻断，复用该证据并用定向源码核对，不重建或在进程内加载整图。本次维护AI能力/实现边界说明；无人工待执行SQL，不登记SQL，不改真实连接或运行策略，不自行重启。

验收覆盖策略验证与动态取值、元数据/realpath归属、2 MiB以上HTML分页、签名及ADMIN权限、两引擎工具装配、配置失败恢复、桌面/窄屏和键盘。未经部署不将旧服务HTTP通过当作本次运行验收。
