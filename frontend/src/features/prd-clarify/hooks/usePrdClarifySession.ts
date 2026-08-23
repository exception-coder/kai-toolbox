import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError } from '@/lib/api'
import {
  autoRegisterToReqPool,
  confirmInitialSpec,
  createSession,
  deleteSession,
  getContent,
  getDiscoveryRun,
  getInitialSpecContent,
  getSession,
  linkPrdToReqItem,
  listSessions,
  returnToClarify,
  saveInitialSpecContent,
  startDiscovery,
  startClarifyFromDraft,
  startGenerate,
  updateSessionProject,
  updateSessionTitle,
} from '../api'
import type {
  CreateSessionRequest,
  PrdClarifyMode,
  PrdDiscoveryRunView,
  PrdReqType,
  PrdSessionView,
  PrdStep,
} from '../types'
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
  const [initialSpecContent, setInitialSpecContent] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [generationFailed, setGenerationFailed] = useState(false)  // GENERATING 失败，留在当前步骤显示重试
  const [discoveryFailed, setDiscoveryFailed] = useState(false)
  const [discoveryStarting, setDiscoveryStarting] = useState(false)
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false)   // 移动端 PRD 库抽屉（桌面端常驻，无此状态）
  const abortRef = useRef<(() => void) | null>(null)
  // GENERATING 阶段用 ref 积累全文，done 时一次性赋值（避免双重 setState）
  const prdAccRef = useRef('')
  // 来自需求管理池时，记录来源标题，用于顶部上下文条
  const [reqContextTitle, setReqContextTitle] = useState<string | null>(null)
  // 防止自动启动多次执行
  const autoStartedRef = useRef(false)
  /** 同一次创建尝试复用操作键，服务端据此合并重复点击和网络重试。 */
  const creationKeyRef = useRef<string | null>(null)
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
  /** 从交付中心创建后直接锁定的规格探索会话。 */
  const urlSessionId = searchParams.get('sessionId') ?? ''
  /** 来自需求管理池的回写 ID（读取一次，后续用 reqItemIdRef） */
  const urlReqItemId = searchParams.get('reqItemId') ?? ''
  /** 直接查看某个历史 PRD 会话（来自需求管理池「查看PRD」按钮） */
  const urlViewSession = searchParams.get('viewSession') ?? ''
  const [autoStartPending, setAutoStartPending] = useState(false)

  // 来自需求管理池（有 reqItemId + 内容）：自动建会话、跳过 INPUT 直接开始探索
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
    setDiscoveryStarting(true)
    setStep('DISCOVERING')
    const creationKey = creationKeyRef.current ?? crypto.randomUUID()
    creationKeyRef.current = creationKey
    createMut.mutateAsync({
      title: urlTitle,
      rawInput: urlRawInput,
      project: urlProject,
      module: urlModule,
      sourceReqItemId: urlReqItemId,
      role: 'PRODUCT',
      reqType,
      maxQuestions,
      clarifyMode,
      engine,
      creationKey,
    })
      .then((created) => {
        creationKeyRef.current = null
        setSessionId(created.id)
        qc.setQueryData(['prd-session', created.id], created)
        setSessionTitle(urlTitle)
        setSearchParams({}, { replace: true })  // URL 清除，但 reqItemIdRef 已保存
        qc.invalidateQueries({ queryKey: ['prd-sessions'] })
        startDiscoveryTask(created.id)
      })
      .catch(() => {
        setDiscoveryStarting(false)
        setStep('INPUT')
        autoStartedRef.current = false  // 创建失败可重试
        setErrorMsg('会话创建失败，请重试')
      })
  }

  // 交付中心已经创建了正式会话，这里只加载并锁定，不再重复创建。
  useEffect(() => {
    if (!urlSessionId) return
    setSearchParams({}, { replace: true })
    setSessionId(urlSessionId)
    qc.fetchQuery({
      queryKey: ['prd-session', urlSessionId],
      queryFn: () => getSession(urlSessionId),
    })
      .then((loaded) => {
        setSessionTitle(loaded.title)
        if (loaded.status === 'DISCOVERING') {
          setDiscoveryFailed(false)
          setStep('DISCOVERING')
        } else if (loaded.status === 'SPEC_REVIEW') {
          getInitialSpecContent(loaded.id)
            .then((content) => setInitialSpecContent(content ?? ''))
            .catch(() => setErrorMsg('初始化规格读取失败，请重新探索'))
          setStep('SPEC_REVIEW')
        } else if (loaded.status === 'CLARIFYING') {
          setDiscoveryFailed(false)
          setDiscoveryStarting(true)
          setStep('DISCOVERING')
        } else if (loaded.status === 'GENERATING') {
          setStep('GENERATING')
        } else if (loaded.status === 'DONE') {
          getContent(loaded.id).then((content) => setPrdContent(content ?? ''))
          setStep('EDITING')
        } else {
          setStep('INPUT')
        }
      })
      .catch(() => {
        setSessionId(null)
        setErrorMsg('目标规格不存在或无法访问')
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
        setErrorMsg('读取核心规格失败')
        setStep('INPUT')
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlViewSession])

  // 当前会话详情
  const { data: session } = useQuery({
    queryKey: ['prd-session', sessionId],
    queryFn: () => getSession(sessionId!),
    // 编辑态仍需读取服务端会话事实，用于刷新后恢复后台执行计划任务。
    enabled: !!sessionId,
    refetchInterval: false,
  })

  const { data: discoveryRun } = useQuery<PrdDiscoveryRunView>({
    queryKey: ['prd-discovery-run', sessionId],
    queryFn: async () => {
      try {
        return await getDiscoveryRun(sessionId!)
      } catch (error) {
        // 兼容改造前已停在 DISCOVERING、但尚无运行记录的会话：补登记后继续追踪。
        if (error instanceof ApiError && error.status === 404) {
          return startDiscovery(sessionId!)
        }
        throw error
      }
    },
    enabled: !!sessionId && step === 'DISCOVERING',
    retry: 2,
    refetchInterval: (query) => query.state.data?.status === 'RUNNING' ? 1_500 : false,
  })

  useEffect(() => {
    if (!sessionId || step !== 'DISCOVERING' || !discoveryRun) return
    setDiscoveryStarting(false)
    if (discoveryRun.status === 'COMPLETED') {
      getInitialSpecContent(sessionId)
        .then((content) => {
          setInitialSpecContent(content ?? '')
          setDiscoveryFailed(false)
          setErrorMsg(null)
          qc.invalidateQueries({ queryKey: ['prd-session', sessionId] })
          qc.invalidateQueries({ queryKey: ['prd-sessions'] })
          setStep('SPEC_REVIEW')
        })
        .catch(() => {
          setDiscoveryFailed(true)
          setErrorMsg('后台探索已完成，但初始化规格读取失败，请重新探索')
        })
    } else if (discoveryRun.status === 'FAILED') {
      setDiscoveryFailed(true)
      setErrorMsg(discoveryRun.lastError ?? '后台探索未完成，请重新探索')
    }
  }, [discoveryRun, qc, sessionId, step])

  // 历史列表
  const { data: sessions = [] } = useQuery({
    queryKey: ['prd-sessions'],
    queryFn: listSessions,
  })

  // 创建会话 mutation
  const createMut = useMutation({ mutationFn: createSession })

  // 草稿转正式发起探索：原地更新已存在的 DRAFT 会话，不新插入一条记录
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
    onError: () => setErrorMsg('修改规格分组失败，请重试'),
  })

  const handleReset = () => {
    abortRef.current?.()
    abortRef.current = null
    setStep('INPUT')
    setSessionId(null)
    setStreamText('')
    setPrdContent('')
    setInitialSpecContent('')
    setErrorMsg(null)
    setGenerationFailed(false)
    setDiscoveryFailed(false)
    setDiscoveryStarting(false)
    setReqContextTitle(null)
    setRevisionPreparing(null)
    setRevisingSession(null)
    autoStartedRef.current = false
    reqItemIdRef.current = ''
  }

  /** 返回想法输入页并回填当前会话内容；再次提交时创建新会话，旧记录保持不变。 */
  const handleBackToInput = () => {
    abortRef.current?.()
    abortRef.current = null
    prdAccRef.current = ''
    setStreamText('')
    setErrorMsg(null)
    setGenerationFailed(false)
    setDiscoveryFailed(false)
    setRevisionPreparing(null)
    setStep('INPUT')
  }

  /** 登记后台探索；前端只追踪持久化进度，不持有任务连接。 */
  const startDiscoveryTask = (sid: string) => {
    setDiscoveryFailed(false)
    setInitialSpecContent('')
    setStreamText('')
    setDiscoveryStarting(true)
    startDiscovery(sid)
      .then((run) => {
        setDiscoveryStarting(false)
        qc.setQueryData(['prd-discovery-run', sid], run)
      })
      .catch((error) => {
        setDiscoveryStarting(false)
        setDiscoveryFailed(true)
        setErrorMsg(error instanceof Error ? error.message : '后台探索启动失败，请重试')
      })
  }

  /** 保存并确认初始化规格，随后直接生成核心规格。 */
  const handleInitialSpecConfirm = async (content: string) => {
    if (!sessionId) return
    setErrorMsg(null)
    await saveInitialSpecContent(sessionId, content)
    const confirmed = await confirmInitialSpec(sessionId)
    setInitialSpecContent(content)
    qc.setQueryData(['prd-session', sessionId], confirmed)
    qc.invalidateQueries({ queryKey: ['prd-sessions'] })
    setGenerationFailed(false)
    setStep('GENERATING')
    startGenerateSse(sessionId)
  }

  /** 保存人工修订后的初始化规格，但不推进流程。 */
  const handleInitialSpecSave = async (content: string) => {
    if (!sessionId) return
    setErrorMsg(null)
    await saveInitialSpecContent(sessionId, content)
    setInitialSpecContent(content)
    qc.invalidateQueries({ queryKey: ['prd-session', sessionId] })
    qc.invalidateQueries({ queryKey: ['prd-sessions'] })
  }

  const handleRetryDiscovery = () => {
    if (!sessionId) return
    setErrorMsg(null)
    setStep('DISCOVERING')
    startDiscoveryTask(sessionId)
  }

  /**
   * 基于已有 PRD 生成修订版：
   * 1. 读取原版 PRD 内容
   * 2. 创建新会话，rawInput = [原PRD内容 + 修订说明]，title 加版本标记
   * 3. 登记后台探索，直接生成新的初始化规格
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
    setStep('DISCOVERING')
    try {
      // 读取原版 PRD 内容
      const prdText = await getContent(originalSession.id)
      setRevisionPreparing({ engine, stage: 'creating' })
      const revisionRawInput = [
        `【核心规格修订版 — 基于原版：${originalSession.title}】`,
        '',
        '=== 原核心规格内容 ===',
        prdText || '（原核心规格读取失败）',
        '=== 本次修订说明 ===',
        changeDesc.trim() || '（无额外修订说明，请结合原规格和现有系统证据重新探索）',
      ].join('\n')

      const newTitle = `${originalSession.title}（修订版）`
      const creationKey = creationKeyRef.current ?? crypto.randomUUID()
      creationKeyRef.current = creationKey
      const created = await createMut.mutateAsync({
        title: newTitle,
        rawInput: revisionRawInput,
        project: originalSession.project ?? '',
        module: originalSession.module ?? '',
        engine,
        role: (originalSession.role as 'PRODUCT' | 'BUSINESS') ?? 'PRODUCT',
        parentId: originalSession.id,
        creationKey,
      })
      creationKeyRef.current = null
      setSessionId(created.id)
      qc.setQueryData(['prd-session', created.id], created)
      setSessionTitle(newTitle)
      setReqContextTitle(`修订自：${originalSession.title}`)
      qc.invalidateQueries({ queryKey: ['prd-sessions'] })
      setRevisionPreparing(null)
      setStep('DISCOVERING')
      startDiscoveryTask(created.id)
    } catch {
      setRevisionPreparing(null)
      setStep('INPUT')
      setErrorMsg('创建修订版会话失败，请重试')
    }
  }

  /**
   * Step INPUT → 创建会话 → 探索并生成初始化规格。
   *
   * reqType/maxQuestions 不传时（业务员角色，弹框里不问技术分类和轮数）故意不给默认值——
   * 让请求体里这两个字段真正缺失，后端据此触发 LLM 自动判定（而不是静默按 NEW_MODULE
   * 处理，那样等于假装"判断"了，其实只是抄了个默认值）。
   */
  const handleStart = async (
    title: string, rawInput: string, project: string, module: string,
    role: 'PRODUCT' | 'BUSINESS' = 'PRODUCT', reqType?: PrdReqType, maxQuestions?: number,
    clarifyMode?: PrdClarifyMode, draftId?: string, engine: ClarifyEngine = 'claude',
  ) => {
    setErrorMsg(null)
    setSessionTitle(title)
    setSearchParams({}, { replace: true })
    const creationKey = creationKeyRef.current ?? crypto.randomUUID()
    creationKeyRef.current = creationKey
    const req = { title, rawInput, project, module, role, reqType, maxQuestions, clarifyMode, engine, creationKey }
    setStep('DISCOVERING')
    setDiscoveryStarting(true)
    try {
      // draftId 非空：从草稿恢复后点「开始探索」，原地转正式，不新建一条记录
      const created = draftId
        ? await startFromDraftMut.mutateAsync({ id: draftId, req })
        : await createMut.mutateAsync(req)
      setSessionId(created.id)
      creationKeyRef.current = null
      qc.setQueryData(['prd-session', created.id], created)
      setStreamText('')
      qc.invalidateQueries({ queryKey: ['prd-sessions'] })
      startDiscoveryTask(created.id)
    } catch (error) {
      setDiscoveryStarting(false)
      setStep('INPUT')
      setErrorMsg(error instanceof Error ? error.message : '探索会话创建失败，请重试')
    }
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
              .catch(() => setErrorMsg('核心规格已生成，但同步到需求管理池失败，请在需求池手动更新状态'))
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
              .catch(() => setErrorMsg('核心规格已生成，但自动登记到需求管理池失败（可手动到需求池查看）'))
          }
          setStep('EDITING')
        }
        if (name === 'error') {
          const d = data as { message: string }
          setErrorMsg(d.message ?? '核心规格生成失败，可点击重试')
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

  /** 重试 PRD 生成（超时/失败后用户点击重试） */
  const handleRetryGenerate = () => {
    if (!sessionId) return
    setErrorMsg(null)
    startGenerateSse(sessionId)
  }

  /** 保留当前核心规格，回到初始化规格审阅；无初始化规格的历史会话重新探索。 */
  const handleReturnToClarify = async () => {
    if (!sessionId) return
    abortRef.current?.()
    abortRef.current = null
    const restored = await returnToClarify(sessionId)
    qc.setQueryData(['prd-session', sessionId], restored)
    qc.invalidateQueries({ queryKey: ['prd-sessions'] })
    setStreamText('')
    setErrorMsg(null)
    setGenerationFailed(false)
    if (restored.status === 'SPEC_REVIEW' && restored.initialSpecPath) {
      const content = await getInitialSpecContent(sessionId)
      setInitialSpecContent(content ?? '')
      setStep('SPEC_REVIEW')
      return
    }
    setDiscoveryFailed(false)
    setStep('DISCOVERING')
    startDiscoveryTask(sessionId)
  }

  /** 从历史记录恢复会话（_openDevDoc=true 时自动打开开发文档分栏） */
  const handleSelectHistory = (s: PrdSessionView & { _openDevDoc?: boolean; _regenDevDoc?: boolean }) => {
    abortRef.current?.()
    abortRef.current = null
    setSessionId(s.id)
    // 历史列表条目本身就是完整的 PrdSessionView（含正确的 maxQuestions），预热缓存跟
    // 预热兼容状态缓存；旧 CLARIFYING 会话进入后会直接升级为后台规格探索。
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
          setErrorMsg('核心规格读取失败，可点击「开始开发」使用当前编辑器内容，或重新生成')
        })
    } else if (s.status === 'DISCOVERING') {
      setDiscoveryFailed(false)
      setStep('DISCOVERING')
    } else if (s.status === 'SPEC_REVIEW') {
      getInitialSpecContent(s.id)
        .then((content) => {
          setInitialSpecContent(content ?? '')
          setStep('SPEC_REVIEW')
        })
        .catch(() => {
          setDiscoveryFailed(true)
          setErrorMsg('初始化规格读取失败，请重新探索')
          setStep('DISCOVERING')
        })
    } else if (s.status === 'CLARIFYING') {
      setDiscoveryFailed(false)
      setDiscoveryStarting(true)
      setStep('DISCOVERING')
    } else if (s.status === 'GENERATING') {
      setStep('GENERATING')
    } else if (s.status === 'ERROR') {
      if (s.initialSpecPath) {
        getInitialSpecContent(s.id)
          .then((content) => setInitialSpecContent(content ?? ''))
          .catch(() => setErrorMsg('初始化规格读取失败，请重新探索'))
        setStep('SPEC_REVIEW')
        return
      }
      const clarificationComplete = s.questions.length > 0
        && s.questions.every((question) => question.answer?.trim())
      if (clarificationComplete) {
        // 澄清问答齐全，说明失败发生在最终 PRD 生成阶段，直接复用问答重试生成。
        setErrorMsg(s.errorMsg ?? '上次生成核心规格出错')
        setGenerationFailed(true)
        setStep('GENERATING')
      } else {
        setErrorMsg(s.errorMsg ?? '后台探索未完成，请重新探索')
        setDiscoveryFailed(true)
        setStep('DISCOVERING')
      }
    } else if (s.status === 'DRAFT') {
      // 草稿：回到 INPUT 表单继续编辑（InputPanel 从上面已预热的 session 缓存里读
      // title/rawInput/project/module 回填，见下方 <InputPanel> 的 initialXxx 取值逻辑）
      setStep('INPUT')
    } else {
      setStep('INPUT')
    }
  }

  return {
    autoStartPending,
    changeGroupMut,
    deleteMut,
    errorMsg,
    generationFailed,
    handleAutoStartConfirm,
    handleBackToInput,
    handleReset,
    handleRetryGenerate,
    handleReturnToClarify,
    handleReviseConfirm,
    handleSelectHistory,
    handleStart,
    handleInitialSpecConfirm,
    handleInitialSpecSave,
    handleRetryDiscovery,
    initialSpecContent,
    discoveryFailed,
    discoveryRun,
    discoveryStarting,
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
    setSplittingSessionId,
    setStep,
    splittingSessionId,
    step,
    streamText,
    urlModule,
    urlProject,
    urlRawInput,
    urlTitle,
  }
}
