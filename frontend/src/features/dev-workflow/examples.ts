/** 领导演示用的典型示例需求，全部围绕「需求管理池（tool-reqpool）」模块展开 */

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
    withoutKg: string[]
    withKg: string[]
  }
  /** 业务逻辑澄清场景：展示澄清前后的偏差 */
  clarifyValue?: {
    withoutClarify: string
    afterClarify: string
  }
}

export const DEMO_EXAMPLES: DemoExample[] = [
  {
    id: 'reqpool-sla',
    title: '需求池 SLA 预警',
    badge: '知识图谱赋能',
    badgeVariant: 'blue',
    highlight: 'AI 直接引用已有字段和状态枚举，而非泛泛询问"有哪些字段"',
    description: '在需求管理池列表中，临近截止日期的需求自动高亮预警，避免需求超期无人处理',
    project: 'kai-toolbox',
    module: 'tool-reqpool',
    rawInput: `当需求池中的需求接近截止日期时，系统没有任何提醒机制，
导致产品经理经常遗忘，需求超期后才发现。

期望功能：
- 在需求列表中，距截止日期 ≤3 天的需求自动标红高亮（行级变色）
- 距截止日期 ≤7 天显示黄色警告图标
- 在页面顶部增加"即将超期 N 条"的摘要提示条
- 已完成（DONE）和已取消（CANCELLED）的需求不参与预警
- 超期阈值可在设置中调整（默认 3 天和 7 天）`,
    comparison: {
      withoutKg: [
        '请描述现有系统中有哪些字段可以用于计算超期？',
        '需求的状态有哪些？哪些状态需要参与预警？',
        '高亮是行级变色还是只加个图标？',
        '前端是什么框架，有没有现成的表格组件可以用？',
      ],
      withKg: [
        'req_pool_item 表中 deadline 存 yyyy-MM-dd 字符串，预警计算在前端（JS Date 比较）还是后端新增查询条件？两种方案实时性和数据库负载各不同。',
        'DONE 和 CANCELLED 不参与预警已确认，那 IN_DEV 状态超期后，是否要额外通知 assignee 字段对应的负责人？',
        '现有 ReqPoolPage 表格是原生 <table>，行级变色只需 className 条件判断；顶部摘要条是复用现有 filter 栏还是新增一个 Alert 组件？',
        '超期阈值"可在设置中调整"——是写入 reqpool 专属配置还是复用现有配置中心 /api/config 的 KV 存储？',
      ],
    },
  },
  {
    id: 'reqpool-bulk',
    title: '需求批量操作',
    badge: '业务逻辑澄清',
    badgeVariant: 'purple',
    highlight: '4 个关键问题消除模糊假设，避免状态机实现错误导致返工',
    description: '产品经理每周需批量变更需求状态或批量指派负责人，目前只能逐条操作，效率极低',
    project: 'kai-toolbox',
    module: 'tool-reqpool',
    rawInput: `产品经理每周会对一批需求做统一操作：
- 将本迭代完成的需求批量标记为 DONE
- 将下迭代的需求批量指派给同一个开发人员
- 将废弃的需求批量取消（状态改为 CANCELLED）

目前只能逐条点击操作，每次迭代结束要手动操作几十条，非常耗时。

期望效果：需求列表支持多选（勾选框），然后可以批量改状态或批量改负责人。`,
    clarifyValue: {
      withoutClarify:
        '直接实现"批量改状态"，允许把 DRAFT 直接改成 DONE，跳过澄清中、PRD就绪、开发中等步骤，破坏了状态机。测试阶段才发现，返工重构状态校验逻辑，耗时 2 天。',
      afterClarify:
        '澄清后确认：批量变更必须遵守状态机合法流转（DRAFT 不能直接到 DONE），非法操作跳过并在结果中列出；批量分配人无视状态限制。首次实现即通过验收，节省 2 天返工。',
    },
  },
  {
    id: 'reqpool-import',
    title: '需求导入（Excel/CSV）',
    badge: '知识图谱 + 业务逻辑',
    badgeVariant: 'green',
    highlight: '知识图谱确定字段映射，业务逻辑澄清确定重复检测和失败处理规则',
    description: '团队已有大量存量需求分散在 Excel 中，希望一次性导入到需求池，无需逐条手动录入',
    project: 'kai-toolbox',
    module: 'tool-reqpool',
    rawInput: `我们团队在使用需求管理池之前，已有数百条需求记录存在 Excel 表格中，
列名包括：需求名称、描述、项目、模块、优先级、负责人、截止日期。

期望功能：
1. 支持上传 .xlsx 或 .csv 文件
2. 提供标准导入模板（可下载）
3. 导入前预览：展示将导入的行数、字段映射结果
4. 导入后生成结果报告（成功 N 条/失败 N 条/跳过 N 条）
5. 重复检测：标题完全相同的需求自动跳过（不重复导入）`,
  },
]
