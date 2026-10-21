# Tasks

- [x] 手机展示复用系统清单与拓扑，新增自动适配布局。
- [x] 节点统一、隐藏常驻标签，点击聚焦与关系详情。
- [x] 分类收敛、定位恢复、平移缩放及携带系统的新咨询草稿。
- [x] 定向测试：MobileSystemGraph 5项、页面恢复24项、显示范围6项，共35项通过；包含安全边距、缩放锚点、拖动与取消、关闭焦点和携带上下文新草稿。`npm run typecheck`通过。
- [x] `openspec validate mobile-consult-graph-readability --strict`及diff检查通过。Forge verify JSON为PASSED且exit 0；executedCheckers为空、运行项仅9个已有API探针，不作为新图谱UI验收依据。
- [x] 已登录Chrome本地Vite检查390×844手机：4系统／5关系、节点完整、无横向溢出、关系聚焦与关闭、切换咨询后缩放保持。650×390横屏检查完整性；1384×769桌面确认原4节点／5标签，未渲染手机组件。浏览器视口模拟不等于真机双指验收。
- [x] 已准备手机／桌面预览入口（WAITING_VIEWER_AUTH），入口以访问者身份打开；准备入口不代表已登录或正式部署。
- [ ] 正式部署与手机真机触控验收（未获本次重启授权，不自动执行）。
