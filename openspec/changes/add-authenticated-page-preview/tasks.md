# 任务与验证

- [x] 核对现有浏览器 worker、登录态、资源中心、权限与前端路由。
- [x] 实现独立渲染、身份/来源隔离、有界生命周期与资源账号端口。
- [x] 实现预览页面、实时画面、设备切换、显式接管及可恢复错误状态。
- [x] SDK/stdio MCP 同步准备预览入口；受限咨询模式不开放交付工具。
- [x] 后端专项、真实 headless 引擎测试及宿主装配编译。
- [x] 前端专项、类型检查、隔离输出构建及 Sidecar 编译/定向测试。
- [x] 规格严格校验、项目质量门禁、提交与剩余范围核对。
- [ ] 本次重启许可后的实际业务咨询登录/图片预览、桌面与手机布局及稳定观察。

## 证据边界

Graphify 历史图超过工具容量限制，代码证据通过定向源码读取补齐；未将旧图或注册状态当作运行事实。初始后端 PID 31788、前端 PID 83340，受管重启次数均为 0（forge status）。实现期间未重启服务。初次 Maven 使用 JAVA_HOME 的 JDK8 导致 release21 失败；切换 Microsoft JDK21 后重跑。直接 strip-types 测试不支持本仓 .js 导入，改用项目 TypeScript 编译产物执行定向测试。

## 本次开发验证

- 后端专项：browser-request 7 项与资源适配 1 项均通过，包含真实 Chromium 表单登录、Cookie、目标路由、手机 JPEG 与原 context 继续导航。
- 前端：4 项预览交互测试通过；feature catalog、feature boundary 与 typecheck 通过。完整 Vite 构建通过；收尾继续导航等调整另以最新入口隔离构建和 typecheck 验证，不将较早构建当成最新页面的全部证据。
- Sidecar：项目 TypeScript 编译通过；预览/资源工具 5 项、Codex 策略与 Runtime 上下文 6 项通过。
- OpenSpec 严格校验通过。Forge quality phase all 返回 PASSED、exit 0；executedCheckers 为空，实际执行的是 9 个既有 API 探测，不代表新增预览 API 或界面已运行验收。
- 混合工作区按当前基线独立暂存：预览组件不依赖其他任务的 preloadable 或导航实现；附属路由继续兼容基线 React.lazy。其他任务的暂存与源码保留。
- 服务未重启。真实业务页面、完整登录守卫和部署版本，以及桌面/手机视觉、稳定观察仍待本次重启许可后核验。

宿主最终编译：Java 21 的 toolbox-starter -am compile 覆盖 41 个模块，BUILD SUCCESS。
