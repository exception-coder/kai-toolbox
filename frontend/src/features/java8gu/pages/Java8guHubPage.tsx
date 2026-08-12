import { useEffect, useMemo, useState } from 'react'
import { marked } from 'marked'
import { BrainCircuit, LoaderCircle, RotateCcw, ShieldCheck } from 'lucide-react'
import { InterviewAssistant } from '../components/InterviewAssistant'
import { KnowledgePlayer, type LearningRating, type LearningRecord } from '../components/KnowledgePlayer'
import { LearningMapPanel } from '../components/LearningMapPanel'
import {
  loadKnowledgeDetail,
  loadKnowledgeRelations,
  loadKnowledgeTree,
  type KnowledgeDetail,
  type KnowledgeRelation,
  type KnowledgeTreeNode,
} from '../api/knowledgeApi'
import {
  buildRecommendedTree,
  DEFAULT_LEARNING_PROFILE,
  getExperienceOption,
  getRoleOption,
  isLearningProfile,
  type LearningProfile,
} from '../lib/learningProfile'
import '../styles/java8gu.css'

const LEARNING_STATE_KEY = 'java8gu:learning-state:v1'
const LAST_NODE_KEY = 'java8gu:last-node:v1'
const LEARNING_PROFILE_KEY = 'java8gu:learning-profile:v1'

export function Java8guHubPage() {
  const [tree, setTree] = useState<KnowledgeTreeNode[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<KnowledgeDetail | null>(null)
  const [relations, setRelations] = useState<KnowledgeRelation[]>([])
  const [search, setSearch] = useState('')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [records, setRecords] = useState<Record<string, LearningRecord>>(loadLearningRecords)
  const [profile, setProfile] = useState<LearningProfile>(loadLearningProfile)
  const [error, setError] = useState<string | null>(null)
  const [loadVersion, setLoadVersion] = useState(0)

  useEffect(() => {
    loadKnowledgeTree()
      .then(nodes => {
        setTree(nodes)
        const readable = flattenReadableNodes(nodes)
        const recommended = flattenReadableNodes(buildRecommendedTree(nodes, profile))
        const candidates = recommended.length > 0 ? recommended : readable
        const lastNodeId = readLastNodeId()
        const initial = candidates.find(node => node.id === lastNodeId) ?? recommendNode(candidates, records)
        if (initial) setSelectedId(initial.id)
      })
      .catch(reason => setError(reason instanceof Error ? reason.message : String(reason)))
  }, [])

  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    setDetail(null)
    setError(null)
    writeLastNodeId(selectedId)
    Promise.all([loadKnowledgeDetail(selectedId), loadKnowledgeRelations(selectedId)])
      .then(([nextDetail, nextRelations]) => {
        if (cancelled) return
        setDetail(nextDetail)
        setRelations(nextRelations)
      })
      .catch(reason => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason))
      })
    return () => {
      cancelled = true
    }
  }, [selectedId, loadVersion])

  const readableNodes = useMemo(() => flattenReadableNodes(tree), [tree])
  const recommendedTree = useMemo(() => buildRecommendedTree(tree, profile), [tree, profile])
  const recommendedNodes = useMemo(() => flattenReadableNodes(recommendedTree), [recommendedTree])
  const learningNodes = recommendedNodes.length > 0 ? recommendedNodes : readableNodes
  const normalizedSearch = search.trim().toLowerCase()
  const filteredRecommendedTree = useMemo(
    () => filterTree(recommendedTree, normalizedSearch),
    [recommendedTree, normalizedSearch],
  )
  const filteredAllTree = useMemo(() => filterTree(tree, normalizedSearch), [tree, normalizedSearch])
  const tokens = useMemo(() => marked.lexer(detail?.node.content ?? '', { gfm: true }), [detail])
  const currentAnswer = selectedId ? answers[selectedId] ?? '' : ''
  const currentRating = selectedId ? records[selectedId]?.rating : undefined
  const masteredCount = learningNodes.filter(node => records[node.id]?.rating === 'mastered').length
  const progress = learningNodes.length === 0 ? 0 : Math.round((masteredCount / learningNodes.length) * 100)
  const experience = getExperienceOption(profile.experience)
  const role = getRoleOption(profile.role)

  function selectNode(nodeId: string) {
    setSelectedId(nodeId)
  }

  function continueLearning() {
    const recommended = recommendNode(learningNodes, records, selectedId)
    if (recommended) selectNode(recommended.id)
  }

  function goNext() {
    const learningNodeIds = new Set(learningNodes.map(node => node.id))
    const related = relations.find(relation => (
      relation.node.id !== selectedId && learningNodeIds.has(relation.node.id)
    ))
    if (related) {
      selectNode(related.node.id)
      return
    }
    continueLearning()
  }

  function rateCurrent(rating: LearningRating) {
    if (!selectedId) return
    const next = {
      ...records,
      [selectedId]: { rating, updatedAt: new Date().toISOString() },
    }
    setRecords(next)
    persistLearningRecords(next)
  }

  function changeProfile(nextProfile: LearningProfile) {
    setProfile(nextProfile)
    persistLearningProfile(nextProfile)
    const nextNodes = flattenReadableNodes(buildRecommendedTree(tree, nextProfile))
    if (nextNodes.length > 0 && !nextNodes.some(node => node.id === selectedId)) {
      const recommended = recommendNode(nextNodes, records)
      if (recommended) selectNode(recommended.id)
    }
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-[var(--color-background)] xl:flex xl:h-[calc(100vh-3.5rem)] xl:flex-col xl:overflow-hidden">
      <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)]/70 bg-[var(--color-card)]/75 px-4 py-3 backdrop-blur sm:px-5">
        <div>
          <h1 className="flex items-center gap-2 text-base font-semibold sm:text-lg">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
              <BrainCircuit className="h-4 w-4" />
            </span>
            Java8 Knowledge Player
          </h1>
          <p className="mt-0.5 text-[11px] text-[var(--color-muted-foreground)] sm:ml-10">Recall · 面试表达 · 工程实践 · 关联续学</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-full border bg-[var(--color-background)] px-3 py-1.5 text-xs sm:flex">
            <span className="text-[var(--color-muted-foreground)]">画像掌握</span>
            <span className="font-semibold tabular-nums">{progress}%</span>
            <span className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--color-muted)]">
              <span className="block h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${progress}%` }} />
            </span>
          </div>
          <div className="hidden rounded-full border px-2.5 py-1.5 text-[11px] text-[var(--color-muted-foreground)] lg:block">
            {experience.label} · {role.label}
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] text-[var(--color-muted-foreground)]">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />本地学习状态
          </div>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[288px_minmax(0,1fr)_320px]">
        <LearningMapPanel
          nodes={tree}
          recommendedNodes={recommendedTree}
          filteredRecommendedNodes={filteredRecommendedTree}
          filteredAllNodes={filteredAllTree}
          selectedId={selectedId}
          records={records}
          profile={profile}
          search={search}
          onProfileChange={changeProfile}
          onSearchChange={setSearch}
          onSelect={node => selectNode(node.id)}
          onContinue={continueLearning}
        />

        <main className="min-h-0 bg-[var(--color-muted)]/[0.12] xl:overflow-y-auto">
          {error && (
            <div className="m-6 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
              <div>加载失败：{error}</div>
              <button type="button" onClick={() => setLoadVersion(version => version + 1)} className="mt-2 inline-flex items-center gap-1 font-semibold hover:underline">
                <RotateCcw className="h-3.5 w-3.5" />重试
              </button>
            </div>
          )}
          {!error && !detail && (
            <div className="flex h-64 items-center justify-center text-sm text-[var(--color-muted-foreground)]">
              <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />正在准备下一张知识卡
            </div>
          )}
          {detail && (
            <KnowledgePlayer
              detail={detail}
              tokens={tokens}
              relations={relations}
              answer={currentAnswer}
              rating={currentRating}
              onAnswerChange={value => selectedId && setAnswers(previous => ({ ...previous, [selectedId]: value }))}
              onSelectRelation={selectNode}
              onNext={goNext}
            />
          )}
        </main>

        <div className="min-h-0 border-l border-[var(--color-border)]/70 bg-[var(--color-card)] p-5 xl:overflow-y-auto">
          <InterviewAssistant
            interviews={detail?.interviews ?? []}
            relations={relations}
            answer={currentAnswer}
            rating={currentRating}
            onRate={rateCurrent}
            onSelectRelation={selectNode}
          />
        </div>
      </div>
    </div>
  )
}

function loadLearningRecords(): Record<string, LearningRecord> {
  try {
    const raw = window.localStorage.getItem(LEARNING_STATE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, LearningRecord>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function persistLearningRecords(records: Record<string, LearningRecord>) {
  try {
    window.localStorage.setItem(LEARNING_STATE_KEY, JSON.stringify(records))
  } catch {
    // Browser storage is optional; the current session state remains usable.
  }
}

function loadLearningProfile(): LearningProfile {
  try {
    const raw = window.localStorage.getItem(LEARNING_PROFILE_KEY)
    if (!raw) return DEFAULT_LEARNING_PROFILE
    const parsed: unknown = JSON.parse(raw)
    return isLearningProfile(parsed) ? parsed : DEFAULT_LEARNING_PROFILE
  } catch {
    return DEFAULT_LEARNING_PROFILE
  }
}

function persistLearningProfile(profile: LearningProfile) {
  try {
    window.localStorage.setItem(LEARNING_PROFILE_KEY, JSON.stringify(profile))
  } catch {
    // Profile persistence is optional; filtering remains available for the current session.
  }
}

function readLastNodeId(): string | null {
  try {
    return window.localStorage.getItem(LAST_NODE_KEY)
  } catch {
    return null
  }
}

function writeLastNodeId(nodeId: string) {
  try {
    window.localStorage.setItem(LAST_NODE_KEY, nodeId)
  } catch {
    // Resume is a convenience only; node loading must not depend on storage.
  }
}

function recommendNode(
  nodes: KnowledgeTreeNode[],
  records: Record<string, LearningRecord>,
  excludedId?: string | null,
): KnowledgeTreeNode | null {
  const candidates = nodes.filter(node => node.id !== excludedId)
  const priority: Record<LearningRating | 'new', number> = { weak: 0, fuzzy: 1, new: 2, mastered: 3 }
  return [...candidates].sort((left, right) => {
    const leftRating = records[left.id]?.rating ?? 'new'
    const rightRating = records[right.id]?.rating ?? 'new'
    return priority[leftRating] - priority[rightRating] || left.id.localeCompare(right.id)
  })[0] ?? null
}

function flattenReadableNodes(nodes: KnowledgeTreeNode[]): KnowledgeTreeNode[] {
  return nodes.flatMap(node => [
    ...(node.nodeType === 'CATEGORY' ? [] : [node]),
    ...flattenReadableNodes(node.children),
  ])
}

function filterTree(nodes: KnowledgeTreeNode[], keyword: string): KnowledgeTreeNode[] {
  if (!keyword) return nodes
  return nodes.flatMap(node => {
    const children = filterTree(node.children, keyword)
    return node.title.toLowerCase().includes(keyword) || children.length > 0 ? [{ ...node, children }] : []
  })
}
