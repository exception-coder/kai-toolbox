## Decisions

在 `GitStatusDialog` 集中承载窗口尺寸、标题操作和焦点管理，`GitStatusPanel` 保持仓库、筛选、文件树和 diff 数据职责，复用现有 `SideBySideDiff`。全屏指铺满当前应用视口，不申请浏览器原生全屏权限。只改同一个弹层的布局，不重新挂载对比内容或重新请求。

OBJ-01、CTX-01：沿用当前仓库、文件、筛选；尺寸切换保留双栏滚动节点。FEED-01：全屏按钮提供清晰名称和选中态，Esc 分两步退出。DENS-01：全屏让代码占用剩余可用空间，标题栏固定可达。CTRL-01：只读显示，窗口关闭不改变 Git。无例外。

使用项目已有 Radix Dialog 和 Button，实现焦点约束、关闭后回到触发器及背景滚动保护；动态视口高度兼容窄屏和矮屏。左右列沿用独立横向滚动和纵向同步。

## Verification

补充既有 GitStatusPanel 用例，覆盖窗口切换、内容节点/滚动位置不重置、无重复请求、Esc 与关闭焦点恢复。执行 frontend typecheck、OpenSpec 校验和既有 Forge 质量入口。浏览器验证全屏边界、长代码和还原，结果写入 tasks。无服务重启；回滚为撤销本次 UI 提交。
