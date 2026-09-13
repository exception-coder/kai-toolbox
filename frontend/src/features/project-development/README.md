# 项目开发

统一入口 `/tools/project-development`，以 ERP、ERP 小程序、SRM、SCM、Forge 页签管理开发服务、日志及配置。旧首页链接跳转到对应 `system` 页签，保留其他查询参数和片段；SRM 开发任务深链接继续有效。

系统页签沿用原 `menu:<feature-id>` 权限、workbench/service ID 和配置 API。已访问面板保留在页面中，切换时不丢未保存表单；离开整个页面仍遵循各表单原有保存规则。新增模块位于页内操作区，沿用 `menu:new-devmodule` 权限和脚手架会话流程；发起会话不代表生成已经完成。

## 扩展系统

1. 复用 `_devkit` 和项目库公开目录接口实现工作台，并通过 feature 的 `public-api.ts` 导出页面，接受 `embedded` 属性。
2. 添加 `features/<id>/development.ts`，默认导出 `DevelopmentWorkbench`；参考 [ERP 注册](../erp-dev/development.ts)。注册由统一页面自动收集。
3. feature manifest 设置 `chrome: true`，保留原权限及兼容路由，通过 `LegacyDevelopmentRedirect` 定位到该系统。
4. 将 ID 加入项目开发 manifest 的 `replacesMenus`，使原授权与已保存的菜单可见性迁移到合并入口。新增系统不创建独立侧栏菜单。
5. 验证有限权限、旧链接、页签草稿和窄屏；生成权限目录并通过类型检查与构建。

`system=new` 为兼容新增模块入口保留，系统 ID 不使用 `new`。通用 DB Console 仍为独立工具。
