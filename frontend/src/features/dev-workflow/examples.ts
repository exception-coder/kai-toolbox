/** 领导演示用的典型示例需求，展示知识图谱与业务澄清的价值 */

export interface DemoExample {
  id: string
  title: string
  badge: string
  badgeVariant: 'blue' | 'purple' | 'green'
  highlight: string
  description: string
  project: string
  module: string
  rawInput: string
  /** 知识图谱赋能场景：展示有/无知识图谱的澄清问题对比 */
  comparison?: {
    withoutKg: string[]   // 没有知识图谱时的通用/低质量问题
    withKg: string[]      // 有知识图谱时的精准问题
  }
  /** 业务逻辑澄清场景：展示澄清前后的偏差 */
  clarifyValue?: {
    withoutClarify: string  // 不澄清直接开发会怎样
    afterClarify: string    // 澄清后如何正确实现
  }
}

export const DEMO_EXAMPLES: DemoExample[] = [
  {
    id: 'resume-scoring',
    title: '简历完整度评分',
    badge: '知识图谱赋能',
    badgeVariant: 'blue',
    highlight: 'AI 基于已有代码结构提出精准问题，而非泛泛而谈',
    description: '为简历模块增加多维度完整度评分功能，帮助用户了解简历质量并获得改进方向',
    project: 'kai-toolbox',
    module: 'tool-resume',
    rawInput: `需求背景：当前简历工作台（tool-resume）只提供 AI 优化建议，用户不清楚自己简历的整体质量水平。

需求描述：增加「简历完整度评分」功能，对用户简历进行多维度评估并给出 0-100 分的综合评分，具体包括：
- 基本信息完整度（姓名、联系方式、城市等）
- 工作经历质量（年限描述、职责描述详细程度、量化成果）
- 技能匹配度（与目标岗位的关联性）
- 教育背景完整性
- 项目经历含金量

用户在简历详情页可以一键触发评分，查看各维度得分和具体改进建议，并与历史评分做对比。`,
    comparison: {
      withoutKg: [
        '现有系统是什么样的结构？有哪些数据表？',
        '评分维度有哪些？权重怎么分配？',
        '评分结果保存在哪里？',
        '前端是什么框架？需要新建页面还是修改现有页面？',
      ],
      withKg: [
        '评分逻辑是否需要复用现有 ResumeOptimizationService 的 Claude Agent 调用，还是独立实现规则引擎？（已知现有引擎支持 fast/quality 两档）',
        '现有 resume_experience、resume_skill、resume_project 等五张表的字段是否已足够计算各维度评分，或需补充如"目标岗位"字段？',
        '历史评分对比功能：是否需要新建 resume_score_history 表，还是在现有 resume_kv 表中按 key 存储？',
        '前端评分结果展示：是内嵌在现有 ResumeDetailPage 的 Tab 中，还是新建独立页面？（现有页面已有 experience、skills、projects 三个 Tab）',
      ],
    },
  },
  {
    id: 'resume-pdf',
    title: '简历一键导出 PDF',
    badge: '业务逻辑澄清',
    badgeVariant: 'purple',
    highlight: '澄清 4 个关键问题，避免实现方向性偏差导致的多轮返工',
    description: '支持用户将填写好的简历导出为专业格式的 PDF 文件，用于求职投递',
    project: 'kai-toolbox',
    module: 'tool-resume',
    rawInput: `需求描述：用户完成简历填写和 AI 优化后，希望能够导出为 PDF 格式，用于向企业投递简历。

当前痛点：工作台提供简历在线编辑和 AI 优化，但没有导出功能。用户只能截图保存，格式不专业，且无法精确控制排版。

期望效果：点击「导出 PDF」按钮，自动生成格式美观的简历 PDF 文件并下载到本地。对排版有一定要求：字体清晰、间距舒适、内容层次分明。`,
    clarifyValue: {
      withoutClarify:
        '直接用 jsPDF 截图转 PDF → 中文字体乱码、内容分页断裂、样式与网页出入大 → 返工 3 次，耗时 2 周',
      afterClarify:
        '澄清确认：服务端生成（wkhtmltopdf）+ 2 套固定模板 + 自动分页 + 内嵌中文字体 → 首次交付即达标',
    },
  },
  {
    id: 'resume-tracker',
    title: '简历投递追踪',
    badge: '知识图谱 + 业务澄清',
    badgeVariant: 'green',
    highlight: '结合知识图谱定位集成点，结合业务澄清确定状态流转规则',
    description: '在简历工作台中增加求职投递记录追踪功能，关联简历版本并统计投递效果',
    project: 'kai-toolbox',
    module: 'tool-resume',
    rawInput: `作为求职者，我希望能在简历工作台中记录和追踪我的求职投递情况，分析哪些简历版本效果更好。

期望功能：
1. 记录每次投递（目标公司、岗位、投递渠道、投递日期）
2. 追踪投递状态流转（已投递 → 简历被查看 → 约面试 → 终面 → Offer / 已拒绝）
3. 关联到具体的简历版本（不同公司用了不同优化版本）
4. 看板视图：以时间线或看板形式展示所有投递的当前状态
5. 数据统计：投递总量、各阶段转化率、平均响应天数`,
  },
]
