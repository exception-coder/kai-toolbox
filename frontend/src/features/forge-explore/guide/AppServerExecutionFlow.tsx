import { ArrowDown, CornerUpLeft } from 'lucide-react'

const steps = [
  ['01', 'Codex App Server 发来通知', 'codexAppServer.ts', 'isCurrentCodexTurnNotification(params, threadId, turnId)', '先核对线程与回合归属，避免子 Agent 的终态结束主回合。'],
  ['02', '按事件类型分流', 'codexAppServer.ts', 'item/agentMessage/delta → 展示文字；turn/completed → acceptRootTerminalTurn()', '文字回复不是自动监督的完成信号。终态还经过 completionGate.assess()；需要收尾时等待子任务完成。'],
  ['03', '转成 Forge 统一结果', 'codexAppServer.ts · finishRootTurn()', "{ type: 'result', stopReason, queueReleaseSafe }", '成功且可安全释放时 stopReason=end_turn；未安全收口时为 incomplete；失败或中断保留相应状态。'],
  ['04', 'Java 接收结果并发布回合事件', 'ClaudeChatService.java', 'case "result" → onResult() → completeTurn() → SessionTurnSettledEvent', '记录会话空闲状态、保存队列释放标记、通知浏览器。监督逻辑由服务端事件触发，浏览器无需保持打开。'],
  ['05', '监督器合并两路证据', 'SessionAutopilotService.java', 'onSettled() → evaluateSettled() → OpenSpecContinuousRunner.decide()', '只处理 ACTIVE 运行；检查成功终态、queueReleaseSafe、预算和进度报告，再 inspect() 重读绑定 change。'],
  ['06', '持久化决策，再决定是否派工', 'SessionAutopilotService.java', 'appendStep() → persist() → ACTIVE 时 queueContinuation()', '步骤去重、版本更新；等待或暂停状态不生成续跑消息。ACTIVE 将服务端选定的 task / phase 写入内部队列。'],
  ['07', '释放一条消息，开始下一轮', 'ClaudeChatService.java → codexAppServer.ts', "SessionQueueReleaseRequestedEvent → dispatchNextQueuedMessage() → 既有发送链 → request('turn/start', …)", '释放前再次检查空闲、无待审批、无后台任务及运行门禁；取出内部消息，将任务指令交给同一会话执行。'],
] as const

export function AppServerExecutionFlow() {
  return <section className="execution-overview" id="app-server-flow">
    <figure aria-label="App Server 消息驱动自动监督的编码流程">
      <figcaption>技术流程：一条 App Server 终态消息，如何触发下一轮？</figcaption>
      <div className="execution-check"><div><strong>一个 AI 会话，多轮执行；监督者是 Java 服务端代码。</strong><p>没有为了监督再创建一个 AI 会话。当前会话执行一轮后，Codex App Server（Codex 的程序通信服务）发出结果通知，Sidecar（引擎适配进程）转交给 Forge。Forge 中的事件监听方法检查状态与任务，再向当前会话发送下一轮指令。</p><p><code>当前 AI 会话 → 结果事件 → Java 监督代码 → 下一轮指令 → 当前 AI 会话</code></p><p>onSettled() 使用 Java 虚拟线程处理检查：这是服务端并发任务，不是新建一个模型会话，也不会再调用一个“监督模型”来读回复。</p></div></div>
      <p className="guide-note">以下对应 Codex App Server 执行路径。按结构化事件与状态判断，不通过搜索助手回复中的“完成”二字决定续跑。</p>
      <aside className="execution-check"><div><strong>旁路输入 · Agent 主动上报进度</strong><p><code>report_session_progress → /sessions/{'{sessionId}'}/autopilot/progress → reportProgress()</code></p><p>通过 MCP（模型调用工具的协议）保存 disposition（继续、完成或等待等处置建议）、summary（工作摘要）、evidence（证据记录）到当前运行，供第 05 步读取；这条报告本身不启动下一轮，也不直接宣告整个任务完成。</p></div></aside>
      <dl className="guide-methods">
        <div><dt>session / thread / turn</dt><dd>sessionId 是 Forge 会话编号；threadId 是 Codex 对话线程编号；turnId 是其中某一轮执行的编号。一次会话可以连续执行多轮，下一轮不等于另开会话。</dd></div>
        <div><dt>delta / turn/completed</dt><dd>delta 是逐段输出的文字增量；turn/completed 是一轮执行结束的通知。收到文字用于展示，收到结束通知才进入回合收尾判断。</dd></div>
        <div><dt>result / stopReason / queueReleaseSafe</dt><dd>统一执行结果 / 本轮停止原因 / 是否允许发送队列中的下一条消息。end_turn 表示正常结束，incomplete 表示尚未安全收尾。</dd></div>
        <div><dt>onSettled / evaluateSettled / decide</dt><dd>接收回合结束事件 / 检查结束条件与运行状态 / 决定下一步。这些都是 Java 方法，不是三个 AI Agent。</dd></div>
        <div><dt>appendStep / persist / queueContinuation</dt><dd>保存本次步骤记录 / 将运行状态写入数据库 / 把续跑指令加入队列。dispatchNextQueuedMessage 表示取出并发送下一条排队消息。</dd></div>
        <div><dt>change / task / phase</dt><dd>本次需求变更 / 当前具体任务 / 实现、核验或归档等执行阶段。ACTIVE 是正在监督，PAUSED 是暂停，WAITING_USER 是等人处理，COMPLETED 是运行完成。</dd></div>
      </dl>
      <ol className="app-server-flow">{steps.map(([number, title, file, call, note]) => <li key={number}><span>{number}</span><div><small>{file}</small><h3>{title}</h3><code>{call}</code><p>{note}</p><ArrowDown size={18} aria-hidden="true" /></div></li>)}</ol>
      <div className="execution-owner"><CornerUpLeft size={20} aria-hidden="true" /><strong>下一轮通知回到 01，形成闭环</strong><span>不是前端轮询，也不是收到任意回复就发送“继续”。</span></div>
      <p className="guide-note">第 05 步的退出分支：终态不安全或预算耗尽 → PAUSED；报告阻塞或需用户处理 → WAITING_USER；阶段检查失败 → 按重试策略修复或暂停；授权归档确认后 → COMPLETED。质量检查按当前阶段运行，不是每个文字片段都触发测试。</p>
    </figure>
  </section>
}
