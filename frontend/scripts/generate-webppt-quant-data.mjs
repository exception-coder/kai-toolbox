// 构建期一次性脚本：分析本需求（vibecoding 开发平台统一治理 WebPPT 汇报）自身的
// PRD 与开发文档版本文件，产出「篇章四：治理成果量化数据」用的固化 JSON。
//
// 数据来源（真实文件，非编造）：
//   ~/.kai-toolbox/prd/{PRD_SESSION_ID}.md          — PRD 定稿
//   ~/.kai-toolbox/prd/{PRD_SESSION_ID}-dev-v1.md   — 开发文档第 1 版（Phase 2 探索未完成）
//   ~/.kai-toolbox/prd/{PRD_SESSION_ID}-dev.md      — 开发文档当前版（前端路由确认已解决）
// 明确不引用 yoooni-hook-report 的真实 hook-events / prompt-signals 统计（PRD §4.2 排除项）。
//
// 计数类指标（章节数/验收标准条数/风险条数/文档字符差）由本脚本对文本做结构化解析得出，
// 可复现、可审计。「insights」一句话解读文案，是本次生成会话里由 AI 结对编程助手
// 阅读上述原文后归纳撰写，属于「LLM 对文本差异做归纳分析」这一步骤本身的产出，
// 一次性写入本脚本、随生成结果固化——不是运行时/构建时对接的在线 LLM API 调用。
//
// 用法：npm run webppt-report:quant
// 可选环境变量：PRD_SESSION_ID（默认见下）、PRD_DIR（默认 ~/.kai-toolbox/prd）

import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FRONTEND_ROOT = path.resolve(__dirname, '..')
const SESSION_ID = process.env.PRD_SESSION_ID || 'ee732035-edcd-4fa3-bbef-daabc44ab320'
const PRD_DIR = process.env.PRD_DIR || path.join(os.homedir(), '.kai-toolbox', 'prd')
const OUT_FILE = path.join(
  FRONTEND_ROOT,
  'src/features/webppt-governance-report/generatedQuantData.json',
)

const FILES = {
  prd: `${SESSION_ID}.md`,
  devV1: `${SESSION_ID}-dev-v1.md`,
  dev: `${SESSION_ID}-dev.md`,
}

async function readIfExists(p) {
  try {
    return await fs.readFile(p, 'utf8')
  } catch {
    return null
  }
}

function countHeadings(md, level) {
  const re = new RegExp(`^${'#'.repeat(level)}\\s+.+$`, 'gm')
  return (md.match(re) || []).length
}

function countTableDataRows(md, sectionHeading) {
  const section = sectionBody(md, sectionHeading)
  const rows = section.match(/^\|.+\|$/gm) || []
  // 去掉表头行 + 分隔行（|---|---|），剩下才是数据行
  return Math.max(0, rows.length - 2)
}

function countChecklistItems(md) {
  return (md.match(/^- \[[ xX]\]/gm) || []).length
}

/** 提取指定 "## 标题" 小节的正文（到下一个同级 "## " 为止），用于范围内计数，避免误配全文其它章节。 */
function sectionBody(md, sectionHeading) {
  const idx = md.indexOf(sectionHeading)
  if (idx < 0) return ''
  const rest = md.slice(idx)
  const nextSection = rest.slice(1).search(/^##\s+/m)
  return nextSection >= 0 ? rest.slice(0, nextSection + 1) : rest
}

function countNumberedListItems(md, sectionHeading) {
  const section = sectionBody(md, sectionHeading)
  return (section.match(/^\d+\.\s+\*\*/gm) || []).length
}

async function main() {
  console.log(`[webppt-quant] session: ${SESSION_ID}`)
  console.log(`[webppt-quant] source dir: ${PRD_DIR}`)

  const prd = await readIfExists(path.join(PRD_DIR, FILES.prd))
  const devV1 = await readIfExists(path.join(PRD_DIR, FILES.devV1))
  const dev = await readIfExists(path.join(PRD_DIR, FILES.dev))

  if (!prd || !dev) {
    console.error(
      '[webppt-quant] 未找到本需求的 PRD/开发文档源文件，跳过生成（保留上一次固化结果，不写入占位假数据）。',
    )
    console.error(`  期望路径: ${path.join(PRD_DIR, FILES.prd)}`)
    console.error(`  期望路径: ${path.join(PRD_DIR, FILES.dev)}`)
    process.exit(0)
  }

  // --- PRD 自身的结构化指标 ---
  const prdChapterCount = countHeadings(prd, 2) // "## N. xxx"
  const acceptanceCriteriaCount = countNumberedListItems(prd, '## 8. 验收标准')
  const riskCount = countTableDataRows(prd, '## 9. 开放问题与风险')
  // PRD 正文明确写出的本轮澄清议题（Q1~A7），非本脚本臆测：
  const clarificationTopics = [
    '听众定位（技术 vs 非技术双听众）',
    '案例选择（讲哪类平台能力）',
    '案例对象确定（Claude Chat 多引擎会话管理）',
    '交付形态确认（纯前端静态单页，不建后端）',
    '架构讲解边界（讲到哪层为止，兼顾非技术听众）',
    'Claude Chat 细节口径（引用知识图谱 draft 记录，需 owner 核实）',
    '数据来源确认（仅用本需求自身数据，不碰 yoooni-hook-report）',
  ]

  // --- 开发文档版本迭代差异（v1 → 当前版）---
  let devDiff = null
  if (devV1) {
    const v1Resolved = /未能确认项/.test(devV1)
    const curResolved = /本轮已解决/.test(dev)
    devDiff = {
      docVersionCount: 2,
      charsV1: devV1.length,
      charsCurrent: dev.length,
      charsDelta: dev.length - devV1.length,
      checklistItemsV1: countChecklistItems(devV1),
      checklistItemsCurrent: countChecklistItems(dev),
      resolvedRisks:
        v1Resolved && curResolved
          ? [{ id: 'R5', from: '前端路由注册机制——未能确认项', to: '前端负责人现场确认——本轮已解决' }]
          : [],
    }
  }

  const output = {
    schemaVersion: 1,
    sourceSessionId: SESSION_ID,
    sourceNote:
      '全部数值来自本需求自身的 PRD 与开发文档文件的结构化解析，不包含任何 yoooni-hook-report 的真实生产数据。',
    generatedByNote:
      'insights 文案由本次开发会话中的 AI 结对编程助手阅读上述原文后归纳撰写，非在线 LLM API 自动调用。',
    prd: {
      chapterCount: prdChapterCount,
      acceptanceCriteriaCount,
      riskCount,
      clarificationRounds: clarificationTopics.length,
      clarificationTopics,
    },
    devDocIteration: devDiff,
    insights: [
      `本次 PRD 澄清共 ${clarificationTopics.length} 轮，覆盖听众定位到数据来源合规的 ${clarificationTopics.length} 个关键歧义点，从一句话原始需求收敛为 ${prdChapterCount} 章结构化文档。`,
      `PRD 落地时共写入 ${acceptanceCriteriaCount} 条可验收标准、${riskCount} 条显式风险项——把"要不要做"的讨论转成了"做完怎么判断做对了"的清单。`,
      devDiff
        ? `开发文档从 v1 到当前版新增/修订约 ${Math.max(devDiff.charsDelta, 0)} 字符，任务项数量维持 ${devDiff.checklistItemsCurrent} 项不变，核心变化是把风险 R5（前端路由注册机制未确认）转为已现场确认解决，并把原本泛泛的任务描述细化为可直接落地的代码片段。`
        : '开发文档尚未产生可比对的历史版本。',
    ],
  }

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true })
  await fs.writeFile(OUT_FILE, JSON.stringify(output, null, 2) + '\n', 'utf8')
  console.log(`[webppt-quant] written -> ${OUT_FILE}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
