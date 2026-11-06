# 设计

适用 OBJ-01、NAV-01、NAV-03、CTX-01、DENS-01、FEED-01、CTRL-01、EVID-01，无例外。主对象由已登记 projectId 或当前 sessionId 和已有仓库标识确定；不接受任意项目根路径。新增只读窗口与 Git 写操作目的不同；只读窗口共享组件，不复制项目列表、Git 数据库或编辑器。关闭回原触发器，查询失败仍可关闭、原位重试；浏览与切换不创建任何业务对象。

桌面为 96vw、94dvh 的目录/提交导航、文件清单、源码/Diff 三栏；分隔条支持鼠标拖动和键盘调整。窄屏按导航→文件→正文逐级显示，有明确返回入口，不压缩三栏到无法阅读。保留单一对象和各区滚动位置；版本、文件、工作区层级共同作为查询身份，迟到响应不会覆盖新选择。Esc 与 Radix 焦点恢复沿用现有覆盖层规范。

GitReviewService 复用 toolbox-common 的 Git 命令超时/字节读取边界；仅固定只读 argv，关闭 optional locks、fsmonitor、外部 diff 与 textconv。提交固定完整 Hash，历史首屏固定 HEAD 快照后分页，合并提交相对第一父提交，初始提交相对空树。目录只列 HEAD 已跟踪条目，未跟踪文件明确位于工作区；按目录懒加载，每页 300 条，提交每页 50 条。文件正文按文件加载，512 KiB 上限，二进制/非 UTF-8/子模块明确不能预览，不以截断正文计算伪完整 Diff。工作区支持整体（HEAD→当前文件）、暂存区（HEAD→index）、未暂存（index→当前文件）。

路径必须为项目内相对路径，拒绝 .git、..、绝对路径、Windows ADS；工作文件 realpath 不得离开原根，且再次核对 ProjectAccess。删除和重命名通过 Git 原路径读取，读取历史 blob 不追随文件链接。新控制器只投影现有 Registry 或 SessionGitRepositoryService 的授权范围，不复制目录发现或账号边界；不会调用 checkout/fetch/pull/commit/push。测试使用真实临时 Git 仓库核对状态前后相同，并覆盖越界和异常路径。

采用项目现有 CodeMirror + 官方 @codemirror/merge 只读视图；Unified 默认保留连续上下文、关闭接受/拒绝与编辑，Split 精细比较；现有 Java/XML/SQL/JSON/TS/JS/CSS/YAML/Markdown 语言包提供高亮。沿用主题 Token，限制 diff 扫描预算，不新增 Monaco 或 IDE 运行时。[CodeMirror 参考](https://codemirror.net/docs/ref/#merge)、[Git diff-tree](https://git-scm.com/docs/git-diff-tree) 支持该实现方向。

项目接口要求登录，并复用现有项目库菜单权限（管理员保留访问）；会话接口复用会话所有者/管理员访问策略，再解析已关联仓库。关闭认证的既有本地模式仍受 ProjectAccess 和路径边界约束，不新增一套账号体系。

本次为项目通用阅读能力，不改变 Harness、上下文分层、任务写入权和交付生命周期；需启动新版后端及前端后另行完成运行与视觉验收，不能以静态构建替代。
