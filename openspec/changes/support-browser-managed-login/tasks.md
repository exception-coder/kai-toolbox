# Tasks

- [x] 核查现有表单、令牌生命周期与官方密码管理器建议，记录安全限制。
- [x] 修复无 change 事件的自动填充提交，保留原生校验、失败重试与防重复请求。
- [x] 移除密码组件状态副本，增加个人设备/共用设备提示。
- [x] 执行登录及认证定向回归、类型检查、OpenSpec strict 和适用项目质量门禁。
- [x] Chrome 在独立 127.0.0.1 来源检查 390×844、390×480：无横向溢出，登录按钮可见，空表单原生必填提示，取消返回原入口，重开字段为空。未提交真实凭据，未改变已有账号登录态；已恢复视口并关闭临时页。
- [x] 审阅并将本次修改纳入本地提交，不包含现有咨询模块改动。

## 验证范围

- `npm test -- src/components/auth/LoginDialog.test.tsx src/components/auth/RouteGuard.test.tsx src/lib/auth.test.ts src/lib/authRefreshCoordinator.test.ts`：exit 0，4 文件、23 项通过，其中 6 项新回归覆盖自动填充无 change、原生校验、失败重试、并发防重、取消和成功后的表单移除。测试直接引用公共登录/鉴权代码，功能目录已 mock，不依赖工作区既有咨询模块未提交修改。
- `openspec validate support-browser-managed-login --strict`：exit 0，通过。
- `npm run typecheck`：exit 0，功能目录 59 项与 manifest 一致，组件边界检查和 TypeScript 检查通过。本次未更改依赖、打包配置或静态资源，不追加全仓生产打包。
- `scripts/forge-quality.ps1 verify -Project . -Format json`：exit 0，JSON PASSED。实际运行 9 项既有 API 探测，`executedCheckers=[]`；不是前端编译或手机密码管理器验收。
- 浏览器验证使用现有 Vite 开发服务的当前源码；未执行服务起停、重启或发布。未构建生产制品，线上不含本次修复；本次仅变更表单，无宿主依赖或装配变更。
- 夸克/鸿蒙真机的保存提示、设备解锁及跨次自动填充尚未验收，浏览器与用户设置可能阻止保存。未查实截图中频繁失效的设备侧原因，不把兼容修复描述为已解决所有掉线。
- 不向咨询更新小纸条登记平台认证变更；无 AI 编程架构影响。
