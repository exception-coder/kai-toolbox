import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  autoRegisterToReqPool,
  createSession,
  deleteSession,
  getContent,
  getSession,
  linkPrdToReqItem,
  listSessions,
  returnToClarify,
  saveQaHistory,
  startClarifyFromDraft,
  startGenerate,
  updateSessionProject,
  updateSessionTitle,
  type QaPair,
} from '../api'
import type {
  CreateSessionRequest,
  DocumentProfile,
  PrdClarifyMode,
  PrdReqType,
  PrdSessionView,
  PrdStep,
  QuestionItem,
} from '../types'
import { navigateWithLaunchIntent } from '@/shell/launch-intent/api'
import { REQ_TYPE_CONFIG } from '../lib/requirementTypePresentation'
import type { ClarifyEngine } from '../components/dialogs/StartClarifyDialog'

export function usePrdClarifySession() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [step, setStep] = useState<PrdStep>('INPUT')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionTitle, setSessionTitle] = useState('')
  const [streamText, setStreamText] = useState('')
  const [prdContent, setPrdContent] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [generationFailed, setGenerationFailed] = useState(false)  // GENERATING 失败，留在当前步骤显示重试
  const [showClarifyHistory, setShowClarifyHistory] = useState(false) // 查看澄清记录抽屉
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false)   // 移动端 PRD 库抽屉（桌面端常驻，无此状态）
  const abortRef = useRef<(() => void) | null>(null)
  // GENERATING 阶段用 ref 积累全文，done 时一次性赋值（避免双重 setState）
  const prdAccRef = useRef('')
  // 从 ChattingPanel 拿到的完整 QA history，用于 generate 时读取
  const qaHistoryRef = useRef<QaPair[]>([])
  // 来自需求管理池时，记录来源标题，用于顶部上下文条
  const [reqContextTitle, setReqContextTitle] = useState<string | null>(null)
  // 防止自动启动多次执行
  const autoStartedRef = useRef(false)
  /**
   * reqItemId 持久化到 ref：URL 参数被 setSearchParams({}) 清除后，
   * 闭包里的 urlReqItemId 会变 ''，导致 startGenerateSse 里的判断失效。
   * 用 ref 在 URL 清除前锁住值，整个会话周期内有效。
   */
  const reqItemIdRef = useRef('')
  /** 正在发起修订的原始会话（显示 ReviseDialog） */
  const [revisingSesion, setRevisingSession] = useState<PrdSessionView | null>(null)
  /** 修订请求提交后、正式会话创建前的即时反馈状态 */
  const [revisionPreparing, setRevisionPreparing] = useState<{
    engine: ClarifyEngine
    stage: 'reading' | 'creating'
  } | null>(null)
  /** 正在做「AI 需求拆分」的会话 id（显示 SplitReviewDialog），null 表示弹框未打开 */
  const [splittingSessionId, setSplittingSessionId] = useState<string | null>(null)

  // 读取 URL 参数
  const urlTitle = searchParams.get('title') ?? ''
  const urlRawInput = searchParams.get('rawInput') ?? ''
  const urlProject = searchParams.get('project') ?? ''
  const urlModule = searchParams.get('module') ?? ''
  /** 从交付中心创建后直接锁定的 PRD 澄清会话。 */
  const urlSessionId = searchParams.get('sessionId') ?? ''
  /** 来自需求管理池的回写 ID（读取一次，后续用 reqItemIdRef） */
  const urlReqItemId = searchParams.get('reqItemId') ?? ''
  /** 直接查看某个历史 PRD 会话（来自需求管理池「查看PRD」按钮） */
  const urlViewSession = searchParams.get('viewSession') ?? ''
  const [autoStartPending, setAutoStartPending] = useState(false)

  // 来自需求管理池（有 reqItemId + 内容）：自动建会话、跳过 INPUT 直接开始澄清
  // 用 ref 保证只执行一次，不因其他 state 变化重触
  useEffect(() => {
    if (autoStartedRef.current) return
    if (!urlReqItemId || !urlTitle || !urlRawInput) return
    autoStartedRef.current = true
    reqItemIdRef.current = urlReqItemId  // ★ 在 URL 清除前锁住 reqItemId
    setReqContextTitle(urlTitle)
    setAutoStartPending(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])  // 只在 mount 时执行一次

  const handleAutoStartConfirm = (
    reqType: PrdReqType | undefined,
    maxQuestions: number | undefined,
    clarifyMode: PrdClarifyMode,
    engine: ClarifyEngine,
  ) => {
    setAutoStartPending(false)
    createMut.mutateAsync({
      title: urlTitle,
      rawInput: urlRawInput,
      project: urlProject,
      module: urlModule,
      role: 'PRODUCT',
      reqType,
      maxQuestions,
      clarifyMode,
      engine,
    })
      .then((created) => {
        setSessionId(created.id)
        // 直接用创建返回值预热 session 缓存（含正确的 maxQuestions），避免 ChattingPanel
        // 挂载时进度条先闪一下默认值再纠正——created 本身就是权威数据，没必要等一次多余的 refetch。
        qc.setQueryData(['prd-session', created.id], created)
        setSessionTitle(urlTitle)
        setSearchParams({}, { replace: true })  // URL 清除，但 reqItemIdRef 已保存
        qc.invalidateQueries({ queryKey: ['prd-sessions'] })
        setStep('CHATTING')
      })
      .catch(() => {
        autoStartedRef.current = false  // 创建失败可重试
        setErrorMsg('会话创建失败，请重试')
      })
  }

  // 交付中心已经创建了正式会话，这里只加载并锁定，不再重复创建。
  useEffect(() => {
    if (!urlSessionId) return
    setSearchParams({}, { replace: true })
    setSessionId(urlSessionId)
    setStep('CHATTING')
    qc.fetchQuery({
      queryKey: ['prd-session', urlSessionId],
      queryFn: () => getSession(urlSessionId),
    })
      .then((loaded) => {
        setSessionTitle(loaded.title)
      })
      .catch(() => {
        setSessionId(null)
        setErrorMsg('目标 PRD 会话不存在或无法访问')
        setStep('INPUT')
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSessionId])

  // viewSession 参数：直接拉取会话内容并跳转到编辑器
  useEffect(() => {
    if (!urlViewSession) return
    setSearchParams({}, { replace: true })
    setSessionId(urlViewSession)
    getContent(urlViewSession)
      .then((content) => {
        setPrdContent(content ?? '')
        setStep('EDITING')
      })
      .catch(() => {
        setErrorMsg('读取 PRD 文件失败')
        setStep('INPUT')
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlViewSession])

  // 当前会话详情
  const { data: session } = useQuery({
    queryKey: ['prd-session', sessionId],
    queryFn: () => getSession(sessionId!),
    enabled: !!sessionId && step !== 'EDITING',
    refetchInterval: false,
  })

  // 历史列表
  const { data: sessions = [] } = useQuery({
    queryKey: ['prd-sessions'],
    queryFn: listSessions,
  })

  // 创建会话 mutation
  const createMut = useMutation({ mutationFn: createSession })

  // 草稿转正式发起澄清：原地更新已存在的 DRAFT 会话，不新插入一条记录
  const startFromDraftMut = useMutation({
    mutationFn: ({ id, req }: { id: string; req: CreateSessionRequest }) => startClarifyFromDraft(id, req),
  })

  // 删除 mutation
  const deleteMut = useMutation({
    mutationFn: deleteSession,
    onSuccess: (_data, deletedId) => {
      qc.invalidateQueries({ queryKey: ['prd-sessions'] })
      // 只有删的是当前激活的会话才 reset，避免删历史条目时中断正在进行的工作
      if (sessionId === deletedId) {
        handleReset()
      }
    },
  })

  // 重命名标题 mutation：历史列表里的需求标题原来不支持编辑，补上
  const renameMut = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => updateSessionTitle(id, title),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['prd-sessions'] })
      // 改的正好是当前激活会话时，同步刷新详情缓存和顶部使用的 sessionTitle
      if (sessionId === id) {
        qc.invalidateQueries({ queryKey: ['prd-session', id] })
        setSessionTitle(_data.title)
      }
    },
  })

  // 修改根 PRD 分组；后端会同步整棵拆分/修订子树，成功后刷新列表与当前详情。
  const changeGroupMut = useMutation({
    mutationFn: ({ id, project }: { id: string; project: string }) => updateSessionProject(id, project),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['prd-sessions'] })
      if (sessionId === id) {
        qc.invalidateQueries({ queryKey: ['prd-session', id] })
      }
    },
    onError: () => setErrorMsg('修改 PRD 分组失败，请重试'),
  })

  const handleReset = () => {
    abortRef.current?.()
    abortRef.current = null
    setStep('INPUT')
    setSessionId(null)
    setStreamText('')
    setPrdContent('')
    setErrorMsg(null)
    setGenerationFailed(false)
    setReqContextTitle(null)
    setRevisionPreparing(null)
    setRevisingSession(null)
    autoStartedRef.current = false
    reqItemIdRef.current = ''
  }

  /** 返回填写需求页并回填当前会话内容；再次提交时创建新会话，旧记录保持不变。 */
  const handleBackToInput = () => {
    abortRef.current?.()
    abortRef.current = null
    prdAccRef.current = ''
    setStreamText('')
    setErrorMsg(null)
    setGenerationFailed(false)
    setRevisionPreparing(null)
    setStep('INPUT')
  }

  /**
   * 基于已有 PRD 生成修订版：
   * 1. 读取原版 PRD 内容
   * 2. 创建新会话，rawInput = [原PRD内容 + 修订说明]，title 加版本标记
   * 3. 直接进入 CHATTING（跳过 INPUT 表单）
   */
  const handleReviseConfirm = async (originalSession: PrdSessionView, changeDesc: string, engine: ClarifyEngine) => {
    setRevisingSession(null)
    setErrorMsg(null)
    setSessionId(null)
    setStreamText('')
    setPrdContent('')
    setSessionTitle(`${originalSession.title}（修订版）`)
    setReqContextTitle(`修订自：${originalSession.title}`)
    setRevisionPreparing({ engine, stage: 'reading' })
    setStep('CHATTING')
    try {
      // 读取原版 PRD 内容
      const prdText = await getContent(originalSession.id)
      setRevisionPreparing({ engine, stage: 'creating' })
      const revisionRawInput = [
        `【修订版 PRD — 基于原版：${originalSession.title}】`,
        '',
        '=== 原版 PRD 内容 ===',
        prdText || '（原版内容读取失败）',
        '=== 本次修订说明 ===',
        changeDesc.trim() || '（未填写修订说明，请在澄清对话中补充）',
      ].join('\n')

      const newTitle = `${originalSession.title}（修订版）`
      const created = await createMut.mutateAsync({
        title: newTitle,
        rawInput: revisionRawInput,
        project: originalSession.project ?? '',
        module: originalSession.module ?? '',
        engine,
        role: (originalSession.role as 'PRODUCT' | 'BUSINESS') ?? 'PRODUCT',
        parentId: originalSession.id,
        documentProfile: originalSession.documentProfile,
      })
      setSessionId(created.id)
      qc.setQueryData(['prd-session', created.id], created)
      setSessionTitle(newTitle)
      setReqContextTitle(`修订自：${originalSession.title}`)
      qc.invalidateQueries({ queryKey: ['prd-sessions'] })
      setRevisionPreparing(null)
      setStep('CHATTING')
    } catch {
      setRevisionPreparing(null)
      setStep('INPUT')
      setErrorMsg('创建修订版会话失败，请重试')
    }
  }

  /**
   * Step INPUT → 创建会话 → 进入多轮对话澄清。
   *
   * reqType/maxQuestions 不传时（业务员角色，弹框里不问技术分类和轮数）故意不给默认值——
   * 让请求体里这两个字段真正缺失，后端据此触发 LLM 自动判定（而不是静默按 NEW_MODULE
   * 处理，那样等于假装"判断"了，其实只是抄了个默认值）。
   */
  const handleStart = async (
    title: string, rawInput: string, project: string, module: string,
    role: 'PRODUCT' | 'BUSINESS' = 'PRODUCT', reqType?: PrdReqType, maxQuestions?: number,
    clarifyMode?: PrdClarifyMode, draftId?: string, engine: ClarifyEngine = 'claude',
    documentProfile: DocumentProfile = 'CLASSIC',
  ) => {
    setErrorMsg(null)
    setSessionTitle(title)
    setSearchParams({}, { replace: true })
    const req = { title, rawInput, project, module, role, reqType, maxQuestions, clarifyMode, engine, documentProfile }
    // draftId 非空：从草稿恢复后点「开始澄清」，原地转正式，不新建一条记录
    const created = draftId
      ? await startFromDraftMut.mutateAsync({ id: draftId, req })
      : await createMut.mutateAsync(req)
    setSessionId(created.id)
    qc.setQueryData(['prd-session', created.id], created)
    setStreamText('')
    qc.invalidateQueries({ queryKey: ['prd-sessions'] })
    setStep('CHATTING')   // 直接进入对话澄清（ChattingPanel 挂载后自动开始第一题）
  }

  /**
   * Vibe Coding 模式澄清：创建会话后，通过持久化 LaunchIntent 跳转 claude-chat。
   * 所选引擎在 Vibe Coding 完整 UI 中执行平台统一的需求澄清流程（工具调用完全可见），
   * 澄清完成后写入 PRD 文件，用户返回时触发 check-prd-file 更新状态。
   */
  const handleStartVibe = async (
    title: string, rawInput: string, project: string, module: string,
    role: 'PRODUCT' | 'BUSINESS' = 'PRODUCT', reqType?: PrdReqType, maxQuestions?: number,
    draftId?: string, engine: ClarifyEngine = 'claude', documentProfile: DocumentProfile = 'CLASSIC',
  ) => {
    setErrorMsg(null)
    setSessionTitle(title)
    setSearchParams({}, { replace: true })

    // 创建会话（用于记录 prd_session_id，PRD 文件路径由此确定）；draftId 非空时原地转正式
    const req = { title, rawInput, project, module, role, reqType, maxQuestions, engine, documentProfile }
    const created = draftId
      ? await startFromDraftMut.mutateAsync({ id: draftId, req })
      : await createMut.mutateAsync(req)
    setSessionId(created.id)
    qc.invalidateQueries({ queryKey: ['prd-sessions'] })

    // 查询项目 cwd。关联项目支持多选（逗号/顿号分隔），但 Vibe Coding 会话只能打开一个
    // 工作目录，取第一个项目作为主项目来解析 cwd。
    let cwd = ''
    const primaryProject = project.split(/[,，、]/)[0]?.trim() ?? ''
    if (primaryProject) {
      try {
        const res = await fetch('/api/claude-chat/workspaces', {
          headers: { Authorization: `Bearer ${localStorage.getItem('toolbox.auth.token') ?? ''}` },
        })
        if (res.ok) {
          const data = await res.json() as { roots: Array<{ exists: boolean; dirs: Array<{ name: string; path: string }> }> }
          for (const root of data.roots ?? []) {
            const found = root.dirs?.find(d => d.name === primaryProject)
            if (found) { cwd = found.path; break }
          }
        }
      } catch { /* cwd 解析失败时留空 */ }
    }

    // 构建 seed 消息：平台无关的需求澄清流程 + 指示写 PRD 文件。
    // reqType/maxQuestions 一律读 created（后端返回的最终解析结果）而非入参本身——
    // 业务员角色没传这两个字段，入参是 undefined，此时已由后端 LLM 自动判定并写回 created。
    const prdPath = `~/.kai-toolbox/prd/${created.id}.md`
    const roleDesc = role === 'BUSINESS' ? '业务人员视角（聚焦业务价值，不讲技术细节）' : '产品/开发视角（可问技术约束、边界条件）'
    const resolvedReqType = created.reqType
    const resolvedMaxQuestions = created.maxQuestions
    const reqTypeLabel = REQ_TYPE_CONFIG[resolvedReqType].label
    // Bug 修复走极简问题清单 + 缺陷修复说明结构；模块调整/新增模块走标准 PRD 9 节结构
    const docGuide = documentProfile === 'SPEC_DRIVEN'
      ? '产出核心规格：目标、范围、需求、规则、场景、验收、约束、决策和开放问题；为条目分配 GOAL/REQ/RULE/SCN/AC/CONSTRAINT/DECISION/OPEN 稳定 ID，验收标准显式引用对应规格 ID'
      : resolvedReqType === 'BUG_FIX'
      ? '只问复现步骤、期望-实际行为落差、影响范围，不问业务目标/使用场景；产出「缺陷修复说明」（问题描述/复现步骤/根因/修复方案/影响范围/验收标准），不是标准 PRD'
      : '产出标准 PRD（文档概述/业务背景/目标用户/功能范围/功能需求/非功能需求/数据模型/验收标准/开放问题共 9 节）'
    const seed = `本次任务：执行需求发现、代码背景调研、逐轮澄清并生成需求文档。
本流程适用于当前所选引擎，不得调用或假设存在某个引擎专属的命令、skill 或 plugin。

[项目信息]
标题：${title}
项目：${project || '未指定'}
模块：${module || '未指定'}
澄清视角：${roleDesc}
需求类型：${reqTypeLabel}（${docGuide}）${reqType ? '' : '（由系统自动判定）'}
文档模式：${documentProfile === 'SPEC_DRIVEN' ? '规格驱动（核心规格 → 执行计划 → 证据评估）' : '经典（PRD → TDD → 进度评估）'}

[原始需求]
${rawInput}

[执行要求]
1. 了解现有系统，两类知识来源分开处理：
   a. 业务语义（domain-knowledge / cross-topology）：通过 MCP 工具查询（mcp__domain-knowledge__search_knowledge、
      mcp__cross-topology__search_knowledge，若可用）
   b. 代码知识图谱（graphify）：不使用 MCP，直接用 Bash 执行 CLI —— 先判断当前目录是否为多项目容器：
      - 检查当前工作目录下是否存在 graphify-out/graph.json；若存在，直接在当前目录执行
        graphify query "<问题>"
      - 若不存在，说明当前目录是聚合了多个子项目的容器目录，改为列出一级子目录，找到其中
        含 graphify-out/graph.json 的子项目（可结合上面的"模块"信息定位到具体子项目），
        cd 进该子项目目录后再执行 graphify query "<问题>"
      - 两种情况都找不到图谱时，跳过这一步，直接基于原始需求澄清即可，不要虚构图谱内容
2. 基于以上背景进行多轮需求澄清对话（引用真实代码实体提问，最多 ${resolvedMaxQuestions} 轮；
   信息已足够时提前结束，不要为了凑轮数硬问）
3. 澄清完成后，按需求类型对应的文档结构生成完整文档（见上方"需求类型"括号说明），并写入文件：
   ${prdPath}
4. 写入成功后输出：PRD_SAVED: ${created.id}

PRD_SESSION_ID: ${created.id}`

    await navigateWithLaunchIntent(navigate, '/tools/claude-chat', {
      type: 'CHAT_OPEN_AND_SEND',
      cwd,
      seed,
      prdSessionId: created.id,
      engine,
    })
  }

  /**
   * 启动 PRD 生成 SSE，可复用于初次生成和重试。
   * 不改变 step（调用方负责设置 GENERATING）。
   */
  const startGenerateSse = (sid: string) => {
    setGenerationFailed(false)
    setStreamText('')
    prdAccRef.current = ''

    const abort = startGenerate(sid, {
      onEvent(name, data) {
        if (name === 'chunk') {
          const chunk = (data as { content: string }).content ?? ''
          prdAccRef.current += chunk
          setStreamText((t) => t + chunk)
        }
        if (name === 'done') {
          setPrdContent(prdAccRef.current)
          qc.invalidateQueries({ queryKey: ['prd-sessions'] })

          // 使用 ref 而非 urlReqItemId（URL 已被 setSearchParams({}) 清除，闭包值会是 ''）
          const savedReqItemId = reqItemIdRef.current

          if (savedReqItemId) {
            // 来自需求管理池：回写 PRD_READY 状态
            linkPrdToReqItem(savedReqItemId, sid)
              .then(() => setErrorMsg(null))
              .catch(() => setErrorMsg('PRD 已生成，但同步到需求管理池失败，请在需求池手动更新状态'))
          } else {
            // 独立创建的 PRD：自动在需求管理池注册
            getSession(sid)
              .then(s => autoRegisterToReqPool({
                title: s.title,
                project: s.project ?? '',
                module: s.module ?? '',
                prdSessionId: sid,
              }))
              .then(() => {
                qc.invalidateQueries({ queryKey: ['reqpool'] })
              })
              .catch(() => setErrorMsg('PRD 已生成，但自动登记到需求管理池失败（可手动到需求池查看）'))
          }
          setStep('EDITING')
        }
        if (name === 'error') {
          const d = data as { message: string }
          setErrorMsg(d.message ?? 'PRD 生成失败，可点击重试')
          // 不改 step！保持 GENERATING 步骤，显示重试按钮
          setGenerationFailed(true)
        }
      },
      onError() {
        setErrorMsg('SSE 连接失败，请点击重试')
        setGenerationFailed(true)
      },
    })
    abortRef.current = abort
  }

  /**
   * ChattingPanel 完成所有轮次后回调。
   * 1. 保存问答历史到数据库
   * 2. 启动 SSE 生成 PRD
   */
  const handleChattingDone = async (history: QaPair[]) => {
    if (!sessionId) return
    setErrorMsg(null)
    setGenerationFailed(false)
    qaHistoryRef.current = history

    try {
      await saveQaHistory(sessionId, history)
    } catch {
      // 保存失败不阻断流程
    }

    setStep('GENERATING')
    startGenerateSse(sessionId)
  }

  /** 重试 PRD 生成（超时/失败后用户点击重试） */
  const handleRetryGenerate = () => {
    if (!sessionId) return
    setErrorMsg(null)
    startGenerateSse(sessionId)
  }

  /** 保留当前 PRD 文件，把生命周期恢复到澄清阶段并继续原会话。 */
  const handleReturnToClarify = async () => {
    if (!sessionId) return
    abortRef.current?.()
    abortRef.current = null
    const restored = await returnToClarify(sessionId)
    qc.setQueryData(['prd-session', sessionId], restored)
    qc.invalidateQueries({ queryKey: ['prd-sessions'] })
    qaHistoryRef.current = restored.questions
      .filter((question) => question.answer?.trim())
      .map((question) => ({ question: question.question, answer: question.answer }))
    setStreamText('')
    setErrorMsg(null)
    setGenerationFailed(false)
    setStep('CHATTING')
  }

  /** 从历史记录恢复会话（_openDevDoc=true 时自动打开开发文档分栏） */
  const handleSelectHistory = (s: PrdSessionView & { _openDevDoc?: boolean; _regenDevDoc?: boolean }) => {
    abortRef.current?.()
    abortRef.current = null
    setSessionId(s.id)
    // 历史列表条目本身就是完整的 PrdSessionView（含正确的 maxQuestions），预热缓存跟
    // handleStart 同样的理由：避免恢复到 CLARIFYING 状态重新进澄清对话时进度条先闪一下默认值。
    qc.setQueryData(['prd-session', s.id], s)
    setStreamText('')
    setErrorMsg(null)

    if (s.status === 'DONE') {
      getContent(s.id)
        .then((content) => {
          setPrdContent(content ?? '')
          setStep('EDITING')
          // _regenDevDoc=true：进入编辑器后立即触发重新生成开发文档
          if ((s as { _regenDevDoc?: boolean })._regenDevDoc) {
            // 通过 sessionId 在 EditingPanel 里监听，不在这里直接触发（需要 devDocContent 等状态）
            // 用 setTimeout 等 EditingPanel 挂载后再发信号
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('prd-clarify:regen-dev-doc', { detail: { sessionId: s.id } }))
            }, 300)
          }
        })
        .catch(() => {
          setPrdContent('')
          setStep('EDITING')
          setErrorMsg('PRD 文件读取失败，可点击「开始开发」使用当前编辑器内容，或重新生成')
        })
    } else if (s.status === 'CLARIFYING') {
      // 重新进入对话澄清：ChattingPanel/BatchClarifyPanel 会从 session.questions 里已回答的
      // 部分（上面已 setQueryData 预热过 s 本身）断点续问/续填，不会重新问已经答过的题
      setStep('CHATTING')
    } else if (s.status === 'GENERATING') {
      setStep('GENERATING')
    } else if (s.status === 'ERROR') {
      const clarificationComplete = s.questions.length > 0
        && s.questions.every((question) => question.answer?.trim())
      if (clarificationComplete) {
        // 澄清问答齐全，说明失败发生在最终 PRD 生成阶段，直接复用问答重试生成。
        setErrorMsg(s.errorMsg ?? '上次生成 PRD 出错')
        setGenerationFailed(true)
        setStep('GENERATING')
      } else {
        // 批量澄清失败也会把会话记为 ERROR。没有题目或仍有未回答题目时必须回到
        // CHATTING 重新提问/续答，不能越过澄清直接生成 PRD。
        setErrorMsg(null)
        setGenerationFailed(false)
        setStep('CHATTING')
      }
    } else if (s.status === 'DRAFT') {
      // 草稿：回到 INPUT 表单继续编辑（InputPanel 从上面已预热的 session 缓存里读
      // title/rawInput/project/module 回填，见下方 <InputPanel> 的 initialXxx 取值逻辑）
      setStep('INPUT')
    } else {
      setStep('INPUT')
    }
  }

  // 澄清记录：优先从 session.questions 读取（已持久化），降级用 qaHistoryRef
  const clarifyQuestions: QuestionItem[] = session?.questions?.length
    ? session.questions
    : qaHistoryRef.current.map((qa, i) => ({ id: i + 1, question: qa.question, answer: qa.answer }))


  return {
    autoStartPending,
    changeGroupMut,
    clarifyQuestions,
    deleteMut,
    errorMsg,
    generationFailed,
    handleAutoStartConfirm,
    handleBackToInput,
    handleChattingDone,
    handleReset,
    handleRetryGenerate,
    handleReturnToClarify,
    handleReviseConfirm,
    handleSelectHistory,
    handleStart,
    handleStartVibe,
    mobileHistoryOpen,
    navigate,
    prdContent,
    qc,
    renameMut,
    reqContextTitle,
    revisingSesion,
    revisionPreparing,
    session,
    sessionId,
    sessionTitle,
    sessions,
    setAutoStartPending,
    setErrorMsg,
    setMobileHistoryOpen,
    setRevisingSession,
    setSearchParams,
    setSessionId,
    setShowClarifyHistory,
    setSplittingSessionId,
    setStep,
    showClarifyHistory,
    splittingSessionId,
    step,
    streamText,
    urlModule,
    urlProject,
    urlRawInput,
    urlTitle,
  }
}
