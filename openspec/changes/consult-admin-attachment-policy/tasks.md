# 实施和验收

- [x] 复用动态配置、服务端上传策略与签名附件读取。
- [x] 管理员配置显示附件限制、数据库状态和原记录编辑入口。
- [x] 验证服务端授权、大小、归属、分页、动态生效及两引擎装配。
- [x] 前端typecheck、定向测试、生产构建；后端宿主编译及受影响测试；Sidecar编译与定向回归。
- [x] 浏览器窄屏、键盘及失败恢复检查，记录部署范围。
- [x] 同步文档与质量入口，审阅提交。

## 验证证据与范围

- Java 21下`mvn -pl toolbox-starter -am test-compile -DskipTests -q`通过，覆盖公共端口、工具模块和宿主装配的编译。首次环境默认JDK不支持release 21，切换本机已安装21.0.11后重跑通过。
- 8个后端测试类共23项通过：ConsultAttachmentPolicyTest、ConsultAttachmentRefreshTest、ConsultToolAssemblyProviderTest、ConsultResourceServiceTest、AttachmentStorageServiceTest、SessionAttachmentTextReaderTest、ReadonlyResourceServiceTest、SystemResourceServiceTest。实际Spring配置重绑定与临时SQLite验证保存、非法候选拒绝、上下文重建恢复；真实2 MiB以上HTML验证分页与降低上限后的拒绝；上传mock验证60 MiB咨询上传与普通50 MiB回退；MVC验证登录/管理员/签名边界。
- 前端typecheck和架构边界通过；6个前端测试文件共16项通过（附件策略2、管理员配置2、拖放3、附件派发4、系统资源4、原连接编辑定位1）。编辑定位测试验证更新原资源ID、密码留空，不创建新连接。新增测试的按钮名称与调用参数断言曾不匹配实际组件，修正后通过，未放宽业务判断。
- Vite生产构建通过，使用`.git`内独立输出，不覆盖当前运行产物。保留已有混合静态/动态导入和大chunk警告。
- Sidecar全量TypeScript编译到独立目录通过，7项定向回归通过；覆盖真实stdio MCP列出并转发附件工具、会话签名、分页参数、两引擎装配及权限拦截。权限回归曾发现Claude白名单缺少新工具，已同时补充Permissions与SessionManager并重跑通过。
- 浏览器加载实际ConsultAdminSettings与Sheet组件，使用本页示例数据模拟API，验证桌面读取、保存反馈及390×844无横向溢出，末项可达、Escape关闭；未修改真实配置。组件验收发现无SheetTrigger时关闭后的默认焦点回到页面，实际页面已显式记录触发器并在关闭时恢复；该补丁已typecheck，真实页面焦点恢复留待部署后验收。临时验收页面及视口覆盖已清理。
- Forge质量入口JSON为`PASSED`、退出码0；静态`executedCheckers`为空，不能宣称额外静态检查已执行。运行验证仅9项已有HTTP场景，与本次新接口部署验收分开。OpenSpec严格校验和diff检查通过。
- 没有人工待执行SQL；未改真实数据库连接、未写真实策略、未重启、未发布或推送。首次上线需装载后端和Sidecar新实现，之后管理员调大小不需要重启。真实大文件网络上传、现有咨询/订阅模型端到端读取、生产稳定观察仍待部署验收，不以构建、mock或旧服务HTTP代替。
- 本次Sidecar临时编译目录清理被自动审批拒绝，目录保留为未跟踪产物，不纳入提交；其他任务已有测试目录原样保留。
