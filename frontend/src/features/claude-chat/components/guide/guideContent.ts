export type GuideTarget = 'start' | 'sessions' | 'execution' | 'workspace' | 'delivery' | 'settings'
export interface GuideTopic { title: string; purpose: string; when: string; path: string; session?: boolean }
export interface GuideChapter { id: GuideTarget; title: string; summary: string; entry: string; topics: GuideTopic[] }

export const GUIDE_CHAPTERS: GuideChapter[] = [
  { id: 'start', title: '开始开发', summary: '先确定项目和运行配置，再向 Agent 说明目标。', entry: '新建会话', topics: [
    { title: '新建与工作目录', purpose: '指定本轮开发的代码目录并命名会话。', when: '开始新任务，或需要独立保留上下文时。', path: '顶部「新建」；手机：会话工具 → 新建会话' },
    { title: '引擎、模型与服务商', purpose: '选择编码引擎及模型；支持的引擎可使用会话级第三方服务商。', when: '需要更换模型、账号或网关时，先核对引擎能力。', path: '新建表单；已有会话：输入区「会话配置」', session: true },
    { title: '给出目标与材料', purpose: '发送文字，添加附件或引用项目与规格，让 Agent 获得明确上下文。', when: '开始编码、分析问题或补充当前任务材料时。', path: '输入区「＋」「@」与发送按钮', session: true },
  ] },
  { id: 'sessions', title: '管理会话', summary: '用项目与收藏组织任务，快速回到正确的对话。', entry: '会话列表', topics: [
    { title: '项目分组与搜索', purpose: '按主项目、需求分组查找会话，结合状态筛选缩小范围。', when: '任务多、需要回到某个项目时。', path: '顶部「会话」→ 项目列表与搜索；Ctrl / Cmd + K' },
    { title: '收藏、复制与重命名', purpose: '标记常用会话，复制已有配置，给会话和项目清晰命名。', when: '保留原任务并开始另一条工作线，或整理任务时。', path: '会话列表中的行操作；当前标题可编辑', session: true },
    { title: '回看与导出', purpose: '按自己的提问跳转、回到开头，或导出 PDF / Word。', when: '查找先前结论或向同事交接时。', path: '会话工具 → 会话 → 我的提问 / 跳到会话开头 / 导出会话', session: true },
  ] },
  { id: 'execution', title: '查看执行', summary: '把聊天结果、执行过程和自动监督分开看。', entry: '会话视图', topics: [
    { title: '对话与轨迹', purpose: '对话查看回复，轨迹查看执行过程及工具活动。', when: '判断 Agent 正在做什么、排查执行问题时。', path: '会话顶部「对话」「轨迹」', session: true },
    { title: '推进与自动监督', purpose: '查看推进状态；跨会话看板集中查看监督中的任务。', when: '按 OpenSpec 推进任务或同时跟进多个运行时。', path: '会话顶部「推进」；顶部「监督」打开看板', session: true },
    { title: '用量与运行控制', purpose: '查看真实订阅窗口与本地统计；执行中可中断或按引擎能力补充、排队。', when: '安排额度、调整任务或发现执行方向偏离时。', path: '会话顶部「用量」；输入区运行控制', session: true },
  ] },
  { id: 'workspace', title: '项目协作', summary: '围绕当前工作目录查看文件、变更与附加项目。', entry: '工作区 · 项目', topics: [
    { title: '文件与 Git 变更', purpose: '查看工作目录、提交记录和待提交文件。', when: '定位代码、检查本轮修改与交付范围时。', path: '会话工具 → 工作区 · 项目 → 工作目录 / 提交记录 / 待提交文件', session: true },
    { title: '附加项目', purpose: '为多项目任务补充关联目录，作为会话上下文。', when: '前后端分仓或需要联动多个项目时。', path: '会话工具 → 工作区 · 项目 → 关联附加项目', session: true },
    { title: '准备项目', purpose: '拉取远端仓库、聚合工作区，或运行项目初始化流水线。', when: '本地尚无代码，或需要准备项目工程上下文时。', path: '会话工具 → 工作区 · 项目 → 拉取项目 / 合并工作区 / 项目初始化流水线' },
  ] },
  { id: 'delivery', title: '交付结果', summary: '让规格、评审、测试入口和待执行变更留在会话中。', entry: '会话', topics: [
    { title: '规格与计划评审', purpose: '关联规格，分享独立评审消息流，让业务和测试提供意见。', when: '需要确认需求、审阅计划或追踪实现依据时。', path: '会话工具 → 会话 → 关联规格 / 分享计划评审', session: true },
    { title: '测试站点', purpose: '关联测试地址，集中访问当前会话的验证入口。', when: '功能具备测试环境、需要实际验证时。', path: '会话顶部「站点」；会话工具 → 会话 → 关联测试站点', session: true },
    { title: '待执行 SQL', purpose: '登记需要人工审核执行的 DDL / DML，并记录后续状态。', when: '开发涉及人工数据库迁移或一次性修复时；登记不等于执行。', path: '会话工具 → 会话 → 登记待执行 SQL', session: true },
  ] },
  { id: 'settings', title: '调整工作区', summary: '先区分阅读方式、个人偏好与运行环境，再按需调整。', entry: '系统 · 设置', topics: [
    { title: '阅读与显示', purpose: '使用专注、悬浮窗或全屏；按需调整工具着色和调用显示。', when: '长篇阅读、切换模块或需要降低信息干扰时。', path: '会话工具 → 视图；工作区个性化在 系统 · 设置' },
    { title: '语音与能力', purpose: '了解语音、MCP、Tools、Plugins 和 Skills；可用性以当前引擎为准。', when: '想使用语音或确认 Agent 能调用哪些工具时。', path: '输入区语音入口；会话工具 → 会话 → 会话能力', session: true },
    { title: '依赖、通知与排障', purpose: '管理服务商、团队依赖、完成通知，查看日志和调试事件。', when: '准备环境、希望任务结束后收到通知，或出现故障时。', path: '会话工具 → 系统 · 设置 → 服务商 / 团队依赖 / 通知设置 / 最新日志 / 调试模式' },
  ] },
]
