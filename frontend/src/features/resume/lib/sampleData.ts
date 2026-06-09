// 通用脱敏示例数据：仅作「示例」按钮的模板演示，全部为虚构占位内容。
// ⚠️ 本仓开源，禁止把真实姓名/公司/项目等隐私写入此文件；真实简历存在本地 DB/localStorage，不入仓。
import type { ResumeData } from '../types'

export const SAMPLE_RESUME: ResumeData = {
  basics: {
    name: '张三',
    gender: '男',
    age: '28',
    experienceYears: '5 年工作经验',
    jobIntent: 'Java 后端开发',
    city: '示例城市',
    email: 'example@example.com',
    phone: '13800000000',
    avatar: '',
    advantage: '熟悉后端服务设计与高并发处理，具备独立负责核心模块的能力。',
  },
  work: [
    {
      id: 'w-1',
      company: '示例科技有限公司',
      role: '高级 Java 开发工程师',
      period: '2021.01 - 至今',
      responsibilities: [
        '负责核心业务模块的设计与开发',
        '参与系统性能优化与稳定性建设',
      ],
      achievements: [
        '主导某核心模块上线，支撑日常业务稳定运转',
      ],
    },
  ],
  projects: [
    {
      id: 'p-1',
      name: '示例项目：订单中心',
      role: '项目负责人',
      period: '2022.03 - 2022.09',
      description: '统一订单登记、状态流转与查询服务的示例项目描述（占位内容）。',
      responsibilities: [
        '设计统一订单模型与状态机',
        '实现支付回调的幂等处理',
      ],
      achievements: [
        '示例：订单中心稳定服务多个业务系统',
      ],
    },
  ],
  education: [
    {
      id: 'e-1',
      school: '示例大学',
      degree: '本科',
      major: '计算机科学与技术',
      period: '2014 - 2018',
    },
  ],
  skills: [
    'Java / Spring Boot',
    'MySQL / Redis',
    '消息队列 / 分布式',
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
