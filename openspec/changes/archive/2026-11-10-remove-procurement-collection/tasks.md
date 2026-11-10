## 1. Retirement

- [x] 1.1 删除独立实现和脚本、移除 Maven 及专属模型配置、刷新生成菜单。
- [x] 1.2 核对共享引用并更新原实施记录的退役状态。

## 2. Verification

- [x] 2.1 验证前端类型、生产构建和宿主装配，检查产物不含招采功能。
- [x] 2.2 执行 OpenSpec 校验、质量门禁与变更审阅并提交。

## Runtime boundary

本次不触发重启。运行实例切换及功能退出的运行验收待用户确认重启后执行，不作为已完成事实。

## Verification evidence

- `npm run typecheck` 通过，含菜单目录一致性和前端架构边界检查。
- `mvn -pl toolbox-starter -am package "-DskipTests" "-Dskip.frontend=true" "-Dstyle.color=never"` 通过（39 个 reactor 模块，编译测试源码，未执行 Java 测试）。宿主 JAR 无招采依赖、类和专属模型配置。该命令跳过前端嵌入，JAR 的旧静态资源不作为本次前端验收或部署制品；新版前端单独验证如下。
- `npx vite build --outDir ../.run/remove-procurement-frontend` 通过；产物菜单、启动导航和页面分包无招采入口。原有大分包警告保留。构建在独立目录，没有替换受管前端产物。
- `openspec validate remove-procurement-collection --strict` 通过。
- Forge Quality Gate 最终退出码 0、JSON `status: PASSED`；`executedCheckers` 为空，实际执行 1 项通用工具 API 检查。原有招采 API 成功场景随退役移除，本机配置备份见 design.md。运行检查针对当前旧服务，不能证明新版本功能退出。
- Graphify 查询受图大小上限阻塞，使用定向源码引用检索补齐；当前可执行源码没有模块、路由或 API 调用残留。历史 OpenSpec 证据仍保留。
- 预览入口已准备（手机和桌面首页），状态为 `WAITING_VIEWER_AUTH`。未执行真实浏览器验收，也未核验新版本运行状态。
