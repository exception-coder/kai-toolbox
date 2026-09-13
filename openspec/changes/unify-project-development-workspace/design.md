## Context

五个 feature 的 pages 使用 _devkit/DevServiceSection 和已有偏好 API。new-devmodule/pages/NewDevModulePage.tsx 的 buildSeed 目前要求生成独立菜单。菜单由 FeatureManifest 生成，不能另建服务端目录。

## Goals / Non-Goals

一个项目开发入口承载稳定系统页签；新增模块为页内能力。保留存量配置、权限与深链接，不合并后端业务模块，不启动 ERP 等目标服务。

## Decisions

采用 project-development 页面组合各 feature 的 public-api，按需加载并保留已访问面板。旧 feature 保持 chrome 路由及权限目录，旧首页跳转到统一入口的 system 参数。SRM 任务深链接继续可用。

入口以 replacesMenus 声明合并的原菜单，持有任一原权限可进入；页签独立检查原 menu 权限，新增模块独立检查原授权。该声明也迁移旧菜单可见性，并消费旧 ID，允许用户之后主动隐藏合并入口。参数 system 不占用子页面参数。新增页为页内 action=new 视图，返回恢复原 system，表单已有本地草稿继续保留。

适用 OBJ-01、NAV-01、CTX-01、DENS-01、FEED-01、AI-01、EVID-01：对象为既有 workbench/service ID，复用原公共服务。五个页签代表长期系统工作台；新增为按钮而非第六个系统。保留原操作的加载、错误、重试反馈，不将脚手架会话创建当作模块生成成功。键盘页签方向键、焦点、移动端横向局部滚动与真实浏览器验收。数据库控制台作用域独立，不纳入本次指定的五个系统。

## Risks / Trade-offs

- 保留已访问面板可能持续查询：仅访问后挂载，沿用现有查询缓存；保持草稿优先。
- 权限接口存在并行修改：合并菜单契约独立实现，按块暂存，不提交其他任务文件或依赖其未提交契约。
- 动态扩展须同时登记权限：扩展工作台注册文件与 chrome manifest 配套，生成提示明确要求。

## Verification / Rollback

测试授权、旧链接参数保留、切换草稿和新增入口；typecheck/build、质量门禁、浏览器桌面与窄屏、运行稳定观察。回退本次提交恢复原导航，不涉及数据迁移。
