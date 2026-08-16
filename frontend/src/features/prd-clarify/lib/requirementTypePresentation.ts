import { Bug, Sparkles, Wrench } from 'lucide-react'
import type { PrdReqType } from '../types'

export const REQ_TYPE_CONFIG: Record<PrdReqType, {
  label: string
  icon: typeof Bug
  desc: string
  color: string
  bg: string
  defaultMaxQuestions: number
}> = {
  BUG_FIX: {
    label: 'Bug 修复',
    icon: Bug,
    desc: '复现步骤 + 期望/实际行为落差，通常 1-2 轮就够',
    color: 'text-red-500',
    bg: 'bg-red-500/10 border-red-500/30',
    defaultMaxQuestions: 2,
  },
  MODULE_ADJUST: {
    label: '模块调整',
    icon: Wrench,
    desc: '调整现有功能，问现状/目标/兼容性',
    color: 'text-amber-500',
    bg: 'bg-amber-500/10 border-amber-500/30',
    defaultMaxQuestions: 5,
  },
  NEW_MODULE: {
    label: '新增模块',
    icon: Sparkles,
    desc: '全新功能，问业务目标/场景/边界/验收标准',
    color: 'text-purple-500',
    bg: 'bg-purple-500/10 border-purple-500/30',
    defaultMaxQuestions: 8,
  },
}
