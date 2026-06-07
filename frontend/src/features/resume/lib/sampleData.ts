// 演示数据：基于「张凯-Java.pdf」示例简历整理，可一键填充作为模板示范
import type { ResumeData } from '../types'

export const SAMPLE_RESUME: ResumeData = {
  basics: {
    name: '张凯',
    gender: '男',
    age: '31',
    experienceYears: '9年工作经验',
    jobIntent: 'Java',
    city: '广州',
    email: '',
    phone: '',
    avatar: '',
    advantage: '独立架构设计能力',
  },
  work: [
    {
      id: 'w-1',
      company: '广州应奥科技有限公司',
      role: '高级 Java 开发',
      period: '2018.04 - 至今',
      responsibilities: [
        '负责 丰云行 OMS（订单管理系统）核心模块的设计与开发，涵盖订单管理、订单轨迹及订单统一对账能力建设',
        '对外提供统一订单登记与订单变更接口服务，并实现 RSA 加解密 + MD5 签名校验 的接口安全机制',
        '基于 GitLab + Nexus + Jenkins 搭建持续集成流水线，实现项目自动构建与发布流程',
        '基于 XXL-JOB 构建分布式任务调度体系，支持多站点订单同步任务的集中配置与运行监控',
        '集成 Spring JDBC + 动态数据源路由机制，根据站点编码实现多数据源动态切换',
        '基于 Spring Cloud Gateway 构建统一接口调用网关，实现请求日志记录与调用链路追踪',
        '基于 pure-admin-service + Freemarker 实现代码生成模块，抽象查询、表单与列模型',
        '基于 百度飞桨 OCR + 通义千问（Qwen）构建本地 OCR 识别服务，实现证件识别与结构化数据处理',
      ],
      achievements: [
        '推动 丰云行 OMS 系统成功上线并交付业务使用，支撑订单与对账相关业务流程',
        '在实际线上攻击场景中通过网关防护机制成功拦截小规模 DDoS 攻击，保障商城首页可用性',
        '推动上线基于 pure-admin-service 的低代码开发模块，显著提升简单 CRUD 模块开发效率与一致性',
        '优化系统模块结构，推动采用 DDD-Lite 分层设计，降低模块耦合度并提升系统可维护性',
        '完成 中油 BP 分布式传单定时任务模块上线，提升传单作业的监控能力与管理效率',
      ],
    },
    {
      id: 'w-2',
      company: '杭州驭缘网络科技有限公司',
      role: '中级 Java 开发工程师',
      period: '2017.07 - 2018.03',
      responsibilities: [
        '负责对接 支付宝、微信支付、银联 等主流支付平台，完成支付、退款、冻结、分账等核心能力的接口集成',
        '设计并实现统一支付通道接口，对外提供标准化支付服务，屏蔽多支付渠道差异',
        '负责支付订单管理模块的开发与维护，涵盖订单创建、状态流转、过期处理及查询等核心逻辑',
        '参与支付系统对账模块的设计与实现，实现对账单拉取、差异识别及异常处理流程',
      ],
      achievements: [
        '支撑多支付渠道（支付宝、微信、银联）的稳定接入与运行，相关支付能力长期服务于核心业务系统',
        '通过统一支付通道的设计与落地，降低多支付渠道接入复杂度，提升系统对外服务的一致性与可维护性',
        '完成支付订单管理模块的建设，保障支付、退款、冻结、分账等关键流程的状态可追踪与可回溯',
      ],
    },
    {
      id: 'w-3',
      company: '广州幽蓝信息科技有限公司',
      role: 'Java 开发工程师',
      period: '2016.11 - 2017.06',
      responsibilities: [
        '负责公司 WMS / TMS 相关业务模块的前后端开发与维护',
        '基于业务需求完成出库管理、库位管理、货品管理等仓储模块的功能实现',
        '前端使用 ExtJS 构建业务页面，后端基于 Servlet + 自研 JPA 持久层框架 实现业务逻辑',
        '使用 SQL Server 数据库，编写及维护 存储过程 处理复杂数据操作',
      ],
      achievements: [
        '参与 WMS 与 TMS 核心业务模块的开发与落地，相关功能已随系统版本稳定上线并投入实际业务使用',
        '独立完成出库管理、库位管理、货品管理等模块的功能开发，保障仓储出库流程的正常运转',
      ],
    },
  ],
  projects: [
    {
      id: 'p-kpay-daily-plugin',
      name: 'KPay 日常开发 AI 插件（Claude Code Plugin）',
      role: '独立开发 / 负责人',
      period: '2026.05 - 2026.06',
      description:
        '面向团队的 Claude Code 插件，把 KPay 日常开发高频操作沉淀为「装一次、全局可用、说人话即触发」的 Skill 体系，免去每个项目重复配置。',
      responsibilities: [
        '设计插件架构：12 个 Skill（自然语言触发，无需记命令）+ 2 个自建 Python MCP Server + 接入 Meegle 官方远程 MCP + slash command + PreToolUse hook',
        'loghub / OpenSearch 日志检索 MCP（订单号 / requestId / 通用 query 全链路）',
        'korepos 本地 SQLite 查询（桌面 / iOS 模拟器 / Android adb 真机三态）',
        'Meegle 工作项查询 / 创建 / 流转 + 每日工作日志推送',
        'macOS korepos 全链路：环境搭建（FVM/Flutter/Xcode）→ 最省时运行 iPad 模拟器 → 按环境自动登录',
        '沉淀 backend 接口规范 / 日志规范 / schema 迁移差异排查等团队工程约束；跨 macOS/Windows；Python 依赖用 uv 管理',
      ],
      achievements: [
        '把分散在各项目、各人重复的开发操作收敛为一个全局插件，新同事 60 秒上手、零命令记忆',
        '自然语言触发 + MCP 后台编排，显著降低日志排障、工作项流转、环境搭建的人工成本',
        '约 1 个月迭代成型（29 次提交）',
      ],
    },
    {
      id: 'p-team-standards',
      name: '团队开发规范 AI 插件（Claude Code + Codex）',
      role: '独立开发 / 负责人',
      period: '2026.03 - 2026.06',
      description:
        '把团队工程规范（编码标准、设计文档、提交、bug 分析、知识图谱等）固化为可被 AI 按场景自动触发执行的 Claude Code / Codex 双端插件，装一次全局生效——让规范「自动落地」而非靠人记。',
      responsibilities: [
        '设计 25 个 Skill 体系：Java/Dart 编码规范（阿里黄山版）、设计文档强制（三档模版分级）、bug 文档强制、git 提交规范、文档索引、术语表、知识图谱（正向 + 反向索引）、跨项目调用定位等',
        '实现 PreToolUse hooks：源码编辑前强制设计文档（识别 monorepo/Maven 项目根）、大改拦截走 skill、注释红线扫描、后端知识图谱就绪检查（跨平台 Node + 单测）',
        '建 CI 守护：三处 manifest 版本同步、CLAUDE.md→AGENTS.md 同步、跨 skill 引用校验、SKILL.md 体检；hooks 在 ubuntu/macOS/Windows × Node 18/20/22 矩阵测试',
        '双端市场架构：同一 GitHub 仓库重构为「marketplace 根 + 子目录单插件」，供 Claude Code（.claude-plugin）与 Codex（.agents/plugins）双端 install/update',
      ],
      achievements: [
        '把团队规范从「文档靠人记」变为「AI 按场景自动触发执行」，约 3 个月迭代到 25 Skill / 166 commits / v1.33',
        '一套插件双端（Claude Code + Codex）复用，GitHub 一处更新两端拉取',
        'hook + CI 形成质量闭环：编码前强制设计文档、提交规范化、跨引用与版本一致性自动校验',
      ],
    },
    {
      id: 'p-kpos-refund',
      name: 'KPos POS 退款退货与支付反结账本地 Backend 重构',
      role: '核心开发 / 本地 Backend 负责人',
      period: '2026.04 - 2026.06',
      description:
        '基于 Flutter/Dart 的多平台 POS 收银系统，负责退款退货、支付退款、反结账等核心链路的本地 Backend 重构。原有退款模块业务逻辑分散在页面、Repository 与旧 Service 中，难以支撑复杂退款、KPay 异步退款、联台分摊、失败重试与主副设备同步等生产场景。本次重构将核心逻辑收敛为 endpoint、DTO、Service、DAO、Registry、BackendInfra 的本地服务架构，提升链路稳定性、可维护性与生产排查能力。',
      responsibilities: [
        '跨栈切入：以 Java 后端背景进入 Flutter/Dart 项目，在缺少完整文档与语言基础的情况下，边掌握 Riverpod、Drift、Dart 异步与代码生成机制，边完成核心接口开发',
        '退款重构：重构 refund backendv2，覆盖退款确认、退款分配、可退商品、最大可退金额、退款按钮隐藏、退款时效校验、整单取消、拒单退款、再次退款等接口',
        '结构治理：将原本分散在页面与 Repository 中的退款逻辑，收敛为 endpoint、DTO、Service、DAO、Registry 的本地 Backend 分层结构',
        '事务落库：抽取退款入库编排能力，处理订单、账单、流水、退款单、商品、税费、小费、服务费等多表一致性',
        '异步补偿：建设 KPay Online 退款链路，支持退款发起、pending 落库、主动轮询、终态回调、超时降级、失败重试与 UI 通知',
        '反结账能力：补齐反结账本地 Backend 接口，处理整单取消、卡机反结回调、重新支付、订单状态与支付流水联动',
        '边界修复：修复部分退、再次退、联台、拆分支付、AA 付、含小费、服务费、不可退渠道、拒单/取消、反结后再支付等复杂场景问题',
        '可观测性：建设 BackendInfra、共享 DAO、BackendModuleLogger、ZoneLogger、trace 串联、cloud logs 与 DAO 异常日志，提升生产排障效率',
        '数据库治理：补齐 pending_online_refund 表、索引与 Drift 迁移逻辑，处理版本升级兼容与查询性能问题',
      ],
      achievements: [
        '将原本偏页面流程的退款模块重构为本地 Backend 服务体系，提升复杂退款链路的可维护性与扩展性',
        '约 7 周内完成 200+ 次提交，覆盖 refund、payment、order、reopen_order、backend_infra、database 等核心模块',
        '完成 KPay 在线退款「发起-落库-轮询-终态-同步-通知」闭环，降低异步退款卡 pending 与状态错乱风险',
        '统一退款金额与状态口径，解决小费重复计算、部分退误判、再次退款失败重试、联台分摊错误等多类生产边界问题',
        '抽取共享 DAO、状态计算、退款锁、日志与基础设施能力，减少页面侧散落判断与重复 SQL',
        '在无完整文档、无 Flutter/Dart 深厚基础的前提下，借助 AI 协同与后端工程经验快速完成跨栈核心链路交付',
        '将原预计需数月熟悉与重构的复杂链路，压缩到约 7 周完成可运行、可联调、可排查的生产闭环',
      ],
    },
    {
      id: 'p-1',
      name: 'AI 求职小助理',
      role: '项目负责人',
      period: '2025.10 - 2025.12',
      description:
        '基于 Spring Boot + Playwright + AI 能力集成，实现岗位采集、筛选分析、AI 生成打招呼与自动投递的全流程自动化。',
      responsibilities: [
        '任务编排层：自动投递任务调度、状态管理与事件推送',
        '自动化执行层：基于 Playwright 实现浏览器控制与行为模拟',
        'API 监控层：通过请求拦截与响应解析实现数据采集与增量更新',
        '反爬对抗层：通过 JS 注入与指纹伪装实现浏览器反检测能力',
        '稳定性保障层：构建 Page 健康检查与自动重建机制，保障长时间运行',
        'AI 能力层：封装 LLM 能力，实现职位匹配、技能分析与招呼语生成',
      ],
      achievements: [
        '实现招聘平台自动化投递全流程系统，支持长期稳定运行',
        '构建浏览器反检测机制，成功绕过多类自动化识别与反爬策略',
        '基于 API 拦截实现数据采集与增量更新，保证数据准确性与实时性',
        '集成 AI 打招呼能力，实现个性化投递内容生成',
      ],
    },
    {
      id: 'p-2',
      name: '企业级审计监控系统',
      role: '项目负责人',
      period: '2025.10 - 2025.11',
      description:
        '面向系统关键行为的实时检测与审计平台，覆盖登录失败、敏感操作、数据删除等 10+ 类审计场景，采用事件驱动架构实现业务逻辑与审计规则解耦。',
      responsibilities: [
        '基于 策略模式 + 注册表模式 实现审计规则的动态分发与执行',
        '使用 注解驱动 + 反射机制 自动发现并注册审计 Handler',
        '集成 Spring Integration 构建消息流，实现审计事件动态路由与异步处理',
        '通过 滑动窗口算法 实现登录失败频率检测与异常行为识别',
        '支持新增审计规则无需修改核心模块，仅通过新增 Handler 即可扩展',
      ],
      achievements: [
        '通过注解自动装配机制，新增审计类型开发效率提升约 80%',
        '审计规则扩展无需修改核心代码，相关模块代码量减少约 60%',
        '审计能力从业务系统中抽离为统一组件，显著提升系统可维护性与一致性',
      ],
    },
    {
      id: 'p-3',
      name: '统一安全网关',
      role: '项目负责人',
      period: '2025.05 - 2025.08',
      description:
        '系统入口网关，负责请求鉴权、安全防护、限流控制、链路监控与动态配置管理，提升系统整体安全性与可观测性。',
      responsibilities: [
        '基于 Redis + 滑动窗口算法 实现 IP 限流，并通过布隆过滤器实现黑名单快速判定',
        '构建爬虫识别机制：User-Agent 特征、请求头校验、JS 校验与访问模式检测',
        '在网关层实现统一服务鉴权机制，通过白名单与 IP 映射校验内部服务访问',
        '集成 OWASP HTML Sanitizer 进行 XSS 清理，并注入 CSP / X-Frame-Options 等安全头',
        '基于 Nacos 实现配置动态管理与多环境隔离，Jasypt + AES-256 加密敏感配置',
        '基于 SkyWalking + MongoDB 异步记录请求链路，构建统一请求追踪与审计入口',
      ],
      achievements: [
        '构建统一系统入口网关，实现安全能力集中治理',
        'IP 限流与布隆过滤器机制有效降低恶意请求压力',
        '动态配置机制使配置变更无需重启服务',
        '网关成为系统安全、防护与治理的统一入口',
      ],
    },
    {
      id: 'p-4',
      name: '企业级 RBAC 权限管理系统',
      role: '项目负责人',
      period: '2022.05 - 2022.08',
      description:
        '基于 Spring Boot + Vue3 + TypeScript 的可复用用户与权限管理模块，支持本地用户与 AD 域用户双认证，实现菜单级与按钮级权限控制。',
      responsibilities: [
        '基于 JWT + Redis 实现统一身份认证与 Token 管理；支持 AccessToken + RefreshToken 双 Token',
        '实现登录失败锁定、IP 白名单、验证码校验与密码过期策略',
        '前端 RSA 加密密码传输，后端 MD5 + Salt 存储',
        '基于 RBAC 模型实现角色与菜单权限映射，动态生成路由树并注册 Vue Router',
        '使用策略模式实现本地用户与 AD 用户认证逻辑解耦',
      ],
      achievements: [
        '构建可复用的用户与权限管理模块，可作为多个系统的统一认证与权限中心',
        '实现本地用户 + AD 域用户双认证体系，统一企业身份管理入口',
        '用户权限路由动态生成，页面响应时间 <200ms',
      ],
    },
    {
      id: 'p-5',
      name: '订单中心系统',
      role: '主程序员',
      period: '2019.05 - 2020.08',
      description:
        '集团订单中心，统一接入多业务系统订单数据，完成订单登记、状态同步、轨迹沉淀与集中查询服务。',
      responsibilities: [
        '设计统一订单模型与状态体系，屏蔽不同来源系统的字段差异与状态语义差异',
        '设计「订单-支付」联动机制，引入 PAYING 业务锁 + 状态机控制有效支付发起',
        '实现支付回调处理的幂等策略（状态校验 / 唯一业务单号 / 重复回调过滤）',
        '建立支付异常补偿机制：查单 + 补偿任务修正订单状态',
        '建设自动退款能力：识别重复支付 / 多收款 / 已关闭但支付成功 等异常',
      ],
      achievements: [
        '订单中心稳定服务多业务系统，显著降低跨系统对接成本',
        '通过 PAYING 业务锁 + 状态机机制解决重复点击 / 请求重试 / 回调延迟导致的重复支付风险',
        '落地重复支付自动退款策略，降低资金风险与人工处理成本',
      ],
    },
  ],
  education: [
    {
      id: 'e-1',
      school: '广东理工学院',
      degree: '本科',
      major: '计算机科学与技术',
      period: '2022 - 2024',
    },
    {
      id: 'e-2',
      school: '广东理工学院',
      degree: '本科',
      major: '软件工程技术',
      period: '2014 - 2018',
    },
  ],
  skills: [
    'Java / Spring Boot / Spring Cloud',
    'MySQL / Redis / MongoDB',
    'XXL-JOB / Nacos / SkyWalking',
    '支付集成（支付宝 / 微信 / 银联）',
    'Vue3 / TypeScript',
  ],
}

export function emptyResume(): ResumeData {
  return {
    basics: {
      name: '',
      gender: '',
      age: '',
      experienceYears: '',
      jobIntent: '',
      city: '',
      email: '',
      phone: '',
      avatar: '',
      advantage: '',
    },
    work: [],
    projects: [],
    education: [],
    skills: [],
  }
}
