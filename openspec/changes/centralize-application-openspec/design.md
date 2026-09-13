## Context

Project Registry 的 RegistryProject.id 是系统身份；OpenSpecBoardService 通过工作区扫描生成工作区 ID。现有摘要缺少目录，不能可靠挂接。现有任务看板已经通过官方 CLI JSON 查询任务与材料，无需新解析器。

## Decisions

交付中心首页展示项目库应用清单；应用详情以系统 ID 路由，展示需求任务、项目设置和资源入口。原需求池移动到 requirements 子路由，保留交付中心入口参数所表达的已有需求筛选。独立 OpenSpec 菜单隐藏但保留兼容路由。

OpenSpec 摘要新增 sourcePath，值来自服务端已允许工作区的规范目录。前端独立应用投影函数按完整路径匹配：Windows 盘符/UNC 路径忽略大小写，POSIX 路径大小写敏感；同目录多个系统或工作区均显示歧义。未知路径不按名称或子目录猜测。缺失连接时提供项目库设置与兼容工作区入口。

OpenSpecBoardPage 增加限定工作区和嵌入参数，应用内不允许切换到其它工作区；旧未限定页面保留兼容查询。跨 feature 通过 public-api 导出读取与组件，不新增数据存储、Maven 依赖或 Shell 调用。

## Risks and boundaries

应用列表与任务统计只是证据投影，不把 OpenSpec 勾选完成视为运行验收通过。来源失败保留明确错误，未关联应用不会拿其它项目兜底。旧缓存缺少 sourcePath 时显示待关联，刷新后恢复；不自动回填关系数据。目录别名/符号链接不推断为同一项目。

## Verification

验证路径大小写、歧义、未关联、应用切换隔离、旧入口、权限、官方查询复用和新增摘要字段；前端测试/typecheck/build、Java 专项及完整宿主构建、真实 HTTP 与质量门禁、60 秒稳定观察。浏览器访问此前被拒绝，不绕过；视觉状态单列。Agent 自审：用户目标已确认，归属策略保守，无破坏性迁移；无独立人工评审声明。
